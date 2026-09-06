/**
 * @file Zustand store slice: agent runs (t261)
 * @description Web UI half of the runner system: which runner backends this
 * machine can use (seeded once, so Herdr affordances only render when Herdr
 * answered available), the live runs (board badges and the editor's PTY
 * preview), the launch action and the 10s polling loop that keeps it all
 * fresh. Slice 3 (event sync) will layer on top of the same state.
 *
 * 📖 Transport: the four /api/agent/runs* routes have no helper in
 * filesystem.ts (frozen for this task), so the slice performs them directly
 * with the same auth the shared rawApiFetch uses: the `X-Kandown-Token` header
 * from window.__KANDOWN_TOKEN__. pollRuns() swallows every error: the zero-
 * config promise means a machine without the daemon (or without Herdr) shows
 * a plain board, never a warning. startRun / stopRun return their outcome so
 * the UI can toast without the slice knowing about toasts.
 *
 * 📖 Wire shapes are mirrored here, not imported from the daemon module tree:
 * the web bundle never reaches into src/cli/ (same discipline as
 * AutopilotWireSnapshot for the autopilot snapshot). The authority remains
 * src/cli/lib/runner/types.ts; a type guard keeps a daemon that grows new
 * optional fields compatible instead of crashing the fold.
 *
 * 📖 Pure core: the most-active-run pick ({@link mostActiveRun}), the badge
 * tone mapping ({@link runBadgeTone}), the output auto-scroll decision
 * ({@link isOutputPinnedToBottom}), the auto-expand rule
 * ({@link shouldAutoExpandOutput}) and the wire guards are exported and
 * unit-tested in src/lib/__tests__/agent-runs.spec.ts.
 *
 * @functions
 *  → createInitialAgentRunsState: empty agentRuns state
 *  → createAgentRunsSlice: seeding, polling, start / stop transport
 *  → setupAgentRuns: one-time wiring called from setupWatcher (server mode)
 *  → mostActiveRun / runBadgeTone / isTerminalRunState: pure lookups
 *  → isOutputPinnedToBottom / shouldAutoExpandOutput: pure panel decisions
 *  → isRunnerRunPayload / isRunnersPayload: wire guards
 *
 * @exports AgentRunsSlice, createAgentRunsSlice, createInitialAgentRunsState,
 * mostActiveRun, runBadgeTone, isTerminalRunState, isOutputPinnedToBottom,
 * shouldAutoExpandOutput, isRunnerRunPayload, isRunnersPayload, RunnerRunView,
 * RunnerDescriptorView, RUN_ACTIVITY_ORDER, OUTPUT_AUTO_EXPAND_MS
 * @see src/cli/lib/runner/types.ts: the daemon-side contract this mirrors
 * @see src/lib/store/types.ts: AgentRunsState shape
 * @see src/components/TaskAgentRunControls.tsx: launch controls + PTY preview
 */

import type { StateCreator } from 'zustand';
import { isServerMode, isDemoMode } from '../filesystem';
import type { State, AgentRunsState, RunnerRunView, RunnerDescriptorView, RunnerId, RunnerRunState } from './types';

/* ═════════════ Pure helpers ═════════════ */

/** 📖 Run states ordered from most to least "deserves attention". When a task
 * has several runs (a stale Herdr pane plus a fresh launch, say) the card
 * shows the single most active one. `gone` sorts last and the badge simply
 * hides on it: a closed pane is not information. */
export const RUN_ACTIVITY_ORDER: readonly RunnerRunState[] = [
  'working', 'blocked', 'starting', 'unknown', 'idle', 'done', 'failed', 'gone',
];

/** 📖 Terminal states: no further output is expected. Mirrors the daemon's
 * TERMINAL_RUN_STATES (kept local: the web bundle does not import src/cli). */
const TERMINAL_STATES: ReadonlySet<RunnerRunState> = new Set<RunnerRunState>(['done', 'failed', 'gone']);

export function isTerminalRunState(state: RunnerRunState): boolean {
  return TERMINAL_STATES.has(state);
}

function activityRank(state: RunnerRunState): number {
  const index = RUN_ACTIVITY_ORDER.indexOf(state);
  // 📖 A state a newer daemon invented ranks as "unknown": visible, never
  // in charge of the sort.
  return index === -1 ? RUN_ACTIVITY_ORDER.indexOf('unknown') : index;
}

/**
 * 📖 Picks the run a task's badge should show: lowest activity rank wins,
 * ties break toward the most recently started run (runs without a known
 * start lose to ones with one, then runId keeps the pick stable). Null when
 * there is nothing to show. Pure.
 */
