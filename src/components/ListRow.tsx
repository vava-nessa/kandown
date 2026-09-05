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
 * 📖 Two modes: `list` (default, draggable, Linear-style selection — a
 * checkbox appears on hover, or stays visible for every row once any task is
 * selected, so multi-select + bulk actions feel like Linear) and `archive`
 * (not draggable, shows a Restore button on hover). Both modes share one
 * renderer — see `ArchiveView`.
 * 📖 Live agent edits (t309): the row hosts the animated border beam while an
 * agent edits the task, and the single "stack host" row mounts the fixed
 * permission approval stack (mount-point agnostic, see isApprovalStackHost).
 *
 * @functions
 *  → ListRow — modern linear-style list row component
 *
 * @exports ListRow
 * @see src/components/ListView.tsx
 * @see src/components/ArchiveView.tsx
 * @see src/components/Card.tsx
 * @see src/components/agent/CardBeam.tsx
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { AssigneeAvatar } from './agentIcons';
import type { BoardTask, Density, SearchMatch } from '../lib/types';
import { useStore } from '../lib/store';
import { CategoryChip } from './CategoryChip';
import { CardBeam } from './agent/CardBeam';
import { ApprovalCardStack, isApprovalStackHost } from './agent/ApprovalCard';

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
  /** Shift-range selection handler. When provided (list view), shift-clicking
 * the row selects every task between the last anchor and this one. Omitted in
 * archive/inline contexts where range selection does not apply. */
  onShiftSelect?: (taskId: string) => void;
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
  /**
   * Board column label rendered as the first chip in the inline meta sub-row.
   * Used by `TaskWorkspace`'s sidebar in category mode, where tasks from many
   * statuses sit under one `[CATEGORY]` section and the status chip makes the
   * status-first sort readable at a glance. Omitted everywhere else.
   */
  statusLabel?: string;
  /** 📖 True when the row renders inside an expanded stack: the category
   * (chip or legacy bracket tag) is already announced by the stack's centered
   * header, so repeating it on every row is noise. */
  inStack?: boolean;
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
  onShiftSelect,
  isActive = false,
  mode = 'list',
  inline = false,
  statusLabel,
  inStack = false,
}: ListRowProps) {
  const { t } = useTranslation();
  const openDrawer = useStore(s => s.openDrawer);
  const unarchiveTask = useStore(s => s.unarchiveTask);
  const showMetadata = useStore(s => s.showMetadata);
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const toggleTaskSelection = useStore(s => s.toggleTaskSelection);

  const [isRestoring, setIsRestoring] = useState(false);
  const isMountedRef = useRef(true);

  const isCompact = density === 'compact';
  const isSelected = isActive || (selectedTaskIds?.includes(task.id) ?? false);
  // 📖 Linear behaviour: once any task is selected, every row reveals its
  // checkbox so the user can keep adding to the selection without hunting
  // for the hover target.
  const anySelected = (selectedTaskIds?.length ?? 0) > 0;

  const dragHandlers = {
    onDragStart,
    onDragEnd,
  } as unknown as Record<string, unknown>;

  const tagMatch = task.title.match(/^\[([^\]]+)\]\s*/);
  const bracketTag = tagMatch ? `[${tagMatch[1]}]` : '';
  const titleWithoutTag = tagMatch ? task.title.slice(tagMatch[0].length) : task.title;

  const categoryChips = useStore(s => s.config.ui.categoryChips !== false);
  const showPreview = searchMatches.length > 0 && !isCompact;
  const prioKey = task.priority || 'P4';
  const prioStyle = priorityBadges[prioKey] || priorityBadges.P4;

  // 📖 Live agent edit (t309): whether this row is the single host of the
  // fixed permission approval stack (first task of the first non-empty
  // column, so exactly one stack exists per rendered view).
  const isStackHost = useStore(s => isApprovalStackHost(s.columns, task.id));

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRestoreClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isRestoring) return;

    setIsRestoring(true);
    await unarchiveTask(task.id);
    if (isMountedRef.current) setIsRestoring(false);
  };

  return (
    <div
      draggable={!!onDragStart}
      {...dragHandlers}
      onClick={(e) => {
        if (e.shiftKey) {
          e.stopPropagation();
          if (onShiftSelect) onShiftSelect(task.id);
          else toggleTaskSelection(task.id);
        } else if (e.metaKey || e.ctrlKey) {
          e.stopPropagation();
          toggleTaskSelection(task.id);
        } else if (onSelect) {
          onSelect(task.id);
        } else {
          openDrawer(task.id);
        }
      }}
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
      {/* 📖 Live agent edit (t309): animated border beam while a session edits
          this task. Self-hiding, insets itself inside the row (variant "row"). */}
      <CardBeam taskId={task.id} variant="row" />
      {/* Title row: checkbox | category chip | title (flex-1) | #id + priority + right chips.
          - Wide layout: title grows freely, the meta cluster (#id, priority, tags,
            subtask counter) sits right-aligned AFTER the title. Category chip is
            the first content element, before the title.
          - Inline layout (narrow sidebar): title uses `truncate` to claim the
            full available width and shows ellipsis on overflow. Right chips
            move to the meta sub-row below. */}
      <div className={`flex ${inline ? 'items-center' : 'items-start'} gap-2`}>
        {/* 📖 Linear-style selection checkbox. Appears on hover, but stays
            visible for EVERY row once at least one task is selected, so the
            user can keep adding to the selection. Only shown in list mode —
            archive rows are not selectable. Clicking it toggles selection
            without opening the drawer. */}
        {mode === 'list' && (
          <button
            type="button"
            aria-label={isSelected ? t('bulk.deselect') : t('bulk.select')}
            aria-pressed={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey && onShiftSelect) {
                onShiftSelect(task.id);
                return;
              }
              toggleTaskSelection(task.id);
            }}
            onPointerDown={e => e.stopPropagation()}
            className={`absolute left-0.5 z-20 flex items-center justify-center h-[18px] w-[18px] rounded-[5px] border bg-card/90 shadow-sm transition-opacity duration-150 cursor-pointer ${
              isCompact ? 'top-[7px]' : 'top-[11px]'
            } ${
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : `border-border/70 text-transparent hover:border-primary/60 hover:bg-primary/5 ${
                    anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                  }`
            }`}
          >
            <Icon.Check size={12} strokeWidth={3} />
          </button>
        )}

        {/* 📖 Category chip FIRST, before the title. When chips are off or the
            task has no category, the row starts with the title (and a legacy
            bracket tag inside it). */}
        {categoryChips && task.category && !inStack ? (
          <CategoryChip category={task.category} className="shrink-0 mt-[1px]" />
        ) : null}

        {/* Title — grows freely in wide layout, truncates in inline. */}
        <div className="flex-1 min-w-0">
          <div
            className={`${isCompact ? 'text-[13px]' : 'text-[14.5px]'} leading-snug font-medium ${
              inline ? 'truncate' : 'break-words'
            } ${
              task.checked ? 'line-through text-fg-muted' : 'text-fg'
            }`}
          >
            {!categoryChips && bracketTag && !inStack ? (
              <span className="inline-flex items-center h-[16px] px-1.5 mr-1.5 align-baseline text-[10px] font-semibold tracking-wide text-fg-muted uppercase rounded bg-black/[0.04] dark:bg-white/10">
                {bracketTag}
              </span>
            ) : null}
            {titleWithoutTag}
          </div>
        </div>

        {/* The rest AFTER the title: task id, priority, then tags + subtasks
            (wide layout only). Right-aligned, flex-none so the title owns the
            remaining width. */}
        <div className="flex items-center gap-1.5 flex-none mt-[1px]">
          {/* Task ID */}
          <span className="font-mono text-[11.5px] font-medium text-fg-faint tabular-nums">
            {task.id.replace(/^t/i, '')}
          </span>

          {/* Priority indicator badge */}
          <span
            className={`inline-flex items-center justify-center px-1.5 py-0.2 h-[18px] text-[10px] font-mono font-bold rounded border ${prioStyle.bg} ${prioStyle.text} ${prioStyle.border}`}
          >
            {prioKey}
          </span>

          {/* Tags + subtask counter, wide layout only. */}
          {!inline && ((task.progress && task.progress.total > 0) ||
            (task.tags && task.tags.length > 0)) && (
            <div className="flex items-center gap-1.5 flex-none">
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
      </div>

      {/* Meta + actions sub-row. ONLY renders when at least one badge is present
          so a bare task doesn't reserve a wasted line of vertical space. The
          hover action buttons moved out to an absolute-positioned overlay
          (see below) so they no longer dictate the row's height. */}
      {(inline || !!statusLabel || task.frontmatter.epic ||
        task.frontmatter.report || task.frontmatter.agentReport ||
        (task.dependsOn && task.dependsOn.length > 0) ||
        task.assignee ||
        task.frontmatter.due ||
        (task.tags && task.tags.length > 0) ||
        (task.progress && task.progress.total > 0)) && (
        <div className="mt-1 pl-[60px] flex items-center gap-1.5 flex-wrap" onPointerDown={e => e.stopPropagation()}>
          {/* Status chip, first in the meta sub-row. Only rendered when the
              row sits in a category-mode section, where the status is not
              obvious from the grouping. */}
          {statusLabel && (
            <span className="inline-flex items-center h-[16px] px-1.5 text-[10px] font-medium text-fg-muted rounded bg-black/[0.04] dark:bg-white/[0.06] border border-border/50">
              {statusLabel}
            </span>
          )}
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

          {/* Assignee — branded agent logo (LobeHub) or human initial avatar */}
          {task.assignee && (
            <AssigneeAvatar assignee={task.assignee} size={16} withLabel />
          )}

          {/* Due Date */}
          {task.frontmatter.due ? (
            <span className="inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded">
              📅 {String(task.frontmatter.due)}
            </span>
          ) : null}
        </div>
      )}

      {/* 📖 Archive-mode only: a hover Restore button. Active-board rows no
          longer carry per-row action buttons — archive/move/delete all live in
          the floating bulk bar once selected (Linear-style). Archive rows are
          not selectable, so they keep their own restore affordance. */}
      {mode === 'archive' && (
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label={t('drawer.restore')}
            title={t(isRestoring ? 'card.archiving' : 'drawer.restore')}
            disabled={isRestoring}
            onClick={handleRestoreClick}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-bg-1/80 text-fg-muted transition-all hover:border-accent/60 hover:text-accent hover:bg-accent/10"
          >
            <Icon.ArchiveRestore size={14} strokeWidth={1.8} />
          </button>
        </div>
      )}

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

      {/* 📖 Pending agent permission requests (t309): the fixed bottom-right
          approval stack. Mount-point agnostic: it is position:fixed, so which
          row mounts it does not matter; every row renders this JSX but only
          the single stack host (see isApprovalStackHost) actually mounts it,
          and the stack itself returns null while the queue is empty. Mounted
          here too so the list and workspace views cover the queue. */}
      {isStackHost && <ApprovalCardStack />}
    </div>
  );
}

