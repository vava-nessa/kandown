/**
 * @file Live agent diff panel (t309)
 * @description Renders the latest `task_diff` snapshot for a task as a
 * readable, dependency-free line diff: removed lines tinted red, added lines
 * green, unchanged context collapsed to a couple of lines around the change.
 * Mounted by BOTH editor shells (TaskWorkspace on desktop, Drawer on mobile)
 * while an agent session is editing the open task; refresh-free, the panel
 * re-renders as each board SSE diff event lands.
 *
 * 📖 The diff algorithm itself (LCS-free prefix/suffix strip + collapsed
 * context) lives in the agentEdits slice as a pure function so it is unit
 * tested: see {@link computeLineDiff} in src/lib/store/agentEditsSlice.ts.
 *
 * 📖 Self-hiding: renders null while the task has no diff yet (the agent just
 * connected or has not written) so hosts can mount it unconditionally.
 *
 * @functions
 *  → DiffOverlay: live diff panel for one task id
 *
 * @exports DiffOverlay
 * @see src/lib/store/agentEditsSlice.ts: the diffs state + computeLineDiff
 * @see src/components/TaskWorkspace.tsx, src/components/Drawer.tsx: mounts
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../lib/store';
import { computeLineDiff } from '../../lib/store/agentEditsSlice';

interface DiffOverlayProps {
  /** Task id whose latest diff (agentEdits.diffs) is rendered. */
  taskId: string;
  className?: string;
}

export function DiffOverlay({ taskId, className = '' }: DiffOverlayProps) {
  const { t } = useTranslation();
  const diff = useStore(s => s.agentEdits.diffs[taskId]);
  const rows = useMemo(() => (diff ? computeLineDiff(diff.before, diff.after) : []), [diff]);

  if (!diff) return null;
  const hasChanges = rows.some(row => row.kind === 'removed' || row.kind === 'added');

  return (
    <section
      aria-label={t('agentEdits.liveDiffTitle', 'Live diff')}
      className={`overflow-hidden rounded-xl border border-border bg-bg-1/70 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="flex-none text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          {t('agentEdits.liveDiffTitle', 'Live diff')}
        </span>
        <span className="min-w-0 truncate font-mono text-[10.5px] text-fg-faint" title={diff.path}>
          {diff.path}
        </span>
      </div>
      {diff.truncated && (
        <div className="border-b border-border/60 bg-amber-500/10 px-3 py-1 text-[10.5px] font-medium text-amber-700 dark:text-amber-300">
          {t('agentEdits.truncatedNotice', 'This diff was truncated by the daemon; earlier lines are missing.')}
        </div>
      )}
      <div className="max-h-64 overflow-y-auto px-1 py-1 font-mono text-[11px] leading-[1.55]">
        {!hasChanges ? (
          <div className="px-2 py-1 text-fg-faint">
            {t('agentEdits.noChanges', 'Agent connected: no file changes yet.')}
          </div>
        ) : (
          rows.map((row, index) => row.kind === 'collapsed' ? (
            <div key={`c${index}`} className="select-none px-2 py-0.5 text-center text-[10px] text-fg-faint">
              {row.text}
            </div>
          ) : (
            <div
              key={`r${index}`}
              className={`flex min-w-0 gap-2 whitespace-pre-wrap break-words rounded px-2 py-px ${
                row.kind === 'removed'
                  ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                  : row.kind === 'added'
                    ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'text-fg-dim'
              }`}
            >
              <span aria-hidden="true" className="w-3 flex-none select-none text-right opacity-60">
                {row.kind === 'removed' ? '-' : row.kind === 'added' ? '+' : ' '}
              </span>
              <span className="min-w-0 flex-1">{row.text === '' ? ' ' : row.text}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
