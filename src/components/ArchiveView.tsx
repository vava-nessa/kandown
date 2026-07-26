/**
 * @file Archive view
 * @description Lists every archived task (frontmatter `archived: true`, files
 * living under `tasks/archive/` at the project root) as a flat list. Shown when
 * the user toggles the archive button in the header, instead of the active
 * board.
 *
 * 📖 Visual contract: the wrapper, section frame, header, body, and empty
 * state are byte-for-byte identical to a ListView column. The only intentional
 * differences are the icon (Archive instead of a column icon), no drag handle
 * on the column reorder, no `#N` section index badge, and a "Back to board"
 * button on the right where `ColumnHeaderActions` normally sits.
 *
 * 📖 Archived tasks are hidden from the board (see buildColumnsFromTasks) and
 * surface only here. Restoring a task moves its file back to tasks/ and drops
 * the flag via the store's unarchiveTask action.
 *
 * @functions
 *  → ArchiveView — scrollable list of archived tasks rendered with ListRow
 *
 * @exports ArchiveView
 * @see src/components/ListRow.tsx (renderer, mode="archive")
 * @see src/components/ListView.tsx (visual template this view mirrors)
 * @see src/lib/store.ts (archivedTasks, unarchiveTask)
 */

import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { ListRow } from './ListRow';
import { useStore } from '../lib/store';

export function ArchiveView() {
  const { t } = useTranslation();
  const archivedTasks = useStore(s => s.archivedTasks);
  const setShowArchives = useStore(s => s.setShowArchives);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full px-4 py-3 space-y-3">
        <section className="group/section overflow-hidden rounded-lg border border-border/60">
          <header className="flex items-center justify-between gap-2.5 border-b border-border/40 bg-bg-1/60 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon.Archive size={16} className="flex-none text-fg-muted" />
              <div className="min-w-0">
                <h2 className="truncate text-[13px] font-semibold tracking-tight text-fg">
                  {t('header.archives')}
                </h2>
                <p className="text-[11.5px] text-fg-muted">
                  {archivedTasks.length} {t('header.tasks')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <KbdButton
                variant="secondary"
                icon="ArrowLeft"
                label={t('header.backToBoard')}
                onClick={() => setShowArchives(false)}
              />
            </div>
          </header>

          <div className="bg-bg/40">
            {archivedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.08] flex items-center justify-center mb-2">
                  <Icon.Archive size={18} className="text-fg-muted/50" />
                </div>
                <p className="text-[12.5px] font-medium text-fg-muted/70">{t('archive.empty')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {archivedTasks.map(task => (
                  <ListRow
                    key={task.id}
                    task={task}
                    columnName="Archive"
                    mode="archive"
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}