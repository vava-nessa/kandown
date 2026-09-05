/**
 * @file Pi harness adapter (RPC mode protocol)
 * @description Drives `pi --mode rpc`, pi's newline-delimited JSON protocol
 * over stdin/stdout (documented in badlogic/pi-mono, packages/coding-agent/
 * docs/rpc.md). Unlike the one-shot claude and codex protocols, an RPC pi
 * process is a long-lived session: kandown sends a `prompt` command and keeps
 * the process for steering and follow-ups, which is what the chat sidebar
 * (t308) and orchestration (t311) build on.
 *
 * 📖 Framing matters: pi mandates strict LF-only JSONL. Node's readline also
 * splits on U+2028/U+2029 which are legal inside JSON strings, so the runtime
 * must (and does) split on `\n` manually.
 *
 * 📖 Event mapping (one JSON object per stdout line):
 *   - response to `get_state`          → session_started (data.sessionId)
 *   - message_update text_delta        → message_delta (partial)
 *   - message_update thinking_delta    → message_delta (partial, thinking)
 *   - message_update toolcall_start    → tool_started
 *   - message_update usage             → usage (cumulative)
 *   - tool_execution_start (edit tool) → tool_started + file_changed
 *   - tool_execution_end               → tool_finished (+ file_changed)
 *   - turn_end                         → turn_completed
 *   - extension_error                  → error
 *
 * 📖 Permission support is advisory: pi is deliberately permission-free (its
 * extensions own confirmations), so both kandown modes degrade to
 * "diff shown after the fact".
 *
 * @functions
 *  → buildArgs     : argv: rpc mode (session persistence stays pi's own)
 *  → initialStdin  : optional session switch, state probe, initial prompt
 *  → parseLine     : one stdout line → normalized events (+ stdin replies)
 *  → onStop        : graceful `abort` command before SIGTERM
 *
 * @exports piAdapter
 * @see src/cli/lib/agent/agent-runtime.ts
 */

import { EDIT_TOOL_NAMES } from '../types.js';
import { excerptFromToolInput } from '../tool-excerpt.js';
import type { AdapterParseResult, AdapterState, AgentSessionConfig, HarnessAdapter } from '../types.js';

export function buildArgs(config: AgentSessionConfig, binPath: string): string[] {
  return [binPath, '--mode', 'rpc'];
}

/** 📖 Seeds the RPC conversation: resume goes through `switch_session` (pi
 *  resumes by session *file path*, not id), then `get_state` reports the
 *  active sessionId, then the compiled kandown-work prompt lands. */
export function initialStdin(config: AgentSessionConfig): string[] {
  const lines: string[] = [];
  if (config.resumeSessionId) {
    lines.push(JSON.stringify({ type: 'switch_session', sessionPath: config.resumeSessionId }));
  }
  lines.push(JSON.stringify({ id: 'kandown-state', type: 'get_state' }));
  lines.push(JSON.stringify({ id: 'kandown-prompt-1', type: 'prompt', message: config.prompt }));
  return lines;
}

export function onStop(): string[] {
  return [JSON.stringify({ type: 'abort' })];
}

/** 📖 Extracts a file path from pi tool args; tool argument names vary by tool,
 *  hence the fallback chain. */
