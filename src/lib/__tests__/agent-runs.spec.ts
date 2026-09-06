/**
 * @file Unit tests for the agent runs slice (t261)
 * @description Covers the pure core exported by
 * src/lib/store/agentRunsSlice.ts (most-active-run pick, badge tone mapping,
 * terminal-state set, PTY panel decisions, wire guards) and the transport
 * behavior of the slice actions (poll merge with stable firstSeenAt, start
 * error mapping, stop, polling lifecycle) against a stubbed fetch, following
 * the same patterns as the autopilot and agent-edits suites.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentRunsSlice,
  createInitialAgentRunsState,
  isOutputPinnedToBottom,
  isRunnerRunPayload,
  isRunnersPayload,
  isTerminalRunState,
  mostActiveRun,
  runBadgeTone,
  shouldAutoExpandOutput,
  type AgentRunsSlice,
} from '../store/agentRunsSlice';
import type { AgentRunsState, RunnerRunView } from '../store/types';

function run(overrides: Partial<RunnerRunView> = {}): RunnerRunView {
  return {
    runnerId: 'herdr',
    runId: 'w1:p1',
    taskId: 't261',
    agentId: 'claude',
    state: 'working',
    firstSeenAt: '2026-09-06T10:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('mostActiveRun', () => {
  it('returns null when there is no run', () => {
    expect(mostActiveRun([])).toBeNull();
  });

  it('picks working over blocked, done and failed', () => {
    const working = run({ runId: 'a', state: 'working' });
    const blocked = run({ runId: 'b', state: 'blocked' });
    const done = run({ runId: 'c', state: 'done', runnerId: 'default' });
    const failed = run({ runId: 'd', state: 'failed', runnerId: 'default' });
    expect(mostActiveRun([done, failed, blocked, working])?.runId).toBe('a');
  });

  it('follows the starting > idle > done > failed > gone order', () => {
    const starting = run({ runId: 'a', state: 'starting', runnerId: 'default' });
    const idle = run({ runId: 'b', state: 'idle', runnerId: 'default' });
    const done = run({ runId: 'c', state: 'done', runnerId: 'default' });
    const failed = run({ runId: 'd', state: 'failed', runnerId: 'default' });
    const gone = run({ runId: 'e', state: 'gone', runnerId: 'default' });
    expect(mostActiveRun([gone, failed, done, idle, starting])?.runId).toBe('a');
    expect(mostActiveRun([gone, failed, done, idle])?.runId).toBe('b');
    expect(mostActiveRun([gone, failed, done])?.runId).toBe('c');
    expect(mostActiveRun([gone, failed])?.runId).toBe('d');
  });

  it('breaks activity ties toward the most recently started run', () => {
    const older = run({ runId: 'old', state: 'working', startedAt: '2026-09-06T09:00:00.000Z' });
    const newer = run({ runId: 'new', state: 'working', startedAt: '2026-09-06T10:00:00.000Z' });
    expect(mostActiveRun([older, newer])?.runId).toBe('new');
  });

  it('prefers a run with a known start over one without (tie on activity)', () => {
    const adopted = run({ runId: 'adopted', state: 'idle' });
    const launched = run({ runId: 'launched', state: 'idle', startedAt: '2026-09-06T08:00:00.000Z' });
    expect(mostActiveRun([adopted, launched])?.runId).toBe('launched');
  });

  it('is deterministic for runs without any start time', () => {
    const first = run({ runId: 'a', state: 'idle' });
    const second = run({ runId: 'b', state: 'idle' });
    expect(mostActiveRun([second, first])?.runId).toBe('a');
  });

  it('is pure: the input array is never mutated', () => {
    const runs = [run(), run({ state: 'done', runnerId: 'default' })];
    mostActiveRun(runs);
    expect(runs).toHaveLength(2);
  });
});

describe('runBadgeTone', () => {
  it('maps each state to its pill tone', () => {
    expect(runBadgeTone('working')).toBe('accent');
    expect(runBadgeTone('blocked')).toBe('orange');
    expect(runBadgeTone('done')).toBe('green');
    expect(runBadgeTone('failed')).toBe('red');
    expect(runBadgeTone('starting')).toBe('neutral');
    expect(runBadgeTone('idle')).toBe('neutral');
    expect(runBadgeTone('unknown')).toBe('neutral');
  });

  it('hides the badge for gone runs', () => {
    expect(runBadgeTone('gone')).toBeNull();
  });
});

describe('isTerminalRunState', () => {
  it('treats done, failed and gone as terminal', () => {
    expect(isTerminalRunState('done')).toBe(true);
    expect(isTerminalRunState('failed')).toBe(true);
    expect(isTerminalRunState('gone')).toBe(true);
  });

  it('keeps alive states non terminal', () => {
    expect(isTerminalRunState('working')).toBe(false);
    expect(isTerminalRunState('blocked')).toBe(false);
    expect(isTerminalRunState('starting')).toBe(false);
    expect(isTerminalRunState('idle')).toBe(false);
    expect(isTerminalRunState('unknown')).toBe(false);
  });
});

describe('shouldAutoExpandOutput', () => {
  it('expands a run younger than five minutes', () => {
    const now = Date.parse('2026-09-06T10:04:59.000Z');
    expect(shouldAutoExpandOutput('2026-09-06T10:00:00.000Z', now)).toBe(true);
  });

  it('keeps an older run collapsed', () => {
    const now = Date.parse('2026-09-06T10:05:00.000Z');
    expect(shouldAutoExpandOutput('2026-09-06T10:00:00.000Z', now)).toBe(false);
  });

  it('stays collapsed when the run has no usable start time', () => {
    const now = Date.parse('2026-09-06T10:00:00.000Z');
    expect(shouldAutoExpandOutput(undefined, now)).toBe(false);
    expect(shouldAutoExpandOutput('not-a-date', now)).toBe(false);
  });
});

describe('isOutputPinnedToBottom', () => {
  it('pins when the view is at the bottom', () => {
    expect(isOutputPinnedToBottom(500, 200, 700)).toBe(true);
  });

  it('allows a small tolerance above the bottom', () => {
    expect(isOutputPinnedToBottom(480, 200, 700)).toBe(true);
    expect(isOutputPinnedToBottom(470, 200, 700)).toBe(false);
  });

  it('pins trivially when the content fits the viewport', () => {
    expect(isOutputPinnedToBottom(0, 200, 120)).toBe(true);
  });
});

describe('wire guards', () => {
  it('accepts a well-formed run payload', () => {
    expect(isRunnerRunPayload(run())).toBe(true);
    expect(isRunnerRunPayload(run({ taskId: null, runnerId: 'default' }))).toBe(true);
  });

  it('rejects malformed runs from a broken daemon', () => {
    expect(isRunnerRunPayload(null)).toBe(false);
    expect(isRunnerRunPayload({})).toBe(false);
    expect(isRunnerRunPayload(run({ runnerId: 'docker' as never }))).toBe(false);
    expect(isRunnerRunPayload(run({ state: 'paused' as never }))).toBe(false);
    expect(isRunnerRunPayload(run({ runId: 42 as never }))).toBe(false);
  });

  it('accepts a well-formed runners seed body', () => {
    expect(isRunnersPayload({
      runners: [{ id: 'default', name: 'Kandown', available: true }, { id: 'herdr', name: 'Herdr', available: false, reason: 'no socket' }],
    })).toBe(true);
    expect(isRunnersPayload({ runners: 'all' })).toBe(false);
    expect(isRunnersPayload({ runners: [{ id: 'default' }] })).toBe(false);
  });
});

/* ═════════════ Slice transport (stubbed fetch) ═════════════ */

