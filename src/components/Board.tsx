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
    }
  | {
      type: 'compact-single';
      column: ColumnType;
      filtered: BoardTask[];
    }
  | {
      type: 'compact-stack';
      columns: { column: ColumnType; filtered: BoardTask[] }[];
    };

const EMPTY_MAP = new Map<string, SearchMatch[]>();

export function Board() {
  const { t } = useTranslation();
  const columns = useStore(s => s.columns);
  const density = useStore(s => s.density);
  const filters = useStore(s => s.filters);
  const moveTask = useStore(s => s.moveTask);
  const addColumn = useStore(s => s.addColumn);
  const searchMatches = useStore(s => s.searchMatches);
  const config = useStore(s => s.config);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedFromCol, setDraggedFromCol] = useState<string | null>(null);

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
      return filteredColumns.map(fc => ({ type: 'normal', ...fc }));
    }

    const groups: ColumnGroup[] = [];
    let i = 0;
    while (i < filteredColumns.length) {
      const fc = filteredColumns[i];
      const isEmpty = fc.column.tasks.length === 0;

      if (!isEmpty) {
        groups.push({ type: 'normal', column: fc.column, filtered: fc.filtered });
        i++;
        continue;
      }

      const run: { column: ColumnType; filtered: BoardTask[] }[] = [];
      while (i < filteredColumns.length && filteredColumns[i].column.tasks.length === 0) {
        run.push(filteredColumns[i]);
        i++;
      }

      if (run.length === 1) {
        groups.push({ type: 'compact-single', column: run[0].column, filtered: run[0].filtered });
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

  const sharedColumnProps = {
    searchMatches: searchMatchesMap,
    density,
    draggedTaskId,
    draggedFromCol,
    onCardDragStart: handleCardDragStart,
    onCardDragEnd: handleDragEnd,
    onDrop: handleDrop,
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
            <motion.div key={group.column.name} {...animProps(i)} className="h-full">
              <Column column={group.column} filteredTasks={group.filtered} {...sharedColumnProps} />
            </motion.div>
          );
        }

        if (group.type === 'compact-single') {
          return (
            <motion.div key={group.column.name} {...animProps(i)} className="h-full">
              <div className={`h-full w-[100px] ${columnBorder}`}>
                <Column column={group.column} filteredTasks={group.filtered} {...sharedColumnProps} isEmptyCompact />
              </div>
            </motion.div>
          );
        }

        const stackKey = `compact-stack-${group.columns.map(c => c.column.name).join('|')}`;
        return (
          <motion.div key={stackKey} {...animProps(i)} className="h-full">
            <div className={`flex flex-col h-full w-[100px] ${columnBorder}`}>
              {group.columns.map(({ column, filtered }, idx) => (
                <div
                  key={column.name}
                  className={`flex-1 min-h-0 ${idx < group.columns.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <Column column={column} filteredTasks={filtered} {...sharedColumnProps} isEmptyCompact />
                </div>
              ))}
            </div>
          </motion.div>
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
