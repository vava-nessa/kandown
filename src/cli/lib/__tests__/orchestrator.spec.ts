/**
 * @file Autopilot orchestrator tests
 * @description Locks the daemon half of autopilot (t311): the pure readiness
 * filter (dependency gating through the shared helpers, terminal and archived
 * detection, live/queued exclusion), the priority/id queue order, the orphan
 * rule, the budget verdicts (session cap, run cap, strict "exceeded"), the
 * cascade handoff extraction from real task files in a temp project, the
 * directive prompt shape, and the full dispatch/finish state machine driven
 * through a fake runtime (no harness process, no SSE plumbing).
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/orchestrator.ts
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAutopilotPrompt,
  budgetDecision,
  computeOrphanTaskIds,
  computeReadyTasks,
  createOrchestrator,
  extractHandoff,
  orderQueue,
  type AutopilotBroadcaster,
  type AutopilotEventSubscriber,
  type AutopilotSessionFactory,
  type AutopilotTaskInput,
  type AutopilotTotals,
} from '../agent/orchestrator';
import type { AgentEvent, AgentSessionInfo } from '../agent/types';

describe('computeReadyTasks', () => {
  const tasks: AutopilotTaskInput[] = [
    { id: 't1', status: 'Todo', priority: 'P1' },
    { id: 't2', status: 'In Progress', depends_on: ['t1'] },
    { id: 't3', status: 'Done' },
    { id: 't4', status: 'Todo', archived: true },
    { id: 't5', status: 'Todo', depends_on: ['t404'] },
  ];

  it('gates on unresolved dependencies, terminal status and archived flag', () => {
    const ready = computeReadyTasks(tasks, 'Done');
    expect(ready.map(task => task.id)).toEqual(['t1', 't5']);
  });

  it('treats an unknown dependency as resolved (the shared gate rule)', () => {
    const ready = computeReadyTasks([{ id: 't9', status: 'Todo', depends_on: ['ghost'] }], 'Done');
    expect(ready.map(task => task.id)).toEqual(['t9']);
  });

  it('accepts a case-insensitive terminal column and excludes live and queued ids', () => {
    const ready = computeReadyTasks(tasks, 'done', ['t1', 't5']);
    expect(ready).toHaveLength(0);
  });

  it('resolves dependencies against a terminal-column completion, unblocking dependents', () => {
    const unblocked: AutopilotTaskInput[] = [
      { id: 't1', status: 'Done' },
      { id: 't2', status: 'In Progress', depends_on: ['t1'] },
    ];
    expect(computeReadyTasks(unblocked, 'Done').map(task => task.id)).toEqual(['t2']);
  });
});

describe('orderQueue', () => {
  it('orders by priority first (P1 before P9) then by numeric-aware id', () => {
    const ordered = orderQueue([
      { id: 't10', priority: 'P2' },
      { id: 't2', priority: 'P1' },
      { id: 't3' },
      { id: 't4', priority: 'P4' },
      { id: 't1', priority: 'P1' },
    ]);
    expect(ordered.map(task => task.id)).toEqual(['t1', 't2', 't10', 't4', 't3']);
  });
});

describe('computeOrphanTaskIds', () => {
  it('lists non-terminal non-backlog tasks with no live session and no queue slot', () => {
    const tasks: AutopilotTaskInput[] = [
      { id: 't1', status: 'Backlog' },
      { id: 't2', status: 'In Progress' },
      { id: 't3', status: 'Done' },
      { id: 't4', status: 'Review' },
    ];
    expect(computeOrphanTaskIds(tasks, 'Done', 'Backlog', ['t4'], ['t2'])).toEqual([]);
    expect(computeOrphanTaskIds(tasks, 'Done', 'Backlog')).toEqual(['t2', 't4']);
  });
});

describe('budgetDecision', () => {
  it('stops one session when its totals pass a session cap', () => {
    const verdict = budgetDecision(
      { tokens: 101, costUsd: 0 },
      { tokens: 101, costUsd: 0 },
      { sessionTokenCap: 100 },
    );
    expect(verdict).toBe('stop-session');
  });

  it('stops the whole run when run totals pass a run cap, taking precedence', () => {
    const verdict = budgetDecision(
      { tokens: 10, costUsd: 0.6 },
      { tokens: 200, costUsd: 0.6 },
      { sessionTokenCap: 100, runCostCapUsd: 0.5 },
    );
    expect(verdict).toBe('stop-run');
  });

  it('treats a total landing exactly on the cap as allowed', () => {
    const verdict = budgetDecision(
      { tokens: 100, costUsd: 0.5 },
      { tokens: 100, costUsd: 0.5 },
      { sessionTokenCap: 100, sessionCostCapUsd: 0.5 },
    );
    expect(verdict).toBe('none');
  });

  it('ignores caps that are not set', () => {
    const huge: AutopilotTotals = { tokens: 9_999_999, costUsd: 9_999 };
    expect(budgetDecision(huge, huge, {})).toBe('none');
  });
});

describe('extractHandoff', () => {
  let root: string;
  let kandownDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kandown-autopilot-handoff-'));
    kandownDir = join(root, '.kandown');
    mkdirSync(join(root, 'tasks'), { recursive: true });
    writeFileSync(join(root, 'tasks', 't1.md'), [
      '---',
      'id: t1',
      'title: First task',
      'status: Done',
      'priority: P1',
      'report: Implemented the login form and covered it with tests.',
      '---',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'tasks', 't2.md'), [
      '---',
      'id: t2',
      'title: Unfinished task',
      'status: In Progress',
      '---',
      '',
    ].join('\n'));
    writeFileSync(join(root, 'tasks', 't3.md'), [
      '---',
      'id: t3',
      'title: Terminal without report',
      'status: Done',
      '---',
      '',
    ].join('\n'));
  });

  it('returns the id, title and report of a terminal task with a report', () => {
    expect(extractHandoff(kandownDir, 't1', 'Done')).toEqual({
      id: 't1',
      title: 'First task',
      report: 'Implemented the login form and covered it with tests.',
    });
  });

  it('returns null for unfinished, report-less and missing tasks', () => {
    expect(extractHandoff(kandownDir, 't2', 'Done')).toBeNull();
    expect(extractHandoff(kandownDir, 't3', 'Done')).toBeNull();
    expect(extractHandoff(kandownDir, 't999', 'Done')).toBeNull();
  });
});

describe('buildAutopilotPrompt', () => {
  const compiled = '# kandown work\n\nTask context for t2.';
  const handoffs = [{ id: 't1', title: 'First task', report: 'Did the earlier thing.' }];

  it('prepends the cascade handoff block and appends the directives', () => {
    const prompt = buildAutopilotPrompt(compiled, handoffs, 'Done');
    expect(prompt).toContain('## Cascade handoff');
    expect(prompt).toContain('### t1 First task');
    expect(prompt).toContain('Did the earlier thing.');
    expect(prompt).toContain('# kandown work');
    expect(prompt).toContain('## Autopilot directives');
    expect(prompt).toContain('"Done"');
    expect(prompt.indexOf('Cascade handoff')).toBeLessThan(prompt.indexOf('# kandown work'));
  });

  it('omits the handoff block when nothing completed yet', () => {
    const prompt = buildAutopilotPrompt(compiled, [], 'Done');
    expect(prompt).not.toContain('Cascade handoff');
    expect(prompt).toContain('## Autopilot directives');
  });
});

describe('createOrchestrator', () => {
  const meta = { harnessId: 'claude', timestamp: new Date().toISOString() };

  interface FakeRuntime {
    sessions: { id: string; taskId: string; prompt: string; permissionMode: string }[];
    stoppedIds: string[];
    emit: (sessionId: string, event: AgentEvent) => void;
    subscribe: AutopilotEventSubscriber;
    createSession: AutopilotSessionFactory;
    stopSession: (sessionId: string) => boolean;
    compileWork: (kandownDir: string, taskId?: string) => { markdown: string };
  }

  function usageEvent(sessionId: string, tokens: number, costUsd = 0): AgentEvent {
    return { type: 'usage', inputTokens: tokens, outputTokens: 0, cachedInputTokens: 0, costUsd, sessionId, ...meta };
  }

  function stoppedEvent(sessionId: string): AgentEvent {
    return { type: 'stopped', reason: 'user', exitCode: null, sessionId, ...meta };
  }

  function fakeRuntime(): FakeRuntime {
    const sessions: FakeRuntime['sessions'] = [];
    const compiledTasks: string[] = [];
    const listeners = new Map<string, (event: AgentEvent) => void>();
    const stoppedIds: string[] = [];
    let counter = 0;

    const emit = (sessionId: string, event: AgentEvent): void => {
      listeners.get(sessionId)?.(event);
    };

    const subscribe: AutopilotEventSubscriber = (sessionId, listener) => {
      listeners.set(sessionId, listener);
      return () => {
        listeners.delete(sessionId);
      };
    };

    const compileWork = (_kandownDir: string, taskId?: string) => {
      compiledTasks.push(taskId ?? '');
      return { markdown: `# compiled work for ${taskId ?? 'board'}` };
    };

    const createSession: AutopilotSessionFactory = config => {
      counter += 1;
      const id = `ses_${String(counter).padStart(2, '0')}`;
      sessions.push({
        id,
        taskId: compiledTasks[sessions.length] ?? '',
        prompt: config.prompt,
        permissionMode: config.permissionMode,
      });
      const info: AgentSessionInfo = {
        id,
        harnessId: config.harnessId,
        status: 'running',
        startedAt: new Date().toISOString(),
        usageTotals: { tokens: 0, costUsd: 0 },
      };
      return info;
    };

    const stopSession = (sessionId: string): boolean => {
      if (stoppedIds.includes(sessionId)) return false;
      stoppedIds.push(sessionId);
      // 📖 Like the real runtime with a child process gone, the stop surfaces
      // as a stopped event the orchestrator must treat as a finish.
      emit(sessionId, stoppedEvent(sessionId));
      return true;
    };

    return { sessions, stoppedIds, emit, subscribe, createSession, stopSession, compileWork };
  }

  let root: string;
  let kandownDir: string;
  let broadcasts: Record<string, unknown>[];

  function writeTask(taskId: string, frontmatterLines: string[]): void {
    writeFileSync(join(root, 'tasks', `${taskId}.md`), ['---', `id: ${taskId}`, ...frontmatterLines, '---', ''].join('\n'));
  }

  function makeProject(config?: unknown): void {
    root = mkdtempSync(join(tmpdir(), 'kandown-autopilot-'));
    kandownDir = join(root, '.kandown');
    mkdirSync(kandownDir, { recursive: true });
    mkdirSync(join(root, 'tasks'), { recursive: true });
    if (config !== undefined) {
      writeFileSync(join(kandownDir, 'kandown.json'), JSON.stringify(config));
    }
  }

  function makeOrchestrator(runtime: FakeRuntime, pollIntervalMs = 60_000) {
    const broadcaster: AutopilotBroadcaster = event => broadcasts.push(event);
    return createOrchestrator(root, kandownDir, {
      broadcast: broadcaster,
      subscribe: runtime.subscribe,
      createSession: runtime.createSession,
      stopSession: runtime.stopSession,
      compileWork: runtime.compileWork,
      isHarnessInstalled: () => true,
      pollIntervalMs,
    });
  }

  beforeEach(() => {
    broadcasts = [];
  });

  afterEach(() => {
    // 📖 Each test disposes its own orchestrator; the unref'd poll timer means
    // a missed dispose can never hang the run anyway.
  });

  it('dispatches orphans first, then ready tasks, up to maxParallel', () => {
    makeProject({ agent: { autopilot: { maxParallel: 2 } } });
    writeTask('t1', ['title: Ready one', 'status: Todo', 'priority: P2']);
    writeTask('t2', ['title: Orphaned one', 'status: In Progress', 'priority: P1']);
    writeTask('t3', ['title: Finished one', 'status: Done']);
    writeTask('t4', ['title: Backlog one', 'status: Backlog', 'priority: P1']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      const snapshot = orch.start('claude');
      expect(snapshot.state).toBe('running');
      expect(snapshot.harnessId).toBe('claude');
      expect(snapshot.config).toEqual({ maxParallel: 2 });
      // 📖 Rule 8, literal: at start every non-terminal, non-backlog task
      // without a live session is an orphan and is re-queued FIRST (files are
      // the truth: a task in progress without a session is resumable). t2
      // (In Progress, P1) then t1 (Todo, P2) are orphans; t4 (Backlog) is
      // never an orphan and follows via the ready order; t3 is terminal.
      expect(runtime.sessions.map(session => session.taskId)).toEqual(['t2', 't1']);
      expect(snapshot.active).toEqual([
        { taskId: 't2', sessionId: 'ses_01' },
        { taskId: 't1', sessionId: 'ses_02' },
      ]);
      expect(snapshot.queue).toEqual(['t4']);
      expect(snapshot.orphans).toEqual([]);
      expect(runtime.sessions[0]?.permissionMode).toBe('yolo');
      expect(runtime.sessions[0]?.prompt).toContain('# compiled work for t2');
      expect(runtime.sessions[0]?.prompt).toContain('## Autopilot directives');
    } finally {
      orch.dispose();
    }
  });

  it('marks a finished terminal task completed-for-run and feeds its report to the next dispatch', () => {
    makeProject({ agent: { autopilot: { maxParallel: 1 } } });
    writeTask('t1', ['title: First', 'status: Todo', 'priority: P1']);
    writeTask('t2', ['title: Second', 'status: Todo', 'priority: P2', 'depends_on: [t1]']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      orch.start('claude');
      expect(runtime.sessions.map(session => session.taskId)).toEqual(['t1']);

      // 📖 The harness (human-confirmed) moves t1 to Done with a report, then
      // the session stops: t1 becomes cascade handoff, t2 unblocks.
      writeTask('t1', ['title: First', 'status: Done', 'priority: P1', 'report: Shipped the first slice.']);
      runtime.emit('ses_01', usageEvent('ses_01', 120, 0.25));
      runtime.emit('ses_01', stoppedEvent('ses_01'));

      expect(runtime.sessions.map(session => session.taskId)).toEqual(['t1', 't2']);
      expect(runtime.sessions[1]?.prompt).toContain('Cascade handoff');
      expect(runtime.sessions[1]?.prompt).toContain('### t1 First');
      expect(runtime.sessions[1]?.prompt).toContain('Shipped the first slice.');

      const snapshot = orch.snapshot();
      expect(snapshot.active).toEqual([{ taskId: 't2', sessionId: 'ses_02' }]);
      // 📖 Run totals accumulate across the sessions of the same run.
      expect(snapshot.totals).toEqual({ tokens: 120, costUsd: 0.25 });
    } finally {
      orch.dispose();
    }
  });

  it('does not requeue an unfinished task: it surfaces as an orphan instead', () => {
    makeProject({ agent: { autopilot: { maxParallel: 1 } } });
    writeTask('t1', ['title: Wip', 'status: In Progress', 'priority: P1']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      orch.start('claude');
      runtime.emit('ses_01', stoppedEvent('ses_01'));

      const snapshot = orch.snapshot();
      expect(snapshot.active).toEqual([]);
      expect(snapshot.queue).toEqual([]);
      expect(snapshot.orphans).toEqual(['t1']);
      expect(runtime.sessions).toHaveLength(1);
    } finally {
      orch.dispose();
    }
  });

  it('stops a session that exceeds the session token cap and leaves its task orphaned', () => {
    makeProject({ agent: { autopilot: { maxParallel: 1, sessionTokenCap: 100 } } });
    writeTask('t1', ['title: Expensive', 'status: Todo', 'priority: P1']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      orch.start('claude');
      runtime.emit('ses_01', usageEvent('ses_01', 60));
      runtime.emit('ses_01', usageEvent('ses_01', 60));

      expect(runtime.stoppedIds).toEqual(['ses_01']);
      const snapshot = orch.snapshot();
      expect(snapshot.state).toBe('running');
      expect(snapshot.totals.tokens).toBe(120);
      expect(snapshot.orphans).toEqual(['t1']);
    } finally {
      orch.dispose();
    }
  });

  it('stops the whole run when the run cost cap is exceeded', () => {
    makeProject({ agent: { autopilot: { maxParallel: 2, runCostCapUsd: 0.5 } } });
    writeTask('t1', ['title: One', 'status: Todo', 'priority: P1']);
    writeTask('t2', ['title: Two', 'status: Todo', 'priority: P2']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      orch.start('claude');
      runtime.emit('ses_01', usageEvent('ses_01', 10, 0.3));
      expect(orch.snapshot().state).toBe('running');
      runtime.emit('ses_02', usageEvent('ses_02', 10, 0.3));

      const snapshot = orch.snapshot();
      expect(snapshot.state).toBe('idle');
      expect(snapshot.active).toEqual([]);
      expect(snapshot.queue).toEqual([]);
      // 📖 Totals stay visible until the next start resets them.
      expect(snapshot.totals).toEqual({ tokens: 20, costUsd: 0.6 });
      expect(runtime.stoppedIds).toEqual(['ses_01', 'ses_02']);
    } finally {
      orch.dispose();
    }
  });

  it('stop answers an idle snapshot with an emptied queue and stopped sessions', () => {
    makeProject({ agent: { autopilot: { maxParallel: 2 } } });
    writeTask('t1', ['title: One', 'status: Todo', 'priority: P1']);
    writeTask('t2', ['title: Two', 'status: Todo', 'priority: P2']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      orch.start('claude');
      const snapshot = orch.stop();
      expect(snapshot.state).toBe('idle');
      expect(snapshot.active).toEqual([]);
      expect(snapshot.queue).toEqual([]);
      expect(runtime.stoppedIds).toEqual(['ses_01', 'ses_02']);
      // 📖 Totals survive the stop until the next start resets them.
      expect(snapshot.totals).toEqual({ tokens: 0, costUsd: 0 });
    } finally {
      orch.dispose();
    }
  });

  it('broadcasts the frozen event shape on pivots only, not on read-only snapshots', () => {
    makeProject({ agent: { autopilot: { maxParallel: 2 } } });
    writeTask('t1', ['title: One', 'status: Todo', 'priority: P1']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime);
    try {
      orch.start('claude');
      orch.snapshot();
      orch.snapshot();
      const afterStart = broadcasts.length;
      expect(afterStart).toBeGreaterThan(0);
      const event = broadcasts.at(-1) as Record<string, unknown>;
      expect(Object.keys(event).sort()).toEqual(['active', 'at', 'orphans', 'queue', 'state', 'totals', 'type']);
      expect(event.type).toBe('agent_autopilot');
      expect(event.state).toBe('running');
      expect(event.active).toEqual([{ taskId: 't1', sessionId: 'ses_01' }]);
      expect(typeof event.at).toBe('string');
      // 📖 Read-only snapshots never broadcast.
      expect(broadcasts.length).toBe(afterStart);
      orch.stop();
      expect(broadcasts.length).toBe(afterStart + 1);
      expect((broadcasts.at(-1) as Record<string, unknown>).state).toBe('idle');
    } finally {
      orch.dispose();
    }
  });

  it('picks up newly ready work on the poll tick', async () => {
    makeProject({ agent: { autopilot: { maxParallel: 2 } } });
    writeTask('t1', ['title: One', 'status: Todo', 'priority: P1']);

    const runtime = fakeRuntime();
    const orch = makeOrchestrator(runtime, 20);
    try {
      orch.start('claude');
      expect(runtime.sessions).toHaveLength(1);
      // 📖 A new task appears mid-run; the next tick queues and dispatches it.
      writeTask('t2', ['title: Late arrival', 'status: Todo', 'priority: P1']);
      await new Promise(resolve => setTimeout(resolve, 90));
      expect(runtime.sessions.map(session => session.taskId)).toEqual(['t1', 't2']);
    } finally {
      orch.dispose();
    }
  });

  it('throws a readable error when no harness is installed', () => {
    makeProject();
    writeTask('t1', ['title: One', 'status: Todo']);
    const orch = createOrchestrator(root, kandownDir, {
      broadcast: event => broadcasts.push(event),
      isHarnessInstalled: () => false,
    });
    try {
      expect(() => orch.start()).toThrow(/No agent harness is installed/);
      expect(orch.snapshot().state).toBe('idle');
    } finally {
      orch.dispose();
    }
  });
});
