/**
 * @file Agent harness contracts: the normalized event model and session types
 * @description Defines the single event vocabulary every harness adapter
 * normalizes to, the session configuration the runtime accepts, and the adapter
 * interface each protocol backend implements. Kandown never talks to an LLM
 * directly: it drives harnesses the user already installed and authenticated
 * (claude, codex, pi, any ACP agent), so this module describes *control and
 * observation*, never credentials or models.
 *
 * 📖 The event list is deliberately closed (nine types). Everything a chat UI,
 * a live-edit view or an orchestrator needs flows through one of them:
 * `session_started`, `message_delta`, `tool_started`, `tool_finished`,
 * `file_changed`, `usage`, `turn_completed`, `error`, `stopped`. Adapter
 * parsers are pure functions from one stdout line to a list of these events
 * (plus optional stdin replies), which is what makes them unit-testable
 * without spawning a real harness.
 *
 * @functions
 *  → (types only)
 *
 * @exports PermissionMode, PermissionSupport, AgentEventType, AgentEvent, AgentSessionConfig, AgentSessionInfo, AgentSessionStatus, AgentUsageTotals, HarnessAdapter, AdapterEvent, AdapterParseResult, AdapterState, EDIT_TOOL_NAMES
 * @see src/cli/lib/agent/agent-runtime.ts: the facade that spawns and drives adapters
 * @see src/cli/lib/agent/detect.ts: which binaries can act as harnesses
 */

import type { PermissionMode, PermissionSupport } from '../../../lib/types.js';

/** 📖 File-editing tool names recognized across adapters: when a tool with one
 *  of these names (case-insensitive) starts or finishes, adapters emit a
 *  `file_changed` event so the board can highlight the task being edited. */
export const EDIT_TOOL_NAMES = new Set(['write', 'edit', 'multiedit', 'notebookedit', 'apply_patch', 'apply-patch', 'str_replace', 'create', 'patch']);

/** 📖 One event emitted by an adapter, before the runtime decorates it with the
 *  kandown session id, harness id and timestamp. Parsers produce these. */
export type AdapterEvent =
  | { type: 'session_started'; harnessSessionId: string; model?: string; permissionMode: PermissionMode; permissionSupport: PermissionSupport }
  | { type: 'message_delta'; text: string; partial: boolean; channel: 'text' | 'thinking' }
  | { type: 'tool_started'; toolCallId?: string; toolName: string; summary?: string }
  | { type: 'tool_finished'; toolCallId?: string; toolName?: string; ok: boolean; summary?: string }
  | { type: 'file_changed'; path: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; costUsd?: number }
  | { type: 'turn_completed'; stopReason?: string }
  | { type: 'error'; message: string; fatal: boolean };

/** 📖 Fully identified event as delivered to consumers (SSE subscribers, the
 *  in-process registry, future orchestrators). The runtime adds `sessionId`
 *  (kandown id), `harnessId`, and an ISO timestamp to every event. `stopped`
 *  is runtime-generated only (process exit), never produced by a parser. */
type AgentEventMeta = { sessionId: string; harnessId: string; timestamp: string };

export type AgentEvent =
  | (AdapterEvent & AgentEventMeta)
  | ({ type: 'stopped'; reason: 'user' | 'exit' | 'crash'; exitCode?: number | null } & AgentEventMeta);

/** 📖 Mutable per-session parse state an adapter carries across stdout lines
 *  (current harness session id, whether session_started already fired, ...). */
export interface AdapterState {
  harnessSessionId?: string;
  model?: string;
  sessionStartedEmitted?: boolean;
  permissionMode: PermissionMode;
  permissionSupport: PermissionSupport;
  /** 📖 True while the harness is mid turn (set by interactive adapters), so
   *  the runtime knows whether a follow-up message must be queued
   *  (pi streamingBehavior) or can start a turn right away. */
  busy?: boolean;
  /** 📖 ACP-only scratch state: the agent-side session id, the next JSON-RPC
   *  request id to hand out, and the id of the in-flight session/prompt. */
  acpSessionId?: string;
  acpNextRequestId?: number;
  acpPendingPromptId?: number;
}

