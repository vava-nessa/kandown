/**
 * @file Board view
 * @description Renders the horizontal kanban board, filters tasks per column,
 * wires drag-and-drop state, and forwards content-search matches to cards.
 *
 * 📖 The board receives normalized columns from the store. It only decides what
 * should be visible for the current filters; actual markdown writes happen in
 * `moveTask` inside the store.
 * 📖 Metadata filters are ignored when their project field is disabled, so
 * hidden controls cannot leave invisible filtering behind.
 *
 * @functions
 *  → Board — animated board surface with draggable columns/cards
 *
 * @exports Board
 * @see src/components/Column.tsx
 * @see src/lib/store.ts
 */

import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Column } from './Column';
import { useStore } from '../lib/store';
import type { BoardTask, SearchMatch, Column as ColumnType } from '../lib/types';

type ColumnGroup =
  | {
      type: 'normal';
      column: ColumnType;
      filtered: BoardTask[];
      columnIndex: number;
    }
  | {
      type: 'compact-single';
      column: ColumnType;
      filtered: BoardTask[];
      columnIndex: number;
    }
  | {
      type: 'compact-stack';
      columns: { column: ColumnType; filtered: BoardTask[]; columnIndex: number }[];
    };

const EMPTY_MAP = new Map<string, SearchMatch[]>();

