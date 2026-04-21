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
}

export function CardStack({
  group,
  searchMatches,
  density,
  columnName,
  onCardDragStart,
  onCardDragEnd,
  defaultExpanded = false,
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
        className="flex flex-col gap-1.5"
      >
        {/* 📖 Expanded header: shows group key + collapse button */}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-[5px] text-[11.5px] font-semibold text-fg-muted uppercase tracking-wide hover:bg-white/30 dark:hover:bg-black/20 transition-colors"
        >
          <IconChevronUp size={13} stroke={2} />
          <span>{group.displayKey}</span>
          <span className="font-normal text-fg-faint">{taskCount}</span>
        </button>

        {/* 📖 Individual cards: fully interactive, draggable */}
        <AnimatePresence mode="popLayout">
          {group.tasks.map(task => (
            <Card
              key={task.id}
              task={task}
              searchMatches={searchMatches.get(task.id) || []}
              density={density}
              columnName={columnName}
              onDragStart={() => onCardDragStart(task.id, columnName)}
              onDragEnd={onCardDragEnd}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    );
  }

  // 📖 Collapsed state: stacked card with shadow layers
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      onClick={() => setExpanded(true)}
      className="relative cursor-pointer pb-2"
    >
      {/* 📖 Layer 2 (deepest): offset furthest, smallest scale */}
      {taskCount > 2 && (
        <div
          className="absolute inset-0 rounded-[6px] border border-white/40 bg-white/25 dark:border-black/25 dark:bg-black/25 pointer-events-none"
          style={{ transform: 'translateY(8px) scale(0.94)', zIndex: 0 }}
        />
      )}

      {/* 📖 Layer 1: slightly offset behind the main card */}
      <div
        className="absolute inset-0 rounded-[6px] border border-white/50 bg-white/35 dark:border-black/30 dark:bg-black/35 pointer-events-none"
        style={{ transform: 'translateY(4px) scale(0.97)', zIndex: 1 }}
      />

      {/* 📖 Main card surface */}
      <motion.div
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className="relative z-10 rounded-[6px] border border-white/60 bg-white/50 p-3 transition-colors hover:border-white/80 hover:bg-white/65 dark:border-black/40 dark:bg-black/50 dark:hover:border-black/55 dark:hover:bg-black/65"
      >
        {/* 📖 Header: stack icon + group key + task count */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <IconStack2 size={14} stroke={1.8} className="text-fg-muted" />
            <span className="text-[12px] font-bold tracking-wide text-fg-muted uppercase">
              {group.displayKey}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center h-[18px] px-1.5 text-[11px] font-semibold rounded-[4px] text-fg-muted bg-bg border border-border tabular-nums">
              {taskCount}
            </span>
            <IconChevronDown size={13} stroke={2} className="text-fg-muted" />
          </div>
        </div>

        {/* 📖 Preview: first task title (tag stripped) */}
        <div className="text-[13px] leading-snug text-fg line-clamp-1">
          {previewTitle}
          {taskCount > 1 && (
            <span className="text-fg-muted ml-1">
              {t('cardStack.andMore', { count: taskCount - 1, defaultValue: `+${taskCount - 1} more` })}
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
