/**
 * @file List view — pure data & layout helpers
 * @description Everything the flat list view needs that is not React: turning
 * the column-shaped board into one ordered list of rows, the search/filter
 * pipeline shared with the kanban view, the sort orders, the adaptive column
 * layout, and word wrapping for the expanded selected row.
 *
 * 📖 Why a flat list at all. On an 80-column terminal a 5-column kanban board
 * leaves ~15 usable characters per card, so every title is truncated into
 * noise. The list view spends the full terminal width on one task per line —
 * the same trade Ableton makes between its session and arrangement views, and
 * the reason `Tab` swaps between them rather than one replacing the other.
 *
 * 📖 The layout is *adaptive, not responsive-by-media-query*: `computeListLayout`
 * starts with every column enabled and drops them one at a time, in a fixed
 * priority order, until the description column can still show something useful.
 * That means the same code path produces a sensible 60-column and 200-column
 * layout without any hardcoded breakpoints to keep in sync.
 *
 * 📖 Search and filter live here rather than in the component because the
 * kanban view applies the exact same predicates — the two views must never
 * disagree about which tasks exist. (Before this refactor `searchQuery` and
 * `filterMode` were held in board.tsx state and never applied to anything;
 * both features were dead. See t264.)
 *
 * @functions
 *  → normalizeOwner — collapses ownerType spellings (`agent`/`ai`, `user`/`human`)
 *  → matchesSearch — case-insensitive substring match over id/title/tags/assignee
 *  → matchesFilter — the `f` key's filter modes
 *  → matchesPriorityFilter — the `Pr` header's priority lens
 *  → sortRows — applies a ListSort + direction in place-safe fashion
 *  → buildListRows — board → filtered, sorted flat rows
 *  → computeListLayout — terminal width → per-column widths + visibility
 *  → listColumnAtX — click X → the header cell under it
 *  → sortForColumn — header cell → the sort it selects (null for `Pr`)
 *  → wrapText — greedy word wrap for the expanded selected row
 *  → priorityColor / priorityRank — shared priority presentation & ordering
 *
 * @exports ListRow, ListSort, ListSortDir, FilterMode, PriorityFilter,
 *   ListLayout, ListColumnPrefs, ListColumnKey, ALL_LIST_COLUMNS,
 *   LIST_COLUMN_ORDER, LIST_SORTS, FILTER_MODES, PRIORITY_FILTERS, MAX_DESC,
 *   OWNER_GLYPH_WIDTH, normalizeOwner, matchesSearch, matchesFilter,
 *   matchesPriorityFilter, sortRows, buildListRows, computeListLayout,
 *   listColumnAtX, sortForColumn, wrapText, priorityColor, priorityRank,
 *   ownerGlyph
 * @see src/cli/screens/board/list-view.tsx — the renderer that consumes these
 * @see src/lib/task-meta.ts — where the Age values come from
 */

import type { BoardTask, ParsedBoard } from '../../../lib/types.js';
import { formatDependencyChip } from '../../../lib/dependency-chip-format.js';
import { termWidth, truncate } from './helpers.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * 📖 One rendered line of the list. Carries the task plus the two things the
 * flat view loses by leaving the kanban shape behind: which column the task
 * came from (`status`, shown as a coloured cell) and that column's index
 * (`colIndex`, used to keep the default sort in board order and to move the
 * task left/right without a lookup).
 */
export interface ListRow {
  task: BoardTask;
  status: string;
  colIndex: number;
}

export type ListSort = 'status' | 'age' | 'priority' | 'id' | 'owner' | 'deps' | 'tags' | 'title' | 'assignee';
export type ListSortDir = 'asc' | 'desc';
export type FilterMode = 'all' | 'priority-p1' | 'owner-ai' | 'owner-human' | 'blocked';

/**
 * 📖 Cycle order for the `s` key. Deliberately shorter than the set of
 * *sortable* columns: `s` walks the four orders anyone reaches for repeatedly,
 * while the rarer ones (owner, deps, tags, title, assignee) are one header
 * click away. A cycle you have to press nine times to get back to the start is
 * a cycle nobody uses.
 */
