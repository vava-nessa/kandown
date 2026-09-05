/**
 * @file Unit and integration tests for the undo journal reader
 * @description `listUndoRecords` is the read half of the undo safety net: the
 * `kandown undo` command peeks at the journal through it BEFORE reverting, so
 * a missing, corrupted or partially written journal must come back as an
 * empty (or filtered) list rather than an exception, and the newest-first
 * ordering is the contract the revert confirmation is phrased from.
 *
 * The integration cases seed a real journal plus task files in a tmpdir and
 * drive `undoLastAction` to prove that the records the reader returns
 * describe what the revert actually restores: a `move` restores its
 * `previousContent`, a `create` (whose `previousContent` is null) removes the
 * created file, and an empty journal reports false instead of throwing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listUndoRecords } from '../undo';
import type { UndoRecord } from '../undo';
import { undoLastAction, undoLastActionDetailed } from '../board-reader';

let projectDir: string;
let kandownDir: string;
let undoDir: string;

/** 📖 A record exactly the shape `pushUndo` writes, overridable per test. */
function makeRecord(overrides: Partial<UndoRecord> = {}): UndoRecord {
  return {
    type: 'move',
    taskId: 't1',
    path: join(projectDir, 'tasks', 't1.md'),
    previousContent: '---\nid: t1\ntitle: t1\nstatus: Backlog\n---\n',
    newContent: '---\nid: t1\ntitle: t1\nstatus: Done\n---\n',
    timestamp: Date.now(),
    ...overrides,
  };
}

/** 📖 Writes the journal file with an arbitrary root: the tests must be able
 * to seed corrupted shapes (an object instead of an array) on purpose. */
function writeJournal(records: unknown): void {
  mkdirSync(undoDir, { recursive: true });
  writeFileSync(join(undoDir, 'log.json'), JSON.stringify(records, null, 2));
}

function readJournalRaw(): string {
  return readFileSync(join(undoDir, 'log.json'), 'utf8');
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'kandown-undo-'));
  kandownDir = join(projectDir, '.kandown');
  undoDir = join(kandownDir, '.undo');
  mkdirSync(kandownDir, { recursive: true });
  mkdirSync(join(projectDir, 'tasks'), { recursive: true });
  writeFileSync(
    join(kandownDir, 'kandown.json'),
    JSON.stringify({ board: { columns: ['Backlog', 'Done'] } }, null, 2),
  );
});

afterEach(() => {
  if (projectDir && existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true });
});

describe('listUndoRecords', () => {
  it('returns an empty list when the journal file does not exist', () => {
    expect(listUndoRecords(kandownDir)).toEqual([]);
  });

  it('returns an empty list when even the .undo directory is missing', () => {
    rmSync(kandownDir, { recursive: true, force: true });
    mkdirSync(kandownDir, { recursive: true });
    expect(listUndoRecords(kandownDir)).toEqual([]);
  });

  it('returns an empty list when the journal is corrupted (invalid JSON)', () => {
    mkdirSync(undoDir, { recursive: true });
    writeFileSync(join(undoDir, 'log.json'), '{ not json at all');
    expect(listUndoRecords(kandownDir)).toEqual([]);
  });

  it('returns an empty list when the journal root is not an array', () => {
    writeJournal({ type: 'move', taskId: 't1' });
    expect(listUndoRecords(kandownDir)).toEqual([]);
  });

  it('returns seeded records newest first, with their exact content', () => {
    const oldest = makeRecord({ taskId: 't1', timestamp: 1000 });
    const middle = makeRecord({ type: 'delete', taskId: 't2', previousContent: 'body', newContent: null, timestamp: 2000 });
    const newest = makeRecord({ type: 'create', taskId: 't3', previousContent: null, timestamp: 3000 });
    // 📖 pushUndo unshifts, so the on-disk order is already newest first.
    writeJournal([newest, middle, oldest]);

    const records = listUndoRecords(kandownDir);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual(newest);
    expect(records[1]).toEqual(middle);
    expect(records[2]).toEqual(oldest);
  });

  it('skips malformed entries instead of crashing on a partial write', () => {
    const valid = makeRecord({ taskId: 't9' });
    writeJournal([
      { type: 'move', taskId: 't1' }, // missing path and content fields
      { type: 'teleport', taskId: 't2', path: '/x', previousContent: null, newContent: null, timestamp: 1 }, // unknown type
      makeRecord({ timestamp: 'yesterday' as unknown as number }), // wrong timestamp type
      'not even an object',
      null,
      valid,
    ]);

    const records = listUndoRecords(kandownDir);
    expect(records).toEqual([valid]);
  });
});

