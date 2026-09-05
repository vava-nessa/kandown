/**
 * @file Zustand store slice: autopilot orchestration (t311)
 * @description Web UI half of the autopilot daemon: keeps the latest
 * orchestration snapshot (run state, active sessions per task, queue, orphans,
 * accumulated token/cost totals), drives the sidebar controls (start, kill
 * switch) and powers the per-card presence chips plus the per-card stop
 * button.
 *
 * 📖 Transport: the `agent_autopilot` board SSE event is parsed and narrowed
 * by src/lib/watcher.ts on the shared `/api/events` stream; this slice
 * subscribes through {@link setupAutopilot}, which the store's setupWatcher
 * calls in every mode, next to the t309 slice. The stream is started here in
 * server mode, where nothing else opens the board EventSource.
 *
 * 📖 HTTP: the three autopilot routes (GET /api/agent/autopilot,
 * POST .../start, POST .../stop) and the per-session stop have no helper in
 * filesystem.ts (frozen for this task), so the slice performs them directly
 * with the same auth the shared rawApiFetch uses: the `X-Kandown-Token`
 * header from window.__KANDOWN_TOKEN__. Never throws; failures surface as
 * toasts and roll the optimistic state back.
 *
 * 📖 Totals: snapshots and events carry usage for the current run. The fold
 * treats incoming totals as deltas and accumulates them, resetting to the
 * incoming value whenever a snapshot lands outside a run (previous state idle
 * or absent, or an authoritative start response). Displayed totals therefore
 * follow the run and survive until the next run starts.
 *
 * 📖 Pure core: the snapshot fold ({@link ingestAutopilotSnapshot},
 * {@link applyAutopilotEvent}), the failed-stop rollback
 * ({@link rollbackAutopilotStop}) and the per-task lookups
 * ({@link autopilotTaskStatus}, {@link activeSessionForTask}) are pure and
 * unit-tested in src/lib/__tests__/autopilot.spec.ts.
 *
 * @functions
 *  → createInitialAutopilotState: empty autopilot state
 *  → createAutopilotSlice: SSE wiring, snapshot fetch, start, kill switch,
 *    per-session stop
 *  → ingestAutopilotSnapshot: fold one wire snapshot into the state (pure)
 *  → applyAutopilotEvent: fold one board event into the state (pure)
 *  → rollbackAutopilotStop: restore state after a failed kill switch (pure)
 *  → autopilotTaskStatus / activeSessionForTask: per-task lookups (pure)
 *
 * @exports AutopilotSlice, createAutopilotSlice, createInitialAutopilotState,
 * ingestAutopilotSnapshot, applyAutopilotEvent, rollbackAutopilotStop,
 * autopilotTaskStatus, activeSessionForTask, AutopilotWireSnapshot
 * @see src/lib/watcher.ts: the SSE parsing + type guard
 * @see src/lib/store/types.ts: AutopilotState shape
 * @see src/components/agent/AutopilotControls.tsx: sidebar kill switch
 * @see src/components/agent/CardStopButton.tsx: per-card chip + stop button
 */

import type { StateCreator } from 'zustand';
import { fileWatcher } from '../watcher';
import type { AgentAutopilotEvent } from '../watcher';
import type { State, AutopilotState, AutopilotSnapshot, AutopilotActiveEntry, AutopilotTotals } from './types';

/* ═════════════ Transport helpers ═════════════ */

function daemonToken(): string | null {
  return typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
   : null;
}

/**
 * 📖 POST helper for the autopilot routes filesystem.ts does not cover.
 * Mirrors rawApiFetch's transport: JSON body + token header, never throws.
 */
