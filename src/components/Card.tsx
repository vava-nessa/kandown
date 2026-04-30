/**
 * @file Task card component
 * @description Displays one board task with priority, progress, tags, assignee,
 * drag handlers, optional highlighted search-preview snippets, and guarded
 * hover deletion.
 *
 * 📖 Cards are intentionally view-only. Clicking opens the drawer through the
 * store, while mutations such as moving, editing, and deleting stay centralized.
 * 📖 The hover delete control requires two clicks: first arm, then confirm.
 * This keeps fast board scanning safe while avoiding a modal confirmation for
 * every card delete.
 * 📖 Priority, tags, and assignee badges respect `config.fields` so disabled
 * metadata stays out of the front even if it exists in old task files.
 *
 * @functions
 *  → HighlightedText — highlights a matched keyword inside preview text
 *  → Card — animated task card used by the board columns
 *
 * @exports Card
 * @see src/components/Column.tsx
 * @see src/components/Drawer.tsx
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconTrash, IconTrashX } from '@tabler/icons-react';
import type { BoardTask, Density, SearchMatch } from '../lib/types';
import { useStore } from '../lib/store';

const priorityColors: Record<string, string> = {
  P1: '#e5484d',
  P2: '#e9a23b',
  P3: '#3e63dd',
  P4: '#6e6e6e',
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
  doneTags?: Set<string>;
}

export function Card({ task, searchMatches = [], density, onDragStart, onDragEnd, columnName, doneTags }: CardProps) {
  const { t } = useTranslation();
  const openDrawer = useStore(s => s.openDrawer);
  const deleteTask = useStore(s => s.deleteTask);
  const fields = useStore(s => s.config.fields);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isMountedRef = useRef(true);

  const isCompact = density === 'compact';
  const visibleTags = fields.tags ? task.tags.slice(0, isCompact ? 1 : 2) : [];
  const extraTags = fields.tags ? task.tags.length - visibleTags.length : 0;

  const progressPct =
    task.progress && task.progress.total > 0
      ? Math.round((task.progress.done / task.progress.total) * 100)
      : 0;
  const isComplete = task.progress && task.progress.done === task.progress.total;

  const dragHandlers = {
    onDragStart,
    onDragEnd,
  } as unknown as Record<string, unknown>;

  // 📖 Extract leading bracket tag from title (e.g. "[optimization] Fix X" → tag="[optimization]", rest="Fix X")
  const tagMatch = task.title.match(/^\[([^\]]+)\]\s*/);
  const bracketTag = tagMatch ? `[${tagMatch[1]}]` : '';
  const titleWithoutTag = tagMatch ? task.title.slice(tagMatch[0].length) : task.title;

  const showPreview = searchMatches.length > 0 && !isCompact;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!deleteArmed) return;

    const timer = window.setTimeout(() => setDeleteArmed(false), 2400);
    return () => window.clearTimeout(timer);
  }, [deleteArmed]);

  const handleDeleteClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDeleting) return;

    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }

    setIsDeleting(true);
    await deleteTask(task.id);
    if (isMountedRef.current) {
      setIsDeleting(false);
      setDeleteArmed(false);
    }
  };

  return (
    <motion.div
      layout
      layoutId={task.id}
      transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      whileTap={{ scale: 0.98 }}
      draggable
      {...dragHandlers}
      onClick={() => openDrawer(task.id)}
      onMouseLeave={() => setDeleteArmed(false)}
      data-task-id={task.id}
      data-col={columnName}
      className={`group relative cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all hover:border-border-strong hover:shadow-md ${
        task.checked ? 'opacity-70' : ''
      }`}
    >
      {/* Drag handle */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="text-fg-muted">
          <circle cx="3" cy="2" r="1.5"/>
          <circle cx="7" cy="2" r="1.5"/>
          <circle cx="3" cy="8" r="1.5"/>
          <circle cx="7" cy="8" r="1.5"/>
          <circle cx="3" cy="14" r="1.5"/>
          <circle cx="7" cy="14" r="1.5"/>
        </svg>
      </div>

      <button
        type="button"
        draggable={false}
        aria-label={deleteArmed ? t('card.confirmDelete') : t('card.delete')}
        title={deleteArmed ? t('card.confirmDelete') : t('card.delete')}
        disabled={isDeleting}
        onClick={handleDeleteClick}
        onPointerDown={e => e.stopPropagation()}
        onBlur={() => setDeleteArmed(false)}
        className={`absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-lg border transition-all ${
          deleteArmed
            ? 'border-red-500 bg-red-500 text-white opacity-100 shadow-sm'
            : 'border-border bg-card/80 text-fg-muted opacity-0 hover:border-red-500/60 hover:bg-card hover:text-red-500 group-hover:opacity-100'
        } ${isDeleting ? 'pointer-events-none opacity-60' : ''}`}
      >
        {deleteArmed ? <IconTrashX size={14} stroke={1.9} /> : <IconTrash size={14} stroke={1.8} />}
      </button>

      {/* Subtle priority edge indicator */}
      {fields.priority && task.priority && (
        <div
          className="absolute left-0 top-3 bottom-3 w-[2.5px] rounded-r-full"
          style={{ backgroundColor: priorityColors[task.priority] }}
        />
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-fg-muted/70">
            #{task.id.replace(/^t/, '')}
          </span>
          {fields.priority && task.priority && (
            <span
              title={task.priority}
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: priorityColors[task.priority] }}
            />
          )}
        </div>
      </div>

      <div
        className={`text-[13.5px] leading-snug font-medium ${
          task.checked ? 'line-through text-fg-muted' : 'text-fg'
        } ${isCompact ? 'line-clamp-1' : 'line-clamp-2'}`}
      >
        {titleWithoutTag}
      </div>

      {/* Bracket tag next to title if present */}
      {bracketTag && (
        <div className="mt-1.5">
          <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-semibold tracking-wide text-fg-muted uppercase rounded bg-black/[0.04] dark:bg-white/10">
            {bracketTag}
          </span>
        </div>
      )}

      {/* Search preview */}
      {showPreview && (
        <div className="mt-2.5 space-y-1">
          {searchMatches.slice(0, 2).map((match, i) => (
            <div key={i} className="text-[12px] text-fg-dim bg-black/[0.03] dark:bg-white/[0.04] rounded-lg px-2.5 py-1.5 border border-black/[0.05] dark:border-white/[0.08]">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wide mr-1.5">
                {t(`sectionLabels.${match.section}`) || match.section}
              </span>
              <HighlightedText text={match.snippet} keyword={match.keyword} />
            </div>
          ))}
        </div>
      )}

      {!isCompact && task.progress && task.progress.total > 0 && (
        <div className={`mt-2.5 flex items-center gap-2 ${showPreview ? '' : ''}`}>
          <div className="flex-1 h-[3px] bg-black/[0.06] dark:bg-white/[0.1] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: isComplete ? '#22c55e' : '#737078' }}
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ type: 'spring', stiffness: 160, damping: 22 }}
            />
          </div>
          <span className="font-mono text-[11px] text-fg-muted tabular-nums">
            {task.progress.done}/{task.progress.total}
          </span>
        </div>
      )}

      {(visibleTags.length > 0 || (fields.assignee && task.assignee)) && (
        <div className={`flex flex-wrap gap-1.5 ${isCompact ? 'mt-1.5' : 'mt-2.5'}`}>
          {visibleTags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center h-[20px] px-2 text-[11px] rounded-md font-medium text-fg-muted bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.1]"
            >
              {tag}
            </span>
          ))}
          {extraTags > 0 && (
            <span className="inline-flex items-center h-[20px] px-2 text-[11px] rounded-md font-medium text-fg-muted bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.1]">
              +{extraTags}
            </span>
          )}
          {fields.assignee && task.assignee && (
            <span className="inline-flex items-center h-[20px] px-2 text-[11px] rounded-md font-medium text-fg bg-black/[0.06] dark:bg-white/[0.12] border border-black/[0.08] dark:border-white/[0.15]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
              {task.assignee}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
