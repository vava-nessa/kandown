/**
 * @file List view — presentational components
 * @description The flat, one-task-per-line view that the TUI opens on, plus the
 * Name/Value detail pane pinned beneath it. Stateless: `board.tsx` owns the
 * selection, the scroll offset and every key binding; this file only draws.
 *
 * 📖 Layout, top to bottom:
 *
 * ```
 *    ID   Age   Status       P O Dep  Tags        Description      ← ListHeaderRow
 *   ───────────────────────────────────────────────────────────
 *    t12  3s    Backlog      P2 A      infra      Wire the daemon  ← TaskListRow
 *  ▸ t264 12min In Progress  P1 A ↪2   tui,ux     [tui] Refactor…  ← selected, expands
 *                                                 …the TUI list…      downward
 *    t99  4d    Done         P3 H      docs       Rewrite README
 *   ▲ 3 above · ▼ 12 below · 4/19 · sort status · filter all       ← ListFooter
 *   ────────────────────────────────────────────────────────────
 *   ID         t264                                               ← TaskDetailPane
 *   Status     In Progress   P1  ai
 *   …
 * ```
 *
 * 📖 The one-line invariant. Every row except the selected one is exactly one
 * terminal line, truncated with `…`. Only the selected row wraps, growing
 * downward so the full title is readable without leaving the list. That is what
 * keeps the scroll arithmetic in `computeListWindow` trivial — it only ever has
 * to special-case a single variable-height row — and it is what makes the list
 * scannable: line count equals task count.
 *
 * 📖 The footer line is drawn unconditionally, even when there is nothing to
 * scroll. A conditional footer would change the viewport height by one whenever
 * you crossed a scroll boundary, which makes rows jump under the cursor.
 *
 * @functions
 *  → computeListWindow — which rows are visible, given selection and height
 *  → ListHeaderRow — the clickable column header (sort arrow, priority lens)
 *  → TaskListRow — one task line (+ wrapped continuation lines when selected)
 *  → ListFooter — scroll position, counts, active sort, direction and filters
 *  → TaskListView — composes the three above over a window of rows
 *  → TaskDetailPane — Name/Value pane that follows the selection
 *
 * @exports DETAIL_PANE_HEIGHT, LIST_START_Y, LIST_HEADER_Y, computeListWindow,
 *   TaskListView, TaskDetailPane
 * @see src/cli/screens/board/list-helpers.ts — the data + layout maths
 * @see src/cli/screens/board.tsx — owns state and input
 */

import { Box, Text } from 'ink';
import type { BoardTask } from '../../../lib/types.js';
import { formatDependencyChip } from '../../../lib/dependency-chip-format.js';
import { formatAge } from '../../../lib/task-meta.js';
import { columnAccentColor, pad, truncate } from './helpers.js';
import type React from 'react';
import {
  type FilterMode,
  type ListColumnKey,
  type ListLayout,
  type ListRow,
  type ListSort,
  type ListSortDir,
  type ListColumnPrefs,
  type PriorityFilter,
  ALL_LIST_COLUMNS,
  computeListLayout,
  normalizeOwner,
  ownerGlyph,
  priorityColor,
  sortForColumn,
  wrapText,
} from './list-helpers.js';

/**
 * 📖 Terminal lines consumed before the first task row in list view.
 *   1 — BoardHeader, 2 — its blank margin, 3 — column headers, 4 — rule.
 * Mouse hit-testing in board.tsx converts a click's Y to a row index with this.
 */
export const LIST_START_Y = 5;

/**
 * 📖 Terminal row (1-based) the clickable column header sits on: line 3 of the
 * four counted above. Derived from LIST_START_Y rather than hardcoded, so the
 * two can never drift when the header block above the list changes height.
 */
export const LIST_HEADER_Y = LIST_START_Y - 2;

/** 📖 Fixed height of the detail pane, so the list viewport is predictable. */
export const DETAIL_PANE_HEIGHT = 11;

/** 📖 Max continuation lines the selected row may grow by. */
const MAX_WRAP_LINES = 4;

// ─── Scroll window ───────────────────────────────────────────────────────────

export interface ListWindow {
  /** First visible row index. */
  scroll: number;
  /** One past the last visible row index. */
  end: number;
}