export const LIST_SORTS: ListSort[] = ['status', 'age', 'priority', 'id'];

/** 📖 Cycle order for the `f` key. */
export const FILTER_MODES: FilterMode[] = ['all', 'priority-p1', 'owner-ai', 'owner-human', 'blocked'];

/**
 * 📖 The priority lens, cycled by clicking the `Pr` header (or pressing `p`).
 * `all` shows everything; a `P1`…`P4` value narrows the list to that single
 * priority, and `none` surfaces the tasks nobody has triaged yet.
 *
 * 📖 Why its own state instead of another `FilterMode` entry: `f` and the
 * priority lens compose. "AI tasks" ∩ "P1" is the question you actually ask on
 * a Monday morning, and folding priority into the `f` cycle would make the two
 * mutually exclusive.
 */
export type PriorityFilter = 'all' | 'P1' | 'P2' | 'P3' | 'P4' | 'none';

export const PRIORITY_FILTERS: PriorityFilter[] = ['all', 'P1', 'P2', 'P3', 'P4', 'none'];

// ─── Owner / priority presentation ───────────────────────────────────────────

/**
 * 📖 Task files in the wild spell the owner several ways — `ownerType: ai`,
 * `ownerType: agent` (what this repo's own tasks use), `human`, `user`. The
 * parser's `normalizeOwnerType` only knows the canonical pair, so we widen the
 * match here rather than rejecting a user's perfectly readable file.
 */
export function normalizeOwner(task: BoardTask): 'ai' | 'human' | '' {
  const raw = String(task.ownerType || task.frontmatter?.ownerType || '').toLowerCase().trim();
  if (raw === 'ai' || raw === 'agent' || raw === 'bot') return 'ai';
  if (raw === 'human' || raw === 'user' || raw === 'me') return 'human';
  return '';
}

/**
 * 📖 Owner badge: 🤖 for an agent-owned task, 👤 for a human one, blank when
 * the file says nothing. `A`/`H` were unreadable without the legend; the two
 * pictograms are the whole point of a one-glyph column.
 *
 * 📖 Width discipline. Both glyphs are astral code points, so JavaScript's
 * `.length` reports 2 — exactly the number of terminal cells an emoji-
 * presentation character occupies. `pad`/`truncate` count code units, so the
 * column lines up for free as long as the width reserved for it is even. That
 * equivalence is the reason these two emoji were picked over, say, 🧑 (same
 * length, but far more variable rendering across fonts).
 */
export const OWNER_GLYPH_WIDTH = 2;

export function ownerGlyph(task: BoardTask): string {
  const owner = normalizeOwner(task);
  return owner === 'ai' ? '🤖' : owner === 'human' ? '👤' : '  ';
}

/** 📖 Sort weight for priority — P1 first, unset last. */
export function priorityRank(task: BoardTask): number {
  const match = String(task.priority || '').match(/^P([1-4])$/i);
  return match ? Number(match[1]) : 9;
}

/** 📖 Shared priority colour, so the list cell and the detail pane agree. */
export function priorityColor(priority: string | null | undefined): string {
  switch (String(priority || '').toUpperCase()) {
    case 'P1': return 'red';
    case 'P2': return 'yellow';
    case 'P3': return 'cyan';
    case 'P4': return 'gray';
    default: return 'gray';
  }
}

// ─── Search & filter ─────────────────────────────────────────────────────────

/**
 * 📖 Plain case-insensitive substring match across the fields a person would
 * actually type: the id, the title, any tag, and the assignee.
 *
 * Deliberately *not* fuzzy. In a filter that re-runs on every keystroke, fuzzy
 * matching makes the result set jump around as you type — you lose the row you
 * were aiming at. Substring matching only ever narrows.
 */
export function matchesSearch(task: BoardTask, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (task.id.toLowerCase().includes(q)) return true;
  if (task.title.toLowerCase().includes(q)) return true;
  if (task.tags.some(tag => tag.toLowerCase().includes(q))) return true;
  if (task.assignee && task.assignee.toLowerCase().includes(q)) return true;
  return false;
}