interface Harness {
  slice: AgentRunsSlice;
  state: { agentRuns: AgentRunsState };
  toasts: string[];
}

/** 📖 Builds the slice against a minimal fake store, mirroring how store.ts
 * composes it: actions see and patch only the agentRuns block. */
function makeHarness(): Harness {
  const state: Harness['state'] = { agentRuns: createInitialAgentRunsState() };
  const toasts: string[] = [];
  let slice: AgentRunsSlice;
  const get = () => ({ ...state, ...slice }) as never;
  const set = (updater: (current: unknown) => Record<string, unknown>) => {
    Object.assign(state, updater({ ...state, ...slice }));
  };
  slice = createAgentRunsSlice(set as never, get as never, {} as never);
  return { slice, state, toasts };
}

function serverWindow(): void {
  vi.stubGlobal('window', { __KANDOWN_ROOT__: '/tmp/project', __KANDOWN_TOKEN__: 'tok' });
}

function runsResponse(runs: unknown, status = 200): Response {
  return new Response(JSON.stringify({ runs }), { status });
}

describe('pollRuns', () => {
  it('merges fresh runs and keeps firstSeenAt stable across polls', async () => {
    serverWindow();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(runsResponse([run()]))
      .mockResolvedValueOnce(runsResponse([run({ state: 'done' })]));
    vi.stubGlobal('fetch', fetchMock);
    const { slice, state } = makeHarness();

    await slice.pollRuns();
    expect(state.agentRuns.runs).toHaveLength(1);
    expect(state.agentRuns.runs[0].state).toBe('working');
    const firstSeen = state.agentRuns.runs[0].firstSeenAt;

    await slice.pollRuns();
    expect(state.agentRuns.runs[0].state).toBe('done');
    // 📖 The merge keeps the client-side anchor stable across polls.
    expect(state.agentRuns.runs[0].firstSeenAt).toBe(firstSeen);
    // 📖 The token rides along on every poll.
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'X-Kandown-Token': 'tok' });
  });

  it('swallows transport and payload failures silently', async () => {
    serverWindow();
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('daemon down'))
      .mockResolvedValueOnce(new Response('not json', { status: 200 }))
      .mockResolvedValueOnce(runsResponse('garbage')));
    const { slice, state } = makeHarness();
    await expect(slice.pollRuns()).resolves.toBeUndefined();
    await expect(slice.pollRuns()).resolves.toBeUndefined();
    await expect(slice.pollRuns()).resolves.toBeUndefined();
    expect(state.agentRuns.runs).toEqual([]);
  });

  it('does not poll in demo mode (the API 501s there)', async () => {
    vi.stubGlobal('window', { __KANDOWN_ROOT__: '/demo', __KANDOWN_DEMO__: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { slice, state } = makeHarness();
    await slice.pollRuns();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.agentRuns.runs).toEqual([]);
  });
});

