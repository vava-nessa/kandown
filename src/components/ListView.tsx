/**
 * @file List view
 * @description Renders board columns as vertically stacked horizontal sections,
 * with dense task rows, filter/search previews, task drops between sections,
 * and vertical section reordering.
 *
 * 📖 List view uses the same store filters and search-match cache as board view,
 * so switching views does not lose search context.
 * 📖 In this orientation, board columns become horizontal list sections. The
 * same `reorderColumns` and `moveTask` store actions persist section order and
 * task status changes back to Kandown's markdown/config files.
 *
 * @functions
 *  → HighlightedText — highlights matched text in search preview rows
 *  → SectionDropGuide — horizontal insertion marker for section reordering
 *  → ListView — sectioned list representation of all filtered tasks
 *
 * @exports ListView
 * @see src/components/Board.tsx
 * @see src/lib/store.ts
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import type { BoardTask, SearchMatch, Column as ColumnType } from '../lib/types';

const priorityColors: Record<string, string> = {
  P1: '#e5484d',
  P2: '#e9a23b',
  P3: '#3e63dd',
  P4: '#6e6e6e',
};

interface FilteredColumn {
  column: ColumnType;
  filtered: BoardTask[];
}

interface DraggedTask {
  id: string;
  fromCol: string;
}

interface SectionDropGuideProps {
  side: 'top' | 'bottom';
  active: boolean;
}

function clampColumnDropIndex(index: number, columnCount: number): number {
  return Math.max(0, Math.min(columnCount, index));
}

function finalColumnIndexFromDropSlot(fromIndex: number, dropIndex: number): number | null {
  if (dropIndex === fromIndex || dropIndex === fromIndex + 1) return null;
  return dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
}

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

function SectionDropGuide({ side, active }: SectionDropGuideProps) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute left-3 right-3 z-30 flex h-0 items-center ${
        side === 'top' ? '-top-2' : '-bottom-2'
      }`}
    >
      <div className="relative h-[3px] w-full rounded-full bg-fg shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_0_22px_rgba(255,255,255,0.55)] dark:shadow-[0_0_0_4px_rgba(255,255,255,0.14),0_0_22px_rgba(255,255,255,0.38)]">
        <div className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-fg" />
        <div className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-fg" />
      </div>
    </div>
  );
}

export function ListView() {
  const { t } = useTranslation();
  const columns = useStore(s => s.columns);
  const filters = useStore(s => s.filters);
  const openDrawer = useStore(s => s.openDrawer);
  const moveTask = useStore(s => s.moveTask);
  const reorderColumns = useStore(s => s.reorderColumns);
  const searchMatches = useStore(s => s.searchMatches);
  const fields = useStore(s => s.config.fields);

  const [draggedTask, setDraggedTask] = useState<DraggedTask | null>(null);
  const [taskDropColumn, setTaskDropColumn] = useState<string | null>(null);
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const filteredColumns = useMemo<FilteredColumn[]>(() => {
    return columns.map(col => {
      const filtered = col.tasks.filter((task: BoardTask) => {
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const titleOrId = task.title.toLowerCase().includes(q) || task.id.toLowerCase().includes(q);
          const hasContentMatch = searchMatches.has(task.id);
          if (!titleOrId && !hasContentMatch) return false;
        }
        if (fields.priority && filters.priority && task.priority !== filters.priority) return false;
        if (fields.tags && filters.tag && !(task.tags || []).includes(filters.tag)) return false;
        if (fields.assignee && filters.assignee && task.assignee !== filters.assignee) return false;
        if (fields.ownerType && filters.ownerType && task.ownerType !== filters.ownerType) return false;
        return true;
      });
      return { column: col, filtered };
    });
  }, [columns, fields, filters, searchMatches]);

  const totalVisibleRows = useMemo(() => {
    return filteredColumns.reduce((sum, { filtered }) => sum + filtered.length, 0);
  }, [filteredColumns]);

  const listGridStyle = useMemo(() => ({
    gridTemplateColumns: [
      '78px',
      fields.priority ? '34px' : null,
      'minmax(220px, 1fr)',
      fields.tags ? 'minmax(100px, 140px)' : null,
      fields.assignee ? 'minmax(100px, 140px)' : null,
      '72px',
    ].filter(Boolean).join(' '),
  }), [fields.assignee, fields.priority, fields.tags]);

  const dueSummary = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    const overdue: BoardTask[] = [];
    const dueSoon: BoardTask[] = [];
    for (const { filtered } of filteredColumns) {
      for (const task of filtered) {
        const d = task.frontmatter.due as string | undefined;
        if (d) {
          if (d < now) overdue.push(task);
          else dueSoon.push(task);
        }
      }
    }
    return { overdue, dueSoon };
  }, [filteredColumns]);

  const isColumnReordering = draggedColIndex !== null;
  const canShowDropGuide = (index: number): boolean => isColumnReordering && dropTargetIndex === index;

  const getDropIndexFromPointer = (e: React.DragEvent, beforeIndex: number, afterIndex = beforeIndex + 1): number => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nextIndex = e.clientY < rect.top + rect.height / 2 ? beforeIndex : afterIndex;
    return clampColumnDropIndex(nextIndex, columns.length);
  };

  const commitColumnDrop = (dropIndex: number) => {
    if (draggedColIndex === null) return;
    const toIndex = finalColumnIndexFromDropSlot(draggedColIndex, dropIndex);
    if (toIndex !== null) {
      void reorderColumns(draggedColIndex, toIndex);
    }
    setDraggedColIndex(null);
    setDropTargetIndex(null);
  };

  const handleColumnDragStart = (e: React.DragEvent, index: number) => {
    setDraggedColIndex(index);
    setDropTargetIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-kandown-list-section-index', String(index));
    e.dataTransfer.setData('text/plain', columns[index]?.name ?? '');
  };

  const handleColumnDragEnd = () => {
    setDraggedColIndex(null);
    setDropTargetIndex(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, beforeIndex: number, afterIndex = beforeIndex + 1) => {
    if (draggedColIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(getDropIndexFromPointer(e, beforeIndex, afterIndex));
  };

  const handleColumnDrop = (e: React.DragEvent, beforeIndex: number, afterIndex = beforeIndex + 1) => {
    if (draggedColIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    commitColumnDrop(getDropIndexFromPointer(e, beforeIndex, afterIndex));
  };

  const handleTaskDragStart = (e: React.DragEvent, taskId: string, fromCol: string) => {
    setDraggedTask({ id: taskId, fromCol });
    setTaskDropColumn(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-kandown-task-id', taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
    setTaskDropColumn(null);
  };

  const handleTaskDragOver = (e: React.DragEvent, toCol: string) => {
    if (!draggedTask || draggedColIndex !== null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setTaskDropColumn(toCol);
  };

  const handleTaskDrop = (e: React.DragEvent, toCol: string) => {
    if (!draggedTask || draggedColIndex !== null) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggedTask.fromCol !== toCol) {
      void moveTask(draggedTask.id, draggedTask.fromCol, toCol);
    }
    setDraggedTask(null);
    setTaskDropColumn(null);
  };

  const handleSectionDragLeave = (e: React.DragEvent, columnName: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    if (taskDropColumn === columnName) setTaskDropColumn(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex-1 min-h-0 overflow-y-auto ${isColumnReordering ? 'select-none' : ''}`}
    >
      <div className="max-w-[1200px] mx-auto px-6 py-5 space-y-4">
        {(dueSummary.overdue.length > 0 || dueSummary.dueSoon.length > 0) && (
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs flex items-center gap-4">
            <span className="font-semibold text-amber-500">📅 Due Dates & Calendar:</span>
            {dueSummary.overdue.length > 0 && (
              <span className="text-red-400 font-medium">{dueSummary.overdue.length} Overdue</span>
            )}
            {dueSummary.dueSoon.length > 0 && (
              <span className="text-amber-300 font-medium">{dueSummary.dueSoon.length} Upcoming</span>
            )}
          </div>
        )}

        <AnimatePresence>
          {filteredColumns.map(({ column, filtered }, sectionIndex) => {
            const isTaskDropTarget = taskDropColumn === column.name;
            const isFiltered = filtered.length !== column.tasks.length;
            return (
              <div
                key={column.name}
                className="relative"
                onDragOver={(e) => {
                  handleColumnDragOver(e, sectionIndex);
                  handleTaskDragOver(e, column.name);
                }}
                onDrop={(e) => {
                  handleColumnDrop(e, sectionIndex);
                  handleTaskDrop(e, column.name);
                }}
                onDragLeave={(e) => handleSectionDragLeave(e, column.name)}
              >
                <SectionDropGuide side="top" active={canShowDropGuide(sectionIndex)} />
                <motion.section
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ delay: Math.min(sectionIndex * 0.025, 0.18), duration: 0.2 }}
                  className={`overflow-hidden rounded-xl border transition-[border-color,background-color,opacity,transform,box-shadow] duration-150 ${
                    isTaskDropTarget
                      ? 'border-border-strong bg-bg-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                      : 'border-border bg-bg/55'
                  } ${draggedColIndex === sectionIndex ? 'opacity-45 scale-[0.995]' : ''}`}
                >
                  <header className="flex items-center justify-between gap-3 border-b border-border bg-bg-1/70 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          handleColumnDragStart(e, sectionIndex);
                        }}
                        onDragEnd={(e) => {
                          e.stopPropagation();
                          handleColumnDragEnd();
                        }}
                        className={`cursor-grab rounded p-1 active:cursor-grabbing ${
                          draggedColIndex === sectionIndex
                            ? 'text-fg'
                            : 'text-fg-muted/70 hover:bg-bg-3 hover:text-fg'
                        }`}
                        title={t('column.reorderColumn')}
                      >
                        <svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="4" cy="3" r="1.5" fill="currentColor" />
                          <circle cx="10" cy="3" r="1.5" fill="currentColor" />
                          <circle cx="4" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="10" cy="8" r="1.5" fill="currentColor" />
                          <circle cx="4" cy="13" r="1.5" fill="currentColor" />
                          <circle cx="10" cy="13" r="1.5" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-[13px] font-semibold tracking-tight text-fg">{column.name}</h2>
                        <p className="text-[11.5px] text-fg-muted">
                          {filtered.length}
                          {isFiltered && <span className="text-fg-faint">/{column.tasks.length}</span>} {t('header.tasks')}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                      #{sectionIndex + 1}
                    </span>
                  </header>

                  <div
                    className="grid gap-3 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint"
                    style={listGridStyle}
                  >
                    <div>{t('listView.id')}</div>
                    {fields.priority && <div></div>}
                    <div>{t('listView.title')}</div>
                    {fields.tags && <div>{t('listView.tags')}</div>}
                    {fields.assignee && <div>{t('listView.assignee')}</div>}
                    <div>{t('listView.progress')}</div>
                  </div>

                  <div className="min-h-[44px]">
                    {filtered.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[13px] text-fg-muted">
                        {filters.search || filters.priority || filters.tag || filters.assignee || filters.ownerType
                          ? t('listView.noMatchingTasks')
                          : 'No tasks yet. Drag tasks here to get started.'}
                      </div>
                    ) : (
                      filtered.map((task, taskIndex) => {
                        const matches = filters.search ? (searchMatches.get(task.id) || []) : [];
                        const showPreview = matches.length > 0;
                        return (
                          <div key={task.id} className="border-b border-border/70 last:border-b-0">
                            <motion.button
                              layout
                              draggable
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ delay: Math.min(taskIndex * 0.01, 0.12), duration: 0.16 }}
                              onDragStartCapture={(e) => handleTaskDragStart(e, task.id, column.name)}
                              onDragEndCapture={handleTaskDragEnd}
                              onClick={() => openDrawer(task.id)}
                              className="group w-full grid gap-3 px-4 py-2.5 text-[13.5px] hover:bg-bg-1 transition-colors text-left items-center cursor-pointer"
                              style={listGridStyle}
                            >
                              <span className="flex items-center gap-2 font-mono text-[13px] font-bold text-fg-muted">
                                <span className="opacity-0 transition-opacity group-hover:opacity-40 cursor-grab">⋮⋮</span>
                                {task.id.replace(/^t/, '')}
                              </span>
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

                            {showPreview && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="px-4 pb-2 grid gap-3"
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
                      })
                    )}
                  </div>
                </motion.section>
                <SectionDropGuide side="bottom" active={canShowDropGuide(columns.length) && sectionIndex === columns.length - 1} />
              </div>
            );
          })}
        </AnimatePresence>

        {totalVisibleRows === 0 && columns.length === 0 && (
          <div className="py-20 text-center text-[13.5px] text-fg-muted">{t('listView.noMatchingTasks')}</div>
        )}
      </div>
    </motion.div>
  );
}
