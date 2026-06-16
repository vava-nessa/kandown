/**
 * @file Archive view
 * @description Lists every archived task (frontmatter `archived: true`, files
 * living under .kandown/tasks/archive/) as a flat, read-only list with a
 * one-click "Restore" action. Shown when the user toggles the archive button
 * in the header, instead of the active board.
 *
 * 📖 Archived tasks are hidden from the board (see buildColumnsFromTasks) and
 * surface only here. Restoring a task moves its file back to tasks/ and drops
 * the flag via the store's unarchiveTask action.
 *
 * @functions
 *  → ArchiveView — scrollable list of archived tasks with restore + open
 *
 * @exports ArchiveView
 * @see src/lib/store.ts (archivedTasks, unarchiveTask)
 */

import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { useStore } from '../lib/store';

export function ArchiveView() {
  const { t } = useTranslation();
  const archivedTasks = useStore(s => s.archivedTasks);
  const unarchiveTask = useStore(s => s.unarchiveTask);
  const setShowArchives = useStore(s => s.setShowArchives);
  const openDrawer = useStore(s => s.openDrawer);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-[5vw] py-6">
      <div className="flex items-center justify-between mb-5 max-w-5xl w-full">
        <div className="flex items-center gap-2">
          <Icon.Archive size={18} className="text-fg-muted" />
          <h2 className="text-[18px] font-semibold tracking-tight">{t('header.archives')}</h2>
          <span className="text-[13px] text-fg-muted tabular-nums">{archivedTasks.length}</span>
        </div>
        <KbdButton
          variant="secondary"
          icon="ArrowLeft"
          label={t('header.backToBoard')}
          onClick={() => setShowArchives(false)}
        />
      </div>

      {archivedTasks.length === 0 ? (
        <div className="text-fg-muted text-[14px] italic px-2 py-8">
          {t('archive.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-w-3xl">
          {archivedTasks.map(task => (
            <div
              key={task.id}
              className="group flex items-center gap-3 px-3 py-2 rounded-[6px] hover:bg-bg-3/80 dark:hover:bg-bg-1/60 transition-colors"
            >
              <button
                onClick={() => {
                  setShowArchives(false);
                  void openDrawer(task.id);
                }}
                className="flex-1 text-left min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11.5px] text-fg-muted flex-shrink-0">
                    {task.id.toUpperCase()}
                  </span>
                  <span className="text-[14px] text-fg truncate">{task.title}</span>
                </div>
              </button>
              <KbdButton
                variant="ghost"
                icon="ArchiveRestore"
                label={t('drawer.restore')}
                onClick={() => void unarchiveTask(task.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
