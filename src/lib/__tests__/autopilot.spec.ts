/**
 * @file Unit tests for the autopilot orchestration pure core (t311)
 * @description Covers the snapshot fold (ingestAutopilotSnapshot), the board
 * event fold (applyAutopilotEvent), the failed kill-switch rollback
 * (rollbackAutopilotStop) and the per-task lookups (autopilotTaskStatus,
 * activeSessionForTask) exported by src/lib/store/autopilotSlice.ts, plus the
 * agent_autopilot board-event type guard exported by src/lib/watcher.ts (the
 * frozen daemon contract surface).
 */

import { describe, expect, it } from 'vitest';
import {
  applyAutopilotEvent,
  activeSessionForTask,
  autopilotTaskStatus,
  createInitialAutopilotState,
  ingestAutopilotSnapshot,
  isAutopilotWireSnapshot,
  rollbackAutopilotStop,
} from '../store/autopilotSlice';
import { isAgentAutopilotEvent } from '../watcher';
import type { AgentAutopilotEvent } from '../watcher';
import type { AutopilotState, AutopilotSnapshot } from '../store/types';

function autopilotEvent(overrides: Partial<AgentAutopilotEvent> = {}): AgentAutopilotEvent {
  return {
    type: 'agent_autopilot',
    state: 'running',
    active: [{ taskId: 't1', sessionId: 'sess-1' }],
    queue: ['t2'],
    orphans: ['t3'],
    totals: { tokens: 100, costUsd: 0.01 },
    at: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

function runningSnapshot(overrides: Partial<AutopilotSnapshot> = {}): AutopilotSnapshot {
  return {
    state: 'running',
    active: [],
    queue: [],
    orphans: [],
    totals: { tokens: 0, costUsd: 0 },
    at: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

describe('applyAutopilotEvent', () => {
  it('folds an event into a snapshot with the wire lists', () => {
    const next = applyAutopilotEvent(createInitialAutopilotState(), autopilotEvent());
    expect(next.snapshot).toEqual({
      state: 'running',
      active: [{ taskId: 't1', sessionId: 'sess-1' }],
      queue: ['t2'],
      orphans: ['t3'],
      totals: { tokens: 100, costUsd: 0.01 },
      at: '2026-09-05T10:00:00.000Z',
    });
  });

  it('clears an in-flight stopping flag: wire truth supersedes the optimistic one', () => {
    const state: AutopilotState = { snapshot: runningSnapshot(), stopping: true };
    const next = applyAutopilotEvent(state, autopilotEvent());
    expect(next.stopping).toBe(false);
  });

  it('keeps the harness id the run was started with', () => {
    const started = ingestAutopilotSnapshot(createInitialAutopilotState(), {
      state: 'running',
      harnessId: 'claude',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 0, costUsd: 0 },
      at: '2026-09-05T10:00:00.000Z',
    });
    const next = applyAutopilotEvent(started, autopilotEvent({ active: [] }));
    expect(next.snapshot?.harnessId).toBe('claude');
  });

  it('is pure: the input state is never mutated', () => {
    const state = createInitialAutopilotState();
    applyAutopilotEvent(state, autopilotEvent());
    expect(state.snapshot).toBeNull();
  });
});

describe('totals authority', () => {
  it('replaces totals with the wire values on every snapshot', () => {
    const idle: AutopilotState = { snapshot: runningSnapshot({ state: 'idle', totals: { tokens: 5000, costUsd: 0.5 } }), stopping: false };
    const next = ingestAutopilotSnapshot(idle, {
      state: 'running',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 120, costUsd: 0.02 },
      at: '2026-09-05T10:01:00.000Z',
    });
    expect(next.snapshot?.totals).toEqual({ tokens: 120, costUsd: 0.02 });
  });

  it('never accumulates: the wire is already cumulative per run', () => {
    let state = ingestAutopilotSnapshot(createInitialAutopilotState(), {
      state: 'running',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 100, costUsd: 0.01 },
      at: '2026-09-05T10:00:00.000Z',
    });
    state = ingestAutopilotSnapshot(state, {
      state: 'running',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 250, costUsd: 0.03 },
      at: '2026-09-05T10:01:00.000Z',
    });
    state = ingestAutopilotSnapshot(state, {
      state: 'running',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 50, costUsd: 0.01 },
      at: '2026-09-05T10:02:00.000Z',
    });
    expect(state.snapshot?.totals).toEqual({ tokens: 50, costUsd: 0.01 });
  });

  it('forces a reset when the caller marks a fresh run start', () => {
    const state: AutopilotState = { snapshot: runningSnapshot({ totals: { tokens: 900, costUsd: 0.9 } }), stopping: false };
    const next = ingestAutopilotSnapshot(
      state,
      {
        state: 'running',
        active: [],
        queue: [],
        orphans: [],
        totals: { tokens: 10, costUsd: 0.001 },
        at: '2026-09-05T10:05:00.000Z',
      },
      { resetTotals: true },
    );
    expect(next.snapshot?.totals).toEqual({ tokens: 10, costUsd: 0.001 });
  });
});

