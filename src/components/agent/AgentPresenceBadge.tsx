/**
 * @file Agent chat presence badge for the task editor headers
 * @description Shows the chat session's blobatar near the task id in the
 * TaskWorkspace (desktop) and Drawer (mobile) headers while a `[show: tXXX]`
 * directive from the ACTIVE chat session points at the open task: a small
 * header avatar, plus the floating companion anchored just under the header
 * line so the session visibly hovers over the open editor. This is
 * non-locking presence: the editor stays fully editable, and when a live
 * edit lock already renders the same session's blob (agentEdits) this badge
 * renders nothing to avoid a double blob. Also consumes the directive's
 * anchor: once the openDrawer read lands, it scrolls the matching section
 * (description, subtasks, report) into view, reduced-motion aware.
 *
 * @functions
 *  → AgentPresenceBadge: header blob + floating companion + anchor scroll
 *
 * @exports AgentPresenceBadge
 * @see src/lib/store/agentChatSlice.ts: where the presence marker is set
 * @see src/components/agent/Blobatar.tsx
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../lib/store';
import { AgentBlobatar, FloatingAgentBlobatar } from './Blobatar';

interface AgentPresenceBadgeProps {
  /** The task open in the editor hosting this header (null when closed). */
  taskId: string | null;
}

export function AgentPresenceBadge({ taskId }: AgentPresenceBadgeProps) {
  const { t } = useTranslation();
  const presence = useStore(s => s.agentChat.showTask);
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  // 📖 The live-edit lock renders its own blob + read-only notice: presence
  // never duplicates it.
  const editLockSession = useStore(s => (taskId ? s.agentEdits.edits[taskId] : undefined));

  const active = !!taskId && !!presence && !!activeSessionId
    && presence.taskId === taskId
    && presence.sessionId === activeSessionId;

  // 📖 Anchor scroll: the directive asked for a section. openDrawer reads the
  // task file asynchronously, so the section may not exist yet: hunt for it
  // over rAF frames for a short deadline, then give up quietly.
  const anchor = presence?.anchor;
  const nonce = presence?.nonce;
  useEffect(() => {
    if (!active || !anchor) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const deadline = performance.now() + 1500;
    const hunt = () => {
      const section = document.querySelector(`[data-task-section="${anchor}"]`);
      if (section) {
        section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      if (performance.now() < deadline) raf = requestAnimationFrame(hunt);
    };
    raf = requestAnimationFrame(hunt);
    return () => cancelAnimationFrame(raf);
  }, [active, anchor, nonce]);

  if (!active || editLockSession) return null;
  return (
    <>
      <span title={t('agentChat.presenceBadge', 'This chat session is looking at this task')}>
        <AgentBlobatar sessionId={presence.sessionId} size={20} />
      </span>
      {/* 📖 The floating companion: anchored to the editor panel's top-right
          corner, just under the header line. The header container is the
          `relative` anchor (TaskWorkspace / Drawer headers), so the blob
          hovers OVER the editor content, not inside the header flow. It is
          decorative here: the small header avatar above already announces the
          session to assistive tech, and pointer-events-none keeps the editor
          fully clickable underneath. */}
      <FloatingAgentBlobatar sessionId={presence.sessionId} size={48} decorative className="right-4 top-full -mt-3.5" />
    </>
  );
}