describe('undoLastAction (journal round trip)', () => {
  it('restores the previous content of a moved task and empties the journal', () => {
    const previousContent = '---\nid: t1\ntitle: t1\nstatus: Backlog\n---\n';
    const newContent = '---\nid: t1\ntitle: t1\nstatus: Done\n---\n';
    const taskPath = join(projectDir, 'tasks', 't1.md');
    writeFileSync(taskPath, newContent);
    writeJournal([makeRecord({ taskId: 't1', path: taskPath, previousContent, newContent })]);

    // 📖 The command reads the record BEFORE reverting: same peek, same data.
    const peeked = listUndoRecords(kandownDir);
    expect(peeked[0].taskId).toBe('t1');
    expect(peeked[0].previousContent).toBe(previousContent);

    expect(undoLastAction(kandownDir)).toBe(true);
    expect(readFileSync(taskPath, 'utf8')).toBe(previousContent);
    expect(listUndoRecords(kandownDir)).toEqual([]);
  });

  it('deletes the created task when undoing a create (previousContent null)', () => {
    const createdContent = '---\nid: t2\ntitle: Fresh\nstatus: Backlog\n---\n';
    const createdPath = join(projectDir, 'tasks', 't2_fresh.md');
    writeFileSync(createdPath, createdContent);
    writeJournal([
      makeRecord({ type: 'create', taskId: 't2', path: createdPath, previousContent: null, newContent: createdContent }),
    ]);

    expect(undoLastAction(kandownDir)).toBe(true);
    expect(existsSync(createdPath)).toBe(false);
  });

  it('reverts the newest entry first when several are queued', () => {
    const t1Path = join(projectDir, 'tasks', 't1.md');
    const t2Path = join(projectDir, 'tasks', 't2.md');
    writeFileSync(t1Path, 't1 current');
    writeFileSync(t2Path, 't2 current');
    writeJournal([
      makeRecord({ taskId: 't2', path: t2Path, previousContent: 't2 previous', newContent: 't2 current' }),
      makeRecord({ taskId: 't1', path: t1Path, previousContent: 't1 previous', newContent: 't1 current' }),
    ]);

    expect(undoLastAction(kandownDir)).toBe(true);
    expect(readFileSync(t2Path, 'utf8')).toBe('t2 previous');
    expect(readFileSync(t1Path, 'utf8')).toBe('t1 current');

    expect(undoLastAction(kandownDir)).toBe(true);
    expect(readFileSync(t1Path, 'utf8')).toBe('t1 previous');

    const remaining = listUndoRecords(kandownDir);
    expect(remaining).toEqual([]);
  });

  it('returns false on an empty journal instead of throwing', () => {
    writeJournal([]);
    expect(undoLastAction(kandownDir)).toBe(false);
  });

  it('returns false when the journal file is missing', () => {
    expect(undoLastAction(kandownDir)).toBe(false);
  });
});

describe('undoLastActionDetailed (drift guard)', () => {
  it('refuses and keeps the entry when the file changed after the mutation', () => {
    const taskPath = join(projectDir, 'tasks', 't1.md');
    const previousContent = '---\nid: t1\nstatus: Todo\n---\n';
    const newContent = '---\nid: t1\nstatus: Done\n---\n';
    // 📖 The file drifted after the journalized move: someone checked a
    // subtask on top of the mutation. A blind restore would erase that.
    writeFileSync(taskPath, `${newContent}report: edited after the move\n`);
    writeJournal([
      makeRecord({ taskId: 't1', path: taskPath, previousContent, newContent }),
    ]);

    const outcome = undoLastActionDetailed(kandownDir);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('drifted');
    expect(outcome.record?.taskId).toBe('t1');
    // 📖 The file keeps the newer edits and the entry stays queued: nothing
    // is silently destroyed, the human decides.
    expect(readFileSync(taskPath, 'utf8')).toBe(`${newContent}report: edited after the move\n`);
    expect(listUndoRecords(kandownDir)).toHaveLength(1);
  });

  it('refuses the create-undo when the created file was edited since', () => {
    const createdPath = join(projectDir, 'tasks', 't2_fresh.md');
    writeFileSync(createdPath, 'created, then edited');
    writeJournal([
      makeRecord({ type: 'create', taskId: 't2', path: createdPath, previousContent: null, newContent: 'created content' }),
    ]);

    const outcome = undoLastActionDetailed(kandownDir);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('drifted');
    expect(existsSync(createdPath)).toBe(true);
  });

  it('reverts a clean entry and reports the reverted record', () => {
    const taskPath = join(projectDir, 'tasks', 't1.md');
    writeFileSync(taskPath, 't1 current');
    writeJournal([
      makeRecord({ taskId: 't1', path: taskPath, previousContent: 't1 previous', newContent: 't1 current' }),
    ]);

    const outcome = undoLastActionDetailed(kandownDir);
    expect(outcome.ok).toBe(true);
    expect(outcome.record?.taskId).toBe('t1');
    expect(readFileSync(taskPath, 'utf8')).toBe('t1 previous');
    expect(listUndoRecords(kandownDir)).toEqual([]);
  });

  it('answers empty on an empty journal with the detailed shape', () => {
    writeJournal([]);
    const outcome = undoLastActionDetailed(kandownDir);
    expect(outcome).toEqual({ ok: false, reason: 'empty' });
  });
});
