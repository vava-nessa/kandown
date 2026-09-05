/**
 * @file Task card
 * @description Displays one board task as a clean, rounded card inside a
 * column. The card carries its own surface (`bg-card`), a subtle hairline
 * border, and a soft resting shadow; it lifts slightly on hover. Cards are
 * separated by a small vertical margin so they read as distinct, floating
 * chips on the column tint — the Linear / Notion kanban look.
 *
 * 📖 This matches the collapsed `CardStack` surface so individual cards and
 * grouped stacks share one visual language. The previous borderless-row
 * treatment washed out in light mode: `bg-white/25` over an already
 * near-white board read as muddy. A defined `bg-card` surface fixes that in
 * both modes.
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
 * title: a 1-line title produces a compact card, a 3-line title produces a
 * taller card. Compact and non-compact differ in vertical padding, outer
 * margin and title font size — not in truncation.
 *
 * 📖 Cards are intentionally view-only. Clicking opens the drawer through the
 * store, while mutations such as moving, editing, and deleting stay centralized.
 * 📖 The hover delete control requires two clicks: first arm, then confirm.
 * This keeps fast board scanning safe while avoiding a modal confirmation for
 * every card delete.
 * 📖 Live agent edits (t309): the card hosts the animated border beam and the
 * session's blob avatar while an agent edits the task, and the single
 * "stack host" card mounts the fixed permission approval stack (mount-point
 * agnostic, see isApprovalStackHost).
 * 📖 Autopilot (t311): the card shows the Working / Queued / Resumable chip
 * in the meta row and a always-visible stop button (top-right, left of the
 * "Ask the agent" button) while an autopilot session runs on the task.
 *
 * @functions
 *  → HighlightedText — highlights a matched keyword inside preview text
 *  → Card — single dense row used by the board columns
 *
 * @exports Card
 * @see src/components/Column.tsx
 * @see src/components/Drawer.tsx
 * @see src/components/agent/CardBeam.tsx
 */

import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconMessage } from '@tabler/icons-react';
import { Icon } from './Icons';
import { AssigneeAvatar } from './agentIcons';
import { CategoryChip } from './CategoryChip';
import { CardBeam } from './agent/CardBeam';
import { AgentBlobatar } from './agent/Blobatar';
import { ApprovalCardStack, isApprovalStackHost } from './agent/ApprovalCard';
import { AutopilotStatusChip, CardStopButton } from './agent/CardStopButton';
import { autopilotTaskStatus, activeSessionForTask } from '../lib/store/autopilotSlice';
import type { BoardTask, Density, SearchMatch } from '../lib/types';
import { useStore } from '../lib/store';
import { useExtensionRuntime } from './ExtensionRuntimeProvider';
import { categoryColor } from '../lib/category-color';
import { formatDependencyChip } from '../lib/dependency-chip-format';

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
  /** 📖 True when the card renders inside an expanded stack: the category
   * (chip or legacy bracket tag) is already announced by the stack's centered
   * header, so repeating it on every card is noise. */
  inStack?: boolean;
}