/** 📖 Result of parsing one stdout line: zero or more normalized events plus
 *  optional lines to write back to the harness stdin (handshakes, prompts,
 *  mode switches). `outbound` keeps adapters fully synchronous and pure. */
export interface AdapterParseResult {
  events: AdapterEvent[];
  outbound?: string[];
}

/** 📖 One protocol backend. `buildArgs` turns a session config into the child
 *  process argv; `initialStdin` seeds protocols that need a handshake or an
 *  explicit prompt command; `parseLine` maps one stdout line at a time;
 *  `onStop` lets a protocol say goodbye gracefully (pi wants `abort`). */
export interface HarnessAdapter {
  /** Human-readable protocol label for logs and settings display. */
  protocol: string;
  buildArgs(config: AgentSessionConfig, binPath: string): string[];
  initialStdin?(config: AgentSessionConfig): string[];
  parseLine(line: string, state: AdapterState, config: AgentSessionConfig): AdapterParseResult;
  /** stdin lines to send when the user stops the session, before SIGTERM. */
  onStop?(state: AdapterState): string[];
}

/** 📖 Everything the runtime needs to start one harness session. `prompt` is
 *  the compiled `kandown work` document (task context or board digest) the
 *  harness receives as its initial user message; the harness persists its own
 *  conversation, kandown keeps only thin index data (see t308). */
export interface AgentSessionConfig {
  /** Detection id of the harness to drive: `claude`, `codex`, `pi`, `opencode`, ... */
  harnessId: string;
  /** Absolute path the session runs in: always the kandown project root. */
  projectRoot: string;
  /** Initial user message, typically the compiled kandown-work Markdown. */
  prompt: string;
  /** Requested permission mode; adapters map it onto the harness' own modes. */
  permissionMode: PermissionMode;
  /** Native harness session to continue, when the caller wants a resume.
   *  Shape depends on the harness: claude/codex take an id, pi takes the
   *  session file path. */
  resumeSessionId?: string;
  /** 📖 True when the session was launched with a skill whose manifest sets
   *  chat.autoApply (t310): routed permission requests are auto-allowed
   *  instead of surfacing an Approval Card. Server-authoritative, derived
   *  from the resolved skill; the client never sends this flag. */
  skillAutoApply?: boolean;
  /** 📖 Extra argv that switch the binary into its harness-wire mode (ACP
   *  agents need a flag; one-protocol harnesses need none). Copied from the
   *  harness definition by the runtime at session creation. */
  protocolArgs?: string[];
}

/** 📖 Lifecycle of a kandown session record. `completed` means the harness
 *  process exited on its own after finishing a turn; `stopped` means the user
 *  (or an orchestrator) killed it; `failed` means it died without completing. */
export type AgentSessionStatus = 'starting' | 'running' | 'completed' | 'stopped' | 'failed';

/** 📖 Cumulative usage of one session, summed by the runtime from the
 *  harness' `usage` events: `tokens` counts input + output + cached-input
 *  tokens, `costUsd` sums the harness-reported cost. JSON-safe, so it rides
 *  along on every session snapshot and endpoint response (t311 budget
 *  enforcement and UI totals). */
export interface AgentUsageTotals {
  tokens: number;
  costUsd: number;
}

/** 📖 JSON-serializable view of a live or finished session, as returned by the
 *  daemon endpoints and consumed by the web UI. */
export interface AgentSessionInfo {
  id: string;
  harnessId: string;
  status: AgentSessionStatus;
  /** Session id reported by the harness itself (claude session id, codex
   *  thread id, pi session id, ACP session id), or undefined until known.
   *  Persisted by the t308 index so conversations can resume. */
  harnessSessionId?: string;
  startedAt: string;
  exitCode?: number | null;
  /** 📖 Running usage totals, zeroed at creation and accumulated as `usage`
   *  events arrive. The orchestrator reads these to enforce session budget
   *  caps; the browser mirror (AgentSessionPayload) keeps the field optional
   *  so payloads from older daemons stay valid. */
  usageTotals?: AgentUsageTotals;
}
