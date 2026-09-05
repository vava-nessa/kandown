/**
 * @file AgentRuntime: the harness session facade
 * @description Spawns and drives harness sessions, normalizing every protocol
 * into the shared event model. Kandown never embeds an LLM: this module starts
 * the harness binary the user already installed and authenticated, streams its
 * stdout through the protocol adapter, and exposes one bounded API surface
 * (create / subscribe / send / stop) for the daemon endpoints, the chat
 * sidebar (t308) and the orchestrator (t311).
 *
 * 📖 Session lifecycle. Interactive protocols (pi rpc, ACP) keep one child
 * process alive across turns; one-shot protocols (claude stream-json, codex
 * exec) exit after each turn, so a follow-up message re-spawns the harness
 * with its native resume mechanism (`--resume <id>`, `exec resume <id>`, pi
 * `switch_session`) and the stream continues under the same kandown session
 * id. Harnesses persist their own conversations; kandown holds nothing but
 * this in-memory registry (the thin on-disk index is t308's).
 *
 * 📖 Framing: stdout is split on `\n` only. Node's readline additionally
 * splits on U+2028/U+2029 which are legal inside JSON strings, and pi's RPC
 * spec explicitly forbids that. Adapter parsing happens inside try/catch so a
 * malformed harness line can never take the daemon down.
 *
 * 📖 Usage accounting (t311): every `usage` event is summed into the record's
 * `usageTotals` (tokens = input + output + cached input; costUsd from the
 * harness) inside recordEvent, the same funnel that buffers and broadcasts,
 * so the totals exposed on AgentSessionInfo always match what subscribers
 * saw. The autopilot orchestrator reads these to enforce session budget caps.
 *
 * 📖 Model selection (round 4): `config.model` is adapter-owned. The pi,
 * claude and codex adapters translate it into their own launch flag in
 * buildArgs; the ACP adapters deliberately ignore it (their agents
 * self-select models), so an unset model is the normal case, never an error.
 *
 * @functions
 *  → createAgentSession         : resolve the harness, spawn, start streaming
 *  → listAgentSessions          : JSON-safe registry snapshot
 *  → getAgentSession            : one session snapshot or undefined
 *  → subscribeAgentSession      : live listener + buffered replay (SSE backing)
 *  → sendToSession              : steer a running turn or resume a finished one
 *  → setAgentPermissionHandler  : per-session callback for routed permissions
 *  → deliverRawLine             : write one pre-built protocol line to stdin
 *  → stopAgentSession           : graceful stop, then SIGTERM
 *  → resetAgentSessions         : test-only registry wipe
 *
 * @exports createAgentSession, listAgentSessions, getAgentSession, subscribeAgentSession, sendToSession, DeliveryMode, piFollowUpCommand, setAgentPermissionHandler, deliverRawLine, stopAgentSession, resetAgentSessions, AgentPermissionRequest, PermissionRoutingAdapter, MAX_SESSIONS, EVENT_BUFFER_LIMIT
 * @see src/cli/lib/agent/types.ts: the event model
 * @see src/cli/lib/agent/detect.ts: the harness catalog and PATH resolution
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AdapterState, AgentEvent, AgentSessionConfig, AgentSessionInfo, HarnessAdapter } from './types.js';
import { resolveHarness } from './detect.js';
import { claudeCodeAdapter } from './adapters/claude-code.js';
import { codexAdapter } from './adapters/codex.js';
import { piAdapter } from './adapters/pi.js';
import { acpAdapter } from './adapters/acp.js';

/** 📖 Registry cap: enough for real orchestration, small enough that a leaked
 *  daemon cannot accumulate unbounded session records. */
export const MAX_SESSIONS = 50;
/** 📖 Per-session replay buffer so an SSE subscriber that connects after a
 *  turn started still sees the full history. */
export const EVENT_BUFFER_LIMIT = 500;

/** 📖 One permission request an adapter extracted from the harness stream and
 *  wants a decision for (t309). Protocol-neutral: `requestId` and `options`
 *  are opaque continuation data the adapter needs to build the reply later,
 *  `title` and `kind` are what the approval UI shows. */
