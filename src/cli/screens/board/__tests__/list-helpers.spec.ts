/**
 * @file List view helpers — sorting, filtering, layout and header hit-testing
 * @description Guards the pure half of the TUI list view, where a bug is
 * invisible until someone notices the wrong task under the cursor:
 *
 *  - `sortRows` produces each column's natural order, and `desc` is its exact
 *    mirror (the property that makes a second header click understandable).
 *  - Empty values sink below every real one in the natural order.
 *  - `matchesPriorityFilter` narrows to one priority, and `none` means
 *    untriaged rather than unfiltered.
 *  - `computeListLayout` caps the description, keeps the assignee column on
 *    the right, and stays inside the terminal width.
 *  - `listColumnAtX` agrees with the widths the renderer draws — the two walk
 *    the same order, and this is what proves they still line up.
 *
 * @see src/cli/screens/board/list-helpers.ts
 */

import { describe, expect, it } from 'vitest';
import type { BoardTask, ParsedBoard } from '../../../../lib/types';
import {
  ALL_LIST_COLUMNS,
  LIST_COLUMN_ORDER,
  MAX_DESC,
  type ListRow,
  buildListRows,
  computeListLayout,
  listColumnAtX,
  matchesPriorityFilter,
  ownerGlyph,
  sortForColumn,
  sortRows,
} from '../list-helpers';

function task(partial: Partial<BoardTask> & { id: string }): BoardTask {
  return {
    title: partial.id,
    checked: false,
    tags: [],
    assignee: null,
    priority: null,
    ownerType: null,
    progress: null,
    updatedAt: null,
    dependsOn: [],
    frontmatter: {},
    ...partial,
  } as BoardTask;
}

function row(t: BoardTask, status = 'Backlog', colIndex = 0): ListRow {
  return { task: t, status, colIndex };
}

describe('sortRows', () => {
  const rows: ListRow[] = [
    row(task({ id: 't3', priority: 'P3', updatedAt: 300, assignee: 'codex' }), 'Done', 2),
    row(task({ id: 't1', priority: 'P1', updatedAt: 100, assignee: 'claude' }), 'Backlog', 0),
    row(task({ id: 't2', priority: 'P2', updatedAt: 200, assignee: null }), 'Todo', 1),
  ];
  const ids = (rs: ListRow[]) => rs.map(r => r.task.id);

  it('does not mutate its input', () => {
    const before = ids(rows);
    sortRows(rows, 'id', 'desc');
    expect(ids(rows)).toEqual(before);
  });

  it('sorts by id ascending, and desc mirrors it', () => {
    expect(ids(sortRows(rows, 'id', 'asc'))).toEqual(['t1', 't2', 't3']);
    expect(ids(sortRows(rows, 'id', 'desc'))).toEqual(['t3', 't2', 't1']);
  });

  it('sorts priority P1 first, and reverses on desc', () => {
    expect(ids(sortRows(rows, 'priority', 'asc'))).toEqual(['t1', 't2', 't3']);
    expect(ids(sortRows(rows, 'priority', 'desc'))).toEqual(['t3', 't2', 't1']);
  });

  it('sorts age most-recent-first by default', () => {
    expect(ids(sortRows(rows, 'age', 'asc'))).toEqual(['t3', 't2', 't1']);
    expect(ids(sortRows(rows, 'age', 'desc'))).toEqual(['t1', 't2', 't3']);
  });

  it('sorts status in board-column order', () => {
    expect(ids(sortRows(rows, 'status', 'asc'))).toEqual(['t1', 't2', 't3']);
    expect(ids(sortRows(rows, 'status', 'desc'))).toEqual(['t3', 't2', 't1']);
  });

  it('puts unassigned tasks after the assigned ones (and first when mirrored)', () => {
    expect(ids(sortRows(rows, 'assignee', 'asc')).at(-1)).toBe('t2');
    expect(ids(sortRows(rows, 'assignee', 'desc')).at(0)).toBe('t2');
  });

  it('sinks tasks with no timestamp to the bottom (and to the top when mirrored)', () => {
    const withNull = [...rows, row(task({ id: 't9', updatedAt: null }), 'Backlog', 0)];
    expect(ids(sortRows(withNull, 'age', 'asc')).at(-1)).toBe('t9');
    expect(ids(sortRows(withNull, 'age', 'desc')).at(0)).toBe('t9');
  });

  it('is a total mirror: desc equals asc reversed', () => {
    for (const sort of ['id', 'age', 'priority', 'status', 'title', 'assignee'] as const) {
      expect(ids(sortRows(rows, sort, 'desc'))).toEqual(ids(sortRows(rows, sort, 'asc')).reverse());
    }
  });
});

