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

// 📖 Map known frontmatter keys to human-readable labels. Custom keys fall
// through to a capitalize() fallback so the block stays useful for any field
// the user adds to a task file (e.g. `estimate: 3d`).
const FIELD_LABELS: Record<string, string> = {
  priority: 'Priority',
  assignee: 'Assignee',
  tags: 'Tags',
  due: 'Due',
  ownerType: 'Owner',
  tools: 'Tools',
};

// Defensive: never render these even if they ever leak into frontmatter.
const EXCLUDED_KEYS = new Set(['report']);

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function renderValue(key: string, value: unknown) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center h-[18px] px-1.5 rounded bg-black/[0.04] dark:bg-white/[0.08] border border-border/60 text-fg-dim"
          >
            {String(item)}
          </span>
        ))}
      </span>
    );
  }
  if (typeof value === 'string') {
    // Dates (the `due` field or any ISO-860ish string) get a locale format.
    if (key === 'due' || isIsoDate(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return (
          <span className="text-fg-dim">
            {d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        );
      }
    }
    return <span className="text-fg-dim break-words">{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-fg-dim">{value ? 'yes' : 'no'}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-fg-dim">{value}</span>;
  }
  return <span className="text-fg-dim">{String(value)}</span>;
}

/**
 * 📖 The per-card metadata block. Renders every key of the task's frontmatter
 * (except heavy/excluded ones) as a small `Label: value` list, adapting to the
 * runtime type of each value: arrays become chips, date-like strings become
 * locale-formatted dates, booleans become yes/no, everything else stays text.
 *
 * When `hidden` is true (the global default), the block returns null so cards
 * stay minimal — just id, title, progress. The App-level master switch flips
 * `hidden` to false to reveal every task's metadata in one click.
 */
function MetadataBlock({ frontmatter, hidden }: { frontmatter: Record<string, unknown>; hidden: boolean }) {
  if (hidden) return null;
  const entries = Object.entries(frontmatter).filter(([k, v]) => {
    if (EXCLUDED_KEYS.has(k)) return false;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
  if (entries.length === 0) return null;
  return (
    <div className="mt-2.5 pt-2 border-t border-border/60 space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2 text-[11.5px] leading-snug">
          <span className="text-fg-muted/80 font-medium flex-shrink-0 min-w-[64px]">{labelFor(key)}</span>
          <span className="flex-1 min-w-0">{renderValue(key, value)}</span>
        </div>
      ))}
    </div>
  );
}

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
  const showMetadata = useStore(s => s.showMetadata);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isMountedRef = useRef(true);

  const isCompact = density === 'compact';

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
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      draggable
      {...dragHandlers}
      onClick={() => openDrawer(task.id)}
      onMouseLeave={() => setDeleteArmed(false)}
      data-task-id={task.id}
      data-col={columnName}
      className={`group relative cursor-pointer rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
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
        className={`absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
          deleteArmed
            ? 'border-red-500 bg-red-500 text-white opacity-100 shadow-sm'
            : 'border-border bg-card/80 text-fg-muted opacity-0 hover:border-red-500/60 hover:bg-card hover:text-red-500 group-hover:opacity-100'
        } ${isDeleting ? 'pointer-events-none opacity-60' : ''}`}
      >
        {deleteArmed ? <IconTrashX size={14} stroke={1.9} /> : <IconTrash size={14} stroke={1.8} />}
      </button>

      {/* Subtle priority edge indicator — removed; priority now lives in the
       * metadata block (revealed via the global showMetadata toggle). */}

      <div className="px-3.5 pt-3 pb-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[11.5px] font-medium text-fg-faint tabular-nums">
          {task.id.replace(/^t/, '#')}
        </span>
        {bracketTag && (
          <span className="inline-flex items-center h-[16px] px-1.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase rounded bg-black/[0.04] dark:bg-white/10">
            {bracketTag}
          </span>
        )}
        {task.dependsOn && task.dependsOn.length > 0 && (
          // 📖 Dep chip: surfaces the task's `depends_on` count next to the id
          // so blocked work is visible at a glance on the board. Hover shows
          // the full id list — the drawer has the "Blocked by" panel for the
          // unresolved/resolved breakdown.
          <span
            className="ml-auto inline-flex items-center gap-0.5 px-1.5 h-[16px] rounded text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20"
            title={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
            aria-label={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
          >
            ↪{task.dependsOn.length}
          </span>
        )}
      </div>

      <div className="px-3.5 pb-1.5">
        <div
          className={`text-[13.5px] leading-snug font-medium ${
            task.checked ? 'line-through text-fg-muted' : 'text-fg'
          } ${isCompact ? 'line-clamp-1' : 'line-clamp-2'}`}
        >
          {titleWithoutTag}
        </div>

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

        <MetadataBlock frontmatter={task.frontmatter} hidden={showMetadata} />
      </div>
    </motion.div>
  );
}
