import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Column } from './Column';
import { useStore } from '../lib/store';
import type { BoardTask } from '../lib/types';

export function Board() {
  const columns = useStore(s => s.columns);
  const density = useStore(s => s.density);
  const filters = useStore(s => s.filters);
  const moveTask = useStore(s => s.moveTask);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedFromCol, setDraggedFromCol] = useState<string | null>(null);

  const filteredColumns = useMemo(() => {
    return columns.map(col => {
      const filtered = col.tasks.filter((t: BoardTask) => {
        if (filters.search) {
          const q = filters.search.toLowerCase();
          if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
        }
        if (filters.priority && t.priority !== filters.priority) return false;
        if (filters.tag && !(t.tags || []).includes(filters.tag)) return false;
        if (filters.assignee && t.assignee !== filters.assignee) return false;
        return true;
      });
      return { column: col, filtered };
    });
  }, [columns, filters]);

  const handleCardDragStart = (taskId: string, fromCol: string) => {
    setDraggedTaskId(taskId);
    setDraggedFromCol(fromCol);
  };

  const handleCardDragEnd = () => {
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
      className="flex-1 flex gap-2.5 p-4 pb-5 overflow-x-auto overflow-y-hidden board-bg relative"
    >
      <div className="noise-overlay" />
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
            density={density}
            draggedTaskId={draggedTaskId}
            draggedFromCol={draggedFromCol}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onDrop={handleDrop}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
