/**
 * @file Conversations section of the expanded left rail (t337, vava requests #1, #5, #6, #8)
 * @description The project's agent chat sessions under the rail's nav items:
 * a header row with a "+ new chat" button, a compact filter input, recency
 * groups (Today / Yesterday / Last 7 days / Older) and one row per
 * conversation. A row resumes the conversation and opens the agent page; the
 * hover trash button forgets the index entry (a live harness session keeps
 * running, this is a list removal only).
 *
 * 📖 Live indicator (vava #1): a session whose agent turn is running shows a
 * small pulsing emerald dot on its row, mirroring the agent page header. The
 * store's `agentChat.live` fold carries `turnActive` per session id; entries
 * only exist for sessions connected during this page life, everything else
 * counts as idle.
 *
 * 📖 Search (vava #5): local component state, case-insensitive substring
 * match on the title and the task id. Purely visual filtering, it never
 * touches the store; groups emptied by the filter are not rendered.
 *
 * 📖 Date grouping (vava #6): rows bucket by calendar day against local
 * time. Buckets render oldest last and only when non-empty.
 *
 * 📖 Tooltips (vava #8): the project's Tooltip (src/components/ui/tooltip-card.tsx)
 * positions its card absolutely inside its trigger, and the nav column's
 * overflow-y-auto would clip anything poking out of it. RailTooltip below is
 * the same visual language but portals to document.body with fixed
 * positioning anchored to the trigger, re-anchoring on scroll and resize
 * while visible, so a tooltip can never be clipped by the rail column.
 *
 * 📖 Frozen ordering (vava, mis-click round): background daemon activity bumps
 * `updatedAt`, so the session index re-sorts live and rows move under the
 * cursor between mousedown and click, opening the WRONG conversation. While
 * the pointer is over the section the rendered ordering is frozen to the
 * snapshot taken at pointer enter; on pointer leave the live re-sorted list
 * takes over again. Purely render stabilization: the store is never written,
 * groups and the filter keep working over the frozen snapshot, and rows the
 * user forgot mid-hover still disappear (frozen entries dropped from the
 * live index are filtered out of the snapshot).
 *
 * @functions
 *  → recencyGroup — bucket an updatedAt instant into Today / Yesterday / Last 7 days / Older
 *  → RailTooltip — hover (and optionally focus) tooltip portaled to document.body, immune to overflow clipping
 *  → ConversationRow — one indexed conversation: full-title tooltip, harness glyph, age, live dot, forget
 *  → ConversationsSection — the whole section: header, search, recency groups
 *
 * @exports ConversationsSection
 * @see src/components/SideNav.tsx
 * @see src/components/ui/tooltip-card.tsx
 * @see src/lib/store/agentChatSlice.ts
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/relative-time';
import { AssigneeAvatar } from './agentIcons';
import type { SessionIndexEntryPayload } from '../lib/types';

/** Recency buckets, rendered in this order (newest first). */
const RECENCY_GROUPS = ['today', 'yesterday', 'last7', 'older'] as const;
type RecencyGroup = (typeof RECENCY_GROUPS)[number];

