/**
 * @file Unit tests for the live agent edits pure core (t309)
 * @description Covers the event fold (applyAgentEditsEvent), the permission
 * queue helpers, diff pruning and the LCS-free line diff exported by
 * src/lib/store/agentEditsSlice.ts, plus the board-event type guards exported
 * by src/lib/watcher.ts (the frozen daemon contract surface).
 */

import { describe, expect, it } from 'vitest';
import {
  applyAgentEditsEvent,
  computeLineDiff,
  createInitialAgentEditsState,
  isActiveEditsPayload,
  mergePermissions,
  pruneDiffs,
  restorePermissions,
  seedAgentEditsFromPairs,
  withoutPermission,
} from '../store/agentEditsSlice';
import type { ActiveEditPair } from '../store/agentEditsSlice';
import {
  isAgentEditsBoardEvent,
  isAgentEditStartedEvent,
  isAgentPermissionEvent,
  isTaskDiffEvent,
} from '../watcher';
import type { AgentEditStartedEvent } from '../watcher';
import type { AgentEditDiff, AgentPermissionRequest } from '../store/types';

function startedEvent(overrides: Partial<AgentEditStartedEvent> = {}): AgentEditStartedEvent {
  return {
    type: 'agent_edit_started',
    sessionId: 'sess-1',
    taskId: 't42',
    harnessId: 'claude',
    at: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

function diffFor(taskId: string, marker: string): AgentEditDiff {
  return { before: `old ${marker}`, after: `new ${marker}`, truncated: false, path: `tasks/${taskId}.md`, at: marker };
}

describe('applyAgentEditsEvent', () => {
  it('registers presence on agent_edit_started', () => {
    const state = applyAgentEditsEvent(createInitialAgentEditsState(), startedEvent());
    expect(state.edits.t42).toEqual({ sessionId: 'sess-1', harnessId: 'claude', since: '2026-09-05T10:00:00.000Z' });
  });

  it('a second session takes over the same task', () => {
    let state = applyAgentEditsEvent(createInitialAgentEditsState(), startedEvent());
    state = applyAgentEditsEvent(state, startedEvent({ sessionId: 'sess-2', at: '2026-09-05T10:05:00.000Z' }));
    expect(state.edits.t42?.sessionId).toBe('sess-2');
  });

  it('clears presence on agent_edit_ended from the owning session', () => {
    let state = applyAgentEditsEvent(createInitialAgentEditsState(), startedEvent());
    state = applyAgentEditsEvent(state, { type: 'agent_edit_ended', sessionId: 'sess-1', taskId: 't42', at: '2026-09-05T10:01:00.000Z' });
    expect(state.edits.t42).toBeUndefined();
  });

  it('ignores a stale agent_edit_ended from another session', () => {
    let state = applyAgentEditsEvent(createInitialAgentEditsState(), startedEvent());
    const before = state;
    state = applyAgentEditsEvent(state, { type: 'agent_edit_ended', sessionId: 'sess-9', taskId: 't42', at: '2026-09-05T10:01:00.000Z' });
    expect(state).toBe(before);
  });

  it('stores a task_diff and refreshes recency on repeat writes', () => {
    let state = applyAgentEditsEvent(createInitialAgentEditsState(), {
      type: 'task_diff', taskId: 't42', sessionId: 'sess-1', path: 'tasks/t42.md', before: 'a', after: 'b', truncated: false, at: 'at-1',
    });
    state = applyAgentEditsEvent(state, { type: 'task_diff', taskId: 't7', sessionId: 'sess-1', path: 'tasks/t7.md', before: 'x', after: 'y', truncated: true, at: 'at-2' });
    expect(Object.keys(state.diffs)).toEqual(['t42', 't7']);
    // 📖 Rewriting t42 must move it to the newest slot (recency ordering).
    state = applyAgentEditsEvent(state, { type: 'task_diff', taskId: 't42', sessionId: 'sess-1', path: 'tasks/t42.md', before: 'a2', after: 'b2', truncated: false, at: 'at-3' });
    expect(Object.keys(state.diffs)).toEqual(['t7', 't42']);
    expect(state.diffs.t42?.after).toBe('b2');
    expect(state.diffs.t7?.truncated).toBe(true);
  });

  it('queues a permission request exactly once per permissionId', () => {
    const event = { type: 'agent_permission' as const, sessionId: 'sess-1', permissionId: 'p1', title: 'Run npm test', kind: 'bash', at: 'at-1' };
    let state = applyAgentEditsEvent(createInitialAgentEditsState(), event);
    const afterFirst = state;
    state = applyAgentEditsEvent(state, event);
    expect(state.permissions).toHaveLength(1);
    expect(state).toBe(afterFirst);
  });
});

describe('permission queue helpers', () => {
  const request = (permissionId: string): AgentPermissionRequest => ({
    sessionId: 'sess-1', permissionId, title: `do ${permissionId}`, kind: 'bash', at: 'at-1',
  });

  it('mergePermissions appends unknown ids and keeps the reference otherwise', () => {
    const current = [request('p1')];
    expect(mergePermissions(current, [request('p2')])).toHaveLength(2);
    expect(mergePermissions(current, [request('p1')])).toBe(current);
  });

  it('withoutPermission removes by id and keeps the reference when absent', () => {
    const current = [request('p1'), request('p2')];
    expect(withoutPermission(current, 'p1').map(p => p.permissionId)).toEqual(['p2']);
    expect(withoutPermission(current, 'p9')).toBe(current);
  });

  it('restorePermissions re-adds snapshot entries missing from current', () => {
    const snapshot = [request('p1'), request('p2')];
    const current = withoutPermission(snapshot, 'p1');
    const restored = restorePermissions(current, snapshot);
    expect(restored.map(p => p.permissionId)).toEqual(['p2', 'p1']);
    expect(restorePermissions(snapshot, snapshot)).toBe(snapshot);
  });
});

describe('pruneDiffs', () => {
  it('keeps the newest max entries and drops the oldest task ids', () => {
    const diffs: Record<string, AgentEditDiff> = {};
    for (let i = 0; i < 25; i++) diffs[`t${i}`] = diffFor(`t${i}`, String(i));
    const pruned = pruneDiffs(diffs, 20);
    expect(Object.keys(pruned)).toHaveLength(20);
    expect(pruned.t0).toBeUndefined();
    expect(pruned.t4).toBeUndefined();
    expect(pruned.t5).toBeDefined();
    expect(pruned.t24).toBeDefined();
  });

  it('returns the same reference under the cap', () => {
    const diffs = { t1: diffFor('t1', 'a') };
    expect(pruneDiffs(diffs, 20)).toBe(diffs);
  });
});

describe('computeLineDiff', () => {
  it('returns no rows for identical inputs', () => {
    expect(computeLineDiff('same\ntext', 'same\ntext')).toEqual([]);
  });

  it('marks removed then added lines in the changed middle', () => {
    const rows = computeLineDiff('hello\nworld\nbye', 'hello\nthere\nbye');
    expect(rows).toEqual([
      { kind: 'same', text: 'hello' },
      { kind: 'removed', text: 'world' },
      { kind: 'added', text: 'there' },
      { kind: 'same', text: 'bye' },
    ]);
  });

  it('collapses long unchanged context around the change', () => {
    const before = ['l1', 'l2', 'l3', 'l4', 'l5', 'old', 'l7', 'l8', 'l9', 'l10', 'l11'].join('\n');
    const after = before.replace('old', 'new');
    const rows = computeLineDiff(before, after, 2);
    expect(rows[0]).toEqual({ kind: 'collapsed', text: '···' });
    expect(rows.filter(row => row.kind === 'same')).toHaveLength(4);
    expect(rows.filter(row => row.kind === 'removed')).toEqual([{ kind: 'removed', text: 'old' }]);
    expect(rows.filter(row => row.kind === 'added')).toEqual([{ kind: 'added', text: 'new' }]);
    expect(rows[rows.length - 1]).toEqual({ kind: 'collapsed', text: '···' });
  });

  it('handles pure insertions and deletions at the end', () => {
    expect(computeLineDiff('a\nb', 'a\nb\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
      { kind: 'added', text: 'c' },
    ]);
    expect(computeLineDiff('a\nb\nc', 'a\nb')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
      { kind: 'removed', text: 'c' },
    ]);
  });
});

describe('active edits seed (t322)', () => {
  const pair = (overrides: Partial<ActiveEditPair> = {}): ActiveEditPair => ({
    sessionId: 'sess-1',
    taskId: 't42',
    harnessId: 'claude',
    startedAt: '2026-09-05T10:00:00.000Z',
    lastActivityAt: '2026-09-05T10:01:00.000Z',
    ...overrides,
  });

  it('isActiveEditsPayload accepts the daemon payload and rejects malformed bodies', () => {
    expect(isActiveEditsPayload({ edits: [pair()] })).toBe(true);
    expect(isActiveEditsPayload({ edits: [] })).toBe(true);
    expect(isActiveEditsPayload(null)).toBe(false);
    expect(isActiveEditsPayload({ edits: 'nope' })).toBe(false);
    expect(isActiveEditsPayload({ edits: [{ sessionId: 's', taskId: 't42', harnessId: 'claude', startedAt: 'at' }] })).toBe(false);
    expect(isActiveEditsPayload({ edits: [{ ...pair(), harnessId: 7 }] })).toBe(false);
  });

  it('seedAgentEditsFromPairs folds every pair in one pass, mapping startedAt to since', () => {
    const state = seedAgentEditsFromPairs(createInitialAgentEditsState(), [
      pair(),
      pair({ sessionId: 'sess-2', taskId: 't7', harnessId: 'codex', startedAt: '2026-09-05T09:00:00.000Z' }),
    ]);
    expect(state.edits.t42).toEqual({ sessionId: 'sess-1', harnessId: 'claude', since: '2026-09-05T10:00:00.000Z' });
    expect(state.edits.t7).toEqual({ sessionId: 'sess-2', harnessId: 'codex', since: '2026-09-05T09:00:00.000Z' });
  });

  it('seedAgentEditsFromPairs returns the same state for an empty list', () => {
    const state = createInitialAgentEditsState();
    expect(seedAgentEditsFromPairs(state, [])).toBe(state);
  });

  it('a seeded pair follows the same fold rules as a live event', () => {
    let state = applyAgentEditsEvent(createInitialAgentEditsState(), startedEvent({ sessionId: 'sess-old' }));
    // 📖 The seed replays the takeover semantics: the newest session wins.
    state = seedAgentEditsFromPairs(state, [pair({ sessionId: 'sess-1' })]);
    expect(state.edits.t42?.sessionId).toBe('sess-1');
    // 📖 And a live agent_edit_ended from the seeded session clears it.
    state = applyAgentEditsEvent(state, { type: 'agent_edit_ended', sessionId: 'sess-1', taskId: 't42', at: '2026-09-05T10:02:00.000Z' });
    expect(state.edits.t42).toBeUndefined();
  });
});

describe('watcher board event guards (frozen daemon contract)', () => {
  it('accepts the four documented event shapes', () => {
    expect(isAgentEditStartedEvent(startedEvent())).toBe(true);
    expect(isAgentEditsBoardEvent({ type: 'agent_edit_ended', sessionId: 's', taskId: 't42', at: 'at' })).toBe(true);
    expect(isTaskDiffEvent({ type: 'task_diff', taskId: 't42', sessionId: 's', path: 'p', before: 'b', after: 'a', truncated: false, at: 'at' })).toBe(true);
    expect(isAgentPermissionEvent({ type: 'agent_permission', sessionId: 's', permissionId: 'p1', title: 'T', kind: 'bash', at: 'at' })).toBe(true);
  });

  it('rejects malformed or unknown payloads', () => {
    expect(isAgentEditsBoardEvent(null)).toBe(false);
    expect(isAgentEditsBoardEvent({ type: 'heartbeat' })).toBe(false);
    expect(isAgentEditStartedEvent({ type: 'agent_edit_started', sessionId: 's', taskId: 't42' })).toBe(false);
    expect(isTaskDiffEvent({ type: 'task_diff', taskId: 't42', sessionId: 's', path: 'p', before: 'b', after: 'a', truncated: 'no', at: 'at' })).toBe(false);
  });
});
