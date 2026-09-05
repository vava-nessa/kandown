/**
 * @file Per-card autopilot stop button and status chip (t311)
 * @description The board-surface half of the autopilot UI. Two tiny exports
 * mounted by Card.tsx and ListRow.tsx:
 *
 *  - {@link AutopilotStatusChip}: a 10.5px pill next to the existing metadata
 *    chips ("Working" accent tint when a session runs on the task, "Queued"
 *    muted when the task waits for a slot, "Resumable" amber when the task
 *    has a live session that left the run).
 *  - {@link CardStopButton}: a 20px stop icon button for the session working
 *    on the task. Always visible while a session is active (not hover-only:
 *    stopping an agent is urgent), optimistically disables while its POST is
 *    in flight, and toasts on failure through the slice.
 *
 * 📖 Data path: both read the autopilot snapshot from the store, which is
 * fed by board SSE `agent_autopilot` events (autopilotSlice). Stopping uses
 * the same session stop route as the chat sidebar
 * (POST /api/agent/sessions/:id/stop), via stopAutopilotSession.
 *
 * @functions
 *  → AutopilotStatusChip: Working / Queued / Resumable pill
 *  → CardStopButton: per-task session stop button
 *
 * @exports AutopilotStatusChip, CardStopButton
 * @see src/lib/store/autopilotSlice.ts: snapshot fold + session stop
 * @see src/components/Card.tsx and src/components/ListRow.tsx: mount points
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlayerStopFilled } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { autopilotTaskStatus, activeSessionForTask } from '../../lib/store/autopilotSlice';

/** 📖 One extra class hook so hosts control positioning: Card passes
 * absolute coordinates (top-right corner, left of the "Ask the agent"
 * button), ListRow places the button inline in its right chip cluster. */
type PositionClasses = string | undefined;

export function AutopilotStatusChip({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const status = useStore(s => autopilotTaskStatus(s.autopilot.snapshot, taskId));
  if (!status) return null;

  if (status === 'active') {
    return (
      <span
        className="inline-flex h-[16px] items-center gap-1 rounded border border-accent/25 bg-accent/10 px-1.5 text-[10.5px] font-semibold text-accent"
        title={t('agentAutopilot.workingTitle', { defaultValue: 'An autopilot session is working on this task' })}
      >
        <span className="h-1 w-1 animate-pulse rounded-full bg-current" aria-hidden />
        {t('agentAutopilot.working', { defaultValue: 'Working' })}
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span
        className="inline-flex h-[16px] items-center rounded border border-border/50 bg-black/[0.04] px-1.5 text-[10.5px] font-semibold text-fg-muted dark:bg-white/[0.06]"
        title={t('agentAutopilot.queuedTitle', { defaultValue: 'Waiting for a free autopilot slot' })}
      >
        {t('agentAutopilot.queued', { defaultValue: 'Queued' })}
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-[16px] items-center rounded border border-amber-500/20 bg-amber-500/10 px-1.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300"
      title={t('agentAutopilot.resumableTitle', { defaultValue: 'A live session exists for this task but left the run; it can be resumed' })}
    >
      {t('agentAutopilot.resumable', { defaultValue: 'Resumable' })}
    </span>
  );
}

export function CardStopButton({ taskId, className }: { taskId: string; className?: PositionClasses }) {
  const { t } = useTranslation();
  const sessionId = useStore(s => activeSessionForTask(s.autopilot.snapshot, taskId));
  const stopAutopilotSession = useStore(s => s.stopAutopilotSession);
  // 📖 Optimistic local disabling: the button goes inert the moment it is
  // clicked and re-arms when the POST settles (the board event that removes
  // the session usually lands first).
  const [stopping, setStopping] = useState(false);

  if (!sessionId) return null;

  const handleStop = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (stopping) return;
    setStopping(true);
    void stopAutopilotSession(sessionId).finally(() => setStopping(false));
  };

  return (
    <button
      type="button"
      aria-label={t('agentAutopilot.stopTask', { defaultValue: 'Stop the agent working on this task' })}
      title={t('agentAutopilot.stopTaskTitle', { defaultValue: 'Stop this autopilot session' })}
      disabled={stopping}
      onClick={handleStop}
      onPointerDown={e => e.stopPropagation()}
      className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-[5px] border border-red-500/40 bg-card text-red-600 shadow-sm transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400 ${
        className ?? ''
      }`}
    >
      <IconPlayerStopFilled size={11} stroke={1.8} aria-hidden />
    </button>
  );
}
