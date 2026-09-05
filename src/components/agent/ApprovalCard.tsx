/**
 * @file Agent permission approval cards (t309)
 * @description ApprovalCard renders one pending harness permission request
 * (title, kind chip, short session id, Approve / Reject); ApprovalCardStack is
 * the fixed bottom-right container fed by the agentEdits permission queue.
 * Resolving is optimistic: the card vanishes at once, the POST answers the
 * daemon, and a failed resolve restores the card with an error toast.
 *
 * 📖 Mount-point agnostic: the stack is `position: fixed`, so it renders the
 * same no matter which component mounts it. Hosts (Card.tsx and ListRow.tsx)
 * mount it only on the single "stack host" task, the first task of the first
 * non-empty column, so exactly one stack exists per view even though every
 * card/row renders the same JSX. The stack renders null when the queue is
 * empty, keeping idle boards at zero cost.
 *
 * @functions
 *  → isApprovalStackHost: true for the one task that should mount the stack
 *  → ApprovalCard: one permission request card
 *  → ApprovalCardStack: fixed bottom-right queue (null when empty)
 *
 * @exports isApprovalStackHost, ApprovalCard, ApprovalCardStack
 * @see src/lib/store/agentEditsSlice.ts: permissions state + resolvePermission
 * @see src/components/Card.tsx, src/components/ListRow.tsx: mount points
 */

import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../lib/store';
import { MOTION } from '../../lib/motion-presets';
import { KbdButton } from '../KbdButton';
import type { Column } from '../../lib/types';
import type { AgentPermissionRequest } from '../../lib/store/types';

/**
 * 📖 Picks the deterministic single host of the fixed stack: the first task
 * of the first column that has tasks. Exactly one card or row per rendered
 * view matches, so the fixed stack is mounted exactly once per page.
 */
export function isApprovalStackHost(columns: Column[], taskId: string): boolean {
  for (const column of columns) {
    const first = column.tasks[0];
    if (first) return first.id === taskId;
  }
  return false;
}

export function ApprovalCard({ permission }: { permission: AgentPermissionRequest }) {
  const { t } = useTranslation();
  const resolvePermission = useStore(s => s.resolvePermission);
  return (
    <motion.div
      {...MOTION.toast}
      className="w-[290px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-xl"
    >
      <div className="flex items-center gap-1.5">
        {/* 📖 BeautifulUI working-state glyph (loading/working patterns,
            beautifului.dev): the amber dot pulses while the request waits. */}
        <span aria-hidden="true" className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-amber-500" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-muted">
          {t('agentEdits.permissionTitle', 'Agent permission requested')}
        </span>
      </div>
      <p className="mt-1.5 break-words text-[13px] font-medium leading-snug text-fg">
        {permission.title}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="inline-flex h-[16px] items-center rounded border border-border/60 bg-black/[0.04] px-1.5 text-[10px] font-semibold text-fg-muted dark:bg-white/[0.08]">
          {permission.kind}
        </span>
        <span className="font-mono text-[10px] text-fg-faint" title={permission.sessionId}>
          {permission.sessionId.slice(0, 8)}
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <KbdButton
          variant="secondary"
          label={t('agentEdits.reject', 'Reject')}
          onClick={() => { void resolvePermission(permission.sessionId, permission.permissionId, false); }}
        />
        <KbdButton
          variant="primary"
          label={t('agentEdits.approve', 'Approve')}
          onClick={() => { void resolvePermission(permission.sessionId, permission.permissionId, true); }}
        />
      </div>
    </motion.div>
  );
}

export function ApprovalCardStack() {
  const { t } = useTranslation();
  const permissions = useStore(s => s.agentEdits.permissions);
  // 📖 Empty queue: null, so idle boards keep zero cost and no dead overlay.
  if (permissions.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('agentEdits.permissionTitle', 'Agent permission requested')}
      className="pointer-events-none fixed bottom-4 right-4 z-[130] flex flex-col items-end"
    >
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <AnimatePresence initial={false}>
          {permissions.map(permission => (
            <ApprovalCard key={permission.permissionId} permission={permission} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
