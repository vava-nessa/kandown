/**
 * @file List row component
 * @description Renders a single task as a compact, Linear-style list item for the
 * list view, with priority indicators, title, status, metadata badges, inline
 * subtask progress slider, and hover quick actions.
 *
 * 📖 Designed specifically for the flat list view to feel compact, modern, and
 * stacked without extra borders, margins, or double separators.
 * 📖 Two layouts:
 *    - **wide** (default): title grows freely with content (`break-words`).
 *      Right-aligned chip cluster (tags + subtasks counter) lives on the
 *      same line as the title. Meta sub-row below holds secondary chips
 *      (epic, report, deps, assignee, due).
 *    - **inline** (`inline` prop): single-line title row with `truncate` so
 *      the title gets the full available width instead of being squeezed
 *      into a thin column. All meta (tags, subtasks, epic, report, deps,
 *      assignee, due) collapses into a single compact sub-row below the
 *      title. Used by `TaskWorkspace` sidebar (narrow ~300px column) so a
 *      1-line title with ellipsis beats a 12-line vertical word stack.
 * 📖 Two modes: `list` (default, draggable, archive/delete buttons) and
 * `archive` (not draggable, restore/delete buttons). Both modes share one
 * renderer — see `ArchiveView`.
 *
 * @functions
 *  → ListRow — modern linear-style list row component
 *
 * @exports ListRow
 * @see src/components/ListView.tsx
 * @see src/components/ArchiveView.tsx
 * @see src/components/Card.tsx
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconArrowsMove, IconTrash, IconTrashX } from '@tabler/icons-react';
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
    <div className="mt-1.5 pt-1.5 border-t border-border/60 space-y-1 pl-[60px]">
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
  /**
   * Rendering mode.
   * - `list` (default): drag handle, archive + delete actions.
   * - `archive`: no drag handle, no archive button (already archived), show
   *   a Restore button that calls `unarchiveTask` instead. Used by
   *   `ArchiveView` so archived and active boards share one renderer.
   */
  mode?: 'list' | 'archive';
  /**
   * Inline layout. When true, the title row uses a single line with
   * `truncate` (ellipsis on overflow) and all meta (tags, subtasks, epic,
   * report, deps, assignee, due) collapses into a compact sub-row below.
   * Designed for narrow containers (≈260-360px) like `TaskWorkspace`'s
   * "All tasks" sidebar, where a wide title with ellipsis reads far better
   * than a 12-line vertical word stack caused by a squeezed 30px title
   * column. Default `false` keeps the wide-layout behavior used by the
   * full-width list view, archive view, and card-stack-expanded views.
   */
  inline?: boolean;
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
  mode = 'list',
  inline = false,
}: ListRowProps) {
  const { t } = useTranslation();
  const openDrawer = useStore(s => s.openDrawer);
  const deleteTask = useStore(s => s.deleteTask);
  const archiveTask = useStore(s => s.archiveTask);
  const unarchiveTask = useStore(s => s.unarchiveTask);
  const moveTask = useStore(s => s.moveTask);
  const columns = useStore(s => s.columns);
  const showMetadata = useStore(s => s.showMetadata);
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const toggleTaskSelection = useStore(s => s.toggleTaskSelection);

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  // 📖 Move modal state. Per-row so only one modal is open at a time across
  // the rendered list — opening one resets the others.
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetIndex, setMoveTargetIndex] = useState(0);
  const isMountedRef = useRef(true);

  // 📖 Columns the user can move TO. Archive mode keeps them all visible so
  // restore-via-move and direct move share the same picker.
  const movableColumns = useMemo(() => columns, [columns]);

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

  const handleRestoreClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDeleting || isRestoring) return;

    setIsRestoring(true);
    await unarchiveTask(task.id);
    if (isMountedRef.current) setIsRestoring(false);
  };

  const openMoveModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isDeleting || isArchiving || isRestoring) return;
    // 📖 Pre-select the column right after the current one so the most likely
    // next move is the default. Falls back to 0 if we're already last.
    const currentIdx = movableColumns.findIndex(c => c.name === columnName);
    const nextIdx = currentIdx >= 0 && currentIdx < movableColumns.length - 1
      ? currentIdx + 1
      : 0;
    setMoveTargetIndex(Math.max(0, nextIdx));
    setShowMoveModal(true);
  };

  const closeMoveModal = () => setShowMoveModal(false);

  const confirmMove = async (toCol: string) => {
    if (toCol === columnName) {
      setShowMoveModal(false);
      return;
    }
    setShowMoveModal(false);
    try {
      await moveTask(task.id, columnName, toCol);
    } catch {
      // store surfaces a toast on failure — swallow here.
    }
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
      className={`group relative px-3 transition-colors duration-150 ease-out border-b border-border/60 last:border-b-0 cursor-pointer ${
        isCompact ? 'py-1.5' : 'py-2.5'
      } ${
        isSelected
          ? 'bg-primary/[0.08] dark:bg-primary/[0.12]'
          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
      } ${task.checked ? 'opacity-60' : ''}`}
    >
      {/* Title row: drag handle | priority | # | title (flex-1) | (optional right chips).
          - Wide layout: title grows freely, right chips (tags + subtask counter)
            sit on the same line. Title uses `break-words` so long titles wrap.
          - Inline layout (narrow sidebar): title uses `truncate` to claim the
            full available width and shows ellipsis on overflow. Right chips
            move to the meta sub-row below. */}
      <div className={`flex ${inline ? 'items-center' : 'items-start'} gap-2`}>
        {/* Drag handle */}
        {mode === 'list' && (
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
        )}

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

        {/* Title + bracket tag — grows freely in wide layout, truncates in inline. */}
        <div className="flex-1 min-w-0">
          <div
            className={`${isCompact ? 'text-[13px]' : 'text-[14.5px]'} leading-snug font-medium ${
              inline ? 'truncate' : 'break-words'
            } ${
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

        {/* Right-aligned chips: tags first, then subtask counter (last).
            ONLY rendered in wide layout — the inline layout moves them to
            the meta sub-row below so the title gets the full row width. */}
        {!inline && ((task.progress && task.progress.total > 0) ||
          (task.tags && task.tags.length > 0)) && (
          <div className="flex items-center gap-1.5 flex-none mt-[1px]">
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

            {/* Subtasks counter — always LAST, always the same width. */}
            {task.progress && task.progress.total > 0 && (
              <div
                className="inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-border/50 text-[10.5px] font-mono text-fg-muted w-[64px] flex-none"
                title={`Subtasks: ${task.progress.done}/${task.progress.total}`}
              >
                <div className="w-8 h-1 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((task.progress.done / task.progress.total) * 100)}%`,
                      backgroundColor: task.progress.done === task.progress.total ? '#22c55e' : 'var(--primary, #3b82f6)',
                    }}
                  />
                </div>
                <span className="tabular-nums font-semibold text-[10px] whitespace-nowrap">{task.progress.done}/{task.progress.total}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Meta + actions sub-row. ONLY renders when at least one badge is present
          so a bare task doesn't reserve a wasted line of vertical space. The
          hover action buttons moved out to an absolute-positioned overlay
          (see below) so they no longer dictate the row's height. */}
      {(inline || task.frontmatter.epic ||
        task.frontmatter.report || task.frontmatter.agentReport ||
        (task.dependsOn && task.dependsOn.length > 0) ||
        task.assignee ||
        task.frontmatter.due ||
        (task.tags && task.tags.length > 0) ||
        (task.progress && task.progress.total > 0)) && (
        <div className="mt-1 pl-[60px] flex items-center gap-1.5 flex-wrap" onPointerDown={e => e.stopPropagation()}>
          {/* Tags — only rendered in the sub-row when in inline mode
              (in wide layout they sit on the title line). */}
          {inline && task.tags && task.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
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

          {/* Subtasks counter — only rendered in the sub-row when in inline
              mode (in wide layout it sits on the title line). Compact,
              no progress bar, just the digits. */}
          {inline && task.progress && task.progress.total > 0 && (
            <span
              className="inline-flex items-center h-[16px] px-1.5 rounded bg-black/[0.04] dark:bg-white/[0.06] border border-border/50 text-[10.5px] font-mono text-fg-muted font-semibold tabular-nums"
              title={`Subtasks: ${task.progress.done}/${task.progress.total}`}
            >
              {task.progress.done}/{task.progress.total}
            </span>
          )}

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

          {/* Assignee */}
          {task.assignee && (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium text-fg-muted rounded bg-black/[0.04] dark:bg-white/[0.06]">
              @{task.assignee}
            </span>
          )}

          {/* Due Date */}
          {task.frontmatter.due ? (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded">
              📅 {String(task.frontmatter.due)}
            </span>
          ) : null}
        </div>
      )}

      {/* 📖 Hover action overlay. Absolutely positioned, vertically centered
          on the row, fading in on hover or focus-within. Archive + Delete are
          red so the destructive actions read as destructive even before the
          user commits; Move stays neutral because it is not destructive.
          In archive mode the Archive button is swapped for Restore (which
          also calls Move through the picker — opening the modal lets the
          user pick the target column instead of going back to the default
          column). */}
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        onPointerDown={e => e.stopPropagation()}
      >
        {mode === 'list' && (
          <button
            type="button"
            aria-label={t('card.archive')}
            title={t(isArchiving ? 'card.archiving' : 'card.archive')}
            disabled={isDeleting || isArchiving}
            onClick={handleArchiveClick}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
              isArchiving
                ? 'border-red-500 bg-red-500/20 text-red-500 opacity-100'
                : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 hover:border-red-500/60'
            }`}
          >
            <Icon.Archive size={14} strokeWidth={1.8} />
          </button>
        )}
        <button
          type="button"
          aria-label={mode === 'archive' ? t('drawer.restore') : t('card.move')}
          title={mode === 'archive' ? t(isRestoring ? 'card.archiving' : 'drawer.restore') : t('card.move')}
          disabled={isDeleting || isArchiving || isRestoring}
          onClick={mode === 'archive' ? handleRestoreClick : openMoveModal}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-bg-1/80 text-fg-muted transition-all hover:border-accent/60 hover:text-accent hover:bg-accent/10"
        >
          {mode === 'archive' ? <Icon.ArchiveRestore size={14} strokeWidth={1.8} /> : <IconArrowsMove size={14} stroke={1.8} />}
        </button>
        <button
          type="button"
          aria-label={deleteArmed ? t('card.confirmDelete') : t('card.delete')}
          title={deleteArmed ? t('card.confirmDelete') : t('card.delete')}
          disabled={isDeleting || isArchiving || isRestoring}
          onClick={handleDeleteClick}
          onBlur={() => setDeleteArmed(false)}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
            deleteArmed
              ? 'border-red-500 bg-red-500 text-white opacity-100 shadow-sm'
              : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500'
          }`}
        >
          {deleteArmed ? <IconTrashX size={14} stroke={1.9} /> : <IconTrash size={14} stroke={1.8} />}
        </button>
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

      {showMoveModal && (
        <MoveModal
          columns={movableColumns}
          currentColumn={columnName}
          selectedIndex={moveTargetIndex}
          onSelectIndex={setMoveTargetIndex}
          onConfirm={confirmMove}
          onClose={closeMoveModal}
        />
      )}
    </div>
  );
}

