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
import { IconChevronDown, IconChevronUp, IconStack2 } from '@tabler/icons-react';
import { Card } from './Card';
import { ListRow } from './ListRow';
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

  // 📖 Preview: strip the group tag from the first task's title for cleaner display
  const previewTitle = firstTask.title
    .replace(/^\[([^\]]+)\]\s*/, '')
    .replace(/#\w+\s*/, '')
    .trim() || firstTask.title;

  if (expanded) {
    return (
      <div className={viewMode === 'list' ? 'divide-y divide-border/30' : 'flex flex-col'}>
        {/* Expanded header: shows group key + collapse button */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 px-2 py-1 my-1 rounded-md text-[11px] font-semibold text-fg-muted/70 uppercase tracking-wide hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors w-fit"
        >
          <IconChevronUp size={13} stroke={2} />
          <span>{group.displayKey}</span>
          <span className="font-normal text-fg-muted/40">{taskCount}</span>
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
        className="group/row relative flex items-center gap-2 px-3 py-2 border-b border-border/60 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer transition-colors"
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); toggleStackSelection(); }}
          aria-label="Select all in group"
          className={`flex items-center justify-center w-[14px] h-[14px] rounded-[3px] border flex-none cursor-pointer transition-all ${
            stackAllSelected
              ? 'bg-primary border-primary'
              : stackSomeSelected
                ? 'bg-primary/40 border-primary/60'
                : 'border-border-strong hover:border-fg-dim opacity-70 md:opacity-0 md:group-hover/row:opacity-100'
          }`}
        >
          {stackAllSelected && <Icon.Check size={10} className="text-white" strokeWidth={2.5} />}
          {!stackAllSelected && stackSomeSelected && <span className="block w-[6px] h-[2px] bg-white rounded-full" />}
        </button>
        <IconStack2 size={13} stroke={1.8} className="text-fg-muted/70 flex-none" />
        <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase flex-none">
          {group.displayKey}
        </span>
        <span className="text-[13px] font-medium text-fg truncate">
          {previewTitle}
          {taskCount > 1 && <span className="text-fg-muted/50 ml-1.5">+{taskCount - 1}</span>}
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
      className="relative cursor-pointer pb-3 group"
    >
      {/* Layer 2 (deepest): offset furthest, smallest scale */}
      {taskCount > 2 && (
        <div
          className="absolute inset-0 rounded-lg border border-border bg-card/40 pointer-events-none"
          style={{ transform: 'translateY(8px) scale(0.94)', zIndex: 0 }}
        />
      )}

      {/* Layer 1: slightly offset behind the main card */}
      <div
        className="absolute inset-0 rounded-lg border border-border bg-card/60 pointer-events-none"
        style={{ transform: 'translateY(4px) scale(0.97)', zIndex: 1 }}
      />

      {/* Per-group select-all checkbox (board): hover-revealed on the main
       * stacked card. Clicking it selects/deselects every task in this stack.
       * Without this, stacked tasks are silently skipped by bulk actions. */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); toggleStackSelection(); }}
        aria-label="Select all in group"
        className={`absolute left-2 top-2 z-20 flex items-center justify-center w-[14px] h-[14px] rounded-[3px] border flex-none cursor-pointer transition-all ${
          stackAllSelected
            ? 'bg-primary border-primary'
            : stackSomeSelected
              ? 'bg-primary/40 border-primary/60'
              : 'border-border bg-card/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:border-fg-dim'
        }`}
      >
        {stackAllSelected && <Icon.Check size={10} className="text-white" strokeWidth={2.5} />}
        {!stackAllSelected && stackSomeSelected && <span className="block w-[6px] h-[2px] bg-white rounded-full" />}
      </button>

      {/* Main card surface (plain <div> with Tailwind transitions — replaces
       * the previous `motion.div whileHover whileTap` setup that produced a
       * 250ms pop on every card. Now hover lift + tap scale are Tailwind
       * transitions on the `transform` property only, not `all`. */}
      <div className="relative z-10 rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]
        transition-[border-color,box-shadow,transform] duration-200 ease-out
        hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-px
        active:scale-[0.99] active:duration-75">
        <div className="px-3.5 pt-3 pb-2.5 pl-7">
          {/* Header: stack icon + group key + task count */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <IconStack2 size={12} stroke={1.8} className="text-fg-muted/60" />
              <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
                {group.displayKey}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium rounded-md text-fg-muted tabular-nums">
                {taskCount}
              </span>
              <IconChevronDown size={12} stroke={2} className="text-fg-muted/50" />
            </div>
          </div>

          {/* Preview: first task title (tag stripped) */}
          <div className="text-[13.5px] leading-snug font-medium text-fg line-clamp-1">
            {previewTitle}
            {taskCount > 1 && (
              <span className="text-fg-muted/50 ml-1.5">
                +{taskCount - 1}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
