/**
 * @file Autopilot sidebar controls (t311)
 * @description Compact control row mounted in the agent chat sidebar header:
 * a play/stop toggle for the daemon's autopilot run (with kill-switch styling
 * while running: destructive tint, pulsing dot, active count, and an 800ms
 * click debounce so a double-click cannot fire two stops) and the compact
 * run totals (tokens + cost). Disabled when the chat guard reports no daemon.
 *
 * 📖 Data path: board SSE `agent_autopilot` events and the autopilot REST
 * endpoints are folded into the store by src/lib/store/autopilotSlice.ts;
 * this component only reads the snapshot and calls startAutopilot /
 * stopAutopilot. The tooltip carries the full active/queued/resumable counts
 * so the header row stays one line tall.
 *
 * @functions
 *  → formatTokens: compact token count (k / M)
 *  → formatCost: compact USD cost
 *  → AutopilotControls: the header control row
 *
 * @exports AutopilotControls
 * @see src/lib/store/autopilotSlice.ts
 * @see src/components/agent/ChatSidebar.tsx: mount point
 */

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlayerPlayFilled, IconPlayerStopFilled } from '@tabler/icons-react';
import { useStore } from '../../lib/store';

/** 📖 Compact token count: 950, 12.3k, 4.2M. */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(Math.max(0, Math.round(tokens)));
}

/** 📖 Compact USD cost: sub-cent runs read as "<$0.01" instead of "$0.00". */
function formatCost(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.01) return '<$0.01';
  return `$${costUsd.toFixed(2)}`;
}

export function AutopilotControls() {
  const { t } = useTranslation();
  const snapshot = useStore(s => s.autopilot.snapshot);
  const stopping = useStore(s => s.autopilot.stopping);
  const guard = useStore(s => s.agentChat.guard);
  const startAutopilot = useStore(s => s.startAutopilot);
  const stopAutopilot = useStore(s => s.stopAutopilot);

  // 📖 Kill switch is confirm-free by design (stopping an agent is urgent),
  // so the only guard is a time debounce: clicks inside 800ms of the last
  // accepted one are ignored, which absorbs accidental double-clicks without
  // ever blocking a deliberate second attempt for long.
  const lastKillClickRef = useRef(0);

  const running = snapshot?.state === 'running';
  const disabled = guard === 'no-daemon' || stopping;
  const activeCount = snapshot?.active.length ?? 0;
  const queuedCount = snapshot?.queue.length ?? 0;
  const orphanCount = snapshot?.orphans.length ?? 0;
  const tokens = snapshot?.totals.tokens ?? 0;
  const costUsd = snapshot?.totals.costUsd ?? 0;
  const showTotals = running || tokens > 0 || costUsd > 0;

  const handleToggle = () => {
    if (disabled) return;
    if (running) {
      const now = Date.now();
      if (now - lastKillClickRef.current < 800) return;
      lastKillClickRef.current = now;
      void stopAutopilot();
      return;
    }
    void startAutopilot();
  };

  const tooltip = running
    ? t('agentAutopilot.runTooltip', {
        defaultValue: 'Autopilot running: {{active}} active, {{queued}} queued, {{resumable}} resumable. Stop ends every session.',
        active: activeCount,
        queued: queuedCount,
        resumable: orphanCount,
      })
    : t('agentAutopilot.idleTooltip', {
        defaultValue: 'Autopilot is idle. Start it to let the daemon pick and run tasks on its own.',
      });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        title={tooltip}
        aria-label={tooltip}
        className={`inline-flex h-6 flex-none items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors disabled:cursor-default disabled:opacity-50 ${
          running
            ? 'border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400'
            : 'border-border bg-bg-2 text-fg-muted hover:text-fg'
        }`}
      >
        {running ? (
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
            <span className="tabular-nums">{activeCount}</span>
            <IconPlayerStopFilled size={11} stroke={1.8} aria-hidden />
          </>
        ) : (
          <>
            <IconPlayerPlayFilled size={11} stroke={1.8} aria-hidden />
            {t('agentAutopilot.start', { defaultValue: 'Autopilot' })}
          </>
        )}
      </button>
      {stopping && (
        <span className="text-[10.5px] text-fg-muted">
          {t('agentAutopilot.stopping', { defaultValue: 'Stopping...' })}
        </span>
      )}
      {showTotals && (
        <span
          className="min-w-0 truncate font-mono text-[10.5px] tabular-nums text-fg-muted"
          title={t('agentAutopilot.totalsTitle', { defaultValue: 'Run totals (tokens, cost)' })}
        >
          {formatTokens(tokens)} tok · {formatCost(costUsd)}
        </span>
      )}
    </div>
  );
}
