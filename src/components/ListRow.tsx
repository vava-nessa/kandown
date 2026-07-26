/**
 * @file List row component
 * @description Renders a single task as a compact, Linear-style list item for the
 * list view, with priority indicators, title, status, metadata badges, inline
 * subtask progress slider, and hover quick actions.
 *
 * 📖 Designed specifically for the flat list view to feel compact, modern, and
 * stacked without extra borders, margins, or double separators.
 * 📖 The title grows with its content — no `truncate`, no `line-clamp`. A 1-line
 * title produces a tight row, a 3-line title produces a taller row.
 * 📖 Left-edge chip group: drag handle, priority, #, bracket tag — all stay
 * flex-none and top-aligned. Title block sits next to them and wraps freely.
 * Meta + actions live in a sub-row below, wrapping on overflow.
 *
 * @functions
 *  → ListRow — modern linear-style list row component
 *
 * @exports ListRow
 * @see src/components/ListView.tsx
 * @see src/components/Card.tsx
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconTrash, IconTrashX } from '@tabler/icons-react';
import { Icon } from './Icons';
import type { BoardTask, Density, SearchMatch } from '../lib/types';
import { useStore } from '../lib/store';

const priorityBadges: Record<string, { bg: string; text: string; border: string }> = {
  P1: { bg: 'bg-red-500/10 dark:bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
  P2: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
  P3: { bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  P4: { bg: 'bg-gray-500/10 dark:bg-gray-500/20', text: 'text-fg-muted', border: 'border-gray-500/25' },
};

const FIELD_LABELS: Record<string, string> = {
  priority: 'Priority',
  assignee: 'Assignee',
  tags: 'Tags',
  due: 'Due',
  ownerType: 'Owner',
  tools: 'Tools',
};

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
            className="inline-flex items-center h-[16px] px-1.5 rounded bg-black/[0.04] dark:bg-white/[0.08] border border-border/60 text-fg-dim"
          >
            {String(item)}
          </span>
        ))}
      </span>
    );
  }
  if (typeof value === 'string') {
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
    <div className="mt-1.5 pt-1.5 border-t border-border/30 space-y-1 pl-[60px]">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2 text-[11px] leading-tight">
          <span className="text-fg-muted font-medium flex-shrink-0 min-w-[60px]">{labelFor(key)}</span>
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

interface ListRowProps {
  task: BoardTask;
  searchMatches?: SearchMatch[];
  density?: Density;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  columnName: string;
  doneTags?: Set<string>;
  onSelect?: (taskId: string) => void;
  isActive?: boolean;
}

export function ListRow({
  task,
  searchMatches = [],
  density = 'comfortable',
  onDragStart,
  onDragEnd,
  columnName,
  doneTags,
  onSelect,
  isActive = false,
}: ListRowProps) {
  const { t } = useTranslation();
  const openDrawer = useStore(s => s.openDrawer);
  const deleteTask = useStore(s => s.deleteTask);
  const archiveTask = useStore(s => s.archiveTask);
  const showMetadata = useStore(s => s.showMetadata);
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const toggleTaskSelection = useStore(s => s.toggleTaskSelection);

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const isMountedRef = useRef(true);

  const isCompact = density === 'compact';
  const isSelected = isActive || (selectedTaskIds?.includes(task.id) ?? false);

  const dragHandlers = {
    onDragStart,
    onDragEnd,
  } as unknown as Record<string, unknown>;

  const tagMatch = task.title.match(/^\[([^\]]+)\]\s*/);
  const bracketTag = tagMatch ? `[${tagMatch[1]}]` : '';
  const titleWithoutTag = tagMatch ? task.title.slice(tagMatch[0].length) : task.title;

  const showPreview = searchMatches.length > 0 && !isCompact;
  const prioKey = task.priority || 'P4';
  const prioStyle = priorityBadges[prioKey] || priorityBadges.P4;

  useEffect(() => {
    isMountedRef.current = true;
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
    if (isDeleting || isArchiving) return;

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

  const handleArchiveClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDeleting || isArchiving) return;

    setIsArchiving(true);
    await archiveTask(task.id);
    if (isMountedRef.current) setIsArchiving(false);
  };

  return (
    <div
      draggable={!!onDragStart}
      {...dragHandlers}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.stopPropagation();
          toggleTaskSelection(task.id);
        } else if (onSelect) {
          onSelect(task.id);
        } else {
          openDrawer(task.id);
        }
      }}
      onMouseLeave={() => setDeleteArmed(false)}
      data-task-id={task.id}
      data-col={columnName}
      className={`group relative px-3 transition-colors duration-150 ease-out border-b border-border/30 last:border-b-0 cursor-pointer ${
        isCompact ? 'py-1.5' : 'py-2.5'
      } ${
        isSelected
          ? 'bg-primary/[0.08] dark:bg-primary/[0.12]'
          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
      } ${task.checked ? 'opacity-60' : ''}`}
    >
      {/* Title row: drag handle | priority | # | bracket tag | title (wraps).
          Right side holds absolutely-positioned hover actions so the title
          can grow with long content without being pushed around. */}
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div className="flex-none pt-[2px] opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" className="text-fg-muted">
            <circle cx="2" cy="2" r="1.2"/>
            <circle cx="6" cy="2" r="1.2"/>
            <circle cx="2" cy="7" r="1.2"/>
            <circle cx="6" cy="7" r="1.2"/>
            <circle cx="2" cy="12" r="1.2"/>
            <circle cx="6" cy="12" r="1.2"/>
          </svg>
        </div>

        {/* Priority indicator badge */}
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 h-[18px] text-[10px] font-mono font-bold rounded border ${prioStyle.bg} ${prioStyle.text} ${prioStyle.border} flex-none mt-[1px]`}
        >
          {prioKey}
        </span>

        {/* Task ID — left of the title, always visible */}
        <span className="font-mono text-[11.5px] font-medium text-fg-faint tabular-nums flex-none mt-[2px]">
          {task.id.replace(/^t/, '#')}
        </span>

        {/* Title + bracket tag — title grows freely with content */}
        <div className="flex-1 min-w-0">
          <div
            className={`${isCompact ? 'text-[13px]' : 'text-[14.5px]'} leading-snug font-medium break-words ${
              task.checked ? 'line-through text-fg-muted' : 'text-fg'
            }`}
          >
            {bracketTag && (
              <span className="inline-flex items-center h-[16px] px-1.5 mr-1.5 align-baseline text-[10px] font-semibold tracking-wide text-fg-muted uppercase rounded bg-black/[0.04] dark:bg-white/10">
                {bracketTag}
              </span>
            )}
            {titleWithoutTag}
          </div>
        </div>
      </div>

      {/* Meta + actions sub-row. Wraps on overflow; actions pinned right on hover. */}
      <div className="mt-1 pl-[60px] flex items-center gap-1.5 flex-wrap" onPointerDown={e => e.stopPropagation()}>
          {/* Epic badge */}
          {task.frontmatter.epic ? (
            <span
              className="inline-flex items-center h-[18px] px-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded"
              title={`Epic: ${task.frontmatter.epic}`}
            >
              ⚡ {String(task.frontmatter.epic)}
            </span>
          ) : null}

          {/* Report badge */}
          {task.frontmatter.report || task.frontmatter.agentReport ? (
            <span
              className="inline-flex items-center h-[18px] px-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded"
              title="Agent report ready"
            >
              🤖 report
            </span>
          ) : null}

          {/* Dependencies */}
          {task.dependsOn && task.dependsOn.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20"
              title={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
            >
              ↪{task.dependsOn.length}
            </span>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1">
              {task.tags.slice(0, 2).map((t, i) => (
                <span
                  key={i}
                  className="inline-flex items-center h-[16px] px-1.5 text-[10px] font-medium text-fg-muted rounded bg-black/[0.04] dark:bg-white/[0.06]"
                >
                  #{t}
                </span>
              ))}
            </span>
          )}

          {/* Assignee */}
          {task.assignee && (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium text-fg-muted rounded bg-black/[0.04] dark:bg-white/[0.06]">
              @{task.assignee}
            </span>
          )}

          {/* Subtasks Progress Slider - Inline & compact */}
          {task.progress && task.progress.total > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-border/50 text-[10.5px] font-mono text-fg-muted"
              title={`Subtasks: ${task.progress.done}/${task.progress.total}`}
            >
              <div className="w-7 h-1 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round((task.progress.done / task.progress.total) * 100)}%`,
                    backgroundColor: task.progress.done === task.progress.total ? '#22c55e' : 'var(--primary, #3b82f6)',
                  }}
                />
              </div>
              <span className="tabular-nums font-semibold text-[10px]">{task.progress.done}/{task.progress.total}</span>
            </div>
          )}

          {/* Due Date */}
          {task.frontmatter.due ? (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded">
              📅 {String(task.frontmatter.due)}
            </span>
          ) : null}

          {/* Hover Action Buttons — pushed to the right end of the meta row */}
          <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label={t('card.archive')}
              title={t(isArchiving ? 'card.archiving' : 'card.archive')}
              disabled={isDeleting || isArchiving}
              onClick={handleArchiveClick}
              className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-all ${
                isArchiving
                  ? 'border-accent bg-accent/15 text-accent opacity-100'
                  : 'border-border/60 bg-card/80 text-fg-muted hover:border-accent/60 hover:text-accent'
              }`}
            >
              <Icon.Archive size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={deleteArmed ? t('card.confirmDelete') : t('card.delete')}
              title={deleteArmed ? t('card.confirmDelete') : t('card.delete')}
              disabled={isDeleting || isArchiving}
              onClick={handleDeleteClick}
              onBlur={() => setDeleteArmed(false)}
              className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-all ${
                deleteArmed
                  ? 'border-red-500 bg-red-500 text-white opacity-100 shadow-sm'
                  : 'border-border/60 bg-card/80 text-fg-muted hover:border-red-500/60 hover:text-red-500'
              }`}
            >
              {deleteArmed ? <IconTrashX size={12} stroke={1.9} /> : <IconTrash size={12} stroke={1.8} />}
            </button>
          </div>
        </div>

      {/* Search match previews */}
      {showPreview && (
        <div className="mt-1 pl-[60px] space-y-1">
          {searchMatches.slice(0, 2).map((match, i) => (
            <div key={i} className="text-[11px] text-fg-dim bg-black/[0.03] dark:bg-white/[0.04] rounded px-2 py-0.5 border border-black/[0.04] dark:border-white/[0.06]">
              <span className="text-[9px] font-semibold text-fg-muted uppercase tracking-wide mr-1.5">
                {t(`sectionLabels.${match.section}`) || match.section}
              </span>
              <HighlightedText text={match.snippet} keyword={match.keyword} />
            </div>
          ))}
        </div>
      )}

      <MetadataBlock frontmatter={task.frontmatter} hidden={showMetadata} />
    </div>
  );
}
