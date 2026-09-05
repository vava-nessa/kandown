/**
 * @file Board view
 * @description Renders the horizontal kanban board, filters tasks per column,
 * wires drag-and-drop state, and forwards content-search matches to cards.
 * Column reordering uses insertion-slot drag state so the UI can show an exact
 * drop line between columns instead of making users guess the target card.
 *
 * 📖 The board receives normalized columns from the store. It only decides what
 * should be visible for the current filters; actual markdown writes happen in
 * `moveTask` inside the store.
 * 📖 Metadata filters are ignored when their project field is disabled, so
 * hidden controls cannot leave invisible filtering behind.
 * 📖 Column reorder drag is intentionally slot-based: the pointer chooses an
 * insertion index from 0..columns.length, then the store receives the final
 * array index after accounting for the dragged column being removed first.
 *
 * @functions
 *  → Board — animated board surface with draggable columns/cards
 *  → ColumnDropGuide — vertical insertion marker shown while reordering columns
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

interface ColumnDropGuideProps {
  side: 'left' | 'right';
  active: boolean;
}

const EMPTY_MAP = new Map<string, SearchMatch[]>();

function clampColumnDropIndex(index: number, columnCount: number): number {
  return Math.max(0, Math.min(columnCount, index));
}

function finalColumnIndexFromDropSlot(fromIndex: number, dropIndex: number): number | null {
  if (dropIndex === fromIndex || dropIndex === fromIndex + 1) return null;
  return dropIndex > fromIndex ? dropIndex - 1 : dropIndex;
}

function ColumnDropGuide({ side, active }: ColumnDropGuideProps) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-2 bottom-2 z-30 flex w-0 items-stretch justify-center ${
        side === 'left' ? '-left-2.5' : '-right-2.5'
      }`}
    >
      <div className="relative w-[3px] rounded-full bg-fg shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_0_22px_rgba(255,255,255,0.55)] dark:shadow-[0_0_0_4px_rgba(255,255,255,0.14),0_0_22px_rgba(255,255,255,0.38)]">
        <div className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-fg" />
        <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-fg" />
      </div>
    </div>
  );
}

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

  // 📖 Multi-select category filter, case-folded once for the whole board
  // pass. Empty selection filters nothing.
  const selectedCategoryKeys = useMemo(
    () => new Set(filters.category.map(c => c.trim().toLowerCase())),
    [filters.category],
  );

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
        // 📖 Category filter (header dropdown): a task passes when its
        // canonical category matches ANY selected category.
        if (selectedCategoryKeys.size > 0 && !selectedCategoryKeys.has((t.category ?? '').trim().toLowerCase())) return false;
        return true;
      });
      return { column: col, filtered };
    });
  }, [columns, config.fields, filters, searchMatches, selectedCategoryKeys]);

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
    setDropTargetIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-kandown-column-index', String(index));
    e.dataTransfer.setData('text/plain', columns[index]?.name ?? '');

    const dragFrame = (e.currentTarget as HTMLElement).closest('[data-column-frame]') as HTMLElement | null;
    if (dragFrame) {
      e.dataTransfer.setDragImage(dragFrame, 24, 24);
    }
  };

  const handleColumnDragEnd = () => {
    setDraggedColIndex(null);
    setDropTargetIndex(null);
  };

  const getDropIndexFromPointer = (e: React.DragEvent, beforeIndex: number, afterIndex = beforeIndex + 1): number => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nextIndex = e.clientX < rect.left + rect.width / 2 ? beforeIndex : afterIndex;
    return clampColumnDropIndex(nextIndex, columns.length);
  };

  const getDropIndexFromBoardPointer = (e: React.DragEvent): number | null => {
    const board = e.currentTarget as HTMLElement;
    const frames = Array.from(board.querySelectorAll<HTMLElement>('[data-column-frame]'));
    const slots = frames.flatMap(frame => {
      const rect = frame.getBoundingClientRect();
      return [
        { index: Number(frame.dataset.dropBefore), x: rect.left },
        { index: Number(frame.dataset.dropAfter), x: rect.right },
      ];
    }).filter((slot): slot is { index: number; x: number } => Number.isFinite(slot.index));

    if (slots.length === 0) return null;
    const nearest = slots.reduce((best, slot) => (
      Math.abs(slot.x - e.clientX) < Math.abs(best.x - e.clientX) ? slot : best
    ));
    return clampColumnDropIndex(nearest.index, columns.length);
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

  const handleBoardColumnDragOver = (e: React.DragEvent) => {
    if (draggedColIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const nextDropIndex = getDropIndexFromBoardPointer(e);
    if (nextDropIndex !== null) setDropTargetIndex(nextDropIndex);
  };

  const handleBoardColumnDrop = (e: React.DragEvent) => {
    if (draggedColIndex === null) return;
    e.preventDefault();
    const nextDropIndex = getDropIndexFromBoardPointer(e) ?? dropTargetIndex;
    if (nextDropIndex !== null) commitColumnDrop(nextDropIndex);
  };

  const handleBoardDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    setDropTargetIndex(null);
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
  const isColumnReordering = draggedColIndex !== null;
  const canShowDropGuide = (index: number): boolean => isColumnReordering && dropTargetIndex === index;

  return (
    <div
      onDragOver={handleBoardColumnDragOver}
      onDrop={handleBoardColumnDrop}
      onDragLeave={handleBoardDragLeave}
      className={`flex-1 min-h-0 flex gap-5 p-5 pb-6 overflow-x-auto overflow-y-hidden relative ${config.ui.background === 'solid' ? 'board-bg' : ''} ${
        isColumnReordering ? 'select-none' : ''
      }`}
    >
      {columnGroups.map((group, i) => {
        if (group.type === 'normal') {
          return (
            <div
              key={group.column.name}
              data-column-frame
              data-drop-before={group.columnIndex}
              data-drop-after={group.columnIndex + 1}
              className="relative h-full flex-none"
              onDragOver={(e) => handleColumnDragOver(e, group.columnIndex)}
              onDrop={(e) => handleColumnDrop(e, group.columnIndex)}
            >
              <ColumnDropGuide side="left" active={canShowDropGuide(group.columnIndex)} />
              <div className="h-full">
                <Column column={group.column} filteredTasks={group.filtered} {...sharedColumnProps} columnIndex={group.columnIndex} />
              </div>
              <ColumnDropGuide side="right" active={canShowDropGuide(columns.length) && group.columnIndex === columns.length - 1} />
            </div>
          );
        }

        if (group.type === 'compact-single') {
          return (
            <div
              key={group.column.name}
              data-column-frame
              data-drop-before={group.columnIndex}
              data-drop-after={group.columnIndex + 1}
              className="relative h-full w-[100px] flex-none"
              onDragOver={(e) => handleColumnDragOver(e, group.columnIndex)}
              onDrop={(e) => handleColumnDrop(e, group.columnIndex)}
            >
              <ColumnDropGuide side="left" active={canShowDropGuide(group.columnIndex)} />
              <div className="h-full w-[100px]">
                <Column column={group.column} filteredTasks={group.filtered} {...sharedColumnProps} isEmptyCompact columnIndex={group.columnIndex} />
              </div>
              <ColumnDropGuide side="right" active={canShowDropGuide(columns.length) && group.columnIndex === columns.length - 1} />
            </div>
          );
        }

        // 📖 compact-stack: the collapsed visual block keeps each empty column
        // draggable inside the stack, while the drop guide appears before or
        // after the whole collapsed run to avoid misleading horizontal slots.
        const firstColumnIndex = group.columns[0].columnIndex;
        const lastColumnIndex = group.columns[group.columns.length - 1].columnIndex;
        const stackKey = `compact-stack-${group.columns.map(c => c.column.name).join('|')}`;
        return (
          <div
            key={stackKey}
            data-column-frame
            data-drop-before={firstColumnIndex}
            data-drop-after={lastColumnIndex + 1}
            className="relative h-full flex-none"
            onDragOver={(e) => handleColumnDragOver(e, firstColumnIndex, lastColumnIndex + 1)}
            onDrop={(e) => handleColumnDrop(e, firstColumnIndex, lastColumnIndex + 1)}
          >
            <ColumnDropGuide side="left" active={canShowDropGuide(firstColumnIndex)} />
            <div className="h-full">
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
            </div>
            <ColumnDropGuide side="right" active={canShowDropGuide(columns.length) && lastColumnIndex === columns.length - 1} />
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
    </div>
  );
}