async function autopilotApiPost(path: string, body: unknown): Promise<Response | null> {
  const token = daemonToken();
  try {
    return await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Kandown-Token': token } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/* ═════════════ Payload guards (GET / POST snapshot bodies) ═════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** 📖 The frozen GET/POST snapshot shape: the board event plus the optional
 * harnessId and the run config echo (maxParallel, caps) this UI does not
 * consume (settings read the project config instead). */
export interface AutopilotWireSnapshot {
  state: 'idle' | 'running';
  harnessId?: string;
  active: AutopilotActiveEntry[];
  queue: string[];
  orphans: string[];
  totals: AutopilotTotals;
  at: string;
}

function isAutopilotEntry(value: unknown): value is AutopilotActiveEntry {
  return isRecord(value) && isString(value.taskId) && isString(value.sessionId);
}

/** 📖 Narrows a /api/agent/autopilot (or start/stop) response body without
 * casting. Malformed payloads are ignored (the caller keeps its state). */
export function isAutopilotWireSnapshot(value: unknown): value is AutopilotWireSnapshot {
  if (!isRecord(value)) return false;
  if (value.state !== 'idle' && value.state !== 'running') return false;
  if (!isString(value.at)) return false;
  if (value.harnessId !== undefined && !isString(value.harnessId)) return false;
  if (!Array.isArray(value.active) || !value.active.every(isAutopilotEntry)) return false;
  if (!Array.isArray(value.queue) || !value.queue.every(isString)) return false;
  if (!Array.isArray(value.orphans) || !value.orphans.every(isString)) return false;
  const totals = value.totals;
  return isRecord(totals)
    && typeof totals.tokens === 'number'
    && typeof totals.costUsd === 'number';
}

/** 📖 Reads and narrows the JSON body of an autopilot response. Returns null
 * on any transport or shape failure so callers can roll back uniformly. */
async function parseAutopilotResponse(res: Response): Promise<AutopilotWireSnapshot | null> {
  if (!res.ok) return null;
  try {
    const data: unknown = await res.json();
    return isAutopilotWireSnapshot(data) ? data : null;
  } catch {
    return null;
  }
}

/* ═════════════ Pure state transitions ═════════════ */

/**
 * 📖 Folds one wire snapshot (board event or HTTP response) into the
 * autopilot state. Pure: the input state is never mutated.
 *
 * 📖 Totals semantics: the daemon owns the run totals (it accumulates usage
 * per session and resets on start), so every snapshot CARRIES THE CUMULATIVE
 * RUN TOTALS and the fold replaces local totals with them outright. Never
 * accumulate wire totals client-side: the wire is already cumulative, and
 * adding it would inflate the numbers quadratically.
 */
export function ingestAutopilotSnapshot(
  state: AutopilotState,
  incoming: AutopilotWireSnapshot,
  _options: { resetTotals?: boolean } = {},
): AutopilotState {
  const previous = state.snapshot;
  const totals: AutopilotTotals = {
    tokens: incoming.totals.tokens,
    costUsd: incoming.totals.costUsd,
  };
  // 📖 The board event carries no harnessId: keep the one the run was
  // started with until the daemon reports a different one.
  const harnessId = incoming.harnessId ?? previous?.harnessId;
  return {
    // 📖 Any authoritative snapshot ends an in-flight kill switch: the wire
    // truth has caught up (or superseded) the optimistic flag.
    stopping: false,
    snapshot: {
      state: incoming.state,
      active: incoming.active,
      queue: incoming.queue,
      orphans: incoming.orphans,
      totals,
      at: incoming.at,
      ...(harnessId ? { harnessId } : {}),
    },
  };
}

/**
 * 📖 Folds one `agent_autopilot` board event into the state. Pure. Delegates
 * to {@link ingestAutopilotSnapshot}: the event totals are already the
 * daemon's cumulative run totals.
 */
export function applyAutopilotEvent(state: AutopilotState, event: AgentAutopilotEvent): AutopilotState {
  return ingestAutopilotSnapshot(state, {
    state: event.state,
    active: event.active,
    queue: event.queue,
    orphans: event.orphans,
    totals: event.totals,
    at: event.at,
  });
}

/**
 * 📖 Rolls back an optimistic kill switch that failed. Pure. Restores the
 * pre-stop snapshot unless a fresher snapshot landed while the request was in
 * flight (events keep flowing during the POST), and always clears the
 * `stopping` flag so the button unblocks.
 */
export function rollbackAutopilotStop(current: AutopilotState, backup: AutopilotSnapshot | null): AutopilotState {
  return {
    snapshot: current.snapshot ?? backup,
    stopping: false,
  };
}

/** 📖 What the board should display for one task: an active session shows the
 * "Working" chip and the stop button, a queued id the "Queued" chip, an
 * orphan the "Resumable" chip. Active wins over queued/orphan. Pure. */
export function autopilotTaskStatus(
  snapshot: AutopilotSnapshot | null,
  taskId: string,
): 'active' | 'queued' | 'orphan' | null {
  if (!snapshot) return null;
  if (snapshot.active.some(entry => entry.taskId === taskId)) return 'active';
  if (snapshot.queue.includes(taskId)) return 'queued';
  if (snapshot.orphans.includes(taskId)) return 'orphan';
  return null;
}

/** 📖 The session id currently working on one task, for the per-card stop
 * button. Null when the task is not active. Pure. */
export function activeSessionForTask(snapshot: AutopilotSnapshot | null, taskId: string): string | null {
  if (!snapshot) return null;
  return snapshot.active.find(entry => entry.taskId === taskId)?.sessionId ?? null;
}

/* ═════════════ Slice ═════════════ */

export interface AutopilotSlice {
  setupAutopilot: State['setupAutopilot'];
  ingestAutopilotEvent: State['ingestAutopilotEvent'];
  fetchAutopilotSnapshot: State['fetchAutopilotSnapshot'];
  startAutopilot: State['startAutopilot'];
  stopAutopilot: State['stopAutopilot'];
  stopAutopilotSession: State['stopAutopilotSession'];
}

/** 📖 Initial `autopilot` state, seeded into the store by store.ts next to
 * the spread slice (the slice itself only carries the actions). */
export function createInitialAutopilotState(): AutopilotState {
  return {
    snapshot: null,
    stopping: false,
  };
}

/** 📖 Unsubscribers from the previous setupAutopilot call. setupWatcher can
 * run again (project reopen) without fileWatcher.stop() in server mode, so
 * re-subscribing must first remove the previous handler to stay idempotent.
 * Same pattern as the t309 slice. */
let eventUnsubscribers: Array<() => void> = [];

export const createAutopilotSlice: StateCreator<State, [], [], AutopilotSlice> = (set, get) => ({
  setupAutopilot: () => {
    const ingest = (event: AgentAutopilotEvent): void => { get().ingestAutopilotEvent(event); };
    // 📖 Re-subscribe on every setupWatcher call: fileWatcher.stop() (local
    // project reopen) clears ALL listeners, so drop any previous subscription
    // first, then attach the fresh handler.
    eventUnsubscribers.forEach(off => off());
    eventUnsubscribers = [fileWatcher.on('agentAutopilot', ingest)];
    // 📖 In server mode nothing else opens the board EventSource: start it
    // here. Idempotent, and a no-op outside server mode.
    fileWatcher.startServerSse();
    // 📖 One snapshot fetch per setup (project open): covers a run that is
    // already going when the page loads, which the SSE stream never replays.
    void get().fetchAutopilotSnapshot();
  },

  ingestAutopilotEvent: (event) => {
    set(state => ({ autopilot: applyAutopilotEvent(state.autopilot, event) }));
  },

  fetchAutopilotSnapshot: async () => {
    const token = daemonToken();
    try {
      const res = await fetch('/api/agent/autopilot', {
        headers: token ? { 'X-Kandown-Token': token } : undefined,
      });
      const snapshot = await parseAutopilotResponse(res);
      if (!snapshot) return;
      set(state => ({ autopilot: ingestAutopilotSnapshot(state.autopilot, snapshot) }));
    } catch {
      // Daemon unreachable: the controls stay on their current state and the
      // next board event (or setup) retries.
    }
  },

  startAutopilot: async (harnessId) => {
    if (get().autopilot.stopping) return;
    const backup = get().autopilot.snapshot;
    // 📖 Optimistic running state with zeroed totals: the controls flip to
    // the kill switch at once and the incoming run deltas accumulate from a
    // clean slate. Rolled back wholesale on failure.
    set(state => ({
      autopilot: ingestAutopilotSnapshot(
        { ...state.autopilot, snapshot: null },
        {
          state: 'running',
          ...(harnessId ? { harnessId } : {}),
          active: [],
          queue: [],
          orphans: [],
          totals: { tokens: 0, costUsd: 0 },
          at: new Date().toISOString(),
        },
      ),
    }));
    const res = await autopilotApiPost('/api/agent/autopilot/start', harnessId ? { harnessId } : {});
    const snapshot = res ? await parseAutopilotResponse(res) : null;
    if (!snapshot) {
      // 📖 Restore the pre-start snapshot, then converge with the daemon in
      // the background: a board event may have landed while the POST was in
      // flight, and the GET is the cheapest way to un-stale the view.
      set(state => ({ autopilot: { ...state.autopilot, snapshot: backup, stopping: false } }));
      get().toast('Could not start autopilot. Is the kandown daemon running?', 'error');
      void get().fetchAutopilotSnapshot();
      return;
    }
    // 📖 Authoritative response: totals reset to what the daemon reports for
    // the fresh run.
    set(state => ({ autopilot: ingestAutopilotSnapshot(state.autopilot, snapshot, { resetTotals: true }) }));
  },

  stopAutopilot: async () => {
    if (get().autopilot.stopping) return;
    const backup = get().autopilot.snapshot;
    set(state => ({ autopilot: { ...state.autopilot, stopping: true } }));
    const res = await autopilotApiPost('/api/agent/autopilot/stop', {});
    const snapshot = res ? await parseAutopilotResponse(res) : null;
    if (!snapshot) {
      set(state => ({ autopilot: rollbackAutopilotStop(state.autopilot, backup) }));
      get().toast('Could not stop autopilot. Is the kandown daemon running?', 'error');
      return;
    }
    // 📖 Real state from the response. Totals keep accumulating semantics
    // (previous run still in view), so a zeroed idle snapshot freezes the
    // last run's spend instead of wiping it.
    set(state => ({ autopilot: ingestAutopilotSnapshot(state.autopilot, snapshot) }));
  },

  stopAutopilotSession: async (sessionId) => {
    // 📖 Same route and transport as the chat sidebar's stopSession: the
    // session is the same object, only the entry point differs (card vs
    // composer). Never throws.
    const res = await autopilotApiPost(`/api/agent/sessions/${encodeURIComponent(sessionId)}/stop`, {});
    if (!res || !res.ok) {
      get().toast('Could not stop the session. Is the kandown daemon running?', 'error');
      return false;
    }
    return true;
  },
});