/**
 * 📖 The priority lens. `none` is not "no filter" — it is the *untriaged*
 * bucket, the tasks with no `priority:` at all, which is the one slice you
 * cannot otherwise ask for.
 */
export function matchesPriorityFilter(task: BoardTask, filter: PriorityFilter): boolean {
  if (filter === 'all') return true;
  const value = String(task.priority || '').toUpperCase();
  if (filter === 'none') return !/^P[1-4]$/.test(value);
  return value === filter;
}

/** 📖 The `f` key's modes. `blocked` surfaces tasks waiting on a dependency. */
export function matchesFilter(task: BoardTask, mode: FilterMode): boolean {
  switch (mode) {
    case 'priority-p1': return priorityRank(task) === 1;
    case 'owner-ai': return normalizeOwner(task) === 'ai';
    case 'owner-human': return normalizeOwner(task) === 'human';
    case 'blocked': return task.dependsOn.length > 0;
    case 'all':
    default: return true;
  }
}

// ─── Row building ────────────────────────────────────────────────────────────

/**
 * 📖 Sorts rows and returns a new array — never mutates the input, because the
 * caller's array is derived straight from the board snapshot React is holding.
 *
 * Every order falls back to board position (column, then in-column order) for
 * ties, so the list never reshuffles arbitrarily between two renders of the
 * same data.
 *
 * 📖 `dir` mirrors the whole comparator, tiebreak included, so `desc` is the
 * exact reverse of `asc` and clicking a header twice returns you to a list you
 * recognise. `asc` always means each column's *natural reading order*: board
 * order for status, most-recent-first for age, P1-first for priority. Those
 * are the orders a person means when they say "sorted by age", so they are the
 * ones the first click gives you.
 */
export function sortRows(rows: ListRow[], sort: ListSort, dir: ListSortDir = 'asc'): ListRow[] {
  const indexOf = new Map<ListRow, number>();
  rows.forEach((row, i) => indexOf.set(row, i));
  const tiebreak = (a: ListRow, b: ListRow) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);
  // 📖 Empty values sort after every real one in `asc`, so "sort by assignee"
  // opens on the tasks that actually have one. Under `desc` they lead, because
  // `desc` is a true mirror (see above): pinning blanks to the bottom in both
  // directions would make the second click on a header flip *most* of the list
  // and leave a block of it stuck, which reads as a bug.
  const byText = (a: string, b: string) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  const compare = (a: ListRow, b: ListRow): number => {
    switch (sort) {
      case 'age': {
        // 📖 Most recently touched first. Tasks with no timestamp at all sink
        // to the bottom rather than pretending to be from 1970.
        const ta = a.task.updatedAt;
        const tb = b.task.updatedAt;
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta;
      }
      case 'priority':
        return priorityRank(a.task) - priorityRank(b.task);
      case 'id':
        return a.task.id.localeCompare(b.task.id, undefined, { numeric: true });
      case 'owner':
        return byText(normalizeOwner(a.task), normalizeOwner(b.task));
      case 'deps':
        return b.task.dependsOn.length - a.task.dependsOn.length;
      case 'tags':
        return byText(a.task.tags.join(','), b.task.tags.join(','));
      case 'title':
        return byText(a.task.title, b.task.title);
      case 'assignee':
        return byText(a.task.assignee ?? '', b.task.assignee ?? '');
      case 'status':
      default:
        // 📖 Board order (columns left to right, tasks top to bottom) is what
        // buildListRows already produced, so the tiebreak alone reproduces it.
        return a.colIndex - b.colIndex;
    }
  };

  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => sign * (compare(a, b) || tiebreak(a, b)));
}

/**
 * 📖 Flattens the board into the rows the list renders, applying the search
 * query and filter mode on the way through.
 *
 * Walking `board.columns` in order means the default `status` sort needs no
 * comparator at all — the natural traversal already produces "Backlog first,
 * Done last, board order within each column".
 */