export interface AgentPermissionRequest {
  /** Adapter-specific id of the inbound request (for ACP: the JSON-RPC id). */
  requestId: number | string;
  toolCallId?: string;
  title: string;
  kind: string;
  options: unknown[];
}

/** 📖 Optional adapter capability for permission routing. `extractPermissionRequest`
 *  recognizes one raw stdout line as a permission request (protocol knowledge
 *  stays inside the adapter); `onPermissionRequest` decides: `allow` lets the
 *  adapter's own parseLine auto-answer as before, `route` hands the decision
 *  to the daemon so the web UI can approve or reject it. */
export interface PermissionRoutingAdapter {
  extractPermissionRequest?(line: string): AgentPermissionRequest | null;
  onPermissionRequest?(state: AdapterState, request: AgentPermissionRequest): 'allow' | 'route';
}

const ADAPTERS: Record<string, HarnessAdapter> = {
  'claude-stream-json': claudeCodeAdapter,
  'codex-exec-json': codexAdapter,
  'pi-rpc': piAdapter,
  'acp': acpAdapter,
};

interface SessionRecord {
  info: AgentSessionInfo;
  config: AgentSessionConfig;
  adapter: HarnessAdapter;
  state: AdapterState;
  emitter: EventEmitter;
  buffer: AgentEvent[];
  child: ChildProcess | null;
  stopRequested: boolean;
  turnSeen: boolean;
  stderrTail: string;
  /** Absolute harness binary path, resolved once at creation for re-spawns. */
  resolvedBinPath: string;
  /** 📖 Daemon-registered callback for routed permission requests; null unless
   *  the server asked to be the decider, and nulled again on process exit. */
  permissionHandler: ((request: AgentPermissionRequest) => void) | null;
  /** 📖 ACP queue-mode FIFO (round 4): session/prompt requests parked here by
   *  sendToSession when the caller asked for 'queue' delivery, flushed into
   *  stdin by handleLine's turn_completed path (the ACP turn ends with its
   *  session/prompt response). Entries carry their own request id because the
   *  "current prompt" pointer (acpPendingPromptId) must only move at drain
   *  time, never at queue time: moving it early would orphan the response of
   *  the in-flight turn and its turn_completed would never fire. Cleared on
   *  process exit so a dead stdin is never written. */
  pendingAcp: Array<{ id: number; line: string }>;
}

const sessions = new Map<string, SessionRecord>();

/** 📖 Splits a chunk stream into LF-delimited lines. Deliberately not
 *  readline: pi's RPC framing forbids splitting on U+2028/U+2029. */
function createLineSplitter(onLine: (line: string) => void): { push(chunk: string): void; flush(): void } {
  let buffer = '';
  return {
    push(chunk: string) {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        onLine(line);
        index = buffer.indexOf('\n');
      }
    },
    flush() {
      if (buffer.trim()) onLine(buffer.replace(/\r$/, ''));
      buffer = '';
    },
  };
}

function meta(record: SessionRecord) {
  return { sessionId: record.info.id, harnessId: record.info.harnessId, timestamp: new Date().toISOString() };
}

/** 📖 Usage events can carry partial or absent counters; anything that is not
 *  a usable finite number counts as zero so one malformed line cannot poison
 *  the totals the budget enforcement (t311) relies on. */
function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 📖 Single funnel for every event a session produces. `usage` events are
 *  summed into the record's usageTotals here, at the same place events are
 *  recorded, so the totals on AgentSessionInfo always match what subscribers
 *  saw. tokens = input + output + cached input; costUsd comes straight from
 *  the harness. */
function recordEvent(record: SessionRecord, event: AgentEvent): void {
  if (event.type === 'usage') {
    const totals = record.info.usageTotals ?? { tokens: 0, costUsd: 0 };
    totals.tokens += finiteOrZero(event.inputTokens) + finiteOrZero(event.outputTokens) + finiteOrZero(event.cachedInputTokens);
    totals.costUsd += finiteOrZero(event.costUsd);
    record.info.usageTotals = totals;
  }
  record.buffer.push(event);
  if (record.buffer.length > EVENT_BUFFER_LIMIT) record.buffer.shift();
  record.emitter.emit('event', event);
}

