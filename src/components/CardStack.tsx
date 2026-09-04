/**
 * @file Collapsible card stack component
 * @description Renders a group of 2+ cards that share the same `[bracket]` or
 * `#hashtag` title tag as a visually stacked card. When collapsed, the stack
 * shows layered shadow borders behind a summary card. When expanded, all
 * individual cards render inline and are fully interactive (draggable, clickable).
 *
 * 📖 The collapsed state uses two absolute-positioned layers behind the main
 * card to create the "stacked paper" illusion. The layers scale down and offset
 * vertically so they peek out from behind.
 *
 * 📖 Stacks auto-expand when a search is active (`defaultExpanded` prop) so
 * search-match highlights remain visible on individual cards.
 *
 * 📖 Expanded group block: header + children are wrapped in a rounded
 * envelope in the category's chip color, so a group reads as one colored
 * unit instead of a loose run of cards. Board view tints the block and
 * insets the child cards; list view draws only the colored frame (no tint,
 * which washed out the row text) with rows at full width inside. Collapsed
 * stacks carry the same colored border, and single cards match the border
 * width in neutral theme colors, so group vs solo reads at a glance.
 *
 * 📖 Collapsed stacks are NOT draggable (v1). Expanded cards retain full drag.
 *
 * @functions
 *  → CardStack — animated collapsible card stack
 *
 * @exports CardStack
 * @see src/lib/grouping.ts
 * @see src/components/Card.tsx
 * @see src/components/Column.tsx
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChecklist, IconChevronDown, IconChevronUp, IconStack2 } from '@tabler/icons-react';
import { Card } from './Card';
import { ListRow } from './ListRow';
import { CategoryChip } from './CategoryChip';
import { categoryColor } from '../lib/category-color';
import { useStore } from '../lib/store';
import { Icon } from './Icons';
import type { TaskGroup } from '../lib/grouping';
import type { Density, SearchMatch } from '../lib/types';

interface CardStackProps {
  group: TaskGroup;
  searchMatches: Map<string, SearchMatch[]>;
  density: Density;
  columnName: string;
  onCardDragStart: (taskId: string, fromCol: string) => void;
  onCardDragEnd: () => void;
  defaultExpanded?: boolean;
  doneTags?: Set<string>;
  viewMode?: 'board' | 'list';
}

export function CardStack({
  group,
  searchMatches,
  density,
  columnName,
  onCardDragStart,
  onCardDragEnd,
  defaultExpanded = false,
  doneTags,
  viewMode = 'board',
}: CardStackProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  // 📖 Sync with defaultExpanded when search activates/deactivates
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const taskCount = group.tasks.length;
  const firstTask = group.tasks[0];

  // 📖 The stack's category: grouping is driven by the frontmatter category
  // field (via extractGroupKey), so sibling tasks share it. Legacy #tag stacks
  // carry no category and keep the plain text key instead.
  const categoryChips = useStore(s => s.config.ui.categoryChips !== false);
  const stackCategory = categoryChips ? (firstTask?.category ?? null) : null;

  // 📖 Expanded group block: the tinted envelope around header + children
  // reuses the exact chip palette (bg + border) so the block reads as the
  // category's color made spatial. Null style keeps everything neutral for
  // legacy #tag stacks or when chips are off.
  const stackColor = stackCategory ? categoryColor(stackCategory) : null;
  const blockStyle = stackColor
    ? { backgroundColor: stackColor.bg, borderColor: stackColor.border }
    : undefined;

  // 📖 Per-group selection helpers: a parent checkbox on the collapsed stack
  // lets the user add ALL sibling tasks to the bulk selection at once, which
  // is the missing affordance for "CardStack without checkbox per row". When
  // every sibling is already selected the parent shows checked; clicking it
  // toggles the whole group (checked → deselect, partial/unchecked → select).
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const selectTasks = useStore(s => s.selectTasks);
  const deselectTasks = useStore(s => s.deselectTasks);
  const taskIds = group.tasks.map(t => t.id);
  const selectedCount = taskIds.filter(id => selectedTaskIds.includes(id)).length;
  const stackAllSelected = selectedCount === taskIds.length;
  const stackSomeSelected = selectedCount > 0 && !stackAllSelected;
  const toggleStackSelection = () => {
    if (stackAllSelected || stackSomeSelected) {
      deselectTasks(taskIds);
    } else {
      selectTasks(taskIds);
    }
  };

  // 📖 The stack label shows the task count (“4 Tasks”), replacing the
  // former first-task title preview; the compact count badge stays on the
  // right.

  if (expanded) {
    // 📖 Category group block: rounded envelope wrapping header + children.
    // Board view tints the block (chip bg + border) and insets the cards;
    // list view only draws the colored frame (no background tint: it washed
    // out the row text) and keeps the rows at full width inside.
    const list = viewMode === 'list';
    return (
      <div
        className={`rounded-xl border-2 border-border ${list ? 'py-1.5' : 'p-1.5'} shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}
        style={list && stackColor ? { borderColor: stackColor.border } : blockStyle}
      >
        {/* Expanded header: minimal. Just the centered category (chip or
         * group key) with a small collapse chevron; the colored block around
         * already announces the group, so no pill, no border, no count. */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 py-1 my-1 mx-auto text-[11px] font-semibold text-fg-muted/70 uppercase tracking-wide hover:opacity-75 transition-opacity w-fit cursor-pointer"
        >
          {stackCategory ? <CategoryChip category={stackCategory} /> : <span>{group.displayKey}</span>}
          <IconChevronUp size={13} stroke={2} />
        </button>

        {/* Individual cards/rows: fully interactive, draggable */}
        {group.tasks.map(task =>
          viewMode === 'list' ? (
            <ListRow
              key={task.id}
              task={task}
              searchMatches={searchMatches.get(task.id) || []}
              density={density}
              columnName={columnName}
              doneTags={doneTags}
              inStack
              onDragStart={() => onCardDragStart(task.id, columnName)}
              onDragEnd={onCardDragEnd}
            />
          ) : (
            <Card
              key={task.id}
              task={task}
              searchMatches={searchMatches.get(task.id) || []}
              density={density}
              columnName={columnName}
              doneTags={doneTags}
              inStack
              onDragStart={() => onCardDragStart(task.id, columnName)}
              onDragEnd={onCardDragEnd}
            />
          )
        )}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div
        onClick={() => setExpanded(true)}
        className="group/row relative flex items-center gap-2 px-3 py-2 mx-1 my-1 rounded-lg border-2 border-border hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer transition-colors"
        style={stackColor ? { borderColor: stackColor.border } : undefined}
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); toggleStackSelection(); }}
          aria-label="Select all in group"
          className={`absolute left-0.5 z-20 flex items-center justify-center h-[18px] w-[18px] rounded-[5px] border bg-card/90 shadow-sm transition-opacity duration-150 cursor-pointer ${
            density === 'compact' ? 'top-[7px]' : 'top-[11px]'
          } ${
            stackAllSelected
              ? 'bg-primary border-primary'
              : stackSomeSelected
                ? 'bg-primary/40 border-primary/60'
                : 'border-border-strong hover:border-fg-dim opacity-0 group-hover/row:opacity-100'
          }`}
        >
          {stackAllSelected && <Icon.Check size={12} className="text-white" strokeWidth={3} />}
          {!stackAllSelected && stackSomeSelected && <span className="block w-[6px] h-[2px] bg-white rounded-full" />}
        </button>
        {stackCategory ? (
          <CategoryChip category={stackCategory} className="shrink-0" />
        ) : (
          <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase flex-none">
            {group.displayKey}
          </span>
        )}
        <IconStack2 size={13} stroke={1.8} className="text-fg-muted/70 flex-none" />
        <span className="flex items-center gap-1 text-[13px] font-medium text-fg truncate">
          {taskCount}
          <IconChecklist size={13} stroke={2} className="text-fg-muted/80 shrink-0" />
        </span>
        <div className="flex items-center gap-1.5 flex-none ml-auto">
          <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-fg-muted tabular-nums">
            {taskCount}
          </span>
          <IconChevronDown size={13} stroke={2} className="text-fg-muted/50" />
        </div>
      </div>
    );
  }

  // Collapsed state: stacked card with shadow layers
  return (
    <div
      onClick={() => setExpanded(true)}
      className="relative cursor-pointer pr-[0.15rem] pb-[0.15rem] mb-2 group"
    >
      {/* 📖 Single ghost sheet: one card behind, offset slightly down-right
       * ("de travers"), wearing the stack's border color. One layer instead
       * of the old two: it still reads as a stack but never spills over the
       * card above, which used to hide its top border. */}
      <div
        className="absolute inset-0 rounded-lg border border-border bg-card opacity-60 pointer-events-none"
        style={{ transform: 'translate(2px, 2px)', zIndex: 0, ...(stackColor ? { borderColor: stackColor.border } : {}) }}
      />

      {/* Per-group select-all checkbox (board): hover-revealed, inline in the
       * row exactly like a normal card's checkbox so the chip and title line
       * up with the cards around it. Clicking it selects/deselects every task
       * in this stack. Without this, stacked tasks are silently skipped by
       * bulk actions. */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); toggleStackSelection(); }}
        aria-label="Select all in group"
        className={`absolute -left-1.5 z-20 flex items-center justify-center h-[18px] w-[18px] rounded-[5px] border-[1.5px] bg-card shadow-sm transition-opacity duration-150 cursor-pointer ${
          density === 'compact' ? 'top-[7px]' : 'top-[11px]'
        } ${
          stackAllSelected
            ? 'bg-primary border-primary'
            : stackSomeSelected
              ? 'bg-primary/40 border-primary/60'
              : 'border-border-strong text-transparent hover:border-primary/60 hover:bg-primary/5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        }`}
        style={stackAllSelected || stackSomeSelected ? undefined : stackColor ? { borderColor: stackColor.border } : undefined}
      >
        {stackAllSelected && <Icon.Check size={12} className="text-white" strokeWidth={3} />}
        {!stackAllSelected && stackSomeSelected && <span className="block w-[6px] h-[2px] bg-white rounded-full" />}
      </button>

      {/* Main card surface (plain <div> with Tailwind transitions — replaces
       * the previous `motion.div whileHover whileTap` setup that produced a
       * 250ms pop on every card. Now hover lift + tap scale are Tailwind
       * transitions on the `transform` property only, not `all`. The inner
       * row mirrors a normal card (px-3.5 py-2.5, inline checkbox, then
       * chip + title) so the chip stays aligned with the surrounding cards. */}
      {/* 📖 Main card surface: 2px border (thicker than single cards) so a
       * stack reads as a group at a glance; no hover lift (the translate
       * made the border visually detach), only shadow and border feedback. */}
      <div
        className="relative z-10 rounded-lg border-2 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]
        transition-[border-color,box-shadow] duration-150 ease-out
        hover:border-border-strong hover:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.14)]"
        style={stackColor ? { borderColor: stackColor.border } : undefined}
      >
        <div className={`px-3.5 ${density === 'compact' ? 'py-1.5' : 'py-2.5'}`}>
          <div className="flex items-center gap-2">
            {/* Chip (or legacy group key), then stack icon, then title. */}
            {stackCategory ? (
              <CategoryChip category={stackCategory} className="shrink-0" />
            ) : (
              <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase flex-none">
                {group.displayKey}
              </span>
            )}

            {/* Label: the task count + a checklist icon. */}
            <span className="flex-1 min-w-0 flex items-center gap-1 text-[13.5px] leading-snug font-medium text-fg truncate">
              {taskCount}
              <IconChecklist size={13} stroke={2} className="text-fg-muted/80 shrink-0" />
            </span>

            {/* Count + chevron, right-aligned. */}
            <div className="flex items-center gap-1.5 flex-none">
              <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-fg-muted tabular-nums">
                {taskCount}
              </span>
              <IconChevronDown size={12} stroke={2} className="text-fg-muted/50" />
            </div>
          </div>
        </div>

        {/* 📖 Stack badge: same spot as the task-id badge on normal cards
            (bottom-right), carrying the stack icon, slightly larger. White
            box at 50% opacity with black icon in light mode, inverted in
            dark, matching the task-id badges. */}
        <span
          className="absolute bottom-1 right-1 rounded px-1.5 py-1 flex items-center justify-center bg-white/50 text-black dark:bg-black/50 dark:text-white select-none pointer-events-none"
        >
          <IconStack2 size={16} stroke={2} />
        </span>
      </div>
    </div>
  );
}
