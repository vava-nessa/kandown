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
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { Card } from './Card';
import { ListRow } from './ListRow';
import { CardStack } from './CardStack';
import { KbdButton } from './KbdButton';
import { groupTasksByTag, extractGroupKey } from '../lib/grouping';
import { getColumnIcon, COLUMN_BAR_MAP } from '../lib/columnUtils';
import { terminalStatus } from '../lib/dependencies';
import { ColumnHeaderActions } from './ColumnHeaderActions';
import type { BoardTask, SearchMatch, Column as ColumnType, ColumnColor } from '../lib/types';

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
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const createTask = useStore(s => s.createTask);
  const renameColumn = useStore(s => s.renameColumn);
  const deleteColumn = useStore(s => s.deleteColumn);
  const bulkArchiveTasks = useStore(s => s.bulkArchiveTasks);
  const bulkDeleteTasks = useStore(s => s.bulkDeleteTasks);
  const addColumn = useStore(s => s.addColumn);
  const density = useStore(s => s.density);
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const setTaskSelection = useStore(s => s.setTaskSelection);
  const toggleTaskSelection = useStore(s => s.toggleTaskSelection);

  const doneTags = useMemo(() => {
    const tagToTasks = new Map<string, BoardTask[]>();
    for (const col of useStore.getState().columns) {
      for (const t of col.tasks) {
        const key = extractGroupKey(t);
        if (key) {
          if (!tagToTasks.has(key)) tagToTasks.set(key, []);
          tagToTasks.get(key)!.push(t);
        }
      }
    }
    const result = new Set<string>();
    for (const [key, tasks] of tagToTasks) {
      if (tasks.every(t => t.checked)) result.add(key);
    }
    return result;
  }, []);

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

  // 📖 Flat, in-display-order list of every visible task id. Used by
  // shift-range selection: shift-clicking a row extends the selection to
  // cover every row between the clicked one and the last selected row.
  const flatVisibleIds = useMemo(
    () => filteredColumns.flatMap(({ filtered }) => filtered.map(t => t.id)),
    [filteredColumns],
  );

  const handleShiftSelect = (taskId: string) => {
    const ids = flatVisibleIds;
    const selected = selectedTaskIds ?? [];
    // 📖 Anchor = the most recently selected row that is still visible. If the
    // user shift-clicks with nothing selected yet, behave like a plain toggle.
    const lastSelected = [...selected].reverse().find(x => ids.includes(x));
    if (!lastSelected) {
      toggleTaskSelection(taskId);
      return;
    }
    const a = ids.indexOf(lastSelected);
    const b = ids.indexOf(taskId);
    if (a === -1 || b === -1) {
      toggleTaskSelection(taskId);
      return;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const range = ids.slice(lo, hi + 1);
    setTaskSelection(Array.from(new Set([...selected, ...range])));
  };

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
    <div className={`flex-1 min-h-0 overflow-y-auto ${isColumnReordering ? 'select-none' : ''}`}>
      <div className="w-full px-4 py-3 space-y-3">
        {(dueSummary.overdue.length > 0 || dueSummary.dueSoon.length > 0) && (
          <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs flex items-center gap-4">
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
            const colColorKey = config.board.columnColors?.[column.name.toLowerCase()] ?? 'gray';
            // 📖 Column color as a 3-4px accent bar on the section top, matching
            // the board view (see Column.tsx). No full-section tint.
            const colBar = COLUMN_BAR_MAP[colColorKey] ?? COLUMN_BAR_MAP.gray;
            const ColumnIcon = getColumnIcon(column.name);
            const isConfiguredColumn = config.board.columns.some(name => name.toLowerCase() === column.name.toLowerCase());
            const columnItems = groupTasksByTag(filtered);

            const handleColorChange = (color: ColumnColor) => {
              updateConfig(c => ({
                ...c,
                board: {
                  ...c.board,
                  columnColors: {
                    ...(c.board.columnColors ?? {}),
                    [column.name.toLowerCase()]: color,
                  },
                },
              }));
            };

            const handleRenameColumn = () => {
              const nextName = window.prompt(t('column.renamePrompt'), column.name)?.trim();
              if (!nextName || nextName === column.name) return;
              void renameColumn(column.name, nextName);
            };

            const handleDeleteColumn = () => {
              const message = t('column.deleteConfirm', { name: column.name, count: column.tasks.length });
              if (!window.confirm(message)) return;
              void deleteColumn(column.name);
            };

            const isTerminalColumn = column.name.toLowerCase() === terminalStatus(config).toLowerCase();
            const handleArchiveAll = () => {
              const taskIds = column.tasks.map(task => task.id);
              if (taskIds.length === 0) return;
              const message = t('column.archiveAllConfirm', {
                count: taskIds.length,
                column: column.name,
              });
              if (!window.confirm(message)) return;
              void bulkArchiveTasks(taskIds);
            };
            const handleDeleteAll = () => {
              const taskIds = column.tasks.map(task => task.id);
              if (taskIds.length === 0) return;
              const message = t('column.deleteAllConfirm', {
                count: taskIds.length,
                column: column.name,
              });
              if (!window.confirm(message)) return;
              void bulkDeleteTasks(taskIds);
            };

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
                <section
                  className={`group/section overflow-hidden rounded-lg border transition-[border-color,background-color,opacity] duration-150 ease-out ${
                    isTaskDropTarget
                      ? 'border-border-strong bg-bg-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                      : 'border-border/60'
                  } ${draggedColIndex === sectionIndex ? 'opacity-45 scale-[0.995]' : ''}`}
                  style={{ borderTop: `3px solid ${colBar}` }}
                >
                  <header className="flex items-center justify-between gap-2.5 border-b border-border/40 bg-bg-1/60 px-3 py-2">
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
                      <ColumnIcon aria-hidden="true" size={16} stroke={1.8} className="flex-none text-fg-muted" />
                      <div className="min-w-0">
                        <h2 className="truncate text-[13px] font-semibold tracking-tight text-fg">{column.name}</h2>
                        <p className="text-[11.5px] text-fg-muted">
                          {filtered.length}
                          {isFiltered && <span className="text-fg-faint">/{column.tasks.length}</span>} {t('header.tasks')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border bg-bg/80 px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                        #{sectionIndex + 1}
                      </span>
                      <ColumnHeaderActions
                        columnName={column.name}
                        taskCount={filtered.length}
                        bulkTaskCount={column.tasks.length}
                        isTerminalColumn={isTerminalColumn}
                        onArchiveAll={handleArchiveAll}
                        onDeleteAll={handleDeleteAll}
                        isConfiguredColumn={isConfiguredColumn}
                        currentColor={colColorKey}
                        onColorSelect={handleColorChange}
                        onCreateTask={() => createTask(column.name)}
                        onRenameColumn={handleRenameColumn}
                        onDeleteColumn={handleDeleteColumn}
                        onAddColumn={() => addColumn(column.name)}
                        className="opacity-0 group-hover/section:opacity-100 transition-opacity"
                      />
                    </div>
                  </header>

                  <div className="bg-bg/40">
                    <AnimatePresence mode="popLayout">
                      {columnItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                          <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.08] flex items-center justify-center mb-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted/50">
                              <path d="M9 11l3 3L22 4"/>
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                            </svg>
                          </div>
                          <p className="text-[12.5px] font-medium text-fg-muted/70">
                            {filters.search || filters.priority || filters.tag || filters.assignee || filters.ownerType
                              ? t('listView.noMatchingTasks')
                              : 'No tasks yet'}
                          </p>
                          <p className="text-[11.5px] text-fg-muted/50 mt-0.5">Drag tasks here to get started.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/30">
                          {columnItems.map(item =>
                            item.type === 'single' ? (
                              <ListRow
                                key={item.task.id}
                                task={item.task}
                                searchMatches={searchMatches.get(item.task.id) || []}
                                density={density}
                                columnName={column.name}
                                doneTags={doneTags}
                                onShiftSelect={handleShiftSelect}
                                onDragStart={(e) => handleTaskDragStart(e, item.task.id, column.name)}
                                onDragEnd={handleTaskDragEnd}
                              />
                            ) : (
                              <CardStack
                                key={`stack-${item.groupKey}`}
                                group={item}
                                searchMatches={searchMatches}
                                density={density}
                                columnName={column.name}
                                doneTags={doneTags}
                                viewMode="list"
                                onCardDragStart={(taskId, fromCol) => handleTaskDragStart({} as React.DragEvent, taskId, fromCol)}
                                onCardDragEnd={handleTaskDragEnd}
                                defaultExpanded={
                                  config.board.stackDefaultState === 'expanded' || !!filters.search
                                }
                              />
                            )
                          )}
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex-none px-3 py-1.5 border-t border-border/30 bg-bg-1/20">
                    <KbdButton
                      variant="ghost"
                      icon="Plus"
                      label={t('column.addTask')}
                      onClick={() => createTask(column.name)}
                      className="w-full justify-start px-2 py-1 h-auto text-[12px] text-fg-muted hover:text-fg rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    />
                  </div>
                </section>
                <SectionDropGuide side="bottom" active={canShowDropGuide(columns.length) && sectionIndex === columns.length - 1} />
              </div>
            );
          })}
        </AnimatePresence>

        {totalVisibleRows === 0 && columns.length === 0 && (
          <div className="py-20 text-center text-[13.5px] text-fg-muted">{t('listView.noMatchingTasks')}</div>
        )}
      </div>
    </div>
  );
}