describe('matchesPriorityFilter', () => {
  it('passes everything on `all`', () => {
    expect(matchesPriorityFilter(task({ id: 't1' }), 'all')).toBe(true);
    expect(matchesPriorityFilter(task({ id: 't1', priority: 'P2' }), 'all')).toBe(true);
  });

  it('narrows to a single priority', () => {
    expect(matchesPriorityFilter(task({ id: 't1', priority: 'P1' }), 'P1')).toBe(true);
    expect(matchesPriorityFilter(task({ id: 't1', priority: 'P2' }), 'P1')).toBe(false);
  });

  it('`none` means untriaged, not unfiltered', () => {
    expect(matchesPriorityFilter(task({ id: 't1' }), 'none')).toBe(true);
    expect(matchesPriorityFilter(task({ id: 't1', priority: 'P1' }), 'none')).toBe(false);
  });

  it('is applied by buildListRows', () => {
    const board: ParsedBoard = {
      title: 'b',
      columns: [{
        name: 'Backlog',
        tasks: [task({ id: 't1', priority: 'P1' }), task({ id: 't2', priority: 'P3' })],
      }],
    } as ParsedBoard;
    const rows = buildListRows(board, { priority: 'P1' });
    expect(rows.map(r => r.task.id)).toEqual(['t1']);
  });
});

describe('ownerGlyph', () => {
  it('renders a robot, a person, or blank — always two cells wide', () => {
    expect(ownerGlyph(task({ id: 't1', ownerType: 'ai' }))).toBe('🤖');
    expect(ownerGlyph(task({ id: 't1', frontmatter: { ownerType: 'agent' } }))).toBe('🤖');
    expect(ownerGlyph(task({ id: 't1', ownerType: 'human' }))).toBe('👤');
    expect(ownerGlyph(task({ id: 't1' }))).toBe('  ');
    for (const owner of ['ai', 'human', null]) {
      expect(ownerGlyph(task({ id: 't1', ownerType: owner as BoardTask['ownerType'] })).length).toBe(2);
    }
  });
});

describe('computeListLayout', () => {
  const rows = [row(task({ id: 't100' }), 'In Progress', 0)];

  it('caps the description even on a very wide terminal', () => {
    const layout = computeListLayout(rows, 400, ALL_LIST_COLUMNS);
    expect(layout.desc).toBe(MAX_DESC);
  });

  it('reserves the assignee column and never exceeds the terminal width', () => {
    for (const width of [40, 60, 80, 120, 200]) {
      const layout = computeListLayout(rows, width, ALL_LIST_COLUMNS);
      expect(layout.total).toBeLessThanOrEqual(width);
    }
    expect(computeListLayout(rows, 120, ALL_LIST_COLUMNS).assignee).toBeGreaterThan(0);
  });

  it('drops the assignee column before the description becomes unreadable', () => {
    const layout = computeListLayout(rows, 44, ALL_LIST_COLUMNS);
    expect(layout.assignee).toBe(0);
    expect(layout.desc).toBeGreaterThanOrEqual(8);
  });

  it('hides a column the user turned off, at any width', () => {
    const layout = computeListLayout(rows, 200, { ...ALL_LIST_COLUMNS, assignee: false });
    expect(layout.assignee).toBe(0);
  });

  it('leaves room for the sort arrow in every header label', () => {
    const layout = computeListLayout(rows, 200, ALL_LIST_COLUMNS);
    const labels: Array<[keyof typeof layout, string]> = [
      ['id', 'ID'], ['age', 'Age'], ['status', 'Status'],
      ['owner', 'Who'], ['deps', 'Dep'], ['tags', 'Tags'], ['assignee', 'Assignee'],
    ];
    for (const [key, label] of labels) {
      expect(layout[key]).toBeGreaterThanOrEqual(label.length + 1);
    }
  });
});

describe('listColumnAtX', () => {
  const layout = computeListLayout([row(task({ id: 't100' }), 'In Progress', 0)], 160, ALL_LIST_COLUMNS);

  it('maps a click to the column whose cells it lands in', () => {
    // Walk the drawn row cell by cell and check every x resolves to the column
    // the renderer would have painted there.
    let x = 1;
    for (const key of LIST_COLUMN_ORDER) {
      const width = layout[key];
      if (width <= 0) continue;
      for (let i = 0; i < width; i++) expect(listColumnAtX(layout, x + i)).toBe(key);
      x += width + 1; // + inter-column gap, which belongs to the cell on its left
    }
  });

  it('returns null past the end of the header', () => {
    expect(listColumnAtX(layout, 10_000)).toBeNull();
  });

  it('never resolves to a hidden column', () => {
    const narrow = computeListLayout([row(task({ id: 't1' }))], 50, { ...ALL_LIST_COLUMNS, tags: false });
    for (let x = 1; x <= 50; x++) {
      const key = listColumnAtX(narrow, x);
      if (key) expect(narrow[key]).toBeGreaterThan(0);
    }
  });
});

describe('sortForColumn', () => {
  it('maps the description header to a title sort', () => {
    expect(sortForColumn('desc')).toBe('title');
  });

  it('gives Pr no sort — it owns the priority lens instead', () => {
    expect(sortForColumn('priority')).toBeNull();
    expect(sortForColumn('cursor')).toBeNull();
  });

  it('covers every visible column with either a sort or a deliberate null', () => {
    for (const key of LIST_COLUMN_ORDER) {
      expect(() => sortForColumn(key)).not.toThrow();
    }
  });
});