describe('startRun', () => {
  it('inserts the returned run optimistically', async () => {
    serverWindow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ run: run() }), { status: 200 })));
    const { slice, state } = makeHarness();
    const result = await slice.startRun('t261', 'claude', 'herdr');
    expect(result).toEqual({ ok: true });
    expect(state.agentRuns.runs).toHaveLength(1);
    expect(state.agentRuns.runs[0].runId).toBe('w1:p1');
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ taskId: 't261', agentId: 'claude', runner: 'herdr' });
  });

  it('maps a 400 to a readable error without touching state', async () => {
    serverWindow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Herdr is not available' }), { status: 400 })));
    const { slice, state } = makeHarness();
    const result = await slice.startRun('t261', 'claude', 'herdr');
    expect(result).toEqual({ ok: false, error: 'Herdr is not available' });
    expect(state.agentRuns.runs).toEqual([]);
  });

  it('reports an unreachable daemon', async () => {
    serverWindow();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { slice } = makeHarness();
    const result = await slice.startRun('t261', 'claude', 'default');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('daemon');
  });
});

describe('stopRun', () => {
  it('posts the stop and refreshes the run list', async () => {
    serverWindow();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(runsResponse([run({ state: 'idle' })]));
    vi.stubGlobal('fetch', fetchMock);
    const { slice, state } = makeHarness();
    const ok = await slice.stopRun('herdr', 'w1:p1');
    expect(ok).toBe(true);
    // 📖 Drain the fire-and-forget refresh poll stopRun triggered.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ runner: 'herdr', runId: 'w1:p1' });
    expect(state.agentRuns.runs[0].state).toBe('idle');
  });

  it('answers false when the stop fails', async () => {
    serverWindow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })));
    const { slice } = makeHarness();
    await expect(slice.stopRun('herdr', 'w1:p1')).resolves.toBe(false);
  });
});

describe('polling lifecycle', () => {
  it('polls immediately, then every 10s, and stops cleanly', async () => {
    serverWindow();
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(runsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const { slice, state } = makeHarness();

    slice.startPolling();
    expect(state.agentRuns.polling).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    slice.stopPolling();
    expect(state.agentRuns.polling).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is a no-op outside server mode and stays idempotent inside it', async () => {
    // 📖 No window at all: local mode, nothing to poll.
    const { slice, state } = makeHarness();
    slice.startPolling();
    expect(state.agentRuns.polling).toBe(false);

    serverWindow();
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(runsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    slice.startPolling();
    slice.startPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    slice.stopPolling();
  });
});

describe('seedRunnerAvailability', () => {
  it('seeds the runner descriptors once', async () => {
    serverWindow();
    const seed = {
      runners: [
        { id: 'default', name: 'Kandown', available: true, version: null, endpoint: null },
        { id: 'herdr', name: 'Herdr', available: true, version: '0.8.2', endpoint: '/tmp/herdr.sock' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(seed), { status: 200 })));
    const { slice, state } = makeHarness();
    await slice.seedRunnerAvailability();
    expect(state.agentRuns.runners).toHaveLength(2);
    // 📖 Second call is a no-op: the seed happens once per page life.
    await slice.seedRunnerAvailability();
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });
});