export function buildListRows(
  board: ParsedBoard | null,
  options: {
    search?: string;
    filter?: FilterMode;
    priority?: PriorityFilter;
    sort?: ListSort;
    dir?: ListSortDir;
  } = {},
): ListRow[] {
  if (!board) return [];
  const { search = '', filter = 'all', priority = 'all', sort = 'status', dir = 'asc' } = options;
  const rows: ListRow[] = [];
  board.columns.forEach((column, colIndex) => {
    for (const task of column.tasks) {
      if (!matchesFilter(task, filter)) continue;
      if (!matchesPriorityFilter(task, priority)) continue;
      if (!matchesSearch(task, search)) continue;
      rows.push({ task, status: column.name, colIndex });
    }
  });
  return sortRows(rows, sort, dir);
}

/**
 * 📖 Same predicates, kanban shape. Returns a board whose columns hold only the
 * matching tasks, so the board view honours `/` and `f` exactly like the list.
 *
 * Returns the original object untouched when nothing is being filtered — that
 * keeps referential equality, so React skips re-rendering every column on each
 * unrelated state change.
 */
export function applyBoardFilter(
  board: ParsedBoard | null,
  search: string,
  filter: FilterMode,
  priority: PriorityFilter = 'all',
): ParsedBoard | null {
  if (!board) return null;
  if (!search.trim() && filter === 'all' && priority === 'all') return board;
  return {
    ...board,
    columns: board.columns.map(column => ({
      ...column,
      tasks: column.tasks.filter(task =>
        matchesFilter(task, filter)
        && matchesPriorityFilter(task, priority)
        && matchesSearch(task, search)),
    })),
  };
}

// ─── Layout ──────────────────────────────────────────────────────────────────

/**
 * 📖 Resolved widths (in terminal cells) for one render of the list. A width of
 * `0` means the column is hidden at this terminal size. `desc` always gets
 * whatever is left over, and is the reason columns get dropped at all.
 */
export interface ListLayout {
  cursor: number;
  id: number;
  age: number;
  status: number;
  priority: number;
  owner: number;
  deps: number;
  tags: number;
  desc: number;
  /** 📖 Assignee cell, drawn *after* the description at the far right. */
  assignee: number;
  /** 📖 First cell (0-based) of the description column — where wrapped
   * continuation lines of the selected row are indented to. */
  descOffset: number;
  /** 📖 Total width actually used, for the header underline. */
  total: number;
}

/** 📖 Below this the description is unreadable, so we drop a column instead. */
const MIN_DESC = 24;

/**
 * 📖 Hard cap on the description column.
 *
 * A title is scanned, not read: past ~60 characters the eye stops parsing the
 * line and starts hunting, and on a 200-column terminal an uncapped
 * description pushes everything after it (the assignee) off into the far
 * distance where it stops being part of the same row. Capping here also makes
 * every row the same shape at any terminal width, which is what makes a long
 * list scannable. The full title is always one keypress away in the detail
 * pane, and the selected row still wraps in place.
 */
export const MAX_DESC = 60;

/** 📖 Enough for `claude-code` / a human handle; longer names get elided. */
const ASSIGNEE_WIDTH = 12;

/** 📖 One space between every visible column. */
const GAP = 1;

/**
 * 📖 Order in which columns are sacrificed as the terminal narrows.
 *
 * Tags go first (nice-to-have grouping), then the dependency chip, then the
 * owner badge, then priority. `age` and `status` are last because they are the
 * two things the flat list exists to show that a single task file does not:
 * what moved recently, and where it sits on the board.
 */
type DroppableColumn = 'tags' | 'assignee' | 'deps' | 'owner' | 'priority' | 'age' | 'status';

/**
 * 📖 Which optional columns the user wants at all, from `tui.columns` in
 * kandown.json. `ID` and `Description` are absent on purpose — they are what
 * makes a row identifiable, so they are never optional.
 *
 * This is a different mechanism from the automatic narrowing drop below: a
 * column turned off here is never drawn at any width, while the drop only
 * removes columns you did ask for, and only when they genuinely do not fit.
 */
export interface ListColumnPrefs {
  age: boolean;
  status: boolean;
  priority: boolean;
  owner: boolean;
  deps: boolean;
  tags: boolean;
  assignee: boolean;
}

