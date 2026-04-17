/**
 * @file List view
 * @description Renders tasks in a dense table-like view with metadata columns,
 * active filters, content-search previews, and drawer navigation.
 *
 * 📖 List view uses the same store filters and search-match cache as board view,
 * so switching views does not lose search context.
 *
 * @functions
 *  → HighlightedText — highlights matched text in search preview rows
 *  → ListView — animated list/table representation of all filtered tasks
 *
 * @exports ListView
 * @see src/components/Board.tsx
 * @see src/lib/store.ts
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import type { BoardTask, SearchMatch } from '../lib/types';

const priorityColors: Record<string, string> = {
  P1: '#e5484d',
  P2: '#e9a23b',
  P3: '#3e63dd',
  P4: '#6e6e6e',
};

function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200/60 text-fg rounded px-0.5 font-semibold">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function ListView() {
  const { t } = useTranslation();
  const columns = useStore(s => s.columns);
  const filters = useStore(s => s.filters);
  const openDrawer = useStore(s => s.openDrawer);
  const searchMatches = useStore(s => s.searchMatches);
  const fields = useStore(s => s.config.fields);

  const rows = useMemo(() => {
    const result: Array<{ task: BoardTask; column: string }> = [];
    for (const col of columns) {
      for (const t of col.tasks) {
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const titleOrId = t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
          const hasContentMatch = searchMatches.has(t.id);
          if (!titleOrId && !hasContentMatch) continue;
        }
        if (fields.priority && filters.priority && t.priority !== filters.priority) continue;
        if (fields.tags && filters.tag && !(t.tags || []).includes(filters.tag)) continue;
        if (fields.assignee && filters.assignee && t.assignee !== filters.assignee) continue;
        if (fields.ownerType && filters.ownerType && t.ownerType !== filters.ownerType) continue;
        result.push({ task: t, column: col.name });
      }
    }
    return result;
  }, [columns, fields, filters, searchMatches]);

  const listGridClass = [
    '80px',
    fields.priority ? '40px' : null,
    '1fr',
    '140px',
    fields.tags ? '120px' : null,
    fields.assignee ? '120px' : null,
    '80px',
  ].filter(Boolean).join('_');
  const listGridStyle = {
    gridTemplateColumns: listGridClass.replaceAll('_', ' '),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto"
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header row */}
        <div className="grid grid-cols-[80px_40px_1fr_140px_120px_120px_80px] gap-3 px-6 py-2 text-[11.5px] font-semibold uppercase tracking-wider text-fg-faint border-b border-border sticky top-0 bg-bg z-10">
          <div>{t('listView.id')}</div>
          <div></div>
          <div>{t('listView.title')}</div>
          <div>{t('listView.status')}</div>
          <div>{t('listView.tags')}</div>
          <div>{t('listView.assignee')}</div>
          <div>{t('listView.progress')}</div>
        </div>

        <AnimatePresence>
          {rows.map(({ task, column }, i) => {
            const matches = filters.search ? (searchMatches.get(task.id) || []) : [];
            const showPreview = matches.length > 0;
            return (
              <div key={task.id}>
                <motion.button
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.012, 0.2), duration: 0.2 }}
                  onClick={() => openDrawer(task.id)}
                  className="w-full grid gap-3 px-6 py-2.5 text-[13.5px] border-b border-border hover:bg-bg-1 transition-colors text-left items-center"
                  style={listGridStyle}
                >
                  <span className="font-mono text-[11.5px] text-fg-muted">{task.id.toUpperCase()}</span>
                  {fields.priority && (
                    <span className="flex items-center gap-1.5">
                      {task.priority && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: priorityColors[task.priority] }}
                          title={task.priority}
                        />
                      )}
                    </span>
                  )}
                  <span className={`truncate ${task.checked ? 'line-through text-fg-muted' : 'text-fg'}`}>
                    {task.title}
                  </span>
                  <span className="text-fg-dim text-[12.5px]">{column}</span>
                  {fields.tags && (
                    <span className="flex flex-wrap gap-1">
                      {task.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="text-[11.5px] px-1.5 py-0.5 rounded-[3px] bg-bg-2 border border-border text-fg-dim">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                  {fields.assignee && (
                    <span className="text-[12.5px] text-fg-dim">
                      {task.assignee ? `@${task.assignee}` : ''}
                    </span>
                  )}
                  <span className="text-[12px] font-mono text-fg-muted tabular-nums">
                    {task.progress ? `${task.progress.done}/${task.progress.total}` : ''}
                  </span>
                </motion.button>
                {/* Search preview */}
                {showPreview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-6 pb-2 grid gap-3"
                    style={listGridStyle}
                  >
                    <div className={`${fields.priority ? 'col-start-3' : 'col-start-2'} flex flex-col gap-1`}>
                      {matches.slice(0, 2).map((match: SearchMatch, idx: number) => (
                        <div key={idx} className="text-[12px] text-fg-dim bg-bg rounded px-2 py-1 border border-border">
                          <span className="text-[10.5px] font-medium text-fg-muted uppercase tracking-wide mr-1.5">
                            {t(`sectionLabels.${match.section}`) || match.section}
                          </span>
                          <HighlightedText text={match.snippet} keyword={match.keyword} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </AnimatePresence>

        {rows.length === 0 && (
          <div className="py-20 text-center text-[13.5px] text-fg-muted">{t('listView.noMatchingTasks')}</div>
        )}
      </div>
    </motion.div>
  );
}
