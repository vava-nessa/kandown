/**
 * @file Agent chat event model (t308)
 * @description Pure, framework-free model of the JSON events the daemon streams
 * on GET /api/agent/sessions/:id/events, plus the reducer that folds them into
 * the chat message list rendered by the agent chat sidebar. Kept free of React
 * and Zustand so the fold is unit-testable: the SSE transport lives in the
 * store slice, this module only decides what events MEAN.
 *
 * 📖 The stream REPLAYS buffered history on connect, so reconnecting is safe:
 * the reducer is written to tolerate out-of-order-ish replays (a tool_finished
 * whose tool_started was never seen still produces a sane entry). User messages
 * are NOT events: the UI appends them optimistically when sending, via
 * {@link appendUserMessage}, and can roll them back with {@link removeChatEntry}
 * when the POST fails.
 *
 * @functions
 *  → isAgentChatEvent + per-type guards: narrow an unknown SSE payload
 *  → createChatFoldState: empty fold state for one session
 *  → applyChatEvent: fold one event into a fold state (pure)
 *  → appendUserMessage: append an optimistic user message (pure)
 *  → removeChatEntry: drop one entry by id (rollback helper, pure)
 *  → nextChatEntryId: stable React keys for entries
 *
 * @exports AgentChatEvent, SessionStartedEvent, MessageDeltaEvent, ToolStartedEvent,
 * ToolFinishedEvent, FileChangedEvent, UsageEvent, TurnCompletedEvent, ErrorEvent,
 * StoppedEvent, ChatEntry, ChatUserEntry, ChatAssistantEntry, ChatErrorEntry,
 * ChatToolEntry, ChatUsageTotals, ChatFoldState, isAgentChatEvent, createChatFoldState,
 * applyChatEvent, appendUserMessage, removeChatEntry, nextChatEntryId
 * @see src/lib/store/agentChatSlice.ts: the SSE transport + store wiring
 */

import type { PermissionMode, PermissionSupport } from './types';

/* ═════════════ Event types (wire shape) ═════════════ */

/** 📖 Fields every streamed event carries, regardless of type. */
interface AgentChatEventBase {
  sessionId: string;
  harnessId: string;
  timestamp: string;
}

export interface SessionStartedEvent extends AgentChatEventBase {
  type: 'session_started';
  harnessSessionId: string;
  model?: string;
  permissionMode: PermissionMode;
  permissionSupport: PermissionSupport;
}

export interface MessageDeltaEvent extends AgentChatEventBase {
  type: 'message_delta';
  text: string;
  partial: boolean;
  channel: 'text' | 'thinking';
}

export interface ToolStartedEvent extends AgentChatEventBase {
  type: 'tool_started';
  toolCallId?: string;
  toolName: string;
  summary?: string;
}

export interface ToolFinishedEvent extends AgentChatEventBase {
  type: 'tool_finished';
  toolCallId?: string;
  toolName?: string;
  ok: boolean;
  summary?: string;
}

export interface FileChangedEvent extends AgentChatEventBase {
  type: 'file_changed';
  path: string;
}

export interface UsageEvent extends AgentChatEventBase {
  type: 'usage';
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
}

export interface TurnCompletedEvent extends AgentChatEventBase {
  type: 'turn_completed';
  stopReason?: string;
}

export interface ErrorEvent extends AgentChatEventBase {
  type: 'error';
  message: string;
  fatal: boolean;
}

export interface StoppedEvent extends AgentChatEventBase {
  type: 'stopped';
  reason: 'user' | 'exit' | 'crash';
  exitCode?: number;
}

export type AgentChatEvent =
  | SessionStartedEvent
  | MessageDeltaEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | FileChangedEvent
  | UsageEvent
  | TurnCompletedEvent
  | ErrorEvent
  | StoppedEvent;

/* ═════════════ Type guards ═════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/** 📖 Common envelope check: every event carries these three strings. */
function hasEventBase(value: Record<string, unknown>): boolean {
  return isString(value.sessionId) && isString(value.harnessId) && isString(value.timestamp);
}

