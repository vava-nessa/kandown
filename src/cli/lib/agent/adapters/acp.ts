/**
 * @file Generic ACP harness adapter (Agent Client Protocol over stdio)
 * @description Speaks ACP, the open JSON-RPC 2.0 newline-delimited protocol
 * introduced by Zed, so every ACP-capable agent (opencode, gemini, and the
 * long tail) appears in kandown without a bespoke integration. The adapter
 * owns the handshake: initialize, session/new, then session/prompt with the
 * compiled kandown-work document.
 *
 * 📖 Permission modes: ACP agents expose session modes in the session/new
 * response. The adapter matches the requested kandown mode against the
 * available ids (bypass/yolo-ish for yolo, accept/edit-ish for accept-edits)
 * and switches with session/set_mode, upgrading the session's support from
 * advisory to native only when a mode actually matched. Unmatched modes stay
 * advisory: the diff shows after the fact (t309).
 *
 * 📖 Inbound requests: ACP lets the agent ask the client for permissions
 * (session/request_permission) and file reads. kandown v1 auto-selects the
 * first allow-once permission option (the session was launched in the mode
 * the user chose) and answers file-read callbacks with a JSON-RPC error:
 * harnesses that do their own filesystem work are unaffected, client-fs
 * agents degrade and kandown does not open an arbitrary-read surface.
 *
 * @functions
 *  → buildArgs   : harness binary plus its ACP entry flag
 *  → initialStdin: the initialize request
 *  → parseLine   : one stdout line → normalized events (+ JSON-RPC replies)
 *
 * @exports acpAdapter
 * @see src/cli/lib/agent/agent-runtime.ts
 */

import type { AdapterParseResult, AdapterState, AgentSessionConfig, HarnessAdapter } from '../types.js';

const JSONRPC_VERSION = '2.0';

export function buildArgs(config: AgentSessionConfig, binPath: string): string[] {
  // 📖 protocolArgs come from the harness definition (opencode: `acp`, gemini:
  // `--experimental-acp`). The runtime passes them after the binary path, so
  // here they ride in through the config already merged by agent-runtime.
  return config.resumeSessionId
    ? [binPath, ...(config.protocolArgs ?? []), '--resume', config.resumeSessionId]
   : [binPath, ...(config.protocolArgs ?? [])];
}

/** 📖 First stdin line: the ACP handshake. Everything else is driven from
 *  parseLine so the state machine stays in one place. */
