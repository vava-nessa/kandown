/**
 * @file Board column component
 * @description Renders a single kanban column, accepts dropped cards, shows the
 * filtered task count, and creates new tasks directly in the column.
 *
 * 📖 Drag state is owned by `Board`; this component only translates browser
 * drag/drop events into the column-level callbacks that eventually update
 * the task files.
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
import { useTranslation } from 'react-i18next';
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
import { KbdButton } from './KbdButton';
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
  amber: 'rgba(245,158,11,0.12)',
  yellow: 'rgba(234,179,8,0.12)',
  lime: 'rgba(132,204,22,0.12)',
  green: 'rgba(34,197,94,0.12)',
  emerald: 'rgba(16,185,129,0.12)',
  teal: 'rgba(20,184,166,0.12)',
  cyan: 'rgba(6,182,212,0.12)',
  sky: 'rgba(14,165,233,0.12)',
  blue: 'rgba(59,130,246,0.12)',
  indigo: 'rgba(99,102,241,0.12)',
  violet: 'rgba(139,92,246,0.12)',
  purple: 'rgba(168,85,247,0.12)',
  fuchsia: 'rgba(217,70,239,0.12)',
  pink: 'rgba(236,72,153,0.12)',
  rose: 'rgba(244,63,94,0.12)',
  slate: 'rgba(100,116,139,0.12)',
  gray: 'rgba(156,163,175,0.12)',
  zinc: 'rgba(113,113,122,0.12)',
  black: 'rgba(0,0,0,0.34)',
  blackTransparent: 'rgba(0,0,0,0.16)',
};

const COLOR_SWATCHES: { key: ColumnColor; label: string; color: string }[] = [
  { key: 'red', label: 'Red', color: 'rgba(239,68,68,0.9)' },
  { key: 'orange', label: 'Orange', color: 'rgba(249,115,22,0.9)' },
  { key: 'amber', label: 'Amber', color: 'rgba(245,158,11,0.9)' },
  { key: 'yellow', label: 'Yellow', color: 'rgba(234,179,8,0.9)' },
  { key: 'lime', label: 'Lime', color: 'rgba(132,204,22,0.9)' },
  { key: 'green', label: 'Green', color: 'rgba(34,197,94,0.9)' },
  { key: 'emerald', label: 'Emerald', color: 'rgba(16,185,129,0.9)' },
  { key: 'teal', label: 'Teal', color: 'rgba(20,184,166,0.9)' },
  { key: 'cyan', label: 'Cyan', color: 'rgba(6,182,212,0.9)' },
  { key: 'sky', label: 'Sky', color: 'rgba(14,165,233,0.9)' },
  { key: 'blue', label: 'Blue', color: 'rgba(59,130,246,0.9)' },
  { key: 'indigo', label: 'Indigo', color: 'rgba(99,102,241,0.9)' },
  { key: 'violet', label: 'Violet', color: 'rgba(139,92,246,0.9)' },
  { key: 'purple', label: 'Purple', color: 'rgba(168,85,247,0.9)' },
  { key: 'fuchsia', label: 'Fuchsia', color: 'rgba(217,70,239,0.9)' },
  { key: 'pink', label: 'Pink', color: 'rgba(236,72,153,0.9)' },
  { key: 'rose', label: 'Rose', color: 'rgba(244,63,94,0.9)' },
  { key: 'slate', label: 'Slate', color: 'rgba(100,116,139,0.9)' },
  { key: 'gray', label: 'Gray', color: 'rgba(156,163,175,0.9)' },
  { key: 'zinc', label: 'Zinc', color: 'rgba(113,113,122,0.9)' },
  { key: 'black', label: 'Black', color: 'rgba(0,0,0,0.9)' },
  { key: 'blackTransparent', label: 'Black 50%', color: 'rgba(0,0,0,0.5)' },
];

interface ColumnColorMenuProps {
  columnName: string;
  currentColor: ColumnColor;
  onSelect: (color: ColumnColor) => void;
}

function ColumnColorMenu({ columnName, currentColor, onSelect }: ColumnColorMenuProps) {
  const { t } = useTranslation();
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
        title={t('column.columnColor')}
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
            className="absolute right-0 top-full mt-1 bg-bg-2 border border-border rounded-[6px] shadow-lg p-1.5 z-50 min-w-[152px]"
            style={{ transformOrigin: 'top right' }}
          >
            <div className="text-[11px] text-fg-muted px-1.5 pb-1.5 font-medium">{t('column.color')}</div>
            <div className="grid grid-cols-5 gap-1">
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
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  const [isColHovered, setIsColHovered] = useState(false);
  const createTask = useStore(s => s.createTask);
  const addColumn = useStore(s => s.addColumn);
  const renameColumn = useStore(s => s.renameColumn);
  const deleteColumn = useStore(s => s.deleteColumn);
  const updateConfig = useStore(s => s.updateConfig);
  const config = useStore(s => s.config);
  const isConfiguredColumn = config.board.columns.some(name => name.toLowerCase() === column.name.toLowerCase());

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
      className="flex flex-col flex-none w-[304px] min-h-[400px] rounded-[10px] transition-colors duration-150"
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
          {!isConfiguredColumn && (
            <button
              onClick={() => addColumn(column.name)}
              className="h-5 rounded-[4px] px-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg"
              title={t('column.addToSettings')}
            >
              {t('column.addColumn')}
            </button>
          )}
          <ColumnColorMenu
            columnName={column.name.toLowerCase()}
            currentColor={colColorKey}
            onSelect={handleColorChange}
          />
          <button
            onClick={handleRenameColumn}
            className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-fg rounded-[4px] transition-colors"
            title={t('column.renameColumn')}
          >
            <span className="text-[11px] leading-none">✎</span>
          </button>
          <button
            onClick={handleDeleteColumn}
            className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-red-500 rounded-[4px] transition-colors"
            title={t('column.deleteColumn')}
          >
            <span className="text-[13px] leading-none">×</span>
          </button>
          <button
            onClick={() => createTask(column.name)}
            className="w-5 h-5 inline-flex items-center justify-center text-fg-muted hover:bg-bg-3 hover:text-fg rounded-[4px] transition-colors"
            title={t('column.addTask')}
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
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-1 overflow-hidden"
            >
              <KbdButton
                variant="ghost"
                icon="Plus"
                label={t('column.addTask')}
                onClick={() => createTask(column.name)}
                className="w-full justify-start px-2 py-1.5 h-auto text-[12.5px]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