/**
 * 📖 Resolves the visible slice from the *previous* scroll offset rather than
 * recomputing it from scratch each render.
 *
 * The stateless approach used by the kanban column (`computeScrollIdx`) always
 * returns the smallest offset that fits the cursor, which pins the selection to
 * the bottom edge of the viewport forever once the list is longer than the
 * screen. For a list you scan top-to-bottom that is unpleasant. Here the offset
 * persists and only moves when the selection would otherwise leave the
 * viewport — normal list behaviour.
 *
 * `selHeight` is the selected row's total height (1 + wrapped continuation
 * lines), which is why the whole computation lives in one place instead of
 * being guessed at both call sites.
 */
export function computeListWindow(
  previousScroll: number,
  selectedIndex: number,
  selHeight: number,
  total: number,
  viewport: number,
): ListWindow {
  if (total <= 0 || viewport <= 0) return { scroll: 0, end: 0 };

  // 📖 Don't leave a gap at the bottom when the list has been filtered down or
  // the terminal has just grown.
  let scroll = Math.min(Math.max(0, previousScroll), Math.max(0, total - viewport));
  // 📖 Selection above the window — follow it up.
  if (selectedIndex < scroll) scroll = selectedIndex;
  // 📖 Selection (plus its wrapped lines) below the window — follow it down.
  if (selectedIndex - scroll + selHeight > viewport) {
    scroll = selectedIndex + selHeight - viewport;
  }
  scroll = Math.max(0, Math.min(scroll, selectedIndex));

  // 📖 Walk forward accumulating heights; only the selected row is taller than
  // one line, so this is a single pass with one branch.
  let used = 0;
  let end = scroll;
  while (end < total) {
    const height = end === selectedIndex ? selHeight : 1;
    if (used + height > viewport) break;
    used += height;
    end++;
  }
  // 📖 Guarantee at least one row is drawn even in a pathologically short
  // terminal, so the view never renders as an empty box.
  if (end === scroll) end = Math.min(total, scroll + 1);

  return { scroll, end };
}

/** 📖 How many lines a row occupies: 1, unless it is selected and wraps. */
function rowHeight(row: ListRow, layout: ListLayout): number {
  return wrapText(row.task.title, layout.desc, MAX_WRAP_LINES).length || 1;
}

/** 📖 Everything both the renderer and the mouse hit-test need to agree on. */
export interface ListGeometry {
  layout: ListLayout;
  window: ListWindow;
  /** Height in lines of the selected (expanded) row. */
  selHeight: number;
  /** Lines available to rows, footer excluded. */
  viewport: number;
}

/**
 * 📖 The single source of truth for "where is each row on screen".
 *
 * Called once per render by `board.tsx`, which then feeds the result to both
 * `TaskListView` (to draw) and its own click handler (to map a Y coordinate
 * back to a row index). Computing it twice is exactly how the kanban view's
 * hit-testing drifted out of sync with its renderer before `computeScrollIdx`
 * was extracted; the same discipline applies here.
 */
export function computeListGeometry(
  rows: ListRow[],
  selectedIndex: number,
  previousScroll: number,
  maxHeight: number,
  width: number,
  columns: ListColumnPrefs = ALL_LIST_COLUMNS,
  /** 📖 Forwarded to `computeListLayout` so the deps column can size itself
   * to fit the longest chip content (id + title preview) instead of always
   * reserving a fixed 4 cells. */
  titleById?: ReadonlyMap<string, string>,
): ListGeometry {
  const layout = computeListLayout(rows, width, columns, titleById);
  // 📖 −1 for the always-present footer line (see the file header).
  const viewport = Math.max(1, maxHeight - 1);
  const selected = rows[selectedIndex] ?? rows[0];
  const selHeight = selected ? rowHeight(selected, layout) : 1;
  const window = computeListWindow(previousScroll, selectedIndex, selHeight, rows.length, viewport);
  return { layout, window, selHeight, viewport };
}

/**
 * 📖 Maps a terminal row (1-based, as the mouse reports it) back to a row index,
 * or null when the click landed on the header, the footer or empty space.
 * Walks the same variable-height rows the renderer emits.
 */