export function mostActiveRun(runs: readonly RunnerRunView[]): RunnerRunView | null {
  let best: RunnerRunView | null = null;
  for (const run of runs) {
    if (!best) {
      best = run;
      continue;
    }
    const byRank = activityRank(run.state) - activityRank(best.state);
    if (byRank < 0) {
      best = run;
      continue;
    }
    if (byRank > 0) continue;
    const runTime = run.startedAt ? Date.parse(run.startedAt) : NaN;
    const bestTime = best.startedAt ? Date.parse(best.startedAt) : NaN;
    if (!Number.isNaN(runTime) && (Number.isNaN(bestTime) || runTime > bestTime)) best = run;
    else if (Number.isNaN(runTime) && Number.isNaN(bestTime) && run.runId < best.runId) best = run;
  }
  return best;
}

export type RunBadgeTone = 'accent' | 'orange' | 'green' | 'red' | 'neutral';

/**
 * 📖 Maps a run state to the badge's color tone. `gone` answers null: the
 * badge hides entirely (the run ceased to exist, nothing to tell). Pure.
 */
export function runBadgeTone(state: RunnerRunState): RunBadgeTone | null {
  switch (state) {
    case 'working':
      return 'accent';
    case 'blocked':
      return 'orange';
    case 'done':
      return 'green';
    case 'failed':
      return 'red';
    case 'starting':
    case 'idle':
    case 'unknown':
      return 'neutral';
    case 'gone':
      return null;
  }
}

/** 📖 How long a run stays "fresh": the PTY preview auto-expands for young
 * runs so a just-launched agent is visible without a click. */
export const OUTPUT_AUTO_EXPAND_MS = 5 * 60 * 1000;

/**
 * 📖 True when the preview should start expanded: the run is younger than
 * five minutes. Runs with no known start (adopted Herdr panes) stay
 * collapsed: never pop a terminal open for something the user did not just
 * launch. Pure.
 */
export function shouldAutoExpandOutput(startedAt: string | undefined, now: number): boolean {
  if (!startedAt) return false;
  const time = Date.parse(startedAt);
  if (Number.isNaN(time)) return false;
  return now - time < OUTPUT_AUTO_EXPAND_MS;
}

/**
 * 📖 The auto-scroll rule for the PTY preview: the view is "pinned" when the
 * user is already at (or near) the bottom, so new output keeps the newest
 * line visible while a manual scroll up freezes the view. Pure.
 */
export function isOutputPinnedToBottom(scrollTop: number, clientHeight: number, scrollHeight: number, tolerancePx = 24): boolean {
  if (scrollHeight <= clientHeight) return true;
  return scrollHeight - scrollTop - clientHeight <= tolerancePx;
}

/* ═════════════ Wire guards ═════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

const RUN_STATES: readonly RunnerRunState[] = [
  'starting', 'idle', 'working', 'blocked', 'done', 'failed', 'unknown', 'gone',
];

function isRunnerId(value: unknown): value is RunnerId {
  return value === 'default' || value === 'herdr';
}

/** 📖 Narrows one run as the daemon reports it. Unknown extra fields are
 * ignored, a bad state or missing ids reject the entry. */
export function isRunnerRunPayload(value: unknown): value is RunnerRunView {
  if (!isRecord(value)) return false;
  if (!isRunnerId(value.runnerId)) return false;
  if (!isString(value.runId) || !isString(value.agentId)) return false;
  if (!isString(value.state) || !RUN_STATES.includes(value.state as RunnerRunState)) return false;
  if (value.taskId !== null && !isString(value.taskId)) return false;
  if (value.startedAt !== undefined && !isString(value.startedAt)) return false;
  return true;
}

/** 📖 Narrows the GET /api/agent/runners seed body. */
export function isRunnersPayload(value: unknown): value is { runners: RunnerDescriptorView[] } {
  if (!isRecord(value) || !Array.isArray(value.runners)) return false;
  return value.runners.every(runner => isRecord(runner) && isString(runner.id) && isString(runner.name) && typeof runner.available === 'boolean');
}

/* ═════════════ Transport helpers ═════════════ */

function daemonToken(): string | null {
  return typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
   : null;
}

/** 📖 True when a daemon can actually answer /api/agent/runs: server mode
 * with a real backend behind it. The website demo satisfies isServerMode but
 * answers 501 on every /api/agent surface, so it is excluded: no polling, no
 * seeding, and the UI hides the launch controls. */
function hasLiveBackend(): boolean {
  return isServerMode() && !isDemoMode();
}

async function runsApiGet(path: string): Promise<Response | null> {
  const token = daemonToken();
  try {
    return await fetch(path, {
      headers: token ? { 'X-Kandown-Token': token } : undefined,
    });
  } catch {
    return null;
  }
}

