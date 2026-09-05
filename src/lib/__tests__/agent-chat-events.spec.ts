/**
 * @file Tests for the agent chat event fold
 * @description Locks the reducer contract the chat sidebar renders from:
 * streaming text accumulates then finalizes, thinking stays on its own channel,
 * tool calls pair by toolCallId, usage accumulates, errors append entries (and
 * fatal ones close the turn), stopped ends the turn, and optimistic user
 * messages can be appended and rolled back. The SSE transport is mocked at the
 * event level: these tests exercise the pure fold only.
 */

import { describe, expect, it } from 'vitest';
import {
  applyChatEvent,
  appendUserMessage,
  createChatFoldState,
  isAgentChatEvent,
  removeChatEntry,
  type AgentChatEvent,
  type ChatAssistantEntry,
  type ChatUserEntry,
} from '../agent-chat-events';

/** Base fields every event carries on the wire. Generic so the literal type of
 * `type` flows through spreads and keeps each fake event precisely typed. */
function base<T extends AgentChatEvent['type']>(type: T): { sessionId: string; harnessId: string; timestamp: string; type: T } {
  return { sessionId: 'ses_1', harnessId: 'claude', timestamp: '2026-09-05T10:00:00Z', type };
}

function delta(text: string, channel: 'text' | 'thinking' = 'text'): AgentChatEvent {
  return { ...base('message_delta'), text, partial: true, channel } as AgentChatEvent;
}

function lastAssistant(state: ReturnType<typeof createChatFoldState>): ChatAssistantEntry {
  const last = state.messages[state.messages.length - 1];
  if (!last || last.kind !== 'assistant') throw new Error(`expected assistant entry, got ${String(last?.kind)}`);
  return last;
}

function findAssistant(state: ReturnType<typeof createChatFoldState>): ChatAssistantEntry {
  const found = state.messages.find(entry => entry.kind === 'assistant');
  if (!found || found.kind !== 'assistant') throw new Error('expected an assistant entry in the fold');
  return found;
}

describe('isAgentChatEvent', () => {
  it('accepts every known event shape and rejects garbage', () => {
    expect(isAgentChatEvent({ ...base('session_started'), harnessSessionId: 'hs_1', permissionMode: 'yolo', permissionSupport: 'native' })).toBe(true);
    expect(isAgentChatEvent({ ...base('message_delta'), text: 'a', partial: true, channel: 'text' })).toBe(true);
    expect(isAgentChatEvent({ ...base('tool_started'), toolName: 'Read' })).toBe(true);
    expect(isAgentChatEvent({ ...base('tool_finished'), ok: true })).toBe(true);
    expect(isAgentChatEvent({ ...base('file_changed'), path: 'src/a.ts' })).toBe(true);
    expect(isAgentChatEvent({ ...base('usage'), inputTokens: 1 })).toBe(true);
    expect(isAgentChatEvent({ ...base('turn_completed') })).toBe(true);
    expect(isAgentChatEvent({ ...base('error'), message: 'boom', fatal: false })).toBe(true);
    expect(isAgentChatEvent({ ...base('stopped'), reason: 'exit' })).toBe(true);
    expect(isAgentChatEvent({ heartbeat: true })).toBe(false);
    expect(isAgentChatEvent({ ...base('message_delta'), text: 42, partial: true, channel: 'text' })).toBe(false);
    expect(isAgentChatEvent(null)).toBe(false);
  });
});

describe('applyChatEvent: streaming and finalizing', () => {
  it('accumulates text deltas into one streaming message and finalizes on turn_completed', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, delta('Hel'));
    state = applyChatEvent(state, delta('lo '));
    state = applyChatEvent(state, delta('world'));

    expect(state.messages).toHaveLength(1);
    const streaming = lastAssistant(state);
    expect(streaming.text).toBe('Hello world');
    expect(streaming.streaming).toBe(true);
    expect(state.turnActive).toBe(true);

    state = applyChatEvent(state, { ...base('turn_completed') });
    const done = lastAssistant(state);
    expect(done.text).toBe('Hello world');
    expect(done.streaming).toBe(false);
    expect(state.turnActive).toBe(false);
  });

  it('keeps thinking deltas on the separate thinking channel of the same message', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, delta('pondering', 'thinking'));
    state = applyChatEvent(state, delta('the answer', 'text'));

    const entry = lastAssistant(state);
    expect(entry.thinking).toBe('pondering');
    expect(entry.text).toBe('the answer');
    // A text delta means the thinking phase closed for now.
    expect(entry.thinkingActive).toBe(false);
  });

  it('starts a fresh assistant message for a second turn after finalize', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, delta('first'));
    state = applyChatEvent(state, { ...base('turn_completed') });
    state = applyChatEvent(state, delta('second'));

    expect(state.messages).toHaveLength(2);
    expect(lastAssistant(state).text).toBe('second');
    expect(lastAssistant(state).streaming).toBe(true);
  });

  it('drops a streaming message that finalized completely empty', () => {
    let state = createChatFoldState();
    // tool_started lazily creates the streaming assistant, turn ends with nothing visible.
    state = applyChatEvent(state, { ...base('turn_completed') });
    expect(state.messages).toHaveLength(0);
  });

  it('records changed files deduped and capped', () => {
    let state = createChatFoldState();
    for (const path of ['a.ts', 'b.ts', 'a.ts', 'c.ts', 'd.ts']) {
      state = applyChatEvent(state, { ...base('file_changed'), path });
    }
    expect(state.changedFiles).toEqual(['b.ts', 'a.ts', 'c.ts', 'd.ts']);
  });
});

