/**
 * @file Task card row
 * @description Displays one board task as a single dense row inside a column.
 * The card has no border, no shadow, no rounded corners: cards are separated
 * only by a single 1px hairline so the board never shows the double-border
 * "crado" effect (card border + gap + card border).
 *
 * 📖 Layout (top → bottom):
 *   - Title row: `#` on the left, the title text fills the rest of the line
 *     and wraps freely. Hover-revealed archive / delete / drag-handle actions
 *     sit absolutely positioned in the top-right corner so they never push
 *     the title around.
 *   - Meta row: bracket tag, epic, report, dependency count — only when at
 *     least one badge is present. Sits directly below the title, no separator.
 *   - Optional block (non-compact only, when applicable): progress bar,
 *     search-match snippets, full metadata block.
 *
 * 📖 The card height grows with its content. There is no `line-clamp` on the
 * title: a 1-line title produces a compact row, a 3-line title produces a
 * taller row. Compact and non-compact differ in vertical padding and title
 * font size — not in truncation.
 *
 * 📖 Cards are intentionally view-only. Clicking opens the drawer through the
 * store, while mutations such as moving, editing, and deleting stay centralized.
 * 📖 The hover delete control requires two clicks: first arm, then confirm.
 * This keeps fast board scanning safe while avoiding a modal confirmation for
 * every card delete.
 *
 * @functions
 *  → HighlightedText — highlights a matched keyword inside preview text
 *  → Card — single dense row used by the board columns
 *
 * @exports Card
 * @see src/components/Column.tsx
 * @see src/components/Drawer.tsx
 */

import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { AssigneeAvatar } from './agentIcons';
import type { BoardTask, Density, SearchMatch } from '../lib/types';
import { useStore } from '../lib/store';
import { useExtensionRuntime } from './ExtensionRuntimeProvider';

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
const EXCLUDED_KEYS = new Set(['report', 'plugins']);

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
  const showMetadata = useStore(s => s.showMetadata);
  const { badges } = useExtensionRuntime();
  const extensionBadges = badges[task.id] ?? [];

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
  const hasMetaBadges = Boolean(
    bracketTag ||
      task.frontmatter.epic ||
      task.frontmatter.report ||
      task.frontmatter.agentReport ||
      (task.dependsOn && task.dependsOn.length > 0) ||
      task.assignee ||
      extensionBadges.length > 0
  );

  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const toggleTaskSelection = useStore(s => s.toggleTaskSelection);
  const isSelected = selectedTaskIds?.includes(task.id) ?? false;

  // 📖 Density drives vertical padding + title size, never truncation. Both
  // modes grow freely with the title length.
  const containerPadding = isCompact ? 'px-3 py-1.5' : 'px-3.5 py-2.5';
  const titleSize = isCompact ? 'text-[13.5px]' : 'text-[15px]';
  const metaGap = isCompact ? 'mt-1' : 'mt-1.5';

  return (
    // 📖 No `motion.div` here: drag uses native HTML5 events, and Tailwind
    // transitions cover the hover/active feedback. Mixing `whileHover` /
    // `whileTap` with Tailwind's `transition-all` produced a 500ms "pop" on
    // every card (the user reported). Hover lift, tap scale, and shadow are
    // all in the className now.
    // 📖 The card has no border, no rounded corners, no card background —
    // a single `border-b` separates it from the next card. The Column
    // owns the outer border; the Card is a row, not a card.
    <div
      draggable
      {...dragHandlers}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.stopPropagation();
          toggleTaskSelection(task.id);
        } else {
          openDrawer(task.id);
        }
      }}
      data-task-id={task.id}
      data-col={columnName}
      className={`group relative cursor-pointer border-b border-border/60 bg-white/25 transition-colors duration-150 ease-out
        ${containerPadding}
        ${
        isSelected
          ? 'bg-primary/[0.08]'
          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
      } ${task.checked ? 'opacity-70' : ''}`}
    >
      {/* Title row: checkbox (hover) | # | title. The title grows with its
          content — no line-clamp, no truncation. */}
      <div className="flex items-start gap-2">
        {/* 📖 Linear-style selection checkbox. Mirrors ListRow: appears on
            hover, stays visible for every card once any task is selected. */}
        <button
          type="button"
          aria-label={isSelected ? t('bulk.deselect') : t('bulk.select')}
          aria-pressed={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskSelection(task.id);
          }}
          onPointerDown={e => e.stopPropagation()}
          className={`flex-none mt-[2px] flex items-center justify-center h-[18px] w-[18px] rounded-[5px] border transition-colors cursor-pointer ${
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : `border-border/70 text-transparent hover:border-primary/60 hover:bg-primary/5 ${
                  (selectedTaskIds?.length ?? 0) > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`
          }`}
        >
          <Icon.Check size={12} strokeWidth={3} />
        </button>
        <span className="font-mono text-[11.5px] font-medium text-fg-faint tabular-nums flex-none pt-[2px]">
          {task.id.replace(/^t/, '#')}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`${titleSize} leading-snug font-medium break-words ${
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

          {hasMetaBadges && (
            <div className={`${metaGap} flex items-center gap-1.5 flex-wrap`}>
              {/* Assignee — branded agent logo (LobeHub) or human initial avatar */}
              {task.assignee && (
                <AssigneeAvatar assignee={task.assignee} size={16} withLabel />
              )}
              {task.frontmatter.epic ? (
                <span
                  className="inline-flex items-center h-[16px] px-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded"
                  title={`Epic: ${task.frontmatter.epic}`}
                >
                  ⚡ {String(task.frontmatter.epic)}
                </span>
              ) : null}
              {task.frontmatter.report || task.frontmatter.agentReport ? (
                <span
                  className="inline-flex items-center h-[16px] px-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded"
                  title="Agent report ready"
                >
                  🤖 report
                </span>
              ) : null}
              {extensionBadges.map((badge) => (
                <span
                  key={`${badge.extId}.${badge.fieldKey}`}
                  className="inline-flex items-center h-[16px] px-1.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded"
                  title={`${badge.extId}.${badge.fieldKey}`}
                >
                  {badge.text}
                </span>
              ))}
              {task.dependsOn && task.dependsOn.length > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 h-[16px] rounded text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20"
                  title={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
                  aria-label={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
                >
                  ↪{task.dependsOn.length}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search preview — non-compact only (compact already shows the badge in the meta row). */}
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
        <div className={`mt-2.5 flex items-center gap-2`}>
          <div className="flex-1 h-[3px] bg-black/[0.06] dark:bg-white/[0.1] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${progressPct}%`,
                backgroundColor: isComplete ? '#22c55e' : '#737078',
              }}
            />
          </div>
          <span className="font-mono text-[11px] text-fg-muted tabular-nums">
            {task.progress.done}/{task.progress.total}
          </span>
        </div>
      )}

      <MetadataBlock frontmatter={task.frontmatter} hidden={showMetadata} />
    </div>
  );
}