/** 📖 JSON-safe copy of a session record's info: the nested usageTotals object
 *  is copied too, so a caller mutating a snapshot can never corrupt the live
 *  accumulator. */
function snapshotInfo(record: SessionRecord): AgentSessionInfo {
  return {
    ...record.info,
    ...(record.info.usageTotals ? { usageTotals: { ...record.info.usageTotals } } : {}),
  };
}

/** 📖 Runs one stdout line through the adapter and fans the normalized events
 *  out to the buffer and subscribers. Never throws.
 *
 *  📖 Permission routing (t309): a permission-aware adapter first gets the
 *  chance to recognize the line as a permission request and route it. On
 *  `route` with a daemon-registered handler the line is consumed here and the
 *  answer comes later through deliverRawLine. Any other outcome (`allow`, no
 *  hook, no handler) falls through to parseLine, whose auto-answer keeps the
 *  harness from ever deadlocking on kandown. */
function handleLine(record: SessionRecord, line: string): void {
  if (!line.trim()) return;
  const routable = record.adapter as HarnessAdapter & PermissionRoutingAdapter;
  const permission = routable.extractPermissionRequest?.(line) ?? null;
  if (
    permission
    && record.permissionHandler
    // 📖 autoApply skills (t310) short-circuit the approval UI in
    // accept-edits mode: parseLine's auto-answer below picks allow_once.
    && !record.config.skillAutoApply
    && routable.onPermissionRequest?.(record.state, permission) === 'route'
  ) {
    record.permissionHandler(permission);
    return;
  }
  let result;
  try {
    result = record.adapter.parseLine(line, record.state, record.config);
  } catch (error) {
    recordEvent(record, {
      type: 'error',
      message: `adapter parse failure: ${error instanceof Error ? error.message: String(error)}`,
      fatal: false,
      ...meta(record),
    });
    return;
  }
  // 📖 ACP queue-mode drain (round 4): a turn_completed means the agent is
  // done with the current turn, which is exactly when parked follow-ups may
  // start the next one. Splice first so a failure below cannot re-deliver.
  let turnJustCompleted = false;
  for (const event of result.events ?? []) {
    if (event.type === 'session_started') {
      record.info.harnessSessionId = event.harnessSessionId || record.state.harnessSessionId;
    }
    if (event.type === 'turn_completed') {
      record.turnSeen = true;
      turnJustCompleted = true;
    }
    recordEvent(record, { ...event, ...meta(record) } as AgentEvent);
  }
  if (result.outbound && record.child?.stdin && !record.child.stdin.destroyed) {
    for (const line of result.outbound) record.child.stdin.write(`${line}\n`);
  }
  if (turnJustCompleted && record.pendingAcp.length > 0 && record.child?.stdin && !record.child.stdin.destroyed) {
    const queued = record.pendingAcp.splice(0);
    // 📖 Point the adapter's "current prompt" at the last drained request so
    // its completion is the one recognized as the next turn end.
    const last = queued[queued.length - 1];
    if (last) record.state.acpPendingPromptId = last.id;
    for (const entry of queued) record.child.stdin.write(`${entry.line}\n`);
  }
}

/** 📖 Wires one child process into a session record: stdout through the line
 *  splitter and adapter, stderr into a bounded tail used for error reports,
 *  exit into status transitions and the terminal `stopped` event. */
