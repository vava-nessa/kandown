/**
 * @file Task card component
 * @description Displays one board task with priority, progress, tags, assignee,
 * drag handlers, and optional highlighted search-preview snippets.
 *
 * 📖 Cards are intentionally view-only. Clicking opens the drawer through the
 * store, while mutations such as moving, editing, and deleting stay centralized.
 *
 * @functions
 *  → HighlightedText — highlights a matched keyword inside preview text
 *  → Card — animated task card used by the board columns
 *
 * @exports Card
 * @see src/components/Column.tsx
 * @see src/components/Drawer.tsx
 */

import { motion } from 'motion/react';
import type { BoardTask, Density, SearchMatch } from '../lib/types';
import { useStore } from '../lib/store';

const priorityColors: Record<string, string> = {
  P1: '#e5484d',
  P2: '#e9a23b',
  P3: '#3e63dd',
  P4: '#6e6e6e',
};

const sectionLabels: Record<string, string> = {
  title: 'Title',
  subtasks: 'Subtask',
  context: 'Context',
  notes: 'Notes',
  whatWasDone: 'What was done',
  tags: 'Tags',
  assignee: 'Assignee',
  priority: 'Priority',
};

function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200/60 text-fg rounded px-0.5 font-semibold">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface CardProps {
  task: BoardTask;
  searchMatches?: SearchMatch[];
  density: Density;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  columnName: string;
}

export function Card({ task, searchMatches = [], density, onDragStart, onDragEnd, columnName }: CardProps) {
  const openDrawer = useStore(s => s.openDrawer);

  const isCompact = density === 'compact';
  const visibleTags = task.tags.slice(0, isCompact ? 1 : 2);
  const extraTags = task.tags.length - visibleTags.length;

  const progressPct =
    task.progress && task.progress.total > 0
      ? Math.round((task.progress.done / task.progress.total) * 100)
      : 0;
  const isComplete = task.progress && task.progress.done === task.progress.total;

  const dragHandlers = {
    onDragStart,
    onDragEnd,
  } as unknown as Record<string, unknown>;

  const showPreview = searchMatches.length > 0 && !isCompact;

  return (
    <motion.div
      layout
      layoutId={task.id}
      transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      draggable
      {...dragHandlers}
      onClick={() => openDrawer(task.id)}
      data-task-id={task.id}
      data-col={columnName}
      className={`group relative cursor-pointer rounded-[6px] border bg-bg-2 p-3 transition-colors hover:border-border-focus hover:bg-bg-3 ${
        task.checked ? 'opacity-75' : ''
      }`}
      style={{
        borderColor: '#1f1f1f',
      }}
    >
      {/* Subtle priority edge indicator */}
      {task.priority && (
        <div
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full"
          style={{ backgroundColor: priorityColors[task.priority] }}
        />
      )}

      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[11.5px] tracking-wide text-fg-muted">
          {task.id.toUpperCase()}
        </span>
        {task.priority && (
          <span
            title={task.priority}
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: priorityColors[task.priority] }}
          />
        )}
      </div>

      <div
        className={`text-[14px] leading-snug font-normal ${
          task.checked ? 'line-through text-fg-muted' : 'text-fg'
        } ${isCompact ? 'line-clamp-1' : 'line-clamp-2'}`}
      >
        {task.title}
      </div>

      {/* Search preview */}
      {showPreview && (
        <div className="mt-2 space-y-1">
          {searchMatches.slice(0, 2).map((match, i) => (
            <div key={i} className="text-[12px] text-fg-dim bg-bg rounded px-2 py-1 border border-border">
              <span className="text-[10.5px] font-medium text-fg-muted uppercase tracking-wide mr-1.5">
                {sectionLabels[match.section] || match.section}
              </span>
              <HighlightedText text={match.snippet} keyword={match.keyword} />
            </div>
          ))}
        </div>
      )}

      {!isCompact && task.progress && task.progress.total > 0 && (
        <div className={`mt-2 flex items-center gap-2 ${showPreview ? '' : ''}`}>
          <div className="flex-1 h-[3px] bg-bg rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: isComplete ? '#30a46c' : '#a1a1a1' }}
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ type: 'spring', stiffness: 160, damping: 22 }}
            />
          </div>
          <span className="font-mono text-[11.5px] text-fg-muted tabular-nums">
            {task.progress.done}/{task.progress.total}
          </span>
        </div>
      )}

      {(visibleTags.length > 0 || task.assignee) && (
        <div className={`flex flex-wrap gap-1 ${isCompact ? 'mt-1.5' : 'mt-2'}`}>
          {visibleTags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center h-[18px] px-1.5 text-[11.5px] rounded-[3px] text-fg-dim bg-bg border border-border"
            >
              {tag}
            </span>
          ))}
          {extraTags > 0 && (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[11.5px] rounded-[3px] text-fg-muted bg-bg border border-border">
              +{extraTags}
            </span>
          )}
          {task.assignee && (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[11.5px] rounded-[3px] text-fg bg-bg-3 border border-border-strong">
              <span className="w-1 h-1 rounded-full bg-success mr-1" />
              {task.assignee}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
