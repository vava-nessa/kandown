/**
 * @file Autopilot orphan re-file order tests (t322)
 * @description Locks the start()-time re-file convention of the autopilot
 * orchestrator: tasks orphaned in a non-terminal, non-backlog column with no
 * live session (typically In Progress or Review after a crash) are re-queued
 * FIRST, before any ready backlog task, and multiple orphans are ordered among
 * themselves by the same orderQueue rule as the board digest (priority P1
 * first, then numeric-aware id). "Middle of a column beats ready backlog" is
 * the documented decision: if someone inverts it, these tests fail.
 *
 * 📖 Scope note, pinned by the last integration test: an orphan whose
 * dependency has been regressed or reverted since it went mid-column is NOT
 * re-filed. The dependency gate rules the re-file path too (the autopilot
 * directives tell sessions to never bypass a dependency), and the gated
 * orphan stays visible in the snapshot's orphans list for the human.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/orchestrator.ts
 * @see src/cli/lib/__tests__/orchestrator.spec.ts
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeOrphanTaskIds,
  computeReadyTasks,
  createOrchestrator,
  orderQueue,
  type AutopilotEventSubscriber,
  type AutopilotOrchestrator,
  type AutopilotSessionFactory,
  type AutopilotTaskInput,
} from '../agent/orchestrator';
import type { AgentSessionInfo } from '../agent/types';

/** 📖 Records which task id was handed to the session factory, in call order:
 *  that sequence IS the dispatch order the convention is about. The current
 *  task id is captured in compileWork, which spawnSession calls synchronously
 *  right before createSession for the same task. */
interface DispatchRecorder {
  dispatched: string[];
  subscribe: AutopilotEventSubscriber;
  createSession: AutopilotSessionFactory;
  stopSession: (sessionId: string) => boolean;
  compileWork: (kandownDir: string, taskId?: string) => { markdown: string };
}

function fakeRuntime(): DispatchRecorder {
  const dispatched: string[] = [];
  let currentTaskId = '';
  let counter = 0;
  return {
    dispatched,
    // 📖 Sessions never emit events here: the tests only observe the start
    // dispatch order, so a no-op unsubscribe is enough.
    subscribe: () => () => {},
    createSession: config => {
      counter += 1;
      const info: AgentSessionInfo = {
        id: `ses_${String(counter).padStart(2, '0')}`,
        harnessId: config.harnessId,
        status: 'running',
        startedAt: new Date().toISOString(),
        usageTotals: { tokens: 0, costUsd: 0 },
      };
      dispatched.push(currentTaskId);
      return info;
    },
    stopSession: () => true,
    compileWork: (_kandownDir, taskId) => {
      currentTaskId = taskId ?? '';
      return { markdown: `# compiled work for ${taskId ?? 'board'}` };
    },
  };
}

/** 📖 A minimal temp project whose config only sets the parallelism under
 *  test; board roles (terminal Done, backlog Backlog) come from the defaults. */
function makeProject(maxParallel: number): { root: string; kandownDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'kandown-orphans-'));
  const kandownDir = join(root, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  mkdirSync(join(root, 'tasks'), { recursive: true });
  writeFileSync(
    join(kandownDir, 'kandown.json'),
    JSON.stringify({ agent: { autopilot: { maxParallel } } }),
  );
  return { root, kandownDir };
}

function writeTask(root: string, taskId: string, frontmatter: string[]): void {
  writeFileSync(join(root, 'tasks', `${taskId}.md`), ['---', `id: ${taskId}`, ...frontmatter, '---', ''].join('\n'));
}

function makeOrchestrator(root: string, kandownDir: string, runtime: DispatchRecorder): AutopilotOrchestrator {
  return createOrchestrator(root, kandownDir, {
    subscribe: runtime.subscribe,
    createSession: runtime.createSession,
    stopSession: runtime.stopSession,
    compileWork: runtime.compileWork,
    isHarnessInstalled: () => true,
    // 📖 Far beyond test duration: the timer is unref'd and dispose clears it.
    pollIntervalMs: 60_000,
  });
}