function attachChild(record: SessionRecord, child: ChildProcess): void {
  record.child = child;
  const splitter = createLineSplitter(line => handleLine(record, line));

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', chunk => splitter.push(chunk));
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => {
    record.stderrTail = `${record.stderrTail}${chunk}`.slice(-2000);
  });

  const finish = (reason: 'user' | 'exit' | 'crash', code: number | null): void => {
    splitter.flush();
    record.child = null;
    record.state.busy = false;
    record.info.exitCode = code;
    // 📖 No decision can reach a dead process: drop the permission handler so
    // a routed request can never be answered after exit.
    record.permissionHandler = null;
    // 📖 Queued ACP follow-ups belong to the process that just died: drop
    // them, a resumed session re-sends its message through the normal path.
    record.pendingAcp = [];
    // 📖 A crash before any turn is useless without context: surface the last
    // stderr lines as the error the UI will actually show the user.
    if (reason === 'crash' && !record.turnSeen && record.stderrTail.trim()) {
      recordEvent(record, {
        type: 'error',
        message: record.stderrTail.trim().split('\n').slice(-3).join('\n'),
        fatal: true,
        ...meta(record),
      });
    }
    record.info.status = reason === 'crash' ? 'failed': reason === 'user' ? 'stopped': 'completed';
    recordEvent(record, { type: 'stopped', reason, exitCode: code, ...meta(record) });
  };

  child.on('error', error => {
    recordEvent(record, {
      type: 'error',
      message: `failed to start ${record.info.harnessId}: ${error.message}`,
      fatal: true,
      ...meta(record),
    });
    if (record.child === child) finish('crash', null);
  });

  child.on('close', code => {
    if (record.stopRequested) finish('user', code);
    else if (code === 0) finish('exit', code);
    else finish('crash', code);
  });
}

/** 📖 Spawns (or re-spawns after a one-shot turn) the harness process and
 *  seeds stdin with the adapter's handshake. Resume is fully encoded in
 *  `record.config.resumeSessionId` + `prompt`: claude/codex take spawn flags,
 *  pi re-switches session over RPC through initialStdin. */
function startChild(record: SessionRecord): void {
  const config = record.config;
  const argv = record.adapter.buildArgs(config, record.resolvedBinPath);
  const child = spawn(argv[0], argv.slice(1), {
    cwd: config.projectRoot,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  attachChild(record, child);
  const initial = record.adapter.initialStdin?.(config) ?? [];
  if (initial.length > 0) {
    child.once('spawn', () => {
      for (const line of initial) child.stdin?.write(`${line}\n`);
    });
  }
}

function evictIfNeeded(): void {
  if (sessions.size < MAX_SESSIONS) return;
  const settled = [...sessions.values()]
    .filter(record => record.info.status !== 'starting' && record.info.status !== 'running')
    .sort((a, b) => a.info.startedAt.localeCompare(b.info.startedAt));
  if (settled.length > 0) sessions.delete(settled[0].info.id);
  else {
    const oldest = sessions.keys().next();
    if (!oldest.done) sessions.delete(oldest.value);
  }
}

/** 📖 Creates and starts one harness session. Throws a readable Error when the
 *  harness id is unknown or its binary is not installed; endpoint callers map
 *  that onto a 400. Returns the JSON-safe session snapshot. */
export function createAgentSession(config: AgentSessionConfig): AgentSessionInfo {
  const resolved = resolveHarness(config.harnessId);
  if (!resolved) {
    throw new Error(`Harness "${config.harnessId}" is not installed or unknown.`);
  }
  const adapter = ADAPTERS[resolved.def.protocol];
  if (!adapter) {
    throw new Error(`No adapter for protocol "${resolved.def.protocol}".`);
  }
  evictIfNeeded();
  const record: SessionRecord = {
    info: {
      id: `ses_${randomUUID().slice(0, 8)}`,
      harnessId: config.harnessId,
      status: 'starting',
      startedAt: new Date().toISOString(),
      usageTotals: { tokens: 0, costUsd: 0 },
      ...(config.model ? { model: config.model } : {}),
    },
    config: { ...config, protocolArgs: [...resolved.def.protocolArgs] },
    adapter,
    state: {
      permissionMode: config.permissionMode,
      // 📖 Detection-level support; ACP upgrades this per session when a
      // matching mode is reported by session/new.
      permissionSupport: resolved.def.permissionModes[config.permissionMode],
    },
    emitter: new EventEmitter(),
    buffer: [],
    child: null,
    stopRequested: false,
    turnSeen: false,
    stderrTail: '',
    resolvedBinPath: resolved.binPath,
    permissionHandler: null,
    pendingAcp: [],
  };
  sessions.set(record.info.id, record);
  startChild(record);
  return snapshotInfo(record);
}

/** 📖 JSON-safe snapshot of every session, creation order preserved. */
export function listAgentSessions(): AgentSessionInfo[] {
  return [...sessions.values()].map(snapshotInfo);
}

/** 📖 One session snapshot for endpoint-level checks, or undefined. */
export function getAgentSession(id: string): AgentSessionInfo | undefined {
  const record = sessions.get(id);
  return record ? snapshotInfo(record): undefined;
}

/** 📖 Subscribes to a session's live events and immediately replays the
 *  buffer to the new listener. Returns the unsubscribe function, or null when
 *  the session is unknown. */
export function subscribeAgentSession(id: string, listener: (event: AgentEvent) => void): (() => void) | null {
  const record = sessions.get(id);
  if (!record) return null;
  for (const event of record.buffer) listener(event);
  record.emitter.on('event', listener);
  return () => record.emitter.off('event', listener);
}

function promptAcpSession(sessionId: string, id: number, text: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'session/prompt',
    params: { sessionId, prompt: [{ type: 'text', text }] },
  });
}

