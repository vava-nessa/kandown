/**
 * @file Board column component
 * @description Renders a single kanban column, accepts dropped cards, shows the
 * filtered task count, and creates new tasks directly in the column.
 *
 * 📖 Drag state is owned by `Board`; this component only translates browser
 * drag/drop events into the column-level callbacks that eventually update
 * the task files. Column reorder is intentionally started only from the handle
 * so card dragging and column sorting never fight for the same gesture.
 * 📖 Column header icons are mapped from normalized status names so default
 * boards get clear visual landmarks while custom columns still use a stable
 * fallback icon.
 *
 * @functions
 *  → Column: animated kanban column with task cards and empty state
 *  → getColumnIcon: resolves the Tabler icon for a column title
 *  → ColumnColorMenu: 3-dot dropdown for picking column accent color
 *
 * @exports Column
 * @see src/components/Board.tsx
 * @see src/components/Card.tsx
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { CardStack } from './CardStack';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { ColumnHeaderActions } from './ColumnHeaderActions';
import { getColumnIcon, getColumnColorStyles } from '../lib/columnUtils';
import { useStore } from '../lib/store';
import { groupTasksByTag, extractGroupKey } from '../lib/grouping';
import { terminalStatus } from '../lib/dependencies';
import type { Column as ColumnType, BoardTask, Density, SearchMatch, ColumnColor } from '../lib/types';

interface ColumnProps {
  column: ColumnType;
  filteredTasks: BoardTask[];
  searchMatches: Map<string, SearchMatch[]>;
  density: Density;
  isEmptyCompact?: boolean;
  draggedTaskId: string | null;
  draggedFromCol: string | null;
  draggedColIndex: number | null;
  onCardDragStart: (taskId: string, fromCol: string) => void;
  onCardDragEnd: () => void;
  onDrop: (toCol: string) => void;
  onColumnDragStart: (e: React.DragEvent, index: number) => void;
  onColumnDragEnd: (e: React.DragEvent) => void;
  columnIndex: number;
}

export function Column({
  column,
  filteredTasks,
  searchMatches,
  density,
  isEmptyCompact,
  draggedTaskId,
  draggedFromCol,
  draggedColIndex,
  onCardDragStart,
  onCardDragEnd,
  onDrop,
  onColumnDragStart,
  onColumnDragEnd,
  columnIndex,
}: ColumnProps) {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  const createTask = useStore(s => s.createTask);
  const addColumn = useStore(s => s.addColumn);
  const renameColumn = useStore(s => s.renameColumn);
  const deleteColumn = useStore(s => s.deleteColumn);
  const bulkArchiveTasks = useStore(s => s.bulkArchiveTasks);
  const bulkDeleteTasks = useStore(s => s.bulkDeleteTasks);
  const updateConfig = useStore(s => s.updateConfig);
  const config = useStore(s => s.config);
  const filters = useStore(s => s.filters);
  const isConfiguredColumn = config.board.columns.some(name => name.toLowerCase() === column.name.toLowerCase());

  // 📖 Group tasks by shared [bracket] or #hashtag title tags into collapsible stacks
  const columnItems = useMemo(() => groupTasksByTag(filteredTasks), [filteredTasks]);

  // 📖 Compute which group keys have ALL their tasks (across all columns) marked as done
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

  const colColorKey = config.board.columnColors?.[column.name.toLowerCase()] ?? 'gray';
  // 📖 Column styling: very light pastel in light mode and deep dark in dark mode.
  const colStyles = getColumnColorStyles(colColorKey);

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

  const handleDragOver = (e: React.DragEvent) => {
    if (!draggedTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (draggedTaskId && draggedFromCol !== column.name) {
      onDrop(column.name);
    }
  };

  const isFiltered = filteredTasks.length !== column.tasks.length;
  const ColumnIcon = getColumnIcon(column.name);

  const isEmptyCompactMode = isEmptyCompact && density === 'compact';

  if (isEmptyCompactMode) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onColumnDragStart(e, columnIndex);
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          onColumnDragEnd(e);
        }}
        className={`h-full w-full cursor-grab transition-opacity duration-200 ease-out active:cursor-grabbing ${
          draggedColIndex === columnIndex ? 'opacity-45' : ''
        }`}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-column={column.name}
          className="flex flex-col items-center justify-center w-full h-full min-h-0 px-1 rounded-lg border bg-[var(--col-bg-light)] dark:bg-[var(--col-bg-dark)] border-[var(--col-border-light)] dark:border-[var(--col-border-dark)] transition-[background-color,opacity] duration-200 ease-out"
          style={{
            opacity: isOver ? 0.8 : 1,
            '--col-bg-light': colStyles.lightBg,
            '--col-bg-dark': colStyles.darkBg,
            '--col-border-light': colStyles.lightBorder,
            '--col-border-dark': colStyles.darkBorder,
          } as React.CSSProperties}
        >
          <ColumnIcon aria-hidden="true" size={16} stroke={1.8} className="text-fg-muted mb-1 shrink-0" />
          <span className="text-[11px] font-medium text-fg-muted text-center leading-tight max-w-full">
            {column.name}
          </span>
        </div>
      </div>
    );
  }

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
    // 📖 Plain `<div>` (no Motion): column drop is HTML5-native, and the only
    // animated value (drag-tint background) is just a CSS transition on
    // background-color. Avoiding `motion.div layout` removes the 300ms spring
    // pop the user reported when columns rearrange.
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-column={column.name}
      className={`group/column flex flex-col flex-none w-[320px] h-full rounded-xl border
        bg-[var(--col-bg-light)] dark:bg-[var(--col-bg-dark)]
        border-[var(--col-border-light)] dark:border-[var(--col-border-dark)]
        transition-[background-color,opacity,box-shadow,border-color] duration-200 ease-out
        ${draggedColIndex === columnIndex ? 'opacity-45 shadow-sm' : ''}
        ${isOver ? 'ring-2 ring-primary/40' : ''}`}
      style={{
        '--col-bg-light': colStyles.lightBg,
        '--col-bg-dark': colStyles.darkBg,
        '--col-border-light': colStyles.lightBorder,
        '--col-border-dark': colStyles.darkBorder,
      } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              onColumnDragStart(e, columnIndex);
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              onColumnDragEnd(e);
            }}
            className={`cursor-grab active:cursor-grabbing p-1 rounded transition-colors ${
              draggedColIndex === columnIndex
                ? 'opacity-100 text-fg'  
                : 'opacity-50 text-fg-muted hover:opacity-80 group-hover/column:opacity-70 hover:bg-black/[0.08] active:bg-black/[0.12]'
            }`}
            title={t('column.reorderColumn')}
            style={{ flexShrink: 0 }}
          >
            {/* 6-dot gripper icon (3 columns x 2 rows) */}
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="3" cy="2" r="1.5" fill="currentColor"/>
              <circle cx="11" cy="2" r="1.5" fill="currentColor"/>
              <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
              <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
              <circle cx="3" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="11" cy="5" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <ColumnIcon
            aria-hidden="true"
            size={14}
            stroke={1.8}
            className="flex-none text-fg-muted"
          />
          <span className="text-[12.5px] font-semibold tracking-tight text-fg">{column.name}</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 text-[10.5px] font-medium text-fg-muted rounded-md tabular-nums">
            {filteredTasks.length}
            {isFiltered && <span className="text-fg-faint">/{column.tasks.length}</span>}
          </span>
        </div>
        <ColumnHeaderActions
          columnName={column.name}
          taskCount={filteredTasks.length}
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
          className="opacity-0 group-hover/column:opacity-100 transition-opacity"
        />
      </div>

      <div
        className="flex-1 min-h-0 px-2.5 scrollbar-always"
        style={{ overflowY: 'scroll' }}
      >
        {/* 📖 Cards float as distinct chips with vertical spacing.
            Padding is on the Card itself. */}
        <div className="flex flex-col pt-1">
          <AnimatePresence mode="popLayout">
            {columnItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.08] flex items-center justify-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted/50">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-fg-muted/70">No tasks yet</p>
                <p className="text-[12px] text-fg-muted/50 mt-0.5">Drag tasks here to get started.</p>
              </div>
            ) : (
              columnItems.map(item =>
                item.type === 'single' ? (
                  <Card
                    key={item.task.id}
                    task={item.task}
                    searchMatches={searchMatches.get(item.task.id) || []}
                    density={density}
                    columnName={column.name}
                    doneTags={doneTags}
                    onDragStart={() => onCardDragStart(item.task.id, column.name)}
                    onDragEnd={onCardDragEnd}
                  />
                ) : (
                  <CardStack
                    key={`stack-${item.groupKey}`}
                    group={item}
                    searchMatches={searchMatches}
                    density={density}
                    columnName={column.name}
                    doneTags={doneTags}
                    onCardDragStart={onCardDragStart}
                    onCardDragEnd={onCardDragEnd}
                    defaultExpanded={
                      config.board.stackDefaultState === 'expanded' || !!filters.search
                    }
                  />
                )
              )
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-none px-2.5 pb-2.5 pt-1">
        <KbdButton
          variant="ghost"
          icon="Plus"
          label={t('column.addTask')}
          onClick={() => createTask(column.name)}
          className="w-full justify-start px-2.5 py-1.5 h-auto text-[12.5px] text-fg-muted hover:text-fg rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        />
      </div>
    </div>
  );
}