export function listRowAtY(geometry: ListGeometry, selectedIndex: number, y: number): number | null {
  let currentY = LIST_START_Y;
  for (let idx = geometry.window.scroll; idx < geometry.window.end; idx++) {
    const height = idx === selectedIndex ? geometry.selHeight : 1;
    if (y >= currentY && y < currentY + height) return idx;
    currentY += height;
  }
  return null;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

/**
 * 📖 The clickable column header.
 *
 * Every cell is a click target (`listColumnAtX` maps the X back), so the header
 * has to *say* which column is driving the order: the active one is rendered
 * bright with an ↑/↓ arrow, the rest stay dim. Without that marker a list
 * sorted by age and a list sorted by title look identical, and the second click
 * that reverses the order looks like nothing happened.
 *
 * 📖 `Pr` is the exception: it cycles the priority lens rather than sorting, so
 * it shows the active priority (`P1`) instead of an arrow, in the priority's
 * own colour. That is also the affordance — a header cell that changes to a
 * value is visibly a filter, not a sort.
 */
function ListHeaderRow({ layout, sort, sortDir, priorityFilter }: {
  layout: ListLayout;
  sort: ListSort;
  sortDir: ListSortDir;
  priorityFilter: PriorityFilter;
}) {
  const arrow = sortDir === 'desc' ? '↓' : '↑';

  /**
   * 📖 A header cell: label + arrow when it owns the sort, dim otherwise.
   *
   * The arrow must never widen the cell — a column that grows by one when you
   * sort by it would shift every column to its right on each click. Column
   * widths already reserve room for it (see `computeListLayout`); the slice is
   * the last-resort guard for a terminal narrow enough that even `Description`
   * has been squeezed, where losing a letter beats corrupting the grid.
   */
  const cell = (key: ListColumnKey, label: string, width: number) => {
    const active = sortForColumn(key) === sort;
    const text = active ? `${label.slice(0, Math.max(1, width - 1))}${arrow}` : label;
    return (
      <Text key={key} bold color={active ? 'cyan' : 'gray'} dimColor={!active} underline={active}>
        {pad(text, width)}{' '}
      </Text>
    );
  };

  const priorityActive = priorityFilter !== 'all';
  const priorityLabel = priorityFilter === 'none' ? '··' : priorityFilter === 'all' ? 'Pr' : priorityFilter;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{pad('', layout.cursor)}{' '}</Text>
        {layout.id > 0 && cell('id', 'ID', layout.id)}
        {layout.age > 0 && cell('age', 'Age', layout.age)}
        {layout.status > 0 && cell('status', 'Status', layout.status)}
        {layout.priority > 0 && (
          <Text bold color={priorityActive ? priorityColor(priorityFilter) : 'gray'} dimColor={!priorityActive}>
            {pad(priorityLabel, layout.priority)}{' '}
          </Text>
        )}
        {layout.owner > 0 && cell('owner', 'Who', layout.owner)}
        {layout.deps > 0 && cell('deps', 'Dep', layout.deps)}
        {layout.tags > 0 && cell('tags', 'Tags', layout.tags)}
        {cell('desc', 'Description', layout.desc)}
        {layout.assignee > 0 && cell('assignee', 'Assignee', layout.assignee)}
      </Box>
      <Text color="gray" dimColor>{'─'.repeat(layout.total)}</Text>
    </Box>
  );
}

/**
 * 📖 One task line. When `selected`, the whole row is reverse-video (cyan
 * background) and the title wraps onto continuation lines indented to the
 * description column, so the eye reads them as belonging to the same task.
 */
