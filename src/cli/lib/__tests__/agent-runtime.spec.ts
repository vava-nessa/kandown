/**
 * @file Agent harness adapter tests
 * @description Locks the pure half of the t307 harness foundation: each
 * protocol adapter's argv mapping (permission modes, resume flags) and its
 * stdout-line-to-event normalization, plus the runtime's follow-up routing
 * decision surface. Real harness binaries are never spawned; every fixture
 * line mirrors a documented protocol payload (claude stream-json, codex exec
 * json, pi rpc, ACP JSON-RPC).
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/agent-runtime.ts
 */

import { describe, expect, it } from 'vitest';
import { buildArgs as claudeArgs, parseLine as claudeParse } from '../agent/adapters/claude-code';
import { buildArgs as codexArgs, parseLine as codexParse } from '../agent/adapters/codex';
import { buildArgs as piArgs, initialStdin as piStdin, parseLine as piParse, onStop as piStop } from '../agent/adapters/pi';
import { buildArgs as acpArgs, initialStdin as acpStdin, parseLine as acpParse } from '../agent/adapters/acp';
import type { AdapterState, AdapterEvent } from '../agent/types';

function makeState(permissionMode: AdapterState['permissionMode'] = 'yolo', support: AdapterState['permissionSupport'] = 'advisory'): AdapterState {
  return { permissionMode, permissionSupport: support };
}

const BASE_CONFIG = {
  harnessId: 'test',
  projectRoot: '/tmp/project',
  prompt: 'PROMPT',
  permissionMode: 'yolo' as const,
};

function types(events: AdapterEvent[]): string[] {
  return events.map(event => event.type);
}

describe('claude-code adapter', () => {
  it('maps yolo and accept-edits onto native permission modes and resume', () => {
    expect(claudeArgs({ ...BASE_CONFIG, permissionMode: 'yolo' }, '/bin/claude')).toContain('bypassPermissions');
    expect(claudeArgs({ ...BASE_CONFIG, permissionMode: 'accept-edits' }, '/bin/claude')).toContain('acceptEdits');
    const resumed = claudeArgs({ ...BASE_CONFIG, resumeSessionId: 'ses9' }, '/bin/claude');
    expect(resumed).toEqual(expect.arrayContaining(['--resume', 'ses9']));
  });

  it('normalizes init, text, tool_use, tool_result and result lines', () => {
    const state = makeState('yolo', 'native');
    const init = claudeParse(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'c1', model: 'm' }), state);
    expect(types(init.events)).toEqual(['session_started']);
    expect(init.events[0]).toMatchObject({ harnessSessionId: 'c1', model: 'm', permissionSupport: 'native' });

    const assistant = claudeParse(JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/p/a.md' } },
      ] },
    }), state);
    expect(assistant.events).toEqual([
      { type: 'message_delta', text: 'hello', partial: false, channel: 'text' },
      { type: 'tool_started', toolCallId: 't1', toolName: 'Write', summary: '/p/a.md' },
      { type: 'file_changed', path: '/p/a.md' },
    ]);

    const toolResult = claudeParse(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false }] },
    }), state);
    expect(types(toolResult.events)).toEqual(['tool_finished']);

    const result = claudeParse(JSON.stringify({
      type: 'result', subtype: 'success', total_cost_usd: 0.5,
      usage: { input_tokens: 10, output_tokens: 5 },
    }), state);
    expect(result.events).toEqual([
      { type: 'usage', inputTokens: 10, outputTokens: 5, costUsd: 0.5 },
      { type: 'turn_completed', stopReason: 'success' },
    ]);
  });

  it('ignores non-JSON banner lines', () => {
    expect(claudeParse('welcome to claude', makeState()).events).toEqual([]);
  });
});

