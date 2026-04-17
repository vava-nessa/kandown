/**
 * @file Board column component
 * @description Renders a single kanban column, accepts dropped cards, shows the
 * filtered task count, and creates new tasks directly in the column.
 *
 * 📖 Drag state is owned by `Board`; this component only translates browser
 * drag/drop events into the column-level callbacks that eventually update
 * `board.md`.
 * 📖 Column header icons are mapped from normalized status names so default
 * boards get clear visual landmarks while custom columns still use a stable
 * fallback icon.
 *
 * @functions
 *  → Column — animated kanban column with task cards and empty state
 *  → getColumnIcon — resolves the Tabler icon for a column title
 *  → ColumnColorMenu — 3-dot dropdown for picking column accent color
 *
 * @exports Column
 * @see src/components/Board.tsx
 * @see src/components/Card.tsx
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  IconCircleCheck,
  IconClipboardList,
  IconEyeCheck,
  IconInbox,
  IconListDetails,
  IconProgress,
  type TablerIcon,
} from '@tabler/icons-react';
import { Card } from './Card';
import { Icon } from './Icons';
import { useStore } from '../lib/store';
import type { Column as ColumnType, BoardTask, Density, SearchMatch, ColumnColor } from '../lib/types';

const columnIconsByName: Readonly<Record<string, TablerIcon>> = {
  backlog: IconInbox,
  icebox: IconInbox,
  todo: IconClipboardList,
  'to do': IconClipboardList,
  ready: IconClipboardList,
  doing: IconProgress,
  progress: IconProgress,
  'in progress': IconProgress,
  active: IconProgress,
  review: IconEyeCheck,
  qa: IconEyeCheck,
  verify: IconEyeCheck,
  done: IconCircleCheck,
  complete: IconCircleCheck,
  completed: IconCircleCheck,
};

function getColumnIcon(columnName: string): TablerIcon {
  const normalizedName = columnName.trim().toLowerCase();
  return columnIconsByName[normalizedName] ?? IconListDetails;
}

const COLUMN_COLOR_MAP: Record<ColumnColor, string> = {
  red: 'rgba(239,68,68,0.12)',
  orange: 'rgba(249,115,22,0.12)',
  yellow: 'rgba(234,179,8,0.12)',
  green: 'rgba(34,197,94,0.12)',
  blue: 'rgba(59,130,246,0.12)',
  violet: 'rgba(139,92,246,0.12)',
  pink: 'rgba(236,72,153,0.12)',
  gray: 'rgba(156,163,175,0.12)',
};

const COLOR_SWATCHES: { key: ColumnColor; label: string; color: string }[] = [
  { key: 'red', label: 'Red', color: 'rgba(239,68,68,0.9)' },
  { key: 'orange', label: 'Orange', color: 'rgba(249,115,22,0.9)' },
  { key: 'yellow', label: 'Yellow', color: 'rgba(234,179,8,0.9)' },
  { key: 'green', label: 'Green', color: 'rgba(34,197,94,0.9)' },
  { key: 'blue', label: 'Blue', color: 'rgba(59,130,246,0.9)' },
  { key: 'violet', label: 'Violet', color: 'rgba(139,92,246,0.9)' },
  { key: 'pink', label: 'Pink', color: 'rgba(236,72,153,0.9)' },
  { key: 'gray', label: 'Gray', color: 'rgba(156,163,175,0.9)' },
];

interface ColumnColorMenuProps {
  columnName: string;
  currentColor: ColumnColor;
  onSelect: (color: ColumnColor) => void;
}

function ColumnColorMenu({ columnName, currentColor, onSelect }: ColumnColorMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-fg rounded-[4px] transition-colors"
        title="Column color"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-60">
          <circle cx="3" cy="2" r="1.2" fill="currentColor" />
          <circle cx="9" cy="2" r="1.2" fill="currentColor" />
          <circle cx="3" cy="6" r="1.2" fill="currentColor" />
          <circle cx="9" cy="6" r="1.2" fill="currentColor" />
          <circle cx="3" cy="10" r="1.2" fill="currentColor" />
          <circle cx="9" cy="10" r="1.2" fill="currentColor" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 bg-bg-2 border border-border rounded-[6px] shadow-lg p-1.5 z-50 min-w-[120px]"
            style={{ transformOrigin: 'top right' }}
          >
            <div className="text-[11px] text-fg-muted px-1.5 pb-1.5 font-medium">Color</div>
            <div className="grid grid-cols-4 gap-1">
              {COLOR_SWATCHES.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(key);
                    setOpen(false);
                  }}
                  title={label}
                  className={`w-6 h-6 rounded-[4px] flex items-center justify-center transition-all ${
                    currentColor === key ? 'ring-2 ring-offset-1 ring-offset-bg-2 ring-fg' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  {currentColor === key && (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-white">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ColumnProps {
  column: ColumnType;
  filteredTasks: BoardTask[];
  searchMatches: Map<string, SearchMatch[]>;
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
  searchMatches,
  density,
  draggedTaskId,
  draggedFromCol,
  onCardDragStart,
  onCardDragEnd,
  onDrop,
}: ColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const [isColHovered, setIsColHovered] = useState(false);
  const createTask = useStore(s => s.createTask);
  const updateConfig = useStore(s => s.updateConfig);
  const config = useStore(s => s.config);

  const colColorKey = config.board.columnColors?.[column.name.toLowerCase()] ?? 'gray';
  const colBg = COLUMN_COLOR_MAP[colColorKey] ?? COLUMN_COLOR_MAP.gray;

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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0.35, 1] }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={() => setIsColHovered(true)}
      onMouseLeave={() => setIsColHovered(false)}
      data-column={column.name}
      className="flex flex-col flex-none w-[304px] rounded-[10px] transition-colors duration-150"
      style={{ backgroundColor: isOver ? 'rgba(255,255,255,0.03)' : colBg }}
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <ColumnIcon
            aria-hidden="true"
            size={15}
            stroke={1.8}
            className="flex-none text-fg-muted"
          />
          <span className="text-[13.5px] font-semibold tracking-tight text-fg">{column.name}</span>
          <span className="text-[12px] text-fg-muted tabular-nums">
            {filteredTasks.length}
            {isFiltered && <span className="text-fg-faint">/{column.tasks.length}</span>}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <ColumnColorMenu
            columnName={column.name.toLowerCase()}
            currentColor={colColorKey}
            onSelect={handleColorChange}
          />
          <button
            onClick={() => createTask(column.name)}
            className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-fg rounded-[4px] transition-colors"
            title="Add task"
          >
            <Icon.Plus size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2.5">
        <div className="flex flex-col gap-1.5">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map(task => (
              <Card
                key={task.id}
                task={task}
                searchMatches={searchMatches.get(task.id) || []}
                density={density}
                columnName={column.name}
                onDragStart={() => onCardDragStart(task.id, column.name)}
                onDragEnd={onCardDragEnd}
              />
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {isColHovered && (
            <motion.button
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => createTask(column.name)}
              className="w-full flex items-center gap-1.5 py-1.5 px-2 text-[12.5px] text-fg-muted hover:text-fg hover:bg-bg-3 rounded-[4px] transition-colors mt-1"
            >
              <Icon.Plus size={12} />
              Add task
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