describe('rollbackAutopilotStop', () => {
  it('restores the pre-stop snapshot and clears the flag on failure', () => {
    const backup = runningSnapshot({ state: 'running', totals: { tokens: 42, costUsd: 0.4 } });
    const current: AutopilotState = { snapshot: null, stopping: true };
    const next = rollbackAutopilotStop(current, backup);
    expect(next).toEqual({ snapshot: backup, stopping: false });
  });

  it('keeps a fresher event snapshot that landed while the request was in flight', () => {
    const backup = runningSnapshot({ at: '2026-09-05T10:00:00.000Z' });
    const fresher = runningSnapshot({ at: '2026-09-05T10:01:00.000Z' });
    const current: AutopilotState = { snapshot: fresher, stopping: true };
    const next = rollbackAutopilotStop(current, backup);
    expect(next.snapshot).toBe(fresher);
    expect(next.stopping).toBe(false);
  });

  it('leaves nothing behind when there was no snapshot at all', () => {
    const next = rollbackAutopilotStop(createInitialAutopilotState(), null);
    expect(next.snapshot).toBeNull();
    expect(next.stopping).toBe(false);
  });
});

describe('per-task lookups', () => {
  const snapshot = runningSnapshot({
    active: [{ taskId: 't1', sessionId: 'sess-1' }],
    queue: ['t2'],
    orphans: ['t3'],
  });

  it('classifies active, queued, orphan and unknown tasks (active wins)', () => {
    expect(autopilotTaskStatus(snapshot, 't1')).toBe('active');
    expect(autopilotTaskStatus(snapshot, 't2')).toBe('queued');
    expect(autopilotTaskStatus(snapshot, 't3')).toBe('orphan');
    expect(autopilotTaskStatus(snapshot, 't99')).toBeNull();
  });

  it('returns null for every task when there is no snapshot', () => {
    expect(autopilotTaskStatus(null, 't1')).toBeNull();
    expect(activeSessionForTask(null, 't1')).toBeNull();
  });

  it('resolves the session id powering the per-card stop button', () => {
    expect(activeSessionForTask(snapshot, 't1')).toBe('sess-1');
    expect(activeSessionForTask(snapshot, 't2')).toBeNull();
  });
});

describe('isAgentAutopilotEvent (frozen contract guard)', () => {
  it('accepts a well-formed event', () => {
    expect(isAgentAutopilotEvent(autopilotEvent())).toBe(true);
    expect(isAgentAutopilotEvent(autopilotEvent({ state: 'idle', active: [], queue: [], orphans: [] }))).toBe(true);
  });

  it('rejects malformed payloads from a newer daemon', () => {
    expect(isAgentAutopilotEvent(null)).toBe(false);
    expect(isAgentAutopilotEvent({ type: 'agent_autopilot' })).toBe(false);
    const paused: unknown = { ...autopilotEvent(), state: 'paused' };
    expect(isAgentAutopilotEvent(paused)).toBe(false);
    const halfEntry: unknown = { ...autopilotEvent(), active: [{ taskId: 't1' }] };
    expect(isAgentAutopilotEvent(halfEntry)).toBe(false);
    const numericQueue: unknown = { ...autopilotEvent(), queue: [42] };
    expect(isAgentAutopilotEvent(numericQueue)).toBe(false);
    const partialTotals: unknown = { ...autopilotEvent(), totals: { tokens: 1 } };
    expect(isAgentAutopilotEvent(partialTotals)).toBe(false);
    const numericAt: unknown = { ...autopilotEvent(), at: 123 };
    expect(isAgentAutopilotEvent(numericAt)).toBe(false);
  });
});

describe('isAutopilotWireSnapshot', () => {
  it('accepts the GET/POST snapshot shape with optional harnessId', () => {
    expect(isAutopilotWireSnapshot({
      state: 'running',
      harnessId: 'claude',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 0, costUsd: 0 },
      at: '2026-09-05T10:00:00.000Z',
    })).toBe(true);
  });

  it('rejects bodies missing the lists or with a bad state', () => {
    expect(isAutopilotWireSnapshot({ state: 'running' })).toBe(false);
    expect(isAutopilotWireSnapshot({
      state: 'paused',
      active: [],
      queue: [],
      orphans: [],
      totals: { tokens: 0, costUsd: 0 },
      at: 'x',
    })).toBe(false);
  });
});