describe('orphan re-file order at start (integration)', () => {
  it('re-files an In Progress orphan before a ready P1 backlog task', () => {
    const { root, kandownDir } = makeProject(2);
    writeTask(root, 't1', ['title: Ready backlog one', 'status: Backlog', 'priority: P1']);
    // 📖 The orphan carries NO priority: even a P9-ranked orphan must beat a
    // P1 backlog task. That is the sharpest possible inversion detector for
    // the "middle of a column before ready backlog" decision.
    writeTask(root, 't2', ['title: Orphaned in-flight one', 'status: In Progress']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(root, kandownDir, runtime);
    try {
      const snapshot = orch.start('claude');
      expect(runtime.dispatched).toEqual(['t2', 't1']);
      expect(snapshot.state).toBe('running');
      expect(snapshot.queue).toEqual([]);
      expect(snapshot.orphans).toEqual([]);
    } finally {
      orch.dispose();
    }
  });

  it('gives the only parallel slot to the orphan over a ready P1 backlog task', () => {
    const { root, kandownDir } = makeProject(1);
    writeTask(root, 't1', ['title: Ready backlog one', 'status: Backlog', 'priority: P1']);
    writeTask(root, 't2', ['title: Orphaned in-flight one', 'status: In Progress']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(root, kandownDir, runtime);
    try {
      const snapshot = orch.start('claude');
      expect(runtime.dispatched).toEqual(['t2']);
      expect(snapshot.queue).toEqual(['t1']);
    } finally {
      orch.dispose();
    }
  });

  it('orders multiple orphans among themselves by priority then numeric id', () => {
    const { root, kandownDir } = makeProject(8);
    writeTask(root, 't10', ['title: Orphan ten', 'status: In Progress']);
    writeTask(root, 't5', ['title: Orphan five', 'status: In Progress', 'priority: P3']);
    writeTask(root, 't2', ['title: Orphan two', 'status: In Progress', 'priority: P1']);
    writeTask(root, 't4', ['title: Orphan four', 'status: Review']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(root, kandownDir, runtime);
    try {
      orch.start('claude');
      // 📖 P1 first, then P3, then the unset priorities ranked as P9; inside
      // that last group the numeric-aware id compare puts t4 before t10.
      expect(runtime.dispatched).toEqual(['t2', 't5', 't4', 't10']);
    } finally {
      orch.dispose();
    }
  });
});

describe('pure helpers backing the convention', () => {
  it('keeps In Progress and Review as orphans, drops terminal, backlog, live and queued', () => {
    const tasks: AutopilotTaskInput[] = [
      { id: 't1', status: 'Backlog' },
      { id: 't2', status: 'Done' },
      { id: 't3', status: 'In Progress' },
      { id: 't4', status: 'Review' },
      { id: 't5', status: 'In Progress' },
      { id: 't6', status: 'Review' },
    ];
    expect(computeOrphanTaskIds(tasks, 'Done', 'Backlog', ['t5'], ['t6'])).toEqual(['t3', 't4']);
  });

  it('sorts P1 before P3 and t2 before t10 within one priority', () => {
    const ordered = orderQueue([
      { id: 't10', priority: 'P3' },
      { id: 't2', priority: 'P3' },
      { id: 't1', priority: 'P1' },
    ]);
    expect(ordered.map(task => task.id)).toEqual(['t1', 't2', 't10']);
  });

  it('filters an In Progress task with an unresolved dependency from the ready path', () => {
    const tasks: AutopilotTaskInput[] = [
      { id: 't1', status: 'Todo', priority: 'P1' },
      { id: 't2', status: 'In Progress', depends_on: ['t1'] },
    ];
    expect(computeReadyTasks(tasks, 'Done').map(task => task.id)).toEqual(['t1']);
    // 📖 Once the dependency reaches the terminal column, the same task is
    // ready: the gate is about dependency state, not the in-flight column.
    const resolved: AutopilotTaskInput[] = [
      { id: 't1', status: 'Done' },
      { id: 't2', status: 'In Progress', depends_on: ['t1'] },
    ];
    expect(computeReadyTasks(resolved, 'Done').map(task => task.id)).toEqual(['t2']);
  });
});

describe('edge case: orphan with an unresolved dependency', () => {
  it('skips the gated orphan at re-file time but keeps it visible in orphans', () => {
    const { root, kandownDir } = makeProject(2);
    // 📖 t1 sits in Backlog so it is neither an orphan nor terminal: the ONLY
    // reason t2 could be skipped is its unresolved dependency on t1.
    writeTask(root, 't1', ['title: Dependency waiting in backlog', 'status: Backlog', 'priority: P1']);
    writeTask(root, 't2', [
      'title: Blocked in-flight one',
      'status: In Progress',
      'priority: P1',
      'depends_on: [t1]',
    ]);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(root, kandownDir, runtime);
    try {
      const snapshot = orch.start('claude');
      // 📖 The dependency gate rules the re-file path too: the autopilot
      // directives tell sessions to never bypass a dependency, so start must
      // not hand one a blocked task. The ready backlog task is dispatched
      // instead, and the gated orphan still shows up in the snapshot's
      // orphans list (that view is the human's crash-recovery radar and stays
      // deliberately ungated).
      expect(runtime.dispatched).toEqual(['t1']);
      expect(snapshot.queue).toEqual([]);
      expect(snapshot.orphans).toEqual(['t2']);
    } finally {
      orch.dispose();
    }
  });
});