export function Board() {
  const { t } = useTranslation();
  const columns = useStore(s => s.columns);
  const density = useStore(s => s.density);
  const filters = useStore(s => s.filters);
  const moveTask = useStore(s => s.moveTask);
  const addColumn = useStore(s => s.addColumn);
  const reorderColumns = useStore(s => s.reorderColumns);
  const searchMatches = useStore(s => s.searchMatches);
  const config = useStore(s => s.config);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedFromCol, setDraggedFromCol] = useState<string | null>(null);
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const filteredColumns = useMemo(() => {
    return columns.map(col => {
      const filtered = col.tasks.filter((t: BoardTask) => {
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const titleOrId = t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
          const hasContentMatch = searchMatches.has(t.id);
          if (!titleOrId && !hasContentMatch) return false;
        }
        if (config.fields.priority && filters.priority && t.priority !== filters.priority) return false;
        if (config.fields.tags && filters.tag && !(t.tags || []).includes(filters.tag)) return false;
        if (config.fields.assignee && filters.assignee && t.assignee !== filters.assignee) return false;
        if (config.fields.ownerType && filters.ownerType && t.ownerType !== filters.ownerType) return false;
        return true;
      });
      return { column: col, filtered };
    });
  }, [columns, config.fields, filters, searchMatches]);

  const columnGroups = useMemo((): ColumnGroup[] => {
    if (density !== 'compact') {
      const result: (typeof columnGroups)[number][] = filteredColumns.map((fc, idx) => ({
        type: 'normal',
        column: fc.column,
        filtered: fc.filtered,
        columnIndex: idx,
      }));
      return result;
    }

    const groups: ColumnGroup[] = [];
    let i = 0;
    while (i < filteredColumns.length) {
      const fc = filteredColumns[i];

      if (fc.column.tasks.length > 0) {
        groups.push({ type: 'normal', column: fc.column, filtered: fc.filtered, columnIndex: i });
        i++;
        continue;
      }

      const run: { column: ColumnType; filtered: BoardTask[]; columnIndex: number }[] = [];
      while (i < filteredColumns.length && filteredColumns[i].column.tasks.length === 0) {
        run.push({ column: filteredColumns[i].column, filtered: filteredColumns[i].filtered, columnIndex: i });
        i++;
      }

      if (run.length === 1) {
        groups.push({ type: 'compact-single', column: run[0].column, filtered: run[0].filtered, columnIndex: run[0].columnIndex });
      } else {
        groups.push({ type: 'compact-stack', columns: run });
      }
    }

    return groups;
  }, [filteredColumns, density]);

  const handleCardDragStart = (taskId: string, fromCol: string) => {
    setDraggedTaskId(taskId);
    setDraggedFromCol(fromCol);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDraggedFromCol(null);
  };

  const handleDrop = (toCol: string) => {
    if (draggedTaskId && draggedFromCol) {
      moveTask(draggedTaskId, draggedFromCol, toCol);
    }
    setDraggedTaskId(null);
    setDraggedFromCol(null);
  };

  const handleCreateColumn = () => {
    const name = window.prompt(t('column.createPrompt'))?.trim();
    if (!name) return;
    void addColumn(name);
  };

  const searchMatchesMap = filters.search ? searchMatches : EMPTY_MAP;

  const handleColumnDragStart = (e: React.DragEvent, index: number) => {
    setDraggedColIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Semi-transparent ghost so drag is visible
    (e.target as HTMLElement).style.opacity = '0.4';
  };

  const handleColumnDragEnd = (e: React.DragEvent) => {
    setDraggedColIndex(null);
    setDropTargetIndex(null);
    (e.target as HTMLElement).style.opacity = '1';
  };

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedColIndex !== null && draggedColIndex !== toIndex) {
      void reorderColumns(draggedColIndex, toIndex);
    }
    setDraggedColIndex(null);
  };

  const sharedColumnProps = {
    searchMatches: searchMatchesMap,
    density,
    draggedTaskId,
    draggedFromCol,
    draggedColIndex,
    onCardDragStart: handleCardDragStart,
    onCardDragEnd: handleDragEnd,
    onDrop: handleDrop,
    onColumnDragStart: handleColumnDragStart,
    onColumnDragEnd: handleColumnDragEnd,
  };

  const animProps = (i: number) => ({
    initial: { opacity: 0, y: 12 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { delay: i * 0.04, duration: 0.35, ease: [0.32, 0.72, 0.35, 1] } as const,
  });

  const columnBorder = 'rounded-xl border border-border overflow-hidden';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={`flex-1 min-h-0 flex gap-5 p-5 pb-6 overflow-x-auto overflow-y-hidden relative ${config.ui.background === 'solid' ? 'board-bg' : ''}`}
    >
      {columnGroups.map((group, i) => {
        if (group.type === 'normal') {
          return (
            <div
              key={group.column.name}
              draggable
              onDragStart={(e) => handleColumnDragStart(e, group.columnIndex)}
              onDragEnd={handleColumnDragEnd}
              onDragOver={handleColumnDragOver}
              onDrop={(e) => handleColumnDrop(e, group.columnIndex)}
            >
              <motion.div {...animProps(i)} className="h-full">
                <Column column={group.column} filteredTasks={group.filtered} {...sharedColumnProps} columnIndex={group.columnIndex} />
              </motion.div>
            </div>
          );
        }

        if (group.type === 'compact-single') {
          return (
            <div
              key={group.column.name}
              draggable
              onDragStart={(e) => handleColumnDragStart(e, group.columnIndex)}
              onDragEnd={handleColumnDragEnd}
              onDragOver={handleColumnDragOver}
              onDrop={(e) => handleColumnDrop(e, group.columnIndex)}
            >
              <motion.div {...animProps(i)} className="h-full w-[100px]">
                <Column column={group.column} filteredTasks={group.filtered} {...sharedColumnProps} isEmptyCompact columnIndex={group.columnIndex} />
              </motion.div>
            </div>
          );
        }

        // 📖 compact-stack: draggable as a whole block, each slot has its own columnIndex
        const stackKey = `compact-stack-${group.columns.map(c => c.column.name).join('|')}`;
        return (
          <div
            key={stackKey}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, group.columns[0].columnIndex)}
            onDragEnd={handleColumnDragEnd}
            onDragOver={handleColumnDragOver}
            onDrop={(e) => {
              handleColumnDragEnd(e);
              handleColumnDrop(e, group.columns[0].columnIndex);
            }}
          >
            <motion.div {...animProps(i)} className="h-full">
              <div className={`flex flex-col h-full w-[100px] ${columnBorder}`}>
                {group.columns.map(({ column, filtered, columnIndex }, idx) => (
                  <div
                    key={column.name}
                    className={`flex-1 min-h-0 ${idx < group.columns.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <Column
                      column={column}
                      filteredTasks={filtered}
                      {...sharedColumnProps}
                      isEmptyCompact
                      columnIndex={columnIndex}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleCreateColumn}
        className="flex h-[120px] w-[220px] flex-none items-center justify-center rounded-[8px] border border-dashed border-border bg-bg/45 px-4 text-[13px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:bg-bg-2 hover:text-fg"
      >
        {t('column.createColumn')}
      </button>
    </motion.div>
  );
}
