/**
 * @file ACP adapter tests: handshake resume and protocol model application
 * @description Locks the t324 surface: resume travels as session/load in the
 * handshake (never as an argv flag, which strict parsers reject), a refused
 * load falls back to a fresh session/new with a non-fatal error event, a
 * failed first session/new is fatal, and a model pick rides
 * session/set_config_option whenever the session exposes a `model` config
 * option (verified live against opencode 1.18) while staying silent when the
 * pick already matches the current value. Everything is pure JSON-RPC line
 * work: no harness process is spawned.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/adapters/acp.ts
 */

import { describe, expect, it } from 'vitest';
import { acpAdapter, buildArgs, parseLine } from '../agent/adapters/acp';
import type { AdapterState, AgentSessionConfig } from '../agent/types';

function acpConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    harnessId: 'opencode',
    projectRoot: '/tmp/project',
    prompt: 'work',
    permissionMode: 'yolo',
    protocolArgs: ['acp'],
    ...overrides,
  };
}

function freshState(): AdapterState {
  return { permissionMode: 'yolo', permissionSupport: 'advisory' };
}

/** 📖 Drives the handshake one line at a time, collecting every outbound
 * request, so a test can assert on the whole request sequence. */
function handshake(config: AgentSessionConfig): string[] {
  const state = freshState();
  const outbound: string[] = [];
  let lines = acpAdapter.initialStdin?.(config) ?? [];
  outbound.push(...lines);
  const step = (line: string): void => {
    const result = parseLine(line, state, config);
    outbound.push(...(result.outbound ?? []));
    lines = result.outbound ?? [];
  };
  // 📖 The initialize answer, then let the test continue from there.
  step(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } }));
  return outbound;
}

function parse(typed: unknown): Record<string, unknown> {
  return JSON.parse(typeof typed === 'string' ? typed : String(typed)) as Record<string, unknown>;
}

describe('handshake resume (t324)', () => {
  it('sends session/load instead of session/new when resuming', () => {
    const outbound = handshake(acpConfig({ resumeSessionId: 'ses_prev' }));
    const open = parse(outbound[1]);
    expect(open.method).toBe('session/load');
    expect(open.params).toMatchObject({ sessionId: 'ses_prev', cwd: '/tmp/project' });
  });

  it('sends session/new when not resuming', () => {
    const outbound = handshake(acpConfig());
    expect(parse(outbound[1]).method).toBe('session/new');
  });

  it('adopts the resume id when the load answer echoes none', () => {
    // 📖 Observed on opencode: session/load answers with configOptions but no
    // sessionId; the loaded id IS the session id.
    const config = acpConfig({ resumeSessionId: 'ses_prev' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    const result = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { configOptions: [] } }), state, config);
    expect(state.acpSessionId).toBe('ses_prev');
    expect(state.harnessSessionId).toBe('ses_prev');
    expect(result.events.some(event => event.type === 'session_started')).toBe(true);
  });

  it('falls back to a fresh session/new when the load is refused', () => {
    const config = acpConfig({ resumeSessionId: 'ses_gone' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    const refused = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'no such session' } }), state, config);
    // 📖 The user learns their history is not coming, but the session lives.
    const note = refused.events.find(event => event.type === 'error');
    expect(note).toMatchObject({ fatal: false });
    expect(state.acpResumeFailed).toBe(true);
    const retry = refused.outbound?.length === 1 ? parse(refused.outbound[0]) : null;
    expect(retry?.method).toBe('session/new');
    // 📖 And the fresh answer completes the handshake normally.
    const done = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'ses_new' } }), state, config);
    expect(state.acpSessionId).toBe('ses_new');
    expect(done.events.some(event => event.type === 'session_started')).toBe(true);
  });

  it('retries the load only once', () => {
    const config = acpConfig({ resumeSessionId: 'ses_gone' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'no such session' } }), state, config);
    // 📖 A second refusal is a failed session/new: fatal, no loop.
    const again = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'still no' } }), state, config);
    const error = again.events.find(event => event.type === 'error');
    expect(error).toMatchObject({ fatal: true });
    expect(again.outbound ?? []).toEqual([]);
  });
});

describe('model application through configOptions (t324)', () => {
  const modelOption = { id: 'model', type: 'select', currentValue: 'kilo/minimax-m3:free', options: [{ value: 'zai-coding-plan/glm-5.3', name: 'GLM-5.3' }] };

  it('sets the model before prompting when the session exposes the option', () => {
    const config = acpConfig({ model: 'zai-coding-plan/glm-5.3' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    const opened = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'ses_1', configOptions: [modelOption] } }), state, config);
    const outbound = opened.outbound ?? [];
    const methods = outbound.map(line => parse(line).method);
    // 📖 Order matters: the pick lands before the first prompt sees the model.
    expect(methods).toEqual(['session/set_config_option', 'session/prompt']);
    expect(parse(outbound[0])).toMatchObject({
      id: 3,
      method: 'session/set_config_option',
      params: { sessionId: 'ses_1', configId: 'model', value: 'zai-coding-plan/glm-5.3' },
    });
    expect(state.acpConfigOptionPendingId).toBe(3);
  });

  it('skips the request when the pick already matches the current value', () => {
    const config = acpConfig({ model: 'kilo/minimax-m3:free' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    const opened = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'ses_1', configOptions: [modelOption] } }), state, config);
    expect((opened.outbound ?? []).map(line => parse(line).method)).toEqual(['session/prompt']);
  });

  it('reports a refused pick as non-fatal and keeps the turn alive', () => {
    const config = acpConfig({ model: 'zai-coding-plan/glm-5.3' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    const opened = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'ses_1', configOptions: [modelOption] } }), state, config);
    // 📖 The prompt request is already in flight; the reply to id 3 arrives
    // while the turn runs.
    const refused = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'bad value' } }), state, config);
    expect(refused.events.find(event => event.type === 'error')).toMatchObject({ fatal: false });
    expect(state.acpConfigOptionPendingId).toBeUndefined();
    // 📖 The prompt completion still closes the turn normally.
    const done = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 4, result: { stopReason: 'end_turn' } }), state, config);
    expect(done.events.some(event => event.type === 'turn_completed')).toBe(true);
  });

  it('never emits the request without configOptions (no spawn flag either)', () => {
    // 📖 A harness with neither surface cannot honor the pick; that must not
    // break the session. opencode is covered by configOptions, gemini by its
    // spawn flag, the long tail simply runs on its default model.
    expect(buildArgs(acpConfig({ model: 'x' }), '/bin/opencode')).toEqual(['/bin/opencode', 'acp']);
    const config = acpConfig({ model: 'x' });
    const state = freshState();
    parseLine(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), state, config);
    const opened = parseLine(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { sessionId: 'ses_1' } }), state, config);
    expect((opened.outbound ?? []).map(line => parse(line).method)).toEqual(['session/prompt']);
  });
});