/** 📖 Fallback when no preference is supplied (tests, direct calls). */
export const ALL_LIST_COLUMNS: ListColumnPrefs = {
  age: true, status: true, priority: true, owner: true, deps: true, tags: true, assignee: true,
};
const DROP_ORDER: DroppableColumn[] = ['tags', 'assignee', 'deps', 'owner', 'priority', 'age', 'status'];

/**
 * 📖 Computes the column widths for the current rows and terminal width.
 *
 * Content-aware where it matters: the id and status columns are sized to their
 * longest actual value (capped), so a project with `t7`-style ids does not
 * reserve six characters, and a project with a "Waiting on review" column is
 * not truncated to "Waiting …" while three columns of slack sit unused.
 *
 * 📖 The deps column is also content-aware now: a single dependency renders as
 * `↪ t234: <20 char preview>` (~30 cells), while multiple deps collapse to
 * `↪N id1, id2, …` which is shorter. We size the column to fit the widest
 * value, capped at 30 cells so a pathological `↪99 …` does not eat the
 * description. `titleById` is optional — without it we fall back to the old
 * 4-cell width so older callers (and tests) keep working unchanged.
 */
export function computeListLayout(
  rows: ListRow[],
  width: number = termWidth(),
  prefs: ListColumnPrefs = ALL_LIST_COLUMNS,
  titleById?: ReadonlyMap<string, string>,
): ListLayout {
  const longestId = rows.reduce((max, row) => Math.max(max, row.task.id.length), 2);
  const longestStatus = rows.reduce((max, row) => Math.max(max, row.status.length), 6);
  // 📖 Adaptive deps width: longest chip content across all rows, capped so
  // one row with 99 deps does not crowd the description out. Falls back to the
  // legacy 4-cell width when no title map is provided.
  const longestDepsContent = titleById
    ? rows.reduce((max, row) => {
        const ids = row.task.dependsOn;
        if (!ids || ids.length === 0) return max;
        return Math.max(max, formatDependencyChip(ids, titleById).length);
      }, 0)
    : 0;
  const depsWidth = titleById
    ? Math.max(4, Math.min(30, longestDepsContent))
    : 4;

  // 📖 A disabled column starts at width 0, which every downstream consumer
  // already reads as "hidden" — the drop loop, `used()`, the header row and the
  // task row all key off `> 0`. Switching a column off therefore needs no extra
  // branch anywhere: it simply enters the layout already collapsed.
  const layout: ListLayout = {
    // 📖 One cell for the ▸ / ✓ marker; the inter-column gap supplies the space
    // that separates it from the id.
    cursor: 1,
    // 📖 Every width below has one cell of slack over its header label, so the
    // active-sort arrow (`ID↑`, `Status↓`) fits without the column changing
    // size when you click it. See `ListHeaderRow`.
    id: Math.max(3, Math.min(longestId, 8)),
    age: prefs.age ? 5 : 0,
    status: prefs.status ? Math.max(7, Math.min(longestStatus, 13)) : 0,
    priority: prefs.priority ? 2 : 0,
    // 📖 An emoji owner badge is two terminal cells wide (see `ownerGlyph`);
    // the extra two carry the `Who↑` header without reserving a third glyph.
    owner: prefs.owner ? OWNER_GLYPH_WIDTH + 2 : 0,
    deps: prefs.deps ? depsWidth : 0,
    tags: prefs.tags ? 14 : 0,
    desc: 0,
    assignee: prefs.assignee ? ASSIGNEE_WIDTH : 0,
    descOffset: 0,
    total: 0,
  };

  const visible = ['cursor', 'id', 'age', 'status', 'priority', 'owner', 'deps', 'tags'] as const;
  const leading = (): number =>
    visible.reduce((sum, key) => sum + layout[key] + (layout[key] > 0 ? GAP : 0), 0);
  // 📖 The assignee sits to the *right* of the description, so its width is
  // subtracted from what the description may claim rather than added to the
  // offset the description starts at.
  const trailing = (): number => (layout.assignee > 0 ? layout.assignee + GAP : 0);
  const used = (): number => leading() + trailing();

  // 📖 Drop columns until the description can breathe. `cursor` and `id` are
  // never in DROP_ORDER, so this always terminates with a usable list.
  for (const key of DROP_ORDER) {
    if (width - used() >= MIN_DESC) break;
    layout[key] = 0;
  }

  layout.descOffset = leading();
  // 📖 Capped, not greedy: see MAX_DESC. Whatever the cap leaves over stays
  // unused rather than being handed to a column that does not need it.
  layout.desc = Math.max(8, Math.min(MAX_DESC, width - layout.descOffset - trailing()));
  layout.total = Math.min(width, layout.descOffset + layout.desc + trailing());
  return layout;
}

