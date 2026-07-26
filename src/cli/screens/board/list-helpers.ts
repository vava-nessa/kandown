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
 *  → sortRows — applies a ListSort in place-safe fashion
 *  → buildListRows — board → filtered, sorted flat rows
 *  → computeListLayout — terminal width → per-column widths + visibility
 *  → wrapText — greedy word wrap for the expanded selected row
 *  → priorityColor / priorityRank — shared priority presentation & ordering
 *
 * @exports ListRow, ListSort, FilterMode, ListLayout, LIST_SORTS, FILTER_MODES,
 *   normalizeOwner, matchesSearch, matchesFilter, sortRows, buildListRows,
 *   computeListLayout, wrapText, priorityColor, priorityRank, ownerGlyph
 * @see src/cli/screens/board/list-view.tsx — the renderer that consumes these
 * @see src/lib/task-meta.ts — where the Age values come from
 */

import type { BoardTask, ParsedBoard } from '../../../lib/types.js';
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

export type ListSort = 'status' | 'age' | 'priority' | 'id';
export type FilterMode = 'all' | 'priority-p1' | 'owner-ai' | 'owner-human' | 'blocked';

/** 📖 Cycle order for the `s` key. */
export const LIST_SORTS: ListSort[] = ['status', 'age', 'priority', 'id'];

/** 📖 Cycle order for the `f` key. */
export const FILTER_MODES: FilterMode[] = ['all', 'priority-p1', 'owner-ai', 'owner-human', 'blocked'];

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
 * 📖 One-character owner badge. Deliberately ASCII-ish and single-width:
 * emoji (🤖/👤) render as two cells in some terminals and one in others, which
 * would shift every column to its right by one on the affected rows.
 */
export function ownerGlyph(task: BoardTask): string {
  const owner = normalizeOwner(task);
  return owner === 'ai' ? 'A' : owner === 'human' ? 'H' : ' ';
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
 */
export function sortRows(rows: ListRow[], sort: ListSort): ListRow[] {
  const indexOf = new Map<ListRow, number>();
  rows.forEach((row, i) => indexOf.set(row, i));
  const tiebreak = (a: ListRow, b: ListRow) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);

  const sorted = [...rows];
  switch (sort) {
    case 'age':
      // 📖 Most recently touched first. Tasks with no timestamp at all sink to
      // the bottom rather than pretending to be from 1970.
      sorted.sort((a, b) => {
        const ta = a.task.updatedAt;
        const tb = b.task.updatedAt;
        if (ta === null && tb === null) return tiebreak(a, b);
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta || tiebreak(a, b);
      });
      break;
    case 'priority':
      sorted.sort((a, b) => priorityRank(a.task) - priorityRank(b.task) || tiebreak(a, b));
      break;
    case 'id':
      sorted.sort((a, b) => a.task.id.localeCompare(b.task.id, undefined, { numeric: true }));
      break;
    case 'status':
    default:
      // 📖 Already in board order (columns left to right, tasks top to bottom)
      // because buildListRows walks the board that way.
      break;
  }
  return sorted;
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
  options: { search?: string; filter?: FilterMode; sort?: ListSort } = {},
): ListRow[] {
  if (!board) return [];
  const { search = '', filter = 'all', sort = 'status' } = options;
  const rows: ListRow[] = [];
  board.columns.forEach((column, colIndex) => {
    for (const task of column.tasks) {
      if (!matchesFilter(task, filter)) continue;
      if (!matchesSearch(task, search)) continue;
      rows.push({ task, status: column.name, colIndex });
    }
  });
  return sortRows(rows, sort);
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
): ParsedBoard | null {
  if (!board) return null;
  if (!search.trim() && filter === 'all') return board;
  return {
    ...board,
    columns: board.columns.map(column => ({
      ...column,
      tasks: column.tasks.filter(task => matchesFilter(task, filter) && matchesSearch(task, search)),
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
  /** 📖 First cell (0-based) of the description column — where wrapped
   * continuation lines of the selected row are indented to. */
  descOffset: number;
  /** 📖 Total width actually used, for the header underline. */
  total: number;
}

/** 📖 Below this the description is unreadable, so we drop a column instead. */
const MIN_DESC = 24;

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
type DroppableColumn = 'tags' | 'deps' | 'owner' | 'priority' | 'age' | 'status';
const DROP_ORDER: DroppableColumn[] = ['tags', 'deps', 'owner', 'priority', 'age', 'status'];

/**
 * 📖 Computes the column widths for the current rows and terminal width.
 *
 * Content-aware where it matters: the id and status columns are sized to their
 * longest actual value (capped), so a project with `t7`-style ids does not
 * reserve six characters, and a project with a "Waiting on review" column is
 * not truncated to "Waiting …" while three columns of slack sit unused.
 */
export function computeListLayout(rows: ListRow[], width: number = termWidth()): ListLayout {
  const longestId = rows.reduce((max, row) => Math.max(max, row.task.id.length), 2);
  const longestStatus = rows.reduce((max, row) => Math.max(max, row.status.length), 6);

  const layout: ListLayout = {
    // 📖 One cell for the ▸ / ✓ marker; the inter-column gap supplies the space
    // that separates it from the id.
    cursor: 1,
    id: Math.min(longestId, 8),
    age: 5,
    status: Math.min(longestStatus, 13),
    priority: 2,
    owner: 1,
    deps: 3,
    tags: 14,
    desc: 0,
    descOffset: 0,
    total: 0,
  };

  const visible = ['cursor', 'id', 'age', 'status', 'priority', 'owner', 'deps', 'tags'] as const;
  const used = (): number =>
    visible.reduce((sum, key) => sum + layout[key] + (layout[key] > 0 ? GAP : 0), 0);

  // 📖 Drop columns until the description can breathe. `cursor` and `id` are
  // never in DROP_ORDER, so this always terminates with a usable list.
  for (const key of DROP_ORDER) {
    if (width - used() >= MIN_DESC) break;
    layout[key] = 0;
  }

  layout.descOffset = used();
  layout.desc = Math.max(8, width - layout.descOffset);
  layout.total = Math.min(width, layout.descOffset + layout.desc);
  return layout;
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
