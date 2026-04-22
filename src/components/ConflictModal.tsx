/**
 * @file Conflict resolution modal
 * @description Shown when drawer has unsaved changes AND the underlying
 * task file was modified externally with conflicting changes.
 *
 * 📖 User has three choices:
 * - Reload: discard local changes, accept remote version from disk
 * - Overwrite: discard remote changes, force local version to disk
 * - Cancel: keep editing (modal closes but conflict state remains for next change)
 *
 * @functions
 *  → ConflictModal — conflict resolution dialog
 *  → ConflictDiff — side-by-side diff view of local vs remote
 *
 * @exports ConflictModal
 * @see src/lib/store.ts (resolveConflict action)
 */

import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { useStore } from '../lib/store';
import type { ConflictState } from '../lib/store';
import { Button } from './ui/button';

export function ConflictModal() {
  const { t } = useTranslation();
  const conflictState = useStore(s => s.conflictState);
  const showConflictModal = useStore(s => s.showConflictModal);
  const resolveConflict = useStore(s => s.resolveConflict);

  return (
    <AnimatePresence>
      {showConflictModal && conflictState && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[4px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0 }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-[10vh] pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-border bg-bg shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 rounded-t-2xl">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold text-fg">{t('conflict.detected')}</h2>
                  <p className="text-[12.5px] text-fg-muted">
                    {t('conflict.detectedDesc')}
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-[13.5px] text-fg" dangerouslySetInnerHTML={{ __html: t('conflict.conflictingChanges', { taskId: conflictState.taskId.toUpperCase() }) }} />

                <div className="grid grid-cols-2 gap-3">
                  <ConflictVersion
                    label={t('conflict.yourVersion')}
                    frontmatter={conflictState.local.frontmatter}
                    body={conflictState.local.body}
                    subtasks={conflictState.local.subtasks}
                  />
                  <ConflictVersion
                    label={t('conflict.diskVersion')}
                    frontmatter={conflictState.remote.frontmatter}
                    body={conflictState.remote.body}
                    subtasks={conflictState.remote.subtasks}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 rounded-b-2xl">
                <Button
                  variant="outline"
                  onClick={() => resolveConflict('cancel')}
                >
                  {t('conflict.cancel')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => resolveConflict('reload')}
                >
                  {t('conflict.reloadFromDisk')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => resolveConflict('overwrite')}
                >
                  {t('conflict.keepMyVersion')}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ConflictVersion({
  label,
  frontmatter,
  body,
  subtasks,
}: {
  label: string;
  frontmatter: ConflictState['local']['frontmatter'];
  body: string;
  subtasks: ConflictState['local']['subtasks'];
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      <div className="bg-bg-2 border-b border-border px-3 py-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      </div>
      <div className="p-3 space-y-2 text-[12.5px]">
        <div>
          <span className="text-fg-muted">{t('conflict.title')}:</span>{' '}
          <span className="font-medium text-fg">{(frontmatter.title as string) || t('conflict.none')}</span>
        </div>
        {frontmatter.priority && (
          <div>
            <span className="text-fg-muted">{t('conflict.priority')}:</span>{' '}
            <span className="font-medium text-fg">{frontmatter.priority}</span>
          </div>
        )}
        {frontmatter.assignee && (
          <div>
            <span className="text-fg-muted">{t('drawer.assignee')}:</span>{' '}
            <span className="font-medium text-fg">{frontmatter.assignee}</span>
          </div>
        )}
        {Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0 && (
          <div>
            <span className="text-fg-muted">{t('conflict.tags') || 'Tags'}:</span>{' '}
            <span className="font-medium text-fg">{frontmatter.tags.join(', ')}</span>
          </div>
        )}
        <div>
          <span className="text-fg-muted">{t('conflict.body')}:</span>{' '}
          <span className="text-fg line-clamp-2">{body.slice(0, 60)}{body.length > 60 ? '...' : ''}</span>
        </div>
        <div>
          <span className="text-fg-muted">{t('conflict.subtasks')}:</span>{' '}
          <span className="font-medium text-fg">
            {subtasks.filter(s => s.done).length}/{subtasks.length} {t('drawer.doneSubtasks')}
          </span>
        </div>
      </div>
    </div>
  );
}
