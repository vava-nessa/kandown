/**
 * @file Claude Code harness adapter (stream-json protocol)
 * @description Drives `claude -p <prompt> --output-format stream-json` and
 * normalizes its JSONL stdout into kandown agent events. Claude Code is the
 * one harness that exposes permission modes natively in headless mode, so both
 * kandown modes map directly onto `--permission-mode`.
 *
 * 📖 Stream-json without `--include-partial-messages` emits complete content
 * blocks (assistant turns arrive whole). kandown v1 deliberately stays on
 * complete blocks: the flag moved between CLI versions and a broken flag would
 * fail every session. Message granularity upgrades later behind a capability
 * probe, not a hardcoded flag.
 *
 * 📖 Event mapping (one JSON object per stdout line):
 *   - `{type:"system",subtype:"init"}`        → session_started
 *   - `{type:"assistant"}` text blocks        → message_delta (final)
 *   - `{type:"assistant"}` tool_use blocks    → tool_started (+ file_changed)
 *   - `{type:"user"}` tool_result blocks      → tool_finished
 *   - `{type:"result"}`                        → usage + turn_completed
 *
 * @functions
 *  → buildArgs  : argv for a new or resumed headless session
 *  → parseLine  : one stdout line → zero or more normalized events
 *
 * @exports claudeCodeAdapter
 * @see src/cli/lib/agent/agent-runtime.ts
 */

import { EDIT_TOOL_NAMES } from '../types.js';
import { excerptFromToolInput } from '../tool-excerpt.js';
import type { AdapterParseResult, AdapterState, AgentSessionConfig, HarnessAdapter } from '../types.js';

/** 📖 Builds the headless argv. `bypassPermissions` is claude's yolo mode;
 *  `acceptEdits` auto-approves file edits but still gates other tools, which
 *  is exactly the kandown accept-edits contract. */
export function buildArgs(config: AgentSessionConfig, binPath: string): string[] {
  const args = [
    binPath,
    '-p',
    config.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    config.permissionMode === 'yolo' ? 'bypassPermissions': 'acceptEdits',
  ];
  if (config.resumeSessionId) args.push('--resume', config.resumeSessionId);
  return args;
}

/** 📖 Reads the file path out of a claude edit-tool input block. Tool input
 *  shapes vary across claude versions, hence the field fallback chain. */
function editPath(input: unknown): string | null {
  if (input === null || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  for (const key of ['file_path', 'filePath', 'path', 'notebook_path']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return null;
}

/** 📖 Parses one stdout line. Non-JSON lines (banners, warnings) are ignored.
 *  Tool results arrive in `user` messages: claude echoes tool_result blocks
 *  back through the conversation, each carrying the originating tool_use id. */
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

  if (event.type === 'system' && event.subtype === 'init' && !state.sessionStartedEmitted) {
    state.sessionStartedEmitted = true;
    state.harnessSessionId = typeof event.session_id === 'string' ? event.session_id: undefined;
    state.model = typeof event.model === 'string' ? event.model: undefined;
    events.push({
      type: 'session_started',
      harnessSessionId: state.harnessSessionId ?? '',
      ...(state.model ? { model: state.model }: {}),
      permissionMode: state.permissionMode,
      permissionSupport: state.permissionSupport,
    });
    return { events };
  }

  if (event.type === 'assistant' && event.message && typeof event.message === 'object') {
    const message = event.message as Record<string, unknown>;
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block === null || typeof block !== 'object') continue;
        const content = block as Record<string, unknown>;
        if (content.type === 'text' && typeof content.text === 'string' && content.text) {
          events.push({ type: 'message_delta', text: content.text, partial: false, channel: 'text' });
        } else if (content.type === 'tool_use') {
          const toolName = typeof content.name === 'string' ? content.name: 'tool';
          const path = editPath(content.input);
          const summary = excerptFromToolInput(content.input);
          events.push({
            type: 'tool_started',
            toolCallId: typeof content.id === 'string' ? content.id: undefined,
            toolName,
            ...(summary ? { summary } : {}),
          });
          if (path && EDIT_TOOL_NAMES.has(toolName.toLowerCase())) {
            events.push({ type: 'file_changed', path });
          }
        }
      }
    }
    return { events };
  }

  if (event.type === 'user' && event.message && typeof event.message === 'object') {
    const message = event.message as Record<string, unknown>;
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block === null || typeof block !== 'object') continue;
        const content = block as Record<string, unknown>;
        if (content.type === 'tool_result') {
          events.push({
            type: 'tool_finished',
            toolCallId: typeof content.tool_use_id === 'string' ? content.tool_use_id: undefined,
            ok: content.is_error !== true,
          });
        }
      }
    }
    return { events };
  }

  if (event.type === 'result') {
    if (event.usage && typeof event.usage === 'object') {
      const usage = event.usage as Record<string, unknown>;
      events.push({
        type: 'usage',
        inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens: undefined,
        outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens: undefined,
        cachedInputTokens:
          typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens: undefined,
        costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd: undefined,
      });
    }
    events.push({
      type: 'turn_completed',
      stopReason: typeof event.subtype === 'string' ? event.subtype: undefined,
    });
    return { events };
  }

  return { events };
}

export const claudeCodeAdapter: HarnessAdapter = {
  protocol: 'claude-stream-json',
  buildArgs,
  parseLine: (line, state) => parseLine(line, state),
};