describe('applyChatEvent: tool pairing', () => {
  it('pairs tool_started and tool_finished by toolCallId', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, { ...base('tool_started'), toolCallId: 'tc_1', toolName: 'Bash', summary: 'running tests' });
    state = applyChatEvent(state, { ...base('tool_started'), toolCallId: 'tc_2', toolName: 'Read' });
    state = applyChatEvent(state, { ...base('tool_finished'), toolCallId: 'tc_1', ok: false, summary: 'tests failed' });

    const entry = lastAssistant(state);
    expect(entry.tools).toHaveLength(2);
    expect(entry.tools[0]).toMatchObject({ toolCallId: 'tc_1', toolName: 'Bash', ok: false, finished: true, summary: 'tests failed' });
    expect(entry.tools[1]).toMatchObject({ toolCallId: 'tc_2', toolName: 'Read', ok: null, finished: false });
  });

  it('keeps the started summary when the finish carries none', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, { ...base('tool_started'), toolName: 'Grep', summary: 'searching' });
    state = applyChatEvent(state, { ...base('tool_finished'), toolName: 'Grep', ok: true });
    expect(lastAssistant(state).tools[0]?.summary).toBe('searching');
  });

  it('renders an unmatched tool_finished as a finished chip instead of dropping it', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, { ...base('tool_finished'), toolName: 'Write', ok: true });
    const entry = lastAssistant(state);
    expect(entry.tools).toHaveLength(1);
    expect(entry.tools[0]).toMatchObject({ toolName: 'Write', ok: true, finished: true });
  });
});

describe('applyChatEvent: usage, errors and stop', () => {
  it('accumulates usage totals across events', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, { ...base('usage'), inputTokens: 100, outputTokens: 20, costUsd: 0.01 });
    state = applyChatEvent(state, { ...base('usage'), inputTokens: 50, cachedInputTokens: 10, costUsd: 0.02 });
    expect(state.totals.inputTokens).toBe(150);
    expect(state.totals.outputTokens).toBe(20);
    expect(state.totals.cachedInputTokens).toBe(10);
    expect(state.totals.costUsd).toBeCloseTo(0.03, 10);
  });

  it('appends non-fatal errors without closing the turn, fatal ones finalize', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, delta('partial answer'));
    state = applyChatEvent(state, { ...base('error'), message: 'tool hiccup', fatal: false });
    expect(state.messages.some(entry => entry.kind === 'error' && !entry.fatal)).toBe(true);
    expect(findAssistant(state).streaming).toBe(true);
    expect(state.turnActive).toBe(true);

    state = applyChatEvent(state, { ...base('error'), message: 'harness died', fatal: true });
    // 📖 The error entry itself is last after a fatal error; the assistant
    // entry below it must have been finalized.
    expect(findAssistant(state).streaming).toBe(false);
    expect(state.turnActive).toBe(false);
  });

  it('marks the turn ended on stopped', () => {
    let state = createChatFoldState();
    state = applyChatEvent(state, delta('working'));
    state = applyChatEvent(state, { ...base('stopped'), reason: 'user' });
    expect(state.turnActive).toBe(false);
    expect(lastAssistant(state).streaming).toBe(false);
  });
});

describe('optimistic user messages', () => {
  it('appends a user message and rolls it back by id', () => {
    let state = createChatFoldState();
    const appended = appendUserMessage(state, 'fix the bug');
    state = appended.state;
    expect(state.messages).toHaveLength(1);
    expect((state.messages[0] as ChatUserEntry)).toMatchObject({ kind: 'user', text: 'fix the bug' });

    const rolled = removeChatEntry(state, appended.messageId);
    expect(rolled.messages).toHaveLength(0);
  });

  it('removeChatEntry is a no-op for unknown ids and never mutates the input', () => {
    const { state } = appendUserMessage(createChatFoldState(), 'hello');
    const untouched = removeChatEntry(state, 'chat-999');
    expect(untouched).toBe(state);
    expect(state.messages).toHaveLength(1);
  });
});
