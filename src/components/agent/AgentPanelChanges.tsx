/**
 * @file Agent panel: changes tab (t337)
 * @description The right panel's changes tab on the agent page: what this
 * conversation's agent is touching, live. Two sections: the files the
 * session changed during the current turn (the chat fold's `file_changed`
 * events) and the live before/after task diffs broadcast by the daemon while
 * a session pair is editing a task file (agentEdits), each rendered with the
 * same dependency-free line diff the editor overlays use.
 *
 * 📖 Both feeds are per conversation: touched files come from the session's
 * own fold, and diffs are filtered to the sessions currently editing each
 * task. Diffs are transient by design (the daemon prunes them); the touched
 * files list is the durable pointer.
 *
 * @functions
 *  → AgentPanelChanges: touched files + live task diffs for one conversation
 *
 * @exports AgentPanelChanges
 * @see src/components/agent/AgentPanelSpace.tsx: the tab registry host
 * @see src/lib/store/agentEditsSlice.ts: diffs state + computeLineDiff
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFileDiff } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { computeLineDiff } from '../../lib/store/agentEditsSlice';

interface AgentPanelChangesProps {
  /** Conversation the panel belongs to; null for a fresh draft, which shows
   * every live diff since there is no session to filter by. */
  sessionId: string | null;
}

export function AgentPanelChanges({ sessionId }: AgentPanelChangesProps) {
  const { t } = useTranslation();
  const changedFiles = useStore(s => (sessionId ? s.agentChat.live[sessionId]?.fold.changedFiles ?? [] : []));
  const diffs = useStore(s => s.agentEdits.diffs);
  const edits = useStore(s => s.agentEdits.edits);

  // 📖 Live diffs for this conversation: a task id qualifies when its current
  // editing session is the one on screen. A draft (no session) shows all
  // live diffs, they are a whole-board signal anyway.
  const sessionDiffIds = useMemo(
    () => Object.keys(diffs)
      .filter(taskId => (sessionId ? edits[taskId]?.sessionId === sessionId : true))
      .sort((a, b) => (diffs[a].at < diffs[b].at ? 1 : -1)),
    [diffs, edits, sessionId],
  );

  const empty = changedFiles.length === 0 && sessionDiffIds.length === 0;
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconFileDiff size={20} stroke={1.5} className="text-fg-faint" />
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          {t('agentChat.changesEmpty', 'Files this conversation touches will show up here.')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      {sessionDiffIds.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
            {t('agentChat.liveDiffs', 'Live task diffs')}
          </h3>
          {sessionDiffIds.map(taskId => (
            <DiffBlock key={taskId} taskId={taskId} />
          ))}
        </section>
      )}
      {changedFiles.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
            {t('agentChat.touchedFiles', 'Touched files')}
          </h3>
          {changedFiles.map(path => (
            <span
              key={path}
              className="truncate rounded-md bg-bg-2 px-2 py-1 font-mono text-[11px] text-fg-muted"
              title={path}
            >
              {path}
            </span>
          ))}
        </section>
      )}
    </div>
  );
}

/** 📖 One task's live diff, rendered with the exact same pure line diff the
 * editor overlays use (removed red, added green, context collapsed). */
function DiffBlock({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const diff = useStore(s => s.agentEdits.diffs[taskId]);
  const rows = useMemo(() => (diff ? computeLineDiff(diff.before, diff.after) : []), [diff]);
  if (!diff) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-1/60">
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <span className="flex-none font-mono text-[11px] font-semibold text-fg">{taskId}</span>
        <span className="min-w-0 truncate font-mono text-[10px] text-fg-faint" title={diff.path}>
          {diff.path}
        </span>
      </div>
      {diff.truncated && (
        <div className="border-b border-border/60 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          {t('agentEdits.truncatedNotice', 'This diff was truncated by the daemon; earlier lines are missing.')}
        </div>
      )}
      <div className="max-h-56 overflow-y-auto px-1 py-1 font-mono text-[10.5px] leading-[1.55]">
        {rows.map((row, index) => row.kind === 'collapsed' ? (
          <div key={`c${index}`} className="select-none px-2 py-0.5 text-center text-[9.5px] text-fg-faint">
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
            <span className="w-2 flex-none text-right text-fg-faint">
              {row.kind === 'removed' ? '-' : row.kind === 'added' ? '+' : ' '}
            </span>
            <span className="min-w-0 flex-1">{row.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