export function isSessionStartedEvent(value: unknown): value is SessionStartedEvent {
  if (!isRecord(value) || value.type !== 'session_started' || !hasEventBase(value)) return false;
  return isString(value.harnessSessionId)
    && (value.permissionMode === 'yolo' || value.permissionMode === 'accept-edits')
    && (value.permissionSupport === 'native' || value.permissionSupport === 'advisory')
    && isOptionalString(value.model);
}

export function isMessageDeltaEvent(value: unknown): value is MessageDeltaEvent {
  if (!isRecord(value) || value.type !== 'message_delta' || !hasEventBase(value)) return false;
  return isString(value.text)
    && typeof value.partial === 'boolean'
    && (value.channel === 'text' || value.channel === 'thinking');
}

export function isToolStartedEvent(value: unknown): value is ToolStartedEvent {
  if (!isRecord(value) || value.type !== 'tool_started' || !hasEventBase(value)) return false;
  return isString(value.toolName) && isOptionalString(value.toolCallId) && isOptionalString(value.summary);
}

export function isToolFinishedEvent(value: unknown): value is ToolFinishedEvent {
  if (!isRecord(value) || value.type !== 'tool_finished' || !hasEventBase(value)) return false;
  return typeof value.ok === 'boolean'
    && isOptionalString(value.toolCallId)
    && isOptionalString(value.toolName)
    && isOptionalString(value.summary);
}

export function isFileChangedEvent(value: unknown): value is FileChangedEvent {
  if (!isRecord(value) || value.type !== 'file_changed' || !hasEventBase(value)) return false;
  return isString(value.path);
}

export function isUsageEvent(value: unknown): value is UsageEvent {
  if (!isRecord(value) || value.type !== 'usage' || !hasEventBase(value)) return false;
  return isOptionalNumber(value.inputTokens)
    && isOptionalNumber(value.outputTokens)
    && isOptionalNumber(value.cachedInputTokens)
    && isOptionalNumber(value.costUsd);
}

export function isTurnCompletedEvent(value: unknown): value is TurnCompletedEvent {
  if (!isRecord(value) || value.type !== 'turn_completed' || !hasEventBase(value)) return false;
  return isOptionalString(value.stopReason);
}

export function isErrorEvent(value: unknown): value is ErrorEvent {
  if (!isRecord(value) || value.type !== 'error' || !hasEventBase(value)) return false;
  return isString(value.message) && typeof value.fatal === 'boolean';
}

export function isStoppedEvent(value: unknown): value is StoppedEvent {
  if (!isRecord(value) || value.type !== 'stopped' || !hasEventBase(value)) return false;
  return (value.reason === 'user' || value.reason === 'exit' || value.reason === 'crash')
    && (value.exitCode === undefined || typeof value.exitCode === 'number');
}

/** 📖 One-stop narrowing for the SSE onmessage handler: returns false for
 * heartbeats, garbage, and events from a newer daemon this build does not know. */
export function isAgentChatEvent(value: unknown): value is AgentChatEvent {
  return isSessionStartedEvent(value)
    || isMessageDeltaEvent(value)
    || isToolStartedEvent(value)
    || isToolFinishedEvent(value)
    || isFileChangedEvent(value)
    || isUsageEvent(value)
    || isTurnCompletedEvent(value)
    || isErrorEvent(value)
    || isStoppedEvent(value);
}

/* ═════════════ Chat model (fold output) ═════════════ */

export interface ChatUserEntry {
  kind: 'user';
  id: string;
  text: string;
}

/** 📖 One tool call inside an assistant turn. `ok` stays null until the
 * matching tool_finished lands, which is what the chip tint keys on. */
export interface ChatToolEntry {
  toolCallId: string | null;
  toolName: string;
  summary?: string;
  ok: boolean | null;
  finished: boolean;
}

export interface ChatAssistantEntry {
  kind: 'assistant';
  id: string;
  text: string;
  /** True while more deltas may still arrive for this entry. */
  streaming: boolean;
  /** Reasoning channel, kept separate from the answer text. */
  thinking: string;
  /** True while the latest delta was thinking (drives the live ActivityBlock). */
  thinkingActive: boolean;
  tools: ChatToolEntry[];
}