// ─── Header hit-testing ──────────────────────────────────────────────────────

/** 📖 Every cell of the header row, in the order it is drawn. */
export type ListColumnKey =
  | 'cursor' | 'id' | 'age' | 'status' | 'priority' | 'owner' | 'deps' | 'tags' | 'desc' | 'assignee';

/** 📖 Draw order. The renderer and the hit-test walk this same array, which is
 *  the only way the two can never disagree about where a column starts. */
export const LIST_COLUMN_ORDER: ListColumnKey[] = [
  'cursor', 'id', 'age', 'status', 'priority', 'owner', 'deps', 'tags', 'desc', 'assignee',
];

/**
 * 📖 Maps a click's X coordinate (1-based, as terminals report it) to the
 * header cell under it, or null past the end of the row. Hidden columns
 * (width 0) are skipped, so a click always lands on something the user can
 * actually see.
 *
 * 📖 The inter-column gap belongs to the cell on its *left*: clicking the
 * single space after `Status` sorts by status rather than doing nothing, which
 * matters when a header label is only two characters wide (`Pr`).
 */
export function listColumnAtX(layout: ListLayout, x: number): ListColumnKey | null {
  let start = 0; // 0-based cell index of the current column
  for (const key of LIST_COLUMN_ORDER) {
    const width = layout[key];
    if (width <= 0) continue;
    const end = start + width + GAP; // inclusive of the trailing gap
    if (x - 1 < end) return key;
    start = end;
  }
  return null;
}

/**
 * 📖 Which sort a header cell selects. The cursor column has nothing to sort
 * by, and `priority` is deliberately absent: clicking `Pr` cycles the priority
 * lens instead (the board's most-used filter deserves the most-clickable
 * target), and priority *sorting* stays on the `s` cycle.
 */
export function sortForColumn(key: ListColumnKey): ListSort | null {
  switch (key) {
    case 'id': return 'id';
    case 'age': return 'age';
    case 'status': return 'status';
    case 'owner': return 'owner';
    case 'deps': return 'deps';
    case 'tags': return 'tags';
    case 'desc': return 'title';
    case 'assignee': return 'assignee';
    case 'priority':
    case 'cursor':
    default: return null;
  }
}

/**
 * 📖 Greedy word wrap used only for the **selected** row, which expands
 * downward so a long title is fully readable without opening the task.
 *
 * Every other row stays exactly one line — that invariant is what lets the list
 * scroll maths stay trivial and what keeps "one task = one line" true when you
 * scan the board.
 *
 * A single word longer than `width` (a URL, a path) is hard-split rather than
 * allowed to overflow the column and corrupt the layout.
 */
export function wrapText(text: string, width: number, maxLines = 4): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (width <= 0) return [];
  if (clean.length <= width) return [clean];

  const lines: string[] = [];
  let current = '';
  for (const word of clean.split(' ')) {
    if (current === '' && word.length > width) {
      // 📖 Unbreakable token — chop it into width-sized pieces.
      for (let i = 0; i < word.length; i += width) {
        if (lines.length >= maxLines) break;
        lines.push(word.slice(i, i + width));
      }
      current = '';
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }
    lines.push(current);
    if (lines.length >= maxLines) { current = ''; break; }
    current = word;
  }
  if (current && lines.length < maxLines) lines.push(current);

  // 📖 Ran out of allowed lines mid-text: mark the truncation on the last one
  // so the user knows to press Enter for the rest.
  const consumed = lines.join(' ').length;
  if (consumed < clean.length && lines.length > 0) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1] + ' …', width);
  }
  return lines;
}