/**
 * 📖 Move picker. Keyboard-first: ArrowUp/ArrowDown move the highlight,
 * Enter confirms, Esc closes. Mouse clicks also work. The current column is
 * shown but greyed out so users can see context, and confirming it is a
 * no-op (the row doesn't visibly change).
 */
function MoveModal({
  columns,
  currentColumn,
  selectedIndex,
  onSelectIndex,
  onConfirm,
  onClose,
}: {
  columns: { name: string; tasks: BoardTask[] }[];
  currentColumn: string;
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  onConfirm: (colName: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // 📖 Clamp the selected index when columns change so we never point past
  // the end of the list. Re-runs whenever the prop changes.
  useEffect(() => {
    if (selectedIndex >= columns.length) onSelectIndex(Math.max(0, columns.length - 1));
  }, [columns.length, selectedIndex, onSelectIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown' || (e.shiftKey && e.key === 'Tab')) {
      e.preventDefault();
      onSelectIndex((selectedIndex + 1) % columns.length);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'Tab') {
      e.preventDefault();
      onSelectIndex((selectedIndex - 1 + columns.length) % columns.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = columns[selectedIndex];
      if (target) onConfirm(target.name);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t('card.move')}
      tabIndex={-1}
      ref={el => el?.focus()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
      <div
        className="relative w-[min(360px,92vw)] max-h-[70vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-4 h-11 border-b border-border/60 bg-bg-1/60">
          <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
            <IconArrowsMove size={14} stroke={1.8} className="text-fg-muted" />
            {t('card.move')}
          </div>
          <span className="kbd">esc</span>
        </header>
        <ul className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
          {columns.length === 0 ? (
            <li className="px-4 py-3 text-[13px] text-fg-muted italic">
              {t('column.noColumns')}
            </li>
          ) : (
            columns.map((col, i) => {
              const isCurrent = col.name === currentColumn;
              const isSelected = i === selectedIndex;
              return (
                <li
                  key={col.name}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => onSelectIndex(i)}
                  onClick={() => onConfirm(col.name)}
                  className={`flex items-center justify-between gap-3 px-4 py-2 text-[13.5px] cursor-pointer transition-colors ${
                    isSelected ? 'bg-accent text-accent-foreground' : 'text-fg hover:bg-bg-1'
                  } ${isCurrent ? 'opacity-60' : ''}`}
                >
                  <span className="truncate font-medium">{col.name}</span>
                  <span className="flex items-center gap-2 flex-none">
                    <span className={`font-mono text-[11px] ${isSelected ? 'text-accent-foreground/70' : 'text-fg-muted'}`}>
                      {col.tasks.length}
                    </span>
                    {isCurrent && (
                      <span className={`font-mono text-[10px] uppercase tracking-wide ${isSelected ? 'text-accent-foreground/70' : 'text-fg-faint'}`}>
                        current
                      </span>
                    )}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