/** 📖 Delivery modes for a follow-up message (round 4).
 *  - 'steer': deliver into the LIVE turn where the protocol allows it (pi
 *    injects at the next tool-call boundary; ACP sends the prompt right away
 *    and lets the agent arbitrate).
 *  - 'queue': never interrupt; pi queues with streamingBehavior 'followUp'
 *    (a no-op when idle, since there is nothing to queue behind), ACP parks
 *    the message on the session record until the next turn_completed.
 *  Absent means the protocol's pre-round-4 default, which the pi and ACP
 *  branches preserve exactly. One-shot adapters (claude, codex) accept the
 *  parameter and ignore it: their follow-ups always resume after the current
 *  process exits, so both modes behave identically there. */
export type DeliveryMode = 'steer' | 'queue';

/** 📖 Pure pi follow-up routing (round 4): the exact stdin line a follow-up
 *  becomes, decided from busy state and the requested delivery alone.
 *  - steer + busy: pi's `steer` command, injected at the next tool-call
 *    boundary.
 *  - busy (queue or no delivery): a `prompt` with streamingBehavior
 *    'followUp', pi's queue.
 *  - idle (any delivery): a plain prompt, because steering or queueing behind
 *    nothing both mean "start the turn now".
 *  Extracted as a pure function so the routing table is unit-testable
 *  without spawning a harness; sendToSession only does the stdin write. */
export function piFollowUpCommand(message: string, busy: boolean, delivery: DeliveryMode | undefined, promptId: string): string {
  if (delivery === 'steer' && busy) {
    return JSON.stringify({ type: 'steer', message });
  }
  return JSON.stringify(
    busy
      ? { type: 'prompt', message, streamingBehavior: 'followUp' }
      : { id: promptId, type: 'prompt', message },
  );
}

/** 📖 Parks a queued ACP session/prompt request on the record, assigning its
 *  future request id. Deliberately does NOT touch acpPendingPromptId: the
 *  in-flight turn keeps the pointer until the drain (see handleLine). */
function queueAcpPrompt(record: SessionRecord, text: string): void {
  const sessionId = record.state.acpSessionId;
  if (!sessionId) return;
  const nextId = record.state.acpNextRequestId ?? 3;
  record.state.acpNextRequestId = nextId + 1;
  record.pendingAcp.push({ id: nextId, line: promptAcpSession(sessionId, nextId, text) });
}

/** 📖 Sends a follow-up user message. Interactive protocols steer or queue the
 *  live process; one-shot protocols re-spawn with their native resume flag so
 *  the conversation continues under the same kandown session id. */