function TaskListRow({ row, selected, layout, now, titleById }: {
  row: ListRow; selected: boolean; layout: ListLayout; now: number;
  /** 📖 id → title lookup, used by the deps chip to show `↪ t234: Fix login…`
   * for a single dependency. Optional — without it the chip falls back to
   * `↪N id1, id2, …` since no titles are available. */
  titleById?: ReadonlyMap<string, string>;
}) {
  const { task } = row;
  const bg = selected ? 'cyan' : undefined;
  const fg = selected ? 'black' : undefined;
  const dim = (color: string) => (selected ? 'black' : color);

  const titleLines = selected
    ? wrapText(task.title, layout.desc, MAX_WRAP_LINES)
    : [truncate(task.title.replace(/\s+/g, ' ').trim(), layout.desc)];

  const tagLabel = task.tags.length > 0
    ? task.tags.join(',')
    : '';

  return (
    <Box flexDirection="column">
      <Box backgroundColor={bg}>
        {/* 📖 The trailing space is the inter-column gap `computeListLayout`
            counts for every visible cell — without it every value below the
            header sits one column to its left. */}
        <Text color={selected ? 'black' : 'cyan'} bold>{pad(selected ? '▸' : task.checked ? '✓' : ' ', layout.cursor)}{' '}</Text>
        {layout.id > 0 && (
          <Text color={fg ?? (task.checked ? 'green' : 'yellow')} bold={selected}>{pad(task.id, layout.id)}{' '}</Text>
        )}
        {layout.age > 0 && (
          <Text color={dim('gray')}>{pad(formatAge(task.updatedAt, now), layout.age)}{' '}</Text>
        )}
        {layout.status > 0 && (
          <Text color={selected ? 'black' : columnAccentColor(row.status)} bold={!selected}>
            {pad(row.status, layout.status)}{' '}
          </Text>
        )}
        {layout.priority > 0 && (
          <Text color={dim(priorityColor(task.priority))} bold>{pad(task.priority || '', layout.priority)}{' '}</Text>
        )}
        {layout.owner > 0 && (
          <Text color={dim(normalizeOwner(task) === 'ai' ? 'magenta' : 'blue')}>{pad(ownerGlyph(task), layout.owner)}{' '}</Text>
        )}
        {layout.deps > 0 && (
          <Text color={dim('yellow')}>
            {pad(
              task.dependsOn.length > 0 ? formatDependencyChip(task.dependsOn, titleById ?? new Map()) : '',
              layout.deps,
            )}{' '}
          </Text>
        )}
        {layout.tags > 0 && (
          <Text color={dim('magenta')}>{pad(tagLabel, layout.tags)}{' '}</Text>
        )}
        <Text color={fg ?? (task.checked ? 'gray' : 'white')} bold={selected} strikethrough={!selected && task.checked}>
          {pad(titleLines[0] ?? '', layout.desc)}
        </Text>
        {/* 📖 Far right: who owns this task. Dimmed and unassigned-as-`—`, so a
            column of blanks reads as "nobody has taken these" at a glance
            rather than as a rendering gap. */}
        {layout.assignee > 0 && (
          <Text color={task.assignee ? dim('cyan') : dim('gray')} dimColor={!selected && !task.assignee}>
            {' '}{pad(task.assignee || '—', layout.assignee)}
          </Text>
        )}
      </Box>
      {/* 📖 Continuation lines — selected row only, indented under Description. */}
      {titleLines.slice(1).map((line, idx) => (
        <Box key={idx} backgroundColor={bg}>
          <Text color={fg} bold>{pad('', layout.descOffset)}{pad(line, layout.desc)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function ListFooter({ scroll, end, total, selectedIndex, sort, sortDir, filter, priorityFilter, search, width }: {
  scroll: number; end: number; total: number; selectedIndex: number;
  sort: ListSort; sortDir: ListSortDir; filter: FilterMode;
  priorityFilter: PriorityFilter; search: string; width: number;
}) {
  const parts: string[] = [];
  if (scroll > 0) parts.push(`▲ ${scroll}`);
  if (end < total) parts.push(`▼ ${total - end}`);
  parts.push(total > 0 ? `${selectedIndex + 1}/${total}` : '0/0');
  parts.push(`sort ${sort} ${sortDir === 'desc' ? '↓' : '↑'}`);
  if (priorityFilter !== 'all') parts.push(`only ${priorityFilter === 'none' ? 'untriaged' : priorityFilter}`);
  if (filter !== 'all') parts.push(`filter ${filter}`);
  if (search) parts.push(`/${search}`);

  return <Text color="gray" dimColor>{'  '}{truncate(parts.join(' · '), Math.max(0, width - 2))}</Text>;
}

// ─── View ────────────────────────────────────────────────────────────────────

/**
 * 📖 The list view proper. Receives the already-filtered, already-sorted rows
 * and the current scroll offset; returns the header, the visible window and the
 * footer. All navigation state lives in board.tsx.
 */
export function TaskListView({
  rows, selectedIndex, geometry, sort, sortDir = 'asc', filter,
  priorityFilter = 'all', search, width, now = Date.now(), titleById,
}: {
  rows: ListRow[];
  selectedIndex: number;
  /** Layout + visible window, from `computeListGeometry` in the parent. */
  geometry: ListGeometry;
  sort: ListSort;
  sortDir?: ListSortDir;
  filter: FilterMode;
  priorityFilter?: PriorityFilter;
  search: string;
  width: number;
  now?: number;
  /** 📖 Forwarded to every row so the deps chip can surface the title of a
   * single dependency instead of just its count. */
  titleById?: ReadonlyMap<string, string>;
}) {
  const { layout, window } = geometry;
  const header = (
    <ListHeaderRow layout={layout} sort={sort} sortDir={sortDir} priorityFilter={priorityFilter} />
  );

  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
        {header}
        <Text color="gray" dimColor>
          {'  '}
          {search || filter !== 'all' || priorityFilter !== 'all'
            ? 'No task matches the current search / filter — press Esc to clear the search, f to cycle the filter, p the priority lens.'
            : 'No tasks yet — press n to create one.'}
        </Text>
      </Box>
    );
  }

  const visible: React.ReactNode[] = [];
  for (let idx = window.scroll; idx < window.end; idx++) {
    const row = rows[idx];
    visible.push(
      <TaskListRow
        key={row.task.id}
        row={row}
        selected={idx === selectedIndex}
        layout={layout}
        now={now}
        titleById={titleById}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {header}
      {visible}
      <ListFooter
        scroll={window.scroll}
        end={window.end}
        total={rows.length}
        selectedIndex={selectedIndex}
        sort={sort}
        sortDir={sortDir}
        filter={filter}
        priorityFilter={priorityFilter}
        search={search}
        width={width}
      />
    </Box>
  );
}

// ─── Detail pane ─────────────────────────────────────────────────────────────

function DetailRow({ name, children, labelWidth }: {
  name: string; children: React.ReactNode; labelWidth: number;
}) {
  return (
    <Box>
      <Text color="gray">{'  '}{pad(name, labelWidth)}</Text>
      {children}
    </Box>
  );
}

/**
 * 📖 The Name/Value pane pinned under the list, mirroring the reference
 * taskwarrior layout. It follows the selection live so you can scan the list
 * and read each task's metadata without opening anything — `Enter` is still
 * there for the full scrollable body.
 *
 * Fields are merged onto shared lines (status + priority + owner, updated +
 * created) to keep the pane at a fixed `DETAIL_PANE_HEIGHT`. A pane that grew
 * and shrank with the selected task would move the list rows under the cursor.
 */
export function TaskDetailPane({ row, filePath, width, now = Date.now() }: {
  row: ListRow | null;
  /** Project-relative path of the task file, e.g. `tasks/t264.md`. */
  filePath: string | null;
  width: number;
  now?: number;
}) {
  const labelWidth = 11;
  const valueWidth = Math.max(10, width - labelWidth - 4);

  if (!row) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" dimColor>{'─'.repeat(width)}</Text>
        <Text color="gray" dimColor>{'  '}No task selected.</Text>
      </Box>
    );
  }

  const task: BoardTask = row.task;
  const owner = normalizeOwner(task);
  const updatedIso = typeof task.frontmatter?.updated === 'string' ? task.frontmatter.updated : null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>{'─'.repeat(width)}</Text>
      <DetailRow name="ID" labelWidth={labelWidth}>
        <Text color="yellow" bold>{task.id}</Text>
        <Text color="gray">{'  '}{task.checked ? '✓ done' : '○ open'}</Text>
      </DetailRow>
      <DetailRow name="Title" labelWidth={labelWidth}>
        <Text color="white">{truncate(task.title, valueWidth)}</Text>
      </DetailRow>
      <DetailRow name="Status" labelWidth={labelWidth}>
        <Text color={columnAccentColor(row.status)} bold>{row.status}</Text>
        {task.priority && <Text color={priorityColor(task.priority)} bold>{'   '}{task.priority}</Text>}
        {owner && <Text color={owner === 'ai' ? 'magenta' : 'blue'}>{'   '}{owner}</Text>}
        {task.assignee && <Text color="cyan">{'   @'}{task.assignee}</Text>}
      </DetailRow>
      <DetailRow name="Tags" labelWidth={labelWidth}>
        <Text color={task.tags.length ? 'magenta' : 'gray'}>
          {task.tags.length ? truncate(task.tags.join(', '), valueWidth) : '—'}
        </Text>
      </DetailRow>
      <DetailRow name="Blocked by" labelWidth={labelWidth}>
        <Text color={task.dependsOn.length ? 'yellow' : 'gray'}>
          {task.dependsOn.length ? truncate(task.dependsOn.join(', '), valueWidth) : '—'}
        </Text>
      </DetailRow>
      <DetailRow name="Checklist" labelWidth={labelWidth}>
        <Text color={task.progress ? (task.progress.done === task.progress.total ? 'green' : 'white') : 'gray'}>
          {task.progress ? `${task.progress.done}/${task.progress.total}` : '—'}
        </Text>
      </DetailRow>
      <DetailRow name="Updated" labelWidth={labelWidth}>
        <Text color="white">{formatAge(task.updatedAt, now)} ago</Text>
        <Text color="gray" dimColor>{'   '}{truncate(updatedIso ?? 'no `updated:` field yet', valueWidth - 12)}</Text>
      </DetailRow>
      <DetailRow name="File" labelWidth={labelWidth}>
        <Text color="gray" dimColor>{truncate(filePath ?? '—', valueWidth)}</Text>
      </DetailRow>
      <Text color="gray" dimColor>{'  '}{truncate('Enter open · Tab board view · z hide pane · ? help', width - 2)}</Text>
    </Box>
  );
}