export interface ChatErrorEntry {
  kind: 'error';
  id: string;
  message: string;
  fatal: boolean;
}

export type ChatEntry = ChatUserEntry | ChatAssistantEntry | ChatErrorEntry;

/** 📖 Running token + cost totals for one session, accumulated from usage events. */
export interface ChatUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
}

/** 📖 Everything the sidebar renders for one session. The slice keeps one fold
 * state per session id and swaps it through Zustand on every event. */
export interface ChatFoldState {
  messages: ChatEntry[];
  totals: ChatUsageTotals;
  /** True from the first delta/tool of a turn until it completes, errors fatally or stops. */
  turnActive: boolean;
  /** 📖 Most recent workspace files the agent touched (deduped, newest last,
   * capped): rendered as a quiet "edited ..." line under the streaming turn. */
  changedFiles: string[];
}

let chatEntryCounter = 0;

/** 📖 Stable ids for React keys. Monotonic per page load; never persisted. */
export function nextChatEntryId(): string {
  chatEntryCounter += 1;
  return `chat-${chatEntryCounter}`;
}

export function createChatFoldState(): ChatFoldState {
  return {
    messages: [],
    totals: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0 },
    turnActive: false,
    changedFiles: [],
  };
}

/** 📖 The streaming assistant entry deltas/tools attach to: the last entry when
 * it is still streaming, otherwise a fresh one. Lazy creation means a turn that
 * produces no visible output never leaves an empty bubble behind. */
function ensureStreamingAssistant(messages: ChatEntry[]): { messages: ChatEntry[]; entry: ChatAssistantEntry } {
  const last = messages[messages.length - 1];
  if (last && last.kind === 'assistant' && last.streaming) {
    return { messages, entry: last };
  }
  const entry: ChatAssistantEntry = {
    kind: 'assistant',
    id: nextChatEntryId(),
    text: '',
    streaming: true,
    thinking: '',
    thinkingActive: false,
    tools: [],
  };
  return { messages: [...messages, entry], entry };
}

/** 📖 Closes every streaming assistant entry (at most one exists per fold).
 * A turn that finalized with no text, no thinking and no tools is dropped
 * entirely: nothing to render. Works positionally independent because error
 * entries can sit after the streaming entry when a fatal error lands first. */
function finalizeStreamingAssistant(messages: ChatEntry[]): ChatEntry[] {
  const next: ChatEntry[] = [];
  for (const entry of messages) {
    if (entry.kind !== 'assistant' || !entry.streaming) {
      next.push(entry);
      continue;
    }
    const isEmpty = entry.text.length === 0 && entry.thinking.length === 0 && entry.tools.length === 0;
    if (isEmpty) continue;
    next.push({ ...entry, streaming: false, thinkingActive: false });
  }
  return next;
}

/** 📖 Finds the open tool a finished event belongs to: by toolCallId first,
 * then by tool name, then any open tool. Returns -1 when nothing matches. */
function findOpenToolIndex(entry: ChatAssistantEntry, event: ToolFinishedEvent): number {
  const { tools } = entry;
  if (event.toolCallId) {
    const byId = tools.findIndex(tool => !tool.finished && tool.toolCallId === event.toolCallId);
    if (byId !== -1) return byId;
  }
  if (event.toolName) {
    const byName = tools.findIndex(tool => !tool.finished && tool.toolName === event.toolName);
    if (byName !== -1) return byName;
  }
  return tools.findIndex(tool => !tool.finished);
}

/**
 * 📖 Folds one SSE event into the chat state. Pure: the input state is never
 * mutated, a new state object is returned (the input is returned as-is when the
 * event changes nothing). Unknown event types cannot reach this function (the
 * guards filter them), so every branch below is exhaustive over the union.
 */