describe('codex adapter', () => {
  it('maps yolo onto bypass flags and accept-edits onto the workspace sandbox', () => {
    const yolo = codexArgs({ ...BASE_CONFIG, permissionMode: 'yolo' }, '/bin/codex');
    expect(yolo).toContain('--dangerously-bypass-approvals-and-sandbox');
    const accept = codexArgs({ ...BASE_CONFIG, permissionMode: 'accept-edits' }, '/bin/codex');
    expect(accept).toEqual(expect.arrayContaining(['--sandbox', 'workspace-write']));
    const resumed = codexArgs({ ...BASE_CONFIG, resumeSessionId: 'th1' }, '/bin/codex');
    expect(resumed.slice(0, 4)).toEqual(['/bin/codex', 'exec', 'resume', 'th1']);
  });

  it('normalizes thread, item and turn lines', () => {
    const state = makeState();
    const thread = codexParse(JSON.stringify({ type: 'thread.started', thread_id: 'th1' }), state);
    expect(types(thread.events)).toEqual(['session_started']);
    expect(thread.events[0]).toMatchObject({ harnessSessionId: 'th1', permissionSupport: 'advisory' });

    const started = codexParse(JSON.stringify({
      type: 'item.started', item: { type: 'command_execution', id: 'i1', command: 'ls' },
    }), state);
    expect(started.events).toEqual([{ type: 'tool_started', toolCallId: 'i1', toolName: 'command', summary: 'ls' }]);

    const message = codexParse(JSON.stringify({
      type: 'item.completed', item: { type: 'agent_message', text: 'done' },
    }), state);
    expect(message.events).toEqual([{ type: 'message_delta', text: 'done', partial: false, channel: 'text' }]);

    const fileChange = codexParse(JSON.stringify({
      type: 'item.completed', item: { type: 'file_change', changes: [{ path: '/p/a.md' }, { path: '/p/b.md' }] },
    }), state);
    expect(fileChange.events).toEqual([
      { type: 'file_changed', path: '/p/a.md' },
      { type: 'file_changed', path: '/p/b.md' },
    ]);

    const turn = codexParse(JSON.stringify({
      type: 'turn.completed', usage: { input_tokens: 7, cached_input_tokens: 2, output_tokens: 3 },
    }), state);
    expect(turn.events).toEqual([
      { type: 'usage', inputTokens: 7, outputTokens: 3, cachedInputTokens: 2 },
      { type: 'turn_completed' },
    ]);

    const failed = codexParse(JSON.stringify({ type: 'turn.failed', error: { message: 'boom' } }), state);
    expect(failed.events).toEqual([{ type: 'error', message: 'boom', fatal: true }]);
  });
});

describe('pi adapter', () => {
  it('seeds stdin with switch_session, get_state and the prompt', () => {
    expect(piArgs(BASE_CONFIG, '/bin/pi')).toEqual(['/bin/pi', '--mode', 'rpc']);
    const lines = piStdin({ ...BASE_CONFIG, resumeSessionId: '/s/session.jsonl' }).map(line => JSON.parse(line));
    expect(lines[0]).toEqual({ type: 'switch_session', sessionPath: '/s/session.jsonl' });
    expect(lines[1].type).toBe('get_state');
    expect(lines[2].message).toBe('PROMPT');
  });

  it('normalizes state, streaming deltas, tools and turns', () => {
    const state = makeState();
    const stateResponse = piParse(JSON.stringify({
      type: 'response', command: 'get_state', success: true,
      data: { sessionId: 'pi1', model: { id: 'model-x' } },
    }), state);
    expect(stateResponse.events).toEqual([{
      type: 'session_started', harnessSessionId: 'pi1', model: 'model-x',
      permissionMode: 'yolo', permissionSupport: 'advisory',
    }]);

    const delta = piParse(JSON.stringify({
      type: 'message_update',
      usage: { input: 4, output: 2, cacheRead: 1, cost: { total: 0.01 } },
      assistantMessageEvent: { type: 'text_delta', delta: 'he' },
    }), state);
    expect(delta.events).toEqual([
      { type: 'usage', inputTokens: 4, outputTokens: 2, cachedInputTokens: 1, costUsd: 0.01 },
      { type: 'message_delta', text: 'he', partial: true, channel: 'text' },
    ]);

    const toolCall = piParse(JSON.stringify({
      type: 'message_update', assistantMessageEvent: { type: 'toolcall_start', id: 'tc1', toolName: 'write' },
    }), state);
    expect(toolCall.events).toEqual([{ type: 'tool_started', toolCallId: 'tc1', toolName: 'write' }]);

    const toolEnd = piParse(JSON.stringify({
      type: 'tool_execution_end', toolCallId: 'tc1', toolName: 'write', args: { path: '/p/a.md' }, isError: false,
    }), state);
    expect(toolEnd.events).toEqual([
      { type: 'tool_finished', toolCallId: 'tc1', toolName: 'write', ok: true },
      { type: 'file_changed', path: '/p/a.md' },
    ]);

    // 📖 tool_execution_start carries the args: the excerpt rides the duplicate
    // tool_started so the fold can patch the open row (pi rows are not nameless).
    const execStart = piParse(JSON.stringify({
      type: 'tool_execution_start', toolCallId: 'tc1', toolName: 'bash', args: { command: 'ls tasks/' },
    }), state);
    expect(execStart.events).toEqual([
      { type: 'tool_started', toolCallId: 'tc1', toolName: 'bash', summary: 'ls tasks/' },
    ]);

    expect(piParse(JSON.stringify({ type: 'turn_end' }), state).events).toEqual([{ type: 'turn_completed' }]);

    expect(piParse(JSON.stringify({ type: 'agent_start' }), state)).toEqual({ events: [] });
    expect(state.busy).toBe(true);
    expect(piParse(JSON.stringify({ type: 'agent_settled' }), state)).toEqual({ events: [] });
    expect(state.busy).toBe(false);

    const failure = piParse(JSON.stringify({ type: 'response', command: 'prompt', success: false, error: 'nope' }), state);
    expect(failure.events).toEqual([{ type: 'error', message: 'nope', fatal: true }]);
  });

  it('says abort before termination', () => {
    expect(piStop()).toEqual([JSON.stringify({ type: 'abort' })]);
  });
});

