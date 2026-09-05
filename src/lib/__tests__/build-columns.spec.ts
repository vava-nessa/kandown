/**
 * @file Unit tests for buildColumnsFromTasks
 * @description `buildColumnsFromTasks` is the single function that turns a flat
 * list of parsed task files into the column layout every surface renders (web
 * board, TUI board, demo backend). It is pure, so it needs no fixtures on disk.
 *
 * The behaviors locked here are the ones a regression would silently break:
 * every configured column is always present even when empty, a task whose
 * `status:` matches no configured column gets its own column *prepended*
 * instead of vanishing, matching is case-insensitive, archived tasks never
 * appear on the active board, and ordering is `order:` first then numeric id.
 */
import { describe, it, expect } from 'vitest';
import { buildColumnsFromTasks } from '../parser';
import type { ParsedTask } from '../types';

const COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Done'];

function task(id: string, extra: Record<string, unknown> = {}): ParsedTask {
  return {
    frontmatter: { id, title: id, status: 'Backlog', ...extra },
    body: '',
  } as ParsedTask;
}

const names = (cols: { name: string }[]) => cols.map(c => c.name);
const idsIn = (cols: { name: string; tasks: { id: string }[] }[], name: string) =>
  cols.find(c => c.name === name)?.tasks.map(t => t.id) ?? [];

describe('buildColumnsFromTasks', () => {
  it('returns every configured column even with no tasks at all', () => {
    expect(names(buildColumnsFromTasks([], COLUMNS))).toEqual(COLUMNS);
  });

  it('keeps empty configured columns rather than dropping them', () => {
    const cols = buildColumnsFromTasks([task('t1', { status: 'Done' })], COLUMNS);
    expect(names(cols)).toEqual(COLUMNS);
    expect(idsIn(cols, 'Backlog')).toEqual([]);
    expect(idsIn(cols, 'Done')).toEqual(['t1']);
  });

  it('matches a status to its column case-insensitively', () => {
    const cols = buildColumnsFromTasks([task('t1', { status: 'in progress' })], COLUMNS);
    expect(names(cols)).toEqual(COLUMNS);
    expect(idsIn(cols, 'In Progress')).toEqual(['t1']);
  });

  it('surfaces an unknown status as its own column, prepended so it cannot be missed', () => {
    const cols = buildColumnsFromTasks(
      [task('t1', { status: 'Blocked' }), task('t2', { status: 'Todo' })],
      COLUMNS,
    );
    expect(names(cols)).toEqual(['Blocked', ...COLUMNS]);
    expect(idsIn(cols, 'Blocked')).toEqual(['t1']);
  });

  it('falls back to the first configured column when status is missing', () => {
    const cols = buildColumnsFromTasks([task('t1', { status: undefined })], COLUMNS);
    expect(idsIn(cols, 'Backlog')).toEqual(['t1']);
  });

  it('hides archived tasks from the active board', () => {
    const cols = buildColumnsFromTasks(
      [task('t1', { status: 'Todo' }), task('t2', { status: 'Todo', archived: true })],
      COLUMNS,
    );
    expect(idsIn(cols, 'Todo')).toEqual(['t1']);
  });

  it('hides a task archived with the string "true" (unquoted YAML scalars)', () => {
    const cols = buildColumnsFromTasks([task('t1', { status: 'Todo', archived: 'true' })], COLUMNS);
    expect(idsIn(cols, 'Todo')).toEqual([]);
  });

  it('drops entries with no id instead of rendering a ghost card', () => {
    const ghost = { frontmatter: { title: 'no id', status: 'Todo' }, body: '' } as unknown as ParsedTask;
    const cols = buildColumnsFromTasks([ghost, task('t1', { status: 'Todo' })], COLUMNS);
    expect(idsIn(cols, 'Todo')).toEqual(['t1']);
  });

  it('orders by explicit order: before falling back to the id', () => {
    const cols = buildColumnsFromTasks(
      [
        task('t1', { status: 'Todo', order: 2 }),
        task('t2', { status: 'Todo', order: 1 }),
      ],
      COLUMNS,
    );
    expect(idsIn(cols, 'Todo')).toEqual(['t2', 't1']);
  });

  it('sorts ids numerically, not lexicographically (t9 before t10)', () => {
    const cols = buildColumnsFromTasks(
      [task('t10', { status: 'Todo' }), task('t9', { status: 'Todo' })],
      COLUMNS,
    );
    expect(idsIn(cols, 'Todo')).toEqual(['t9', 't10']);
  });

  it('falls back to the default columns when the config lists none', () => {
    const cols = buildColumnsFromTasks([task('t1')], []);
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.flatMap(c => c.tasks.map(t => t.id))).toEqual(['t1']);
  });
});
