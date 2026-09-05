/**
 * @file Conversation switcher for the agent chat sidebar
 * @description Dropdown over the project's chat session index: title, relative
 * last-activity time, and a harness chip per row. Actions: start a new
 * conversation, resume an indexed one through its harness session id, and
 * forget the local index entry (a live session keeps running: this is a
 * sidebar-only removal). Follows the Header's outside-click dropdown pattern.
 *
 * @functions
 *  → relativeTime: compact "now / 5m / 3h / 2d" age label
 *  → SessionSwitcher: session list dropdown
 *
 * @exports SessionSwitcher
 * @see src/components/agent/ChatSidebar.tsx
 * @see src/lib/store/agentChatSlice.ts: resume/forget/newConversation actions
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { IconChevronDown, IconMessage, IconPlus, IconTrash } from '@tabler/icons-react';
import { MOTION } from '../../lib/motion-presets';
import type { SessionIndexEntryPayload } from '../../lib/types';

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return '<1m';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface SessionSwitcherProps {
  sessions: SessionIndexEntryPayload[];
  activeSessionId: string | null;
  onResume: (entry: SessionIndexEntryPayload) => void;
  onForget: (id: string) => void;
  onNew: () => void;
}

export function SessionSwitcher({ sessions, activeSessionId, onResume, onForget, onNew }: SessionSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeTitle = sessions.find(entry => entry.id === activeSessionId)?.title;

  return (
    <div className="relative min-w-0 flex-1" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-left text-[12.5px] text-fg transition-colors hover:border-border-strong hover:bg-bg-2"
        title={activeTitle ?? t('agentChat.title', 'Agent')}
      >
        <IconMessage size={13} stroke={1.8} className="flex-none text-fg-muted" />
        <span className="min-w-0 flex-1 truncate">
          {activeTitle ?? t('agentChat.sessionUntitled', 'Untitled conversation')}
        </span>
        <IconChevronDown size={11} stroke={1.8} className="flex-none opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            {...MOTION.fade}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: MOTION.fade.transition.ease }}
            className="absolute left-0 top-full z-50 mt-1.5 max-h-[60vh] w-[300px] overflow-y-auto rounded-[8px] border border-border bg-bg shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNew();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg transition-colors hover:bg-bg-2"
            >
              <IconPlus size={13} stroke={1.8} className="text-fg-muted" />
              {t('agentChat.newChat', 'New chat')}
            </button>
            <div className="h-px bg-border" />
            {sessions.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-fg-muted">
                {t('agentChat.sessionsEmpty', 'No conversations yet')}
              </div>
            ): (
              sessions.map(entry => (
                <div
                  key={entry.id}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 transition-colors hover:bg-bg-2 ${
                    entry.id === activeSessionId ? 'bg-bg-2': ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      // 📖 Clicking the active row just closes the dropdown;
                      // any other row resumes the harness transcript as a new
                      // kandown session (native resume flags).
                      if (entry.id !== activeSessionId) onResume(entry);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={entry.harnessSessionId ? undefined: t('agentChat.resumeUnavailable', 'Not resumable yet')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-fg">{entry.title || t('agentChat.sessionUntitled', 'Untitled conversation')}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fg-muted">
                        <span className="rounded bg-bg-2 px-1 py-px font-mono uppercase">{entry.harnessId}</span>
                        <span className="tabular-nums">{relativeTime(entry.updatedAt)}</span>
                        {entry.taskId && <span className="font-mono">{entry.taskId}</span>}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onForget(entry.id)}
                    className="flex-none rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    title={t('agentChat.forget', 'Forget')}
                    aria-label={t('agentChat.forget', 'Forget')}
                  >
                    <IconTrash size={12} stroke={1.8} />
                  </button>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