describe('acp adapter', () => {
  it('drives the initialize, session/new, set_mode, prompt handshake', () => {
    const state = makeState('accept-edits');
    expect(acpArgs({ ...BASE_CONFIG, permissionMode: 'accept-edits', protocolArgs: ['acp'] }, '/bin/opencode'))
      .toEqual(['/bin/opencode', 'acp']);
    expect(JSON.parse(acpStdin()[0])).toMatchObject({ id: 1, method: 'initialize' });

    const init = acpParse(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } }), state, {
      ...BASE_CONFIG, permissionMode: 'accept-edits',
    });
    expect(JSON.parse(init.outbound![0])).toMatchObject({ id: 2, method: 'session/new' });

    const session = acpParse(JSON.stringify({
      jsonrpc: '2.0', id: 2,
      result: { sessionId: 'a1', modes: { availableModes: [{ id: 'acceptEdits' }, { id: 'yolo' }] } },
    }), state, { ...BASE_CONFIG, permissionMode: 'accept-edits', projectRoot: '/tmp/project', prompt: 'PROMPT' });
    expect(session.events).toEqual([{
      type: 'session_started', harnessSessionId: 'a1',
      permissionMode: 'accept-edits', permissionSupport: 'native',
    }]);
    expect(JSON.parse(session.outbound![0])).toMatchObject({ method: 'session/set_mode', params: { modeId: 'acceptEdits' } });
    expect(JSON.parse(session.outbound![1])).toMatchObject({ method: 'session/prompt', params: { prompt: [{ type: 'text', text: 'PROMPT' }] } });
  });

  it('stays advisory when no session mode matches the request', () => {
    const state = makeState('yolo');
    acpParse(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, BASE_CONFIG);
    const session = acpParse(JSON.stringify({
      jsonrpc: '2.0', id: 2, result: { sessionId: 'a2', modes: { availableModes: [{ id: 'something-else' }] } },
    }), state, BASE_CONFIG);
    expect(session.outbound).toHaveLength(1);
    expect(session.events[0]).toMatchObject({ permissionSupport: 'advisory' });
  });

  it('normalizes session updates, prompt completion and permission requests', () => {
    const state = makeState();
    state.acpSessionId = 'a1';
    state.acpPendingPromptId = 3;
    state.acpNextRequestId = 4;

    const chunk = acpParse(JSON.stringify({
      jsonrpc: '2.0', method: 'session/update',
      params: { sessionId: 'a1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } },
    }), state, BASE_CONFIG);
    expect(chunk.events).toEqual([{ type: 'message_delta', text: 'hi', partial: true, channel: 'text' }]);

    const toolCall = acpParse(JSON.stringify({
      jsonrpc: '2.0', method: 'session/update',
      params: { sessionId: 'a1', update: { sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'Edit file' } },
    }), state, BASE_CONFIG);
    expect(toolCall.events).toEqual([{ type: 'tool_started', toolCallId: 'tc1', toolName: 'Edit file' }]);

    const toolUpdate = acpParse(JSON.stringify({
      jsonrpc: '2.0', method: 'session/update',
      params: { sessionId: 'a1', update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc1', status: 'failed' } },
    }), state, BASE_CONFIG);
    expect(toolUpdate.events).toEqual([{ type: 'tool_finished', toolCallId: 'tc1', ok: false }]);

    const permission = acpParse(JSON.stringify({
      jsonrpc: '2.0', id: 10, method: 'session/request_permission',
      params: { sessionId: 'a1', options: [{ kind: 'allow_once', optionId: 'ok1' }, { kind: 'reject_once', optionId: 'no1' }] },
    }), state, BASE_CONFIG);
    expect(JSON.parse(permission.outbound![0])).toMatchObject({
      id: 10,
      result: { outcome: { outcome: 'selected', optionId: 'ok1' } },
    });

    const done = acpParse(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { stopReason: 'end_turn' } }), state, BASE_CONFIG);
    expect(done.events).toEqual([{ type: 'turn_completed', stopReason: 'end_turn' }]);
  });
});
