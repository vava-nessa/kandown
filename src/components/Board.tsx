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
import { Column } from './Column';
import { useStore } from '../lib/store';
import type { BoardTask, SearchMatch } from '../lib/types';

export function Board() {
  const columns = useStore(s => s.columns);
  const density = useStore(s => s.density);
  const filters = useStore(s => s.filters);
  const moveTask = useStore(s => s.moveTask);
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={`flex-1 flex gap-2.5 p-4 pb-5 overflow-x-auto overflow-y-hidden relative ${config.ui.background === 'solid' ? 'board-bg' : ''}`}
    >
      {config.ui.background === 'solid' && <div className="noise-overlay" />}
      {filteredColumns.map(({ column, filtered }, i) => (
        <motion.div
          key={column.name}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: i * 0.04,
            duration: 0.35,
            ease: [0.32, 0.72, 0.35, 1],
          }}
        >
          <Column
            column={column}
            filteredTasks={filtered}
            searchMatches={filters.search ? searchMatches : new Map()}
            density={density}
            draggedTaskId={draggedTaskId}
            draggedFromCol={draggedFromCol}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleDragEnd}
            onDrop={handleDrop}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