async function runsApiPost(path: string, body: unknown): Promise<Response | null> {
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

/* ═════════════ Slice ═════════════ */

export interface AgentRunsSlice {
  setupAgentRuns: State['setupAgentRuns'];
  pollRuns: State['pollRuns'];
  seedRunnerAvailability: State['seedRunnerAvailability'];
  startRun: State['startRun'];
  stopRun: State['stopRun'];
  startPolling: State['startPolling'];
  stopPolling: State['stopPolling'];
}

/** 📖 Initial `agentRuns` state, seeded into the store by store.ts next to
 * the spread slice (the slice itself only carries the actions). */
export function createInitialAgentRunsState(): AgentRunsState {
  return {
    runners: [],
    runs: [],
    polling: false,
  };
}

/** 📖 Polling timer, module state like the chat sidebar's EventSource map:
 * the UI never renders it and it must survive store snapshots. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

export const createAgentRunsSlice: StateCreator<State, [], [], AgentRunsSlice> = (set, get) => ({
  setupAgentRuns: () => {
    // 📖 One-time wiring per project open, called from setupWatcher's server
    // branch. Idempotent: a second call while polling keeps the same timer.
    if (!hasLiveBackend()) return;
    void get().seedRunnerAvailability();
    get().startPolling();
  },

  seedRunnerAvailability: async () => {
    if (!hasLiveBackend() || get().agentRuns.runners.length > 0) return;
    const res = await runsApiGet('/api/agent/runners');
    if (!res || !res.ok) return;
    try {
      const data: unknown = await res.json();
      if (!isRunnersPayload(data)) return;
      set(state => ({ agentRuns: { ...state.agentRuns, runners: data.runners } }));
    } catch {
      // Unreadable body: the seed stays empty, Herdr affordances stay hidden.
    }
  },

  pollRuns: async () => {
    if (!hasLiveBackend()) return;
    const res = await runsApiGet('/api/agent/runs');
    if (!res || !res.ok) return;
    let runs: RunnerRunView[] | null = null;
    try {
      const data: unknown = await res.json();
      if (isRecord(data) && Array.isArray(data.runs) && data.runs.every(isRunnerRunPayload)) {
        runs = data.runs;
      }
    } catch {
      return;
    }
    if (!runs) return;
    // 📖 Merge keeps firstSeenAt stable across polls (it anchors "how old is
    // this run" for adopted panes without a daemon-side start time).
    const seenAt = new Date().toISOString();
    const previous = new Map(get().agentRuns.runs.map(run => [`${run.runnerId}:${run.runId}`, run]));
    const merged = runs.map(run => {
      const known = previous.get(`${run.runnerId}:${run.runId}`);
      return { ...run, firstSeenAt: known?.firstSeenAt ?? seenAt };
    });
    set(state => ({ agentRuns: { ...state.agentRuns, runs: merged } }));
  },

  startRun: async (taskId, agentId, runner = 'default') => {
    const res = await runsApiPost('/api/agent/runs', { taskId, agentId, runner });
    if (!res) {
      return { ok: false, error: 'The kandown daemon is not reachable' };
    }
    try {
      const data: unknown = await res.json();
      if (!res.ok) {
        const message = isRecord(data) && isString(data.error) ? data.error : `HTTP ${res.status}`;
        return { ok: false, error: message };
      }
      if (isRecord(data) && isRunnerRunPayload(data.run)) {
        const run: RunnerRunView = { ...data.run, firstSeenAt: new Date().toISOString() };
        // 📖 Optimistic insert so the pill and preview appear at once; the
        // next poll reconciles with the backend's own list.
        set(state => ({
          agentRuns: {
            ...state.agentRuns,
            runs: [
              ...state.agentRuns.runs.filter(existing => !(existing.runnerId === run.runnerId && existing.runId === run.runId)),
              run,
            ],
          },
        }));
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'The daemon returned an unreadable response' };
    }
  },

  stopRun: async (runner, runId) => {
    const res = await runsApiPost('/api/agent/runs/stop', { runner, runId });
    if (!res || !res.ok) return false;
    // 📖 Refresh right away: the stopped run's state (and the Stop button
    // with it) should flip without waiting for the next 10s tick.
    void get().pollRuns();
    return true;
  },

  startPolling: () => {
    if (!hasLiveBackend() || pollTimer) return;
    set(state => ({ agentRuns: { ...state.agentRuns, polling: true } }));
    // 📖 Poll immediately: a run launched from another tab (or an already
    // running Herdr pane) must show up without a 10s wait.
    void get().pollRuns();
    pollTimer = setInterval(() => {
      void get().pollRuns();
    }, 10_000);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    set(state => ({ agentRuns: { ...state.agentRuns, polling: false } }));
  },
});