export function Card({ task, searchMatches = [], density, onDragStart, onDragEnd, columnName, doneTags, inStack = false }: CardProps) {
  const { t } = useTranslation();
  const openDrawer = useStore(s => s.openDrawer);
  const openSidebar = useStore(s => s.openSidebar);
  const showMetadata = useStore(s => s.showMetadata);
  const { badges } = useExtensionRuntime();
  const extensionBadges = badges[task.id] ?? [];

  const isCompact = density === 'compact';

  // 📖 Autopilot (t311): chip status + the session id driving the stop
  // button. Both derive from the SSE snapshot in one place (autopilotSlice).
  // Declared early: hasMetaBadges below counts the autopilot chip as a badge.
  const autopilotStatus = useStore(s => autopilotTaskStatus(s.autopilot.snapshot, task.id));
  const autopilotSessionId = useStore(s => activeSessionForTask(s.autopilot.snapshot, task.id));

  const progressPct =
    task.progress && task.progress.total > 0
      ? Math.round((task.progress.done / task.progress.total) * 100)
      : 0;
  const isComplete = task.progress && task.progress.done === task.progress.total;

  // 📖 Drag tilt (vava's ask): the native drag ghost is a static snapshot,
  // so we build a rotated clone and hand it to `setDragImage`: the card
  // follows the cursor already tilted, while the original stays untouched.
  // On release the ghost vanishes, so we snap the original to the tilted
  // angle with transitions disabled and let it ease back to level over
  // 400ms, which reads as the card "landing".
  const ghostRef = useRef<HTMLElement | null>(null);
  const handleDragStart = (e: React.DragEvent) => {
    onDragStart?.(e);
    const card = e.currentTarget as HTMLElement;
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.style.width = `${card.offsetWidth}px`;
    ghost.style.position = 'absolute';
    ghost.style.top = '-10000px';
    ghost.style.transform = 'rotate(3deg)';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    e.dataTransfer.setDragImage(ghost, card.offsetWidth / 2, card.offsetHeight / 2);
  };
  const handleDragEnd = (e: React.DragEvent) => {
    onDragEnd?.(e);
    ghostRef.current?.remove();
    ghostRef.current = null;
    const card = e.currentTarget as HTMLElement;
    card.style.transition = 'none';
    card.style.transform = 'rotate(3deg)';
    void card.offsetWidth;
    card.style.transition = 'transform 400ms ease-in-out';
    card.style.transform = 'rotate(0deg)';
    window.setTimeout(() => {
      card.style.transition = '';
      card.style.transform = '';
    }, 400);
  };
  const dragHandlers = {
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
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
      autopilotStatus ||
      extensionBadges.length > 0
  );

  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const toggleTaskSelection = useStore(s => s.toggleTaskSelection);
  const categoryChips = useStore(s => s.config.ui.categoryChips !== false);
  const isSelected = selectedTaskIds?.includes(task.id) ?? false;

  // 📖 Single dependency chip needs the title of the blocking task; build a
  // id → title lookup from every column once per board change so each card
  // stays O(deps) at render time.
  const columns = useStore(s => s.columns);
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of columns) {
      for (const t of col.tasks) {
        if (t.id && t.title) map.set(t.id, t.title);
      }
    }
    return map;
  }, [columns]);
  const depsChip = task.dependsOn && task.dependsOn.length > 0
    ? formatDependencyChip(task.dependsOn, titleById)
    : '';

  // 📖 Live agent edit (t309): presence, and whether this card is the single
  // host of the fixed permission stack (first task of the first non-empty
  // column, so exactly one stack exists per rendered view).
  const editSession = useStore(s => s.agentEdits.edits[task.id]);
  const isStackHost = useStore(s => isApprovalStackHost(s.columns, task.id));

  // 📖 Density drives vertical padding + title size, never truncation. Both
  // modes grow freely with the title length.
  const containerPadding = isCompact ? 'px-3 py-1.5' : 'px-3.5 py-2.5';
  // 📖 Outer margin between cards replaces the old separator. Gives
  // comfortable vertical breathing room so each card floats as a distinct chip
  // on the column background.
  const cardMargin = inStack
    ? (isCompact ? 'mb-2' : 'mb-2.5 last:mb-0')
    : (isCompact ? 'mb-2.5' : 'mb-3.5');
  const titleSize = isCompact ? 'text-[13.5px]' : 'text-[15px]';
  const metaGap = isCompact ? 'mt-1' : 'mt-1.5';
  // 📖 Border encodes content shape (vava's hierarchy): a solo card with a
  // category wears that category's border color, matching its chip; a titled
  // card without subtasks wears its title color (fg); an untitled card
  // (renders as its bare id) gets the stronger neutral border-strong; cards
  // with subtasks keep the quiet hairline.
  const hasSubtasks = !!task.progress && task.progress.total > 0;
  const hasTitle = task.title.trim().length > 0;
  const categoryBorderColor = categoryChips && task.category && !inStack
    ? categoryColor(task.category).border
    : null;
  const borderClass = categoryBorderColor
    ? 'border'
    : hasTitle
      ? (hasSubtasks ? 'border-border/80' : 'border-fg/70')
      : 'border-border-strong';

  return (
    // 📖 No `motion.div` here: drag uses native HTML5 events, and Tailwind
    // transitions cover the hover/active feedback. Mixing `whileHover` /
    // `whileTap` with Tailwind's `transition-all` produced a 500ms "pop" on
    // every card (the user reported). Hover shadow and border feedback are
    // all in the className now; the old hover lift is gone (the translate
    // made the border visually detach).
    // 📖 The card is a real surface: `bg-card` gives a clean white chip in
    // light mode and a defined elevated surface in dark mode. A hairline
    // border + resting shadow define the edge; hover tightens the border and
    // deepens the shadow. Cards are spaced by `cardMargin` (not a separator
    // border) so they float on the column tint.
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
      className={`group relative cursor-pointer rounded-lg bg-card border-[1.5px] ${borderClass} ${cardMargin}
        ${containerPadding}
        ${
        isSelected
          ? 'border-primary/50 bg-primary/[0.08] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] ring-1 ring-primary/25'
          : 'shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-border-strong hover:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.14)]'
      } ${task.checked ? 'opacity-70' : ''}`}
      style={categoryBorderColor ? { borderColor: categoryBorderColor } : undefined}
    >
      {/* 📖 Live agent edit (t309): animated border beam while a session edits
          this task (self-hiding), plus the session's deterministic blob avatar
          with its "I am editing..." bubble. The blob sits left of the
          hover-revealed "Ask the agent" button so the two never collide. */}
      <CardBeam taskId={task.id} variant="card" />
      {editSession && (
        <AgentBlobatar
          sessionId={editSession.sessionId}
          size={24}
          bubble
          className={`absolute z-20 ${isCompact ? 'top-[2px]' : 'top-[6px]'} ${
            // 📖 t311: when an autopilot stop button is mounted next to it,
            // the blob shifts left so the two controls never overlap.
            autopilotSessionId ? 'right-[54px]' : 'right-7'
          }`}
        />
      )}
      {/* Title row: checkbox (hover) | # | title. The title grows with its
          content — no line-clamp, no truncation. */}
      <div className="flex items-start gap-2">
        {/* 📖 Linear-style selection checkbox. Mirrors ListRow: appears on
            hover, stays visible for every card once any task is selected. It
            floats absolutely over the card's left edge so it never shifts the
            content, with a fade in/out on hover. */}
        <button
          type="button"
          aria-label={isSelected ? t('bulk.deselect') : t('bulk.select')}
          aria-pressed={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskSelection(task.id);
          }}
          onPointerDown={e => e.stopPropagation()}
          className={`absolute -left-1.5 z-20 flex items-center justify-center h-[18px] w-[18px] rounded-[5px] border-[1.5px] bg-card shadow-sm transition-opacity duration-150 cursor-pointer ${
            isCompact ? 'top-[7px]' : 'top-[11px]'
          } ${
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : `${borderClass} text-transparent hover:border-primary/60 hover:bg-primary/5 ${
                  (selectedTaskIds?.length ?? 0) > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`
          }`}
        >
          <Icon.Check size={12} strokeWidth={3} />
        </button>
        {/* 📖 "Ask the agent" (t308): hover-revealed action in the top-right
         * corner, mirroring the checkbox pattern. stopPropagation on click and
         * pointerdown keeps the card's open-drawer and drag handlers quiet. */}
        <button
          type="button"
          aria-label={t('agentChat.askAgent', 'Ask the agent')}
          title={t('agentChat.askAgent', 'Ask the agent')}
          onClick={(e) => {
            e.stopPropagation();
            openSidebar(task.id);
          }}
          onPointerDown={e => e.stopPropagation()}
          className={`absolute right-[6px] z-20 flex h-[20px] w-[20px] items-center justify-center rounded-[5px] border border-border bg-card text-fg-muted shadow-sm transition-opacity duration-150 hover:border-border-strong hover:text-fg ${
            isCompact ? 'top-[4px]' : 'top-[8px]'
          } opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
        >
          <IconMessage size={12} stroke={1.8} />
        </button>
        {/* 📖 Autopilot stop (t311): rendered while a session is active on
         * this task, always visible (not hover-only: stopping an agent is
         * urgent), left of the "Ask the agent" button. Self-hiding: renders
         * null when the task has no active session. */}
        <CardStopButton
          taskId={task.id}
          className={`absolute right-[30px] z-20 ${isCompact ? 'top-[4px]' : 'top-[8px]'}`}
        />
        <div className="flex-1 min-w-0">
          <div
            className={`${titleSize} leading-snug font-medium break-words ${
              task.checked ? 'line-through text-fg-muted' : 'text-fg'
            }`}
          >
            {categoryChips && task.category && !inStack ? (
              <CategoryChip category={task.category} className="mr-1.5 align-middle shrink-0" />
            ) : bracketTag && !inStack ? (
              <span className="inline-flex items-center h-[16px] px-1.5 mr-1.5 align-baseline text-[10px] font-semibold tracking-wide text-fg-muted uppercase rounded bg-black/[0.04] dark:bg-white/10">
                {bracketTag}
              </span>
            ) : null}
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
              {/* 📖 Autopilot presence (t311): Working / Queued / Resumable. */}
              <AutopilotStatusChip taskId={task.id} />
              {depsChip && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 h-[16px] rounded text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 max-w-[260px] truncate"
                  title={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
                  aria-label={t('card.blockedBy', { ids: task.dependsOn.join(', ') })}
                >
                  {depsChip}
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

      {/* 📖 Task id badge: absolute bottom-right, glued to the card edge. White
          box at 50% opacity with black id in light mode, inverted in dark.
          No `#` prefix, digits only, comfortably readable. */}
      <span
        className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 font-mono text-[12px] font-semibold leading-none bg-white/50 text-black dark:bg-black/50 dark:text-white select-none pointer-events-none"
      >
        {task.id.replace(/^t/i, '')}
      </span>

      {/* 📖 Pending agent permission requests (t309): the fixed bottom-right
          approval stack. Mount-point agnostic: it is position:fixed, so which
          card mounts it does not matter; every card renders this JSX but only
          the single stack host (see isApprovalStackHost) actually mounts it,
          and the stack itself returns null while the queue is empty. Mounted
          from the board card because it must stay visible across all views. */}
      {isStackHost && <ApprovalCardStack />}
    </div>
  );
}
