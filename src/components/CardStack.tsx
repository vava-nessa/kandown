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
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconChevronUp, IconStack2 } from '@tabler/icons-react';
import { Card } from './Card';
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
}: CardStackProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  // 📖 Sync with defaultExpanded when search activates/deactivates
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const taskCount = group.tasks.length;
  const firstTask = group.tasks[0];

  // 📖 Preview: strip the group tag from the first task's title for cleaner display
  const previewTitle = firstTask.title
    .replace(/^\[([^\]]+)\]\s*/, '')
    .replace(/#\w+\s*/, '')
    .trim() || firstTask.title;

  if (expanded) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
        className="flex flex-col gap-2"
      >
        {/* Expanded header: shows group key + collapse button */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold text-fg-muted/70 uppercase tracking-wide hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors w-fit"
        >
          <IconChevronUp size={13} stroke={2} />
          <span>{group.displayKey}</span>
          <span className="font-normal text-fg-muted/40">{taskCount}</span>
        </button>

        {/* Individual cards: fully interactive, draggable */}
        <AnimatePresence mode="popLayout">
          {group.tasks.map(task => (
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
          ))}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Collapsed state: stacked card with shadow layers
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      onClick={() => setExpanded(true)}
      className="relative cursor-pointer pb-3"
    >
      {/* Layer 2 (deepest): offset furthest, smallest scale */}
      {taskCount > 2 && (
        <div
          className="absolute inset-0 rounded-xl border border-border bg-card/40 pointer-events-none"
          style={{ transform: 'translateY(8px) scale(0.94)', zIndex: 0 }}
        />
      )}

      {/* Layer 1: slightly offset behind the main card */}
      <div
        className="absolute inset-0 rounded-xl border border-border bg-card/60 pointer-events-none"
        style={{ transform: 'translateY(4px) scale(0.97)', zIndex: 1 }}
      />

      {/* Main card surface */}
      <motion.div
        whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
        whileTap={{ scale: 0.98 }}
        className="relative z-10 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all hover:border-border-strong hover:shadow-md"
      >
        {/* Header: stack icon + group key + task count */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconStack2 size={14} stroke={1.8} className="text-fg-muted/60" />
            <span className="text-[11.5px] font-semibold tracking-wide text-fg-muted uppercase">
              {group.displayKey}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center h-5 px-2 text-[11px] font-semibold rounded-md text-fg-muted bg-black/[0.05] dark:bg-white/[0.1] border border-black/[0.06] dark:border-white/[0.12] tabular-nums">
              {taskCount}
            </span>
            <IconChevronDown size={13} stroke={2} className="text-fg-muted/50" />
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
      </motion.div>
    </motion.div>
  );
}