export function sendToSession(id: string, text: string, delivery?: DeliveryMode): { ok: boolean; error?: string } {
  const record = sessions.get(id);
  if (!record) return { ok: false, error: 'Unknown session' };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Message is empty' };

  // 📖 Live process: hand the message to stdin via the protocol's own
  // steering mechanism (pi steer/queue modes, ACP re-prompt or FIFO).
  if (record.child?.stdin && !record.child.stdin.destroyed) {
    if (record.adapter === piAdapter) {
      record.child.stdin.write(`${piFollowUpCommand(trimmed, record.state.busy === true, delivery, `kandown-prompt-${Date.now()}`)}\n`);
      return { ok: true };
    }
    if (record.adapter === acpAdapter && record.state.acpSessionId) {
      // 📖 Queue mode parks the line; the next turn_completed (handled in
      // handleLine) flushes the FIFO. Steer and the default deliver the
      // prompt immediately, even mid turn: ACP agents arbitrate concurrent
      // prompts themselves.
      if (delivery === 'queue') {
        queueAcpPrompt(record, trimmed);
        return { ok: true };
      }
      const nextId = record.state.acpNextRequestId ?? 3;
      record.state.acpNextRequestId = nextId + 1;
      record.state.acpPendingPromptId = nextId;
      record.child.stdin.write(`${promptAcpSession(record.state.acpSessionId, nextId, trimmed)}\n`);
      return { ok: true };
    }
    // 📖 One-shot harness mid turn: the delivery parameter is accepted and
    // ignored; resuming is only possible once the process has exited.
    return { ok: false, error: 'This harness is one-shot; wait for the turn to finish.' };
  }

  // 📖 One-shot protocol, process finished: resume a new turn in-place.
  if (record.info.status === 'completed' || record.info.status === 'stopped' || record.info.status === 'failed') {
    if (!record.info.harnessSessionId) {
      return { ok: false, error: 'The harness never reported a session id; resume is impossible.' };
    }
    record.config.prompt = trimmed;
    record.config.resumeSessionId = record.info.harnessSessionId;
    record.stopRequested = false;
    record.turnSeen = false;
    record.stderrTail = '';
    record.info.status = 'running';
    try {
      startChild(record);
    } catch (error) {
      record.info.status = 'failed';
      return { ok: false, error: error instanceof Error ? error.message: String(error) };
    }
    return { ok: true };
  }

  return { ok: false, error: `Session is ${record.info.status}; cannot send now.` };
}

/** 📖 Registers (or clears, with null) the daemon-side decider for routed
 *  permission requests on one session. Only called by the runtime when the
 *  adapter both extracts a permission request and routes it, so sessions on
 *  non-routing adapters never invoke the handler. False for an unknown
 *  session. */
export function setAgentPermissionHandler(
  sessionId: string,
  handler: ((request: AgentPermissionRequest) => void) | null,
): boolean {
  const record = sessions.get(sessionId);
  if (!record) return false;
  record.permissionHandler = handler;
  return true;
}

/** 📖 Writes one fully built protocol line to a session's stdin. Used to answer
 *  a routed permission request after the user decides (the reply line comes
 *  from the adapter's response builder). False when the session is unknown or
 *  its process is gone, which makes a late answer a harmless no-op. */
export function deliverRawLine(sessionId: string, line: string): boolean {
  const record = sessions.get(sessionId);
  if (!record?.child?.stdin || record.child.stdin.destroyed) return false;
  record.child.stdin.write(`${line}\n`);
  return true;
}

/** 📖 Graceful stop: protocol goodbye (pi abort), then SIGTERM after a short
 *  grace period. The process close handler emits the terminal `stopped` event
 *  with reason `user`; a dead session is marked stopped immediately. */
export function stopAgentSession(id: string): boolean {
  const record = sessions.get(id);
  if (!record) return false;
  record.stopRequested = true;
  if (record.child) {
    const goodbye = record.adapter.onStop?.(record.state) ?? [];
    if (record.child.stdin && !record.child.stdin.destroyed) {
      for (const line of goodbye) record.child.stdin.write(`${line}\n`);
    }
    const child = record.child;
    setTimeout(() => {
      if (record.child === child && child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
      }
    }, 3000);
  } else {
    record.info.status = 'stopped';
    recordEvent(record, { type: 'stopped', reason: 'user', exitCode: null, ...meta(record) });
  }
  return true;
}

/** 📖 Test-only: clears the registry between integration runs. */
export function resetAgentSessions(): void {
  for (const record of sessions.values()) {
    record.emitter.removeAllListeners();
    record.child?.kill('SIGTERM');
  }
  sessions.clear();
}