/** i18n key plus English fallback for each bucket label. */
const RECENCY_LABELS: Record<RecencyGroup, { key: string; fallback: string }> = {
  today: { key: 'agentChat.groupToday', fallback: 'Today' },
  yesterday: { key: 'agentChat.groupYesterday', fallback: 'Yesterday' },
  last7: { key: 'agentChat.groupLast7Days', fallback: 'Last 7 days' },
  older: { key: 'agentChat.groupOlder', fallback: 'Older' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 📖 Calendar-day bucketing against local time: "Today" starts at local
 * midnight, "Yesterday" is the previous calendar day and "Last 7 days" the
 * seven calendar days before that. Unparsable instants (should not happen)
 * land in "older" rather than crashing the rail. */
function recencyGroup(updatedAt: string, now: Date): RecencyGroup {
  const time = new Date(updatedAt).getTime();
  if (Number.isNaN(time)) return 'older';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= startOfToday) return 'today';
  if (time >= startOfToday - DAY_MS) return 'yesterday';
  if (time >= startOfToday - 7 * DAY_MS) return 'last7';
  return 'older';
}

/** 📖 Tooltip card portaled to document.body (vava #8). Same card styling as
 * the project's Tooltip, but fixed-positioned against the trigger's viewport
 * rect: prefers above and centered, drops below when there is no room,
 * clamps horizontally to the viewport, and re-anchors on scroll and resize
 * while visible. The card renders hidden until first measured, so it never
 * flashes at (0, 0).
 *
 * 📖 `showOnFocus` (vava, tooltip round): the filter input lives under this
 * tooltip and focus follows every click, so a focus-opened card floated over
 * the CONVERSATIONS header while typing. Pass false for such form controls:
 * the card then opens on hover only. Row titles, forget and new chat keep
 * the hover + focus behavior validated as good. */
function RailTooltip({ content, children, wrapperClassName, showOnFocus = true }: {
  content: string;
  children: React.ReactNode;
  wrapperClassName?: string;
  /** Whether keyboard/click focus on the trigger opens the card. Default true. */
  showOnFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const wrapper = wrapperRef.current;
    const card = cardRef.current;
    if (!wrapper || !card) return;
    const rect = wrapper.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.min(Math.max(12, left), Math.max(12, window.innerWidth - width - 12));
    let top = rect.top - height - 8;
    if (top < 8) top = rect.bottom + 8;
    setPos({ top, left });
  }, []);

  // 📖 Measure once the card is mounted (and again when the text changes):
  // placement needs the real rendered size, which does not exist before mount.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, content, place]);

  useEffect(() => {
    if (!open) return;
    const reanchor = () => place();
    window.addEventListener('scroll', reanchor, true);
    window.addEventListener('resize', reanchor);
    return () => {
      window.removeEventListener('scroll', reanchor, true);
      window.removeEventListener('resize', reanchor);
    };
  }, [open, place]);

  return (
    <div
      ref={wrapperRef}
      className={`relative ${wrapperClassName ?? ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={showOnFocus ? () => setOpen(true) : undefined}
      onBlur={showOnFocus ? () => setOpen(false) : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={cardRef}
            className="pointer-events-none fixed z-50"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="max-w-[16rem] rounded-lg border border-border/80 bg-card/95 px-3 py-1.5 text-xs font-medium leading-snug text-fg shadow-xl backdrop-blur-md dark:bg-bg-1/95"
            >
              {content}
            </motion.div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** 📖 One conversation row (t337): full title in a portaled tooltip (native
 * title clipped long titles at the rail width), harness glyph and age on the
 * second line, a pulsing emerald dot while the agent turn runs, hover trash
 * to forget the index entry. */
function ConversationRow({ entry, active, turnActive, onSelect, onForget, untitledLabel, forgetLabel, workingLabel }: {
  entry: SessionIndexEntryPayload;
  active: boolean;
  turnActive: boolean;
  onSelect: () => void;
  onForget: () => void;
  untitledLabel: string;
  forgetLabel: string;
  workingLabel: string;
}) {
  const fullTitle = entry.title || untitledLabel;
  return (
    <div
      className={`group flex items-center rounded-lg pr-1 transition-colors ${
        active ? 'bg-secondary' : 'hover:bg-secondary/60'
      }`}
    >
      <RailTooltip content={fullTitle} wrapperClassName="min-w-0 flex-1">
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full min-w-0 flex-col items-start px-2.5 py-1.5 text-left"
        >
          <span className="w-full truncate text-[12px] leading-tight text-fg">{fullTitle}</span>
          {/* 📖 Brand logo instead of the harness name (vava, t337 round 2): the
           * text chip used to clip in the narrow rail ("CLAUDE" became
           * "CLAIDE"); the same glyph cards use for assignees reads at a
           * glance and never truncates. Unknown harnesses keep a tiny text
           * chip, they have no brand to resolve to. */}
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-none text-fg-muted">
            <AssigneeAvatar assignee={entry.harnessId} size={12} />
            <span className="tabular-nums">{relativeTime(entry.updatedAt)}</span>
            {turnActive && (
              <span
                role="img"
                aria-label={workingLabel}
                className="h-1.5 w-1.5 flex-none rounded-full bg-emerald-500 motion-safe:animate-pulse"
              />
            )}
          </span>
        </button>
      </RailTooltip>
      <RailTooltip content={forgetLabel} wrapperClassName="flex-none">
        <button
          type="button"
          onClick={onForget}
          className="rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
          aria-label={forgetLabel}
        >
          <IconTrash size={11} stroke={1.8} />
        </button>
      </RailTooltip>
    </div>
  );
}

/** 📖 The whole conversations section of the expanded rail. Reads the session
 * index and live folds straight from the store; `onOpenAgent` is SideNav's
 * routing (full page on desktop, overlay below 768px).
 *
 * 📖 Hover freeze (vava, mis-click round): the live index re-sorts on every
 * background `updatedAt` bump, so rows used to move under the cursor and
 * clicks landed on the wrong conversation. Between pointer enter and leave
 * the section renders the ordering captured at enter instead of the live
 * one; the store stays the single source of truth and is never written. */
export function ConversationsSection({ onOpenAgent }: { onOpenAgent: () => void }) {
  const { t } = useTranslation();
  const sessions = useStore(s => s.agentChat.sessions);
  const live = useStore(s => s.agentChat.live);
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const currentPage = useStore(s => s.currentPage);
  const resumeSession = useStore(s => s.resumeSession);
  const forgetSession = useStore(s => s.forgetSession);
  const newConversation = useStore(s => s.newConversation);
  const [query, setQuery] = useState('');
  // 📖 Snapshot of the session index taken when the pointer entered the
  // section; null when the pointer is outside and the live order renders.
  const [frozenOrder, setFrozenOrder] = useState<SessionIndexEntryPayload[] | null>(null);

  // 📖 Render base while hovering: the frozen ordering, minus entries the
  // user forgot mid-hover (a forgotten id leaves the live index, so keeping
  // it would render a ghost row until pointer leave). New sessions and
  // re-sorts wait for pointer leave: nothing may move under the cursor.
  const liveIds = new Set(sessions.map(entry => entry.id));
  const ordered = frozenOrder
    ? frozenOrder.filter(entry => liveIds.has(entry.id))
    : sessions;

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? ordered.filter(entry =>
        entry.title.toLowerCase().includes(needle) ||
        (entry.taskId ?? '').toLowerCase().includes(needle))
    : ordered;

  // 📖 Cheap on purpose: the session index is small, and grouping per render
  // keeps buckets correct after midnight without a timer.
  const now = new Date();
  const groups = RECENCY_GROUPS
    .map(group => ({
      group,
      items: filtered.filter(entry => recencyGroup(entry.updatedAt, now) === group),
    }))
    .filter(bucket => bucket.items.length > 0);

  return (
    <div
      className="mt-4 flex flex-col gap-0.5"
      onMouseEnter={() => setFrozenOrder(current => (current ? current : [...sessions]))}
      onMouseLeave={() => setFrozenOrder(null)}
    >
      <div className="flex items-center justify-between px-2.5 pb-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
          {t('agentChat.conversations', 'Conversations')}
        </span>
        <RailTooltip content={t('agentChat.newChat', 'New chat')} wrapperClassName="flex-none">
          <button
            type="button"
            onClick={() => {
              newConversation();
              onOpenAgent();
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-fg-faint transition-colors hover:bg-secondary/60 hover:text-fg"
            aria-label={t('agentChat.newChat', 'New chat')}
          >
            <IconPlus size={12} stroke={1.8} />
          </button>
        </RailTooltip>
      </div>

      <div className="px-2.5 pb-1.5">
        {/* 📖 showOnFocus={false} (vava, tooltip round): focusing the filter
         * used to float the "Filter conversations" card over the CONVERSATIONS
         * header while typing; the placeholder already names the field, so the
         * card opens on hover only. */}
        <RailTooltip
          content={t('agentChat.searchConversations', 'Filter conversations')}
          wrapperClassName="w-full"
          showOnFocus={false}
        >
          <div className="flex h-7 w-full items-center gap-1.5 rounded-lg border border-border/60 px-2 transition-colors focus-within:border-border">
            <IconSearch size={12} stroke={1.6} className="flex-none text-fg-faint" />
            <input
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setQuery('');
              }}
              placeholder={t('agentChat.searchConversations', 'Filter conversations')}
              aria-label={t('agentChat.searchConversations', 'Filter conversations')}
              className="w-full min-w-0 bg-transparent text-[11.5px] text-fg placeholder:text-fg-faint focus:outline-none"
            />
          </div>
        </RailTooltip>
      </div>

      {ordered.length === 0 ? (
        <p className="px-2.5 text-[11px] leading-relaxed text-fg-faint">
          {t('agentChat.sessionsEmpty', 'No conversations yet')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-2.5 text-[11px] leading-relaxed text-fg-faint">
          {t('agentChat.searchNoMatch', 'No matching conversations')}
        </p>
      ) : (
        groups.map(({ group, items }, index) => (
          <div key={group} className={`flex flex-col gap-0.5 ${index > 0 ? 'mt-1.5' : ''}`}>
            <span className="px-2.5 pb-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-fg-faint">
              {t(RECENCY_LABELS[group].key, RECENCY_LABELS[group].fallback)}
            </span>
            {items.map(entry => (
              <ConversationRow
                key={entry.id}
                entry={entry}
                active={entry.id === activeSessionId && currentPage === 'agent'}
                turnActive={live[entry.id]?.fold.turnActive === true}
                onSelect={() => {
                  if (entry.id !== activeSessionId) void resumeSession(entry);
                  onOpenAgent();
                }}
                onForget={() => void forgetSession(entry.id)}
                untitledLabel={t('agentChat.sessionUntitled', 'Untitled conversation')}
                forgetLabel={t('agentChat.forget', 'Forget')}
                workingLabel={t('agentChat.working', 'Working')}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
