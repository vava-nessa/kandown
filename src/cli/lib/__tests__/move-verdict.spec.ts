/**
 * @file Unit tests for the move verdict surfaced by board-reader
 * @description `moveTaskToColumnDetailed` is the one place a move is decided:
 * it resolves the task, asks the shared dependency gate, writes the file and
 * reports *why* when it refuses. Every interface (CLI, MCP, TUI, launcher)
 * phrases its own refusal from this verdict, so the shape of the verdict is a
 * contract, not an implementation detail: a missing `blockedBy` or a vague
 * `message` turns "blocked by t2" back into "Move failed".
 *
 * These run in-process against a tmpdir board (no spawn), so they cover the
 * cases the end-to-end CLI suite cannot reach cheaply: the three distinct
 * refusal reasons, and the guarantee that a refused move leaves the file byte
 * for byte untouched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveTaskToColumn, moveTaskToColumnDetailed } from '../board-reader';

const COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

let projectDir: string;
let kandownDir: string;

function seed(tasks: Array<{ id: string; status: string; depends_on?: string[] }>) {
  projectDir = mkdtempSync(join(tmpdir(), 'kandown-verdict-'));
  kandownDir = join(projectDir, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  mkdirSync(join(projectDir, 'tasks'), { recursive: true });
  writeFileSync(
    join(kandownDir, 'kandown.json'),
    JSON.stringify({ board: { columns: COLUMNS } }, null, 2),
  );
  for (const t of tasks) {
    const deps = t.depends_on?.length ? `depends_on: [${t.depends_on.join(', ')}]\n` : '';
    writeFileSync(
      join(projectDir, 'tasks', `${t.id}.md`),
      `---\nid: ${t.id}\ntitle: ${t.id}\nstatus: ${t.status}\n${deps}---\n\n# ${t.id}\n`,
    );
  }
}

const taskFile = (id: string) => join(projectDir, 'tasks', `${id}.md`);
const statusOf = (id: string) => readFileSync(taskFile(id), 'utf8').match(/^status: (.*)$/m)?.[1];

beforeEach(() => {
  seed([
    { id: 't1', status: 'In Progress', depends_on: ['t2'] },
    { id: 't2', status: 'Backlog' },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (projectDir && existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true });
});

describe('moveTaskToColumnDetailed', () => {
  it('reports success with no reason and no blockers', () => {
    expect(moveTaskToColumnDetailed(kandownDir, 't1', 'Review')).toEqual({
      ok: true,
      blockedBy: [],
      message: '',
    });
    expect(statusOf('t1')).toBe('Review');
  });

  it('names every unresolved dependency when the gate refuses', () => {
    seed([
      { id: 't1', status: 'In Progress', depends_on: ['t2', 't3'] },
      { id: 't2', status: 'Backlog' },
      { id: 't3', status: 'Todo' },
    ]);
    const outcome = moveTaskToColumnDetailed(kandownDir, 't1', 'Done');
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('blocked');
    expect(outcome.blockedBy).toEqual(['t2', 't3']);
    expect(outcome.message).toBe('Cannot move t1 to Done: blocked by t2, t3');
  });

  it('leaves the task file untouched when the gate refuses', () => {
    const before = readFileSync(taskFile('t1'), 'utf8');
    expect(moveTaskToColumnDetailed(kandownDir, 't1', 'Done').ok).toBe(false);
    expect(readFileSync(taskFile('t1'), 'utf8')).toBe(before);
  });

  it('distinguishes an unknown id from a blocked move', () => {
    const outcome = moveTaskToColumnDetailed(kandownDir, 'ghost', 'Done');
    expect(outcome).toEqual({
      ok: false,
      reason: 'not-found',
      blockedBy: [],
      message: 'Task not found: ghost',
    });
  });

  it('reports a write failure as its own reason instead of a blocked gate', () => {
    // 📖 Simulate the locked-file / EACCES case the launcher must survive.
    rmSync(taskFile('t2'));
    mkdirSync(taskFile('t2'));
    const outcome = moveTaskToColumnDetailed(kandownDir, 't2', 'Done');
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('write-failed');
    expect(outcome.blockedBy).toEqual([]);
    expect(outcome.message).toMatch(/^Failed to move task t2 to Done: /);
  });

  it('lets the move through once the dependency reaches the terminal column', () => {
    expect(moveTaskToColumnDetailed(kandownDir, 't1', 'Done').ok).toBe(false);
    expect(moveTaskToColumnDetailed(kandownDir, 't2', 'Done').ok).toBe(true);
    expect(moveTaskToColumnDetailed(kandownDir, 't1', 'Done').ok).toBe(true);
    expect(statusOf('t1')).toBe('Done');
  });
});

describe('moveTaskToColumn (boolean compatibility wrapper)', () => {
  it('returns the same decision as the detailed form', () => {
    expect(moveTaskToColumn(kandownDir, 't1', 'Done')).toBe(false);
    expect(moveTaskToColumn(kandownDir, 't1', 'Review')).toBe(true);
    expect(statusOf('t1')).toBe('Review');
  });

  it('still logs the refusal so callers that only branch on false say something', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    moveTaskToColumn(kandownDir, 't1', 'Done');
    expect(spy).toHaveBeenCalledWith('[kandown] Cannot move t1 to Done: blocked by t2');
  });

  it('stays quiet on a missing task: the caller already knows the id it passed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(moveTaskToColumn(kandownDir, 'ghost', 'Done')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
