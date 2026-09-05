/**
 * @file Session edit tracker tests
 * @description Locks the daemon half of the live editing experience (t309):
 * the session-to-task path mapping (descriptive names, bare ids, the archive
 * directory, non-task rejection), the started/ended broadcast idempotence,
 * the task_diff gating on active pairs and the 24k truncation flag. The
 * runtime subscription and the broadcaster are fakes, so no harness process
 * and no SSE plumbing is involved.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/session-edits.ts
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionEditTracker, DIFF_CHAR_CAP } from '../agent/session-edits';
import type { AgentEvent } from '../agent/types';
import type { SessionEventSubscriber } from '../agent/session-edits';

const SESSION = 'ses_test01';
const HARNESS = 'acp';
const META = { sessionId: SESSION, harnessId: HARNESS, timestamp: new Date().toISOString() };

const fileChanged = (path: string): AgentEvent => ({ type: 'file_changed', path, ...META });
const turnCompleted = (): AgentEvent => ({ type: 'turn_completed', ...META });
const stopped = (): AgentEvent => ({ type: 'stopped', reason: 'user', exitCode: null, ...META });

const tick = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface Harness {
  subscribe: SessionEventSubscriber;
  emit: (event: AgentEvent) => void;
}

function fakeSubscriber(): Harness {
  let listener: ((event: AgentEvent) => void) | null = null;
  return {
    subscribe(_sessionId, next) {
      listener = next;
      return () => { listener = null; };
    },
    emit(event) {
      listener?.(event);
    },
  };
}

function makeProject(): { root: string; tasksDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'kandown-session-edits-'));
  const tasksDir = join(root, 'tasks');
  mkdirSync(join(tasksDir, 'archive'), { recursive: true });
  writeFileSync(join(tasksDir, 't232.md'), 't232 before\n');
  writeFileSync(join(tasksDir, 't301_UI_fix_login.md'), 't301 before\n');
  writeFileSync(join(tasksDir, 'archive', 't100.md'), 't100 before\n');
  return { root, tasksDir };
}

describe('session edit tracker', () => {
  let root: string;
  let tasksDir: string;
  let harness: Harness;
  let events: Record<string, unknown>[];

  beforeEach(() => {
    const project = makeProject();
    root = project.root;
    tasksDir = project.tasksDir;
    harness = fakeSubscriber();
    events = [];
  });

  afterEach(() => {
    harness.emit(stopped());
  });

  function makeTracker() {
    return createSessionEditTracker(root, tasksDir, event => events.push(event), {
      idleTimeoutMs: 60,
      turnLingerMs: 20,
      subscribe: harness.subscribe,
    });
  }

  function types(): string[] {
    return events.map(event => event.type as string);
  }

  it('maps file_changed paths to task ids, including the archive dir', () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);

    harness.emit(fileChanged(join(tasksDir, 't301_UI_fix_login.md')));
    harness.emit(fileChanged(join(tasksDir, 'archive', 't100.md')));

    const started = events.filter(event => event.type === 'agent_edit_started');
    expect(started).toHaveLength(2);
    expect(started[0]).toMatchObject({ sessionId: SESSION, taskId: 't301', harnessId: HARNESS });
    expect(started[1]).toMatchObject({ sessionId: SESSION, taskId: 't100' });
    expect(typeof started[0].at).toBe('string');
    expect(tracker.pendingPairs()).toHaveLength(2);
  });

  it('accepts project-relative paths and ignores non-task paths', () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);

    harness.emit(fileChanged('tasks/t232.md'));
    expect(tracker.pendingPairs().map(pair => pair.taskId)).toEqual(['t232']);

    const before = events.length;
    harness.emit(fileChanged(join(root, '.kandown', 'kandown.json')));
    harness.emit(fileChanged(join(root, 'README.md')));
    harness.emit(fileChanged(join(root, 'src', 'lib', 'version.ts')));
    expect(events.length).toBe(before);
    expect(tracker.pendingPairs()).toHaveLength(1);
  });

  it('broadcasts started once per pair and ended once per close', async () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);

    const path = join(tasksDir, 't301_UI_fix_login.md');
    harness.emit(fileChanged(path));
    harness.emit(fileChanged(path));
    expect(types().filter(type => type === 'agent_edit_started')).toHaveLength(1);

    harness.emit(turnCompleted());
    await tick(60);
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(1);
    await tick(30);
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(1);
    expect(tracker.pendingPairs()).toHaveLength(0);

    // 📖 A second turn with no edits must not re-open or re-close anything.
    harness.emit(turnCompleted());
    await tick(40);
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(1);
  });

  it('re-opens a pair when activity lands during the turn-end linger', async () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);
    const path = join(tasksDir, 't232.md');

    harness.emit(fileChanged(path));
    harness.emit(turnCompleted());
    harness.emit(fileChanged(path));
    await tick(100);

    expect(types().filter(type => type === 'agent_edit_started')).toHaveLength(1);
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(1);
  });

  it('clears a pair after the idle timeout with one ended broadcast', async () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);
    harness.emit(fileChanged(join(tasksDir, 't232.md')));
    await tick(100);
    expect(types()).toEqual(['agent_edit_started', 'agent_edit_ended']);
    expect(tracker.pendingPairs()).toHaveLength(0);
  });

  it('ends every pair on stopped and on detach, without duplicates', () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);
    harness.emit(fileChanged(join(tasksDir, 't232.md')));
    harness.emit(fileChanged(join(tasksDir, 'archive', 't100.md')));

    harness.emit(stopped());
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(2);

    tracker.attachSession(SESSION, HARNESS);
    harness.emit(fileChanged(join(tasksDir, 't232.md')));
    tracker.detachSession(SESSION);
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(3);

    // 📖 Detaching twice is a no-op, and an unknown session never broadcasts.
    tracker.detachSession(SESSION);
    tracker.detachSession('ses_unknown');
    expect(types().filter(type => type === 'agent_edit_ended')).toHaveLength(3);
  });

  it('gates task_diff on an active pair and carries the frozen keys', () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);
    const path = join(tasksDir, 't232.md');

    tracker.recordChange(path, 'old', 'new');
    expect(types()).toEqual([]);

    harness.emit(fileChanged(path));
    tracker.recordChange(path, 'old', 'new');
    const diffs = events.filter(event => event.type === 'task_diff');
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      type: 'task_diff',
      taskId: 't232',
      sessionId: SESSION,
      path,
      before: 'old',
      after: 'new',
      truncated: false,
      at: expect.any(String),
    });

    // 📖 A task nobody is editing stays silent even when it changes on disk.
    tracker.recordChange(join(tasksDir, 't301_UI_fix_login.md'), 'a', 'b');
    expect(events.filter(event => event.type === 'task_diff')).toHaveLength(1);
  });

  it('flags truncation and clips both sides at the 24k cap', () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);
    const path = join(tasksDir, 't232.md');
    harness.emit(fileChanged(path));

    const bigBefore = 'a'.repeat(DIFF_CHAR_CAP + 5);
    tracker.recordChange(path, bigBefore, 'small after');
    let diff = events.find(event => event.type === 'task_diff') as Record<string, unknown>;
    expect(diff.truncated).toBe(true);
    expect((diff.before as string).length).toBe(DIFF_CHAR_CAP);
    expect(diff.after).toBe('small after');

    const bigAfter = 'b'.repeat(DIFF_CHAR_CAP + 1);
    tracker.recordChange(path, 'tiny', bigAfter);
    diff = events.filter(event => event.type === 'task_diff')[1] as Record<string, unknown>;
    expect(diff.truncated).toBe(true);
    expect(diff.before).toBe('tiny');
    expect((diff.after as string).length).toBe(DIFF_CHAR_CAP);

    // 📖 Missing before text (brand-new file) is an empty string, not undefined.
    tracker.recordChange(path, undefined, 'created');
    diff = events.filter(event => event.type === 'task_diff')[2] as Record<string, unknown>;
    expect(diff.before).toBe('');
    expect(diff.truncated).toBe(false);
  });

  it('answers the live-edit query for active pairs only', () => {
    const tracker = makeTracker();
    tracker.attachSession(SESSION, HARNESS);
    const path = join(tasksDir, 't232.md');

    expect(tracker.isTaskBeingEditedByAgent(path)).toBeNull();
    harness.emit(fileChanged(path));
    expect(tracker.isTaskBeingEditedByAgent(path)).toEqual({ taskId: 't232', sessionId: SESSION });
    expect(tracker.isTaskBeingEditedByAgent(join(tasksDir, 'archive', 't100.md'))).toBeNull();
    expect(tracker.isTaskBeingEditedByAgent(join(root, 'kandown.json'))).toBeNull();

    tracker.dispose();
    expect(tracker.isTaskBeingEditedByAgent(path)).toBeNull();
    expect(tracker.pendingPairs()).toHaveLength(0);
  });
});