export function initialStdin(): string[] {
  return [JSON.stringify({
    jsonrpc: JSONRPC_VERSION,
    id: 1,
    method: 'initialize',
    params: { protocolVersion: 1, clientCapabilities: {} },
  })];
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

/** 📖 Matches an available ACP mode id against the requested kandown mode.
 *  Names differ per agent, so this is a deliberately loose lexical match over
 *  the words every known agent uses. */
function matchModeId(modeId: string, mode: 'yolo' | 'accept-edits'): boolean {
  const normalized = modeId.toLowerCase().replace(/[\s_-]/g, '');
  if (mode === 'yolo') return /yolo|bypass|danger|fullaccess/.test(normalized);
  return /accept|edit|autowrite|write/.test(normalized);
}

/** 📖 Builds the session/prompt request carrying the compiled document. */
function promptRequest(sessionId: string, id: number, prompt: string): string {
  return JSON.stringify({
    jsonrpc: JSONRPC_VERSION,
    id,
    method: 'session/prompt',
    params: { sessionId, prompt: [{ type: 'text', text: prompt }] },
  });
}

/** 📖 Handles one inbound session/update notification body. */
function parseSessionUpdate(update: Record<string, unknown>, events: AdapterParseResult['events']): void {
  const kind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate: '';
  if (kind === 'agent_message_chunk') {
    const content = update.content && typeof update.content === 'object' ? update.content as Record<string, unknown>: undefined;
    if (content && typeof content.text === 'string' && content.text) {
      events.push({ type: 'message_delta', text: content.text, partial: true, channel: 'text' });
    }
  } else if (kind === 'agent_thought_chunk') {
    const content = update.content && typeof update.content === 'object' ? update.content as Record<string, unknown>: undefined;
    if (content && typeof content.text === 'string' && content.text) {
      events.push({ type: 'message_delta', text: content.text, partial: true, channel: 'thinking' });
    }
  } else if (kind === 'tool_call') {
    events.push({
      type: 'tool_started',
      toolCallId: typeof update.toolCallId === 'string' ? update.toolCallId: undefined,
      toolName: typeof update.title === 'string' ? update.title: 'tool',
    });
  } else if (kind === 'tool_call_update') {
    const status = typeof update.status === 'string' ? update.status: undefined;
    if (status === 'completed' || status === 'failed') {
      events.push({
        type: 'tool_finished',
        toolCallId: typeof update.toolCallId === 'string' ? update.toolCallId: undefined,
        ok: status === 'completed',
      });
    }
  }
}

/** 📖 Parses one stdout line. JSON-RPC replies drive the handshake forward via
 *  `outbound`; notifications become normalized events; agent requests (mode
 *  unknown to kandown) get a minimal reply. */
export function parseLine(line: string, state: AdapterState, config: AgentSessionConfig): AdapterParseResult {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return { events: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [] };
  }
  if (parsed === null || typeof parsed !== 'object') return { events: [] };
  const message = parsed as JsonRpcMessage;
  const events: AdapterParseResult['events'] = [];
  const outbound: string[] = [];

  // 📖 Response to initialize → create the session on the agent side.
  if (message.id === 1 && message.method === undefined && message.result !== undefined) {
    outbound.push(JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'session/new',
      params: { cwd: config.projectRoot, mcpServers: [] },
    }));
    return { events, outbound };
  }

  // 📖 Response to session/new → resolve permission mode, then send the prompt.
  if (message.id === 2 && message.method === undefined && message.result !== undefined) {
    const result = message.result && typeof message.result === 'object' ? message.result as Record<string, unknown>: {};
    state.acpSessionId = typeof result.sessionId === 'string' ? result.sessionId: undefined;
    state.harnessSessionId = state.acpSessionId;
    state.acpNextRequestId = 3;

    const modes = result.modes && typeof result.modes === 'object' ? result.modes as Record<string, unknown>: undefined;
    const available = Array.isArray(modes?.availableModes) ? modes!.availableModes as unknown[]: [];
    let matchedModeId: string | null = null;
    for (const mode of available) {
      const modeId = mode && typeof mode === 'object' && typeof (mode as Record<string, unknown>).id === 'string'
        ? (mode as Record<string, unknown>).id as string
       : '';
      if (modeId && matchModeId(modeId, state.permissionMode)) {
        matchedModeId = modeId;
        break;
      }
    }
    if (matchedModeId && state.acpSessionId) {
      state.permissionSupport = 'native';
      outbound.push(JSON.stringify({
        jsonrpc: JSONRPC_VERSION,
        method: 'session/set_mode',
        params: { sessionId: state.acpSessionId, modeId: matchedModeId },
      }));
    }
    if (state.acpSessionId) {
      state.acpPendingPromptId = state.acpNextRequestId;
      state.acpNextRequestId += 1;
      outbound.push(promptRequest(state.acpSessionId, state.acpPendingPromptId, config.prompt));
    }
    state.sessionStartedEmitted = true;
    events.push({
      type: 'session_started',
      harnessSessionId: state.harnessSessionId ?? '',
      permissionMode: state.permissionMode,
      permissionSupport: state.permissionSupport,
    });
    return { events, outbound };
  }

  // 📖 Response to session/prompt → the turn is over.
  if (message.method === undefined && message.id !== undefined && message.id === state.acpPendingPromptId) {
    state.acpPendingPromptId = undefined;
    if (message.error !== undefined && message.error !== null) {
      events.push({ type: 'error', message: `ACP prompt failed: ${JSON.stringify(message.error)}`, fatal: true });
      return { events };
    }
    const result = message.result && typeof message.result === 'object' ? message.result as Record<string, unknown>: {};
    events.push({ type: 'turn_completed', stopReason: typeof result.stopReason === 'string' ? result.stopReason: undefined });
    return { events };
  }

  // 📖 Agent requests. Permission requests select the first allow-once option;
  // everything else (fs callbacks) is declined with a JSON-RPC error.
  if (message.method !== undefined && message.id !== undefined) {
    if (message.method === 'session/request_permission') {
      const params = message.params && typeof message.params === 'object' ? message.params as Record<string, unknown>: {};
      const options = Array.isArray(params.options) ? params.options as unknown[]: [];
      let optionId: string | undefined;
      for (const option of options) {
        const record = option && typeof option === 'object' ? option as Record<string, unknown>: {};
        if (record.kind === 'allow_once' && typeof record.optionId === 'string') {
          optionId = record.optionId;
          break;
        }
      }
      outbound.push(JSON.stringify({
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result: {
          outcome: optionId
            ? { outcome: 'selected', optionId }
           : { outcome: 'cancelled' },
        },
      }));
      return { events, outbound };
    }
    outbound.push(JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id: message.id,
      error: { code: -32601, message: `kandown does not implement ${String(message.method)}` },
    }));
    return { events, outbound };
  }

  // 📖 Notifications.
  if (message.method === 'session/update' && message.params && typeof message.params === 'object') {
    const params = message.params as Record<string, unknown>;
    const update = params.update && typeof params.update === 'object' ? params.update as Record<string, unknown>: undefined;
    if (update) parseSessionUpdate(update, events);
    return { events };
  }

  return { events };
}

export const acpAdapter: HarnessAdapter = {
  protocol: 'acp',
  buildArgs,
  initialStdin: () => initialStdin(),
  parseLine,
};
