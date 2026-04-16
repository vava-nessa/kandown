import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from './Card';
import { Icon } from './Icons';
import { useStore } from '../lib/store';
import type { Column as ColumnType, BoardTask, Density } from '../lib/types';

interface ColumnProps {
  column: ColumnType;
  filteredTasks: BoardTask[];
  density: Density;
  draggedTaskId: string | null;
  draggedFromCol: string | null;
  onCardDragStart: (taskId: string, fromCol: string) => void;
  onCardDragEnd: () => void;
  onDrop: (toCol: string) => void;
}

export function Column({
  column,
  filteredTasks,
  density,
  draggedTaskId,
  draggedFromCol,
  onCardDragStart,
  onCardDragEnd,
  onDrop,
}: ColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const createTask = useStore(s => s.createTask);

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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0.35, 1] }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-column={column.name}
      className={`flex flex-col flex-none w-[304px] rounded-[10px] border overflow-hidden transition-colors duration-150 ${
        isOver
          ? 'border-border-focus bg-bg-2'
          : 'border-border bg-bg-1'
      }`}
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold tracking-tight text-fg">{column.name}</span>
          <span className="text-[11px] text-fg-muted tabular-nums">
            {filteredTasks.length}
            {isFiltered && <span className="text-fg-faint">/{column.tasks.length}</span>}
          </span>
        </div>
        <button
          onClick={() => createTask(column.name)}
          className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-fg rounded-[4px] transition-colors"
          title="Add task"
        >
          <Icon.Plus size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2.5">
        <div className="flex flex-col gap-1.5">
          <AnimatePresence mode="popLayout">
            {filteredTasks.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-6 px-2 text-center text-[11.5px] text-fg-faint"
              >
                {isFiltered ? 'No matches' : 'No tasks'}
              </motion.div>
            ) : (
              filteredTasks.map(task => (
                <Card
                  key={task.id}
                  task={task}
                  density={density}
                  columnName={column.name}
                  onDragStart={() => onCardDragStart(task.id, column.name)}
                  onDragEnd={onCardDragEnd}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