function argsPath(args: unknown): string | null {
  if (args === null || typeof args !== 'object') return null;
  const record = args as Record<string, unknown>;
  for (const key of ['path', 'file_path', 'filePath', 'file', 'target']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return null;
}

/** 📖 Parses one streaming `message_update` line into events. */
function parseMessageUpdate(event: Record<string, unknown>, events: AdapterParseResult['events']): void {
  if (event.usage && typeof event.usage === 'object') {
    const usage = event.usage as Record<string, unknown>;
    const cost = usage.cost && typeof usage.cost === 'object' ? usage.cost as Record<string, unknown>: undefined;
    events.push({
      type: 'usage',
      inputTokens: typeof usage.input === 'number' ? usage.input: undefined,
      outputTokens: typeof usage.output === 'number' ? usage.output: undefined,
      cachedInputTokens: typeof usage.cacheRead === 'number' ? usage.cacheRead: undefined,
      costUsd: cost && typeof cost.total === 'number' ? cost.total: undefined,
    });
  }
  const delta = event.assistantMessageEvent && typeof event.assistantMessageEvent === 'object'
    ? event.assistantMessageEvent as Record<string, unknown>
   : undefined;
  if (!delta) return;
  switch (delta.type) {
    case 'text_delta':
      if (typeof delta.delta === 'string') {
        events.push({ type: 'message_delta', text: delta.delta, partial: true, channel: 'text' });
      }
      break;
    case 'thinking_delta':
      if (typeof delta.delta === 'string') {
        events.push({ type: 'message_delta', text: delta.delta, partial: true, channel: 'thinking' });
      }
      break;
    case 'toolcall_start':
      events.push({
        type: 'tool_started',
        toolCallId: typeof delta.id === 'string' ? delta.id: undefined,
        toolName: typeof delta.toolName === 'string' ? delta.toolName: 'tool',
      });
      break;
    default:
      break;
  }
}

/** 📖 Parses one stdout line. Non-JSON lines are ignored. Response failures
 *  for the initial prompt are fatal; other command failures are not. */
export function parseLine(line: string, state: AdapterState): AdapterParseResult {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return { events: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [] };
  }
  if (parsed === null || typeof parsed !== 'object') return { events: [] };
  const event = parsed as Record<string, unknown>;
  const events: AdapterParseResult['events'] = [];

  if (event.type === 'response') {
    if (event.command === 'get_state' && event.success === true && !state.sessionStartedEmitted) {
      const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown>: {};
      state.sessionStartedEmitted = true;
      state.harnessSessionId = typeof data.sessionId === 'string' ? data.sessionId: undefined;
      const model = data.model && typeof data.model === 'object' ? data.model as Record<string, unknown>: undefined;
      state.model = model && typeof model.id === 'string' ? model.id: undefined;
      events.push({
        type: 'session_started',
        harnessSessionId: state.harnessSessionId ?? '',
        ...(state.model ? { model: state.model }: {}),
        permissionMode: state.permissionMode,
        permissionSupport: state.permissionSupport,
      });
      return { events };
    }
    if (event.success === false) {
      const message = typeof event.error === 'string' ? event.error: `pi command failed: ${String(event.command ?? 'unknown')}`;
      events.push({ type: 'error', message, fatal: event.command === 'prompt' });
      return { events };
    }
    return { events };
  }

  if (event.type === 'agent_start') {
    state.busy = true;
    return { events };
  }

  if (event.type === 'agent_settled') {
    state.busy = false;
    return { events };
  }

  if (event.type === 'message_update') {
    parseMessageUpdate(event, events);
    return { events };
  }

  if (event.type === 'tool_execution_start') {
    const toolName = typeof event.toolName === 'string' ? event.toolName: 'tool';
    // 📖 tool_execution_start carries the args (toolcall_start does not), so
    // this is where pi's row excerpt comes from. The fold attaches it to the
    // already-open toolCallId instead of duplicating the row.
    const summary = excerptFromToolInput(event.args);
    events.push({
      type: 'tool_started',
      toolCallId: typeof event.toolCallId === 'string' ? event.toolCallId: undefined,
      toolName,
      ...(summary ? { summary } : {}),
    });
    const path = argsPath(event.args);
    if (path && EDIT_TOOL_NAMES.has(toolName.toLowerCase())) {
      events.push({ type: 'file_changed', path });
    }
    return { events };
  }

  if (event.type === 'tool_execution_end') {
    const toolName = typeof event.toolName === 'string' ? event.toolName: undefined;
    events.push({
      type: 'tool_finished',
      toolCallId: typeof event.toolCallId === 'string' ? event.toolCallId: undefined,
      ...(toolName ? { toolName }: {}),
      ok: event.isError !== true,
    });
    const path = argsPath(event.args);
    if (path && toolName && EDIT_TOOL_NAMES.has(toolName.toLowerCase())) {
      events.push({ type: 'file_changed', path });
    }
    return { events };
  }

  if (event.type === 'turn_end') {
    events.push({ type: 'turn_completed' });
    return { events };
  }

  if (event.type === 'extension_error') {
    const message = typeof event.error === 'string' ? event.error: 'pi extension error';
    events.push({ type: 'error', message, fatal: false });
    return { events };
  }

  return { events };
}

export const piAdapter: HarnessAdapter = {
  protocol: 'pi-rpc',
  buildArgs,
  initialStdin,
  parseLine: (line, state) => parseLine(line, state),
  onStop,
};