export function applyChatEvent(state: ChatFoldState, event: AgentChatEvent): ChatFoldState {
  switch (event.type) {
    // 📖 Session metadata only: the sidebar reads it for status, the fold has
    // nothing to render for it.
    case 'session_started':
      return state;

    case 'message_delta': {
      const { messages, entry } = ensureStreamingAssistant(state.messages);
      const patched: ChatAssistantEntry = event.channel === 'thinking'
        ? { ...entry, thinking: entry.thinking + event.text, thinkingActive: true }
       : { ...entry, text: entry.text + event.text, thinkingActive: false };
      return {
        ...state,
        messages: [...messages.slice(0, -1), patched],
        turnActive: true,
      };
    }

    case 'tool_started': {
      const { messages, entry } = ensureStreamingAssistant(state.messages);
      const existingIndex = event.toolCallId
        ? entry.tools.findIndex(tool => !tool.finished && tool.toolCallId === event.toolCallId)
       : -1;
      const tools = existingIndex !== -1
        ? entry.tools
       : [...entry.tools, {
            toolCallId: event.toolCallId ?? null,
            toolName: event.toolName,
            summary: event.summary,
            ok: null,
            finished: false,
          }];
      const patched: ChatAssistantEntry = { ...entry, tools };
      return {
        ...state,
        messages: [...messages.slice(0, -1), patched],
        turnActive: true,
      };
    }

    case 'tool_finished': {
      const { messages, entry } = ensureStreamingAssistant(state.messages);
      const index = findOpenToolIndex(entry, event);
      let tools: ChatToolEntry[];
      if (index === -1) {
        // 📖 Replays can surface a finish whose start was never buffered: keep
        // the result as a self-contained finished chip instead of dropping it.
        tools = [...entry.tools, {
          toolCallId: event.toolCallId ?? null,
          toolName: event.toolName ?? 'tool',
          summary: event.summary,
          ok: event.ok,
          finished: true,
        }];
      } else {
        tools = entry.tools.map((tool, i) => i === index
          ? { ...tool, finished: true, ok: event.ok, summary: event.summary ?? tool.summary }
         : tool);
      }
      const patched: ChatAssistantEntry = { ...entry, tools };
      return { ...state, messages: [...messages.slice(0, -1), patched] };
    }

    case 'file_changed': {
      // 📖 Dedupe, keep the tail capped so a chatty turn cannot grow the list
      // (and the render) without bound.
      const withoutDup = state.changedFiles.filter(path => path !== event.path);
      const changedFiles = [...withoutDup, event.path].slice(-8);
      return { ...state, changedFiles };
    }

    case 'usage': {
      const totals: ChatUsageTotals = {
        inputTokens: state.totals.inputTokens + (event.inputTokens ?? 0),
        outputTokens: state.totals.outputTokens + (event.outputTokens ?? 0),
        cachedInputTokens: state.totals.cachedInputTokens + (event.cachedInputTokens ?? 0),
        costUsd: state.totals.costUsd + (event.costUsd ?? 0),
      };
      return { ...state, totals };
    }

    case 'turn_completed':
      return { ...state, messages: finalizeStreamingAssistant(state.messages), turnActive: false };

    case 'error': {
      // 📖 Fatal errors end the turn (the harness is gone); advisory ones are
      // just surfaced as an entry while the stream keeps going.
      const messages: ChatEntry[] = [...state.messages, {
        kind: 'error',
        id: nextChatEntryId(),
        message: event.message,
        fatal: event.fatal,
      }];
      return event.fatal
        ? { ...state, messages: finalizeStreamingAssistant(messages), turnActive: false }
       : { ...state, messages };
    }

    case 'stopped':
      return { ...state, messages: finalizeStreamingAssistant(state.messages), turnActive: false };
  }
}

/**
 * 📖 Appends the user's own message optimistically (pure). Returns the new
 * state plus the entry id so the caller can roll the message back with
 * {@link removeChatEntry} if the send POST fails.
 */
export function appendUserMessage(state: ChatFoldState, text: string): { state: ChatFoldState; messageId: string } {
  const messageId = nextChatEntryId();
  const entry: ChatUserEntry = { kind: 'user', id: messageId, text };
  return { state: { ...state, messages: [...state.messages, entry] }, messageId };
}

/** 📖 Removes one entry by id. Used to roll back an optimistic user message
 * when the backend rejects the send. Pure. */
export function removeChatEntry(state: ChatFoldState, messageId: string): ChatFoldState {
  const messages = state.messages.filter(entry => entry.id !== messageId);
  if (messages.length === state.messages.length) return state;
  return { ...state, messages };
}
