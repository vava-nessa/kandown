/**
 * @file OpenAI Codex harness adapter (exec json protocol)
 * @description Drives `codex exec --json` and normalizes its JSONL event stream
 * into kandown agent events. Codex exec is one-shot: the process starts with
 * the prompt and exits after the turn, so `turn_completed` and the process
 * exit usually land together.
 *
 * 📖 Permission mapping: yolo uses codex's bypass flags (native support).
 * accept-edits can only be approximated in exec mode with the workspace-write
 * sandbox; there is no interactive approver to hold an edit, so the session
 * reports advisory support and the UI shows the diff after the fact (t309).
 *
 * 📖 Event mapping (one JSON object per stdout line):
 *   - `{type:"thread.started"}`                    → session_started
 *   - `{type:"item.started"}` command_execution    → tool_started
 *   - `{type:"item.completed"}` agent_message      → message_delta (final)
 *   - `{type:"item.completed"}` command_execution  → tool_finished
 *   - `{type:"item.completed"}` file_change        → file_changed per path
 *   - `{type:"turn.completed"}`                    → usage + turn_completed
 *   - `{type:"turn.failed"}` / `{type:"error"}`    → error
 *
 * @functions
 *  → buildArgs  : argv for a new or resumed exec session
 *  → parseLine  : one stdout line → zero or more normalized events
 *
 * @exports codexAdapter
 * @see src/cli/lib/agent/agent-runtime.ts
 */

import type { AdapterParseResult, AdapterState, AgentSessionConfig, HarnessAdapter } from '../types.js';

/** 📖 Builds the exec argv. `--skip-git-repo-check` is required because a
 *  kandown project is not necessarily a git repo and codex refuses to run
 *  outside one without it. Resume uses the `codex exec resume <id>` subform. */
export function buildArgs(config: AgentSessionConfig, binPath: string): string[] {
  const modeFlags = config.permissionMode === 'yolo'
    ? ['--dangerously-bypass-approvals-and-sandbox']
   : ['--sandbox', 'workspace-write'];
  const jsonAndCheck = ['--json', '--skip-git-repo-check'];
  if (config.resumeSessionId) {
    return [binPath, 'exec', 'resume', config.resumeSessionId, ...jsonAndCheck, ...modeFlags, config.prompt];
  }
  return [binPath, 'exec', ...jsonAndCheck, ...modeFlags, config.prompt];
}

/** 📖 Codex items are loosely typed; this narrows the fields kandown consumes
 *  without trusting the rest. */
function itemFields(item: unknown): { type: string; id?: string; text?: string; command?: string; exitCode?: number; paths: string[] } {
  const empty = { type: '', paths: [] as string[] };
  if (item === null || typeof item !== 'object') return empty;
  const record = item as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type: '';
  const paths: string[] = [];
  if (Array.isArray(record.changes)) {
    for (const change of record.changes) {
      if (change && typeof change === 'object' && typeof (change as Record<string, unknown>).path === 'string') {
        paths.push((change as Record<string, unknown>).path as string);
      }
    }
  }
  return {
    type,
    id: typeof record.id === 'string' ? record.id: undefined,
    text: typeof record.text === 'string' ? record.text: undefined,
    command: typeof record.command === 'string' ? record.command: undefined,
    exitCode: typeof record.exit_code === 'number' ? record.exit_code: undefined,
    paths,
  };
}

/** 📖 Parses one stdout line. Non-JSON lines are ignored. */
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

  if (event.type === 'thread.started' && !state.sessionStartedEmitted) {
    state.sessionStartedEmitted = true;
    state.harnessSessionId = typeof event.thread_id === 'string' ? event.thread_id: undefined;
    events.push({
      type: 'session_started',
      harnessSessionId: state.harnessSessionId ?? '',
      permissionMode: state.permissionMode,
      permissionSupport: state.permissionSupport,
    });
    return { events };
  }

  if ((event.type === 'item.started' || event.type === 'item.completed') && event.item !== undefined) {
    const item = itemFields(event.item);
    if (event.type === 'item.started' && item.type === 'command_execution') {
      events.push({
        type: 'tool_started',
        toolCallId: item.id,
        toolName: 'command',
        ...(item.command ? { summary: item.command }: {}),
      });
      return { events };
    }
    if (event.type === 'item.completed') {
      if (item.type === 'agent_message' && item.text) {
        events.push({ type: 'message_delta', text: item.text, partial: false, channel: 'text' });
      } else if (item.type === 'command_execution') {
        events.push({
          type: 'tool_finished',
          toolCallId: item.id,
          toolName: 'command',
          ok: item.exitCode === undefined ? true: item.exitCode === 0,
          ...(item.command ? { summary: item.command }: {}),
        });
      } else if (item.type === 'file_change') {
        for (const path of item.paths) events.push({ type: 'file_changed', path });
      } else if (item.type === 'error') {
        events.push({ type: 'error', message: item.text ?? 'codex item failed', fatal: false });
      }
      return { events };
    }
    return { events };
  }

  if (event.type === 'turn.completed') {
    if (event.usage && typeof event.usage === 'object') {
      const usage = event.usage as Record<string, unknown>;
      events.push({
        type: 'usage',
        inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens: undefined,
        outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens: undefined,
        cachedInputTokens:
          typeof usage.cached_input_tokens === 'number' ? usage.cached_input_tokens: undefined,
      });
    }
    events.push({ type: 'turn_completed' });
    return { events };
  }

  if (event.type === 'turn.failed') {
    const error = event.error as Record<string, unknown> | undefined;
    const message = error && typeof error.message === 'string' ? error.message: 'codex turn failed';
    events.push({ type: 'error', message, fatal: true });
    return { events };
  }

  if (event.type === 'error' && typeof event.message === 'string') {
    events.push({ type: 'error', message: event.message, fatal: false });
    return { events };
  }

  return { events };
}

export const codexAdapter: HarnessAdapter = {
  protocol: 'codex-exec-json',
  buildArgs,
  parseLine: (line, state) => parseLine(line, state),
};
