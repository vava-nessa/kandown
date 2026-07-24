/**
 * @file Column header actions toolbar
 * @description Standardized action buttons (Add Task, Color Picker, Rename, Delete,
 * bulk terminal-task actions, Add to Settings) shared across Board and List view
 * column headers.
 *
 * @exports ColumnHeaderActions
 * @see src/components/Column.tsx
 * @see src/components/ListView.tsx
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ColumnColorMenu } from './ColumnColorMenu';
import { Icon } from './Icons';
import type { ColumnColor } from '../lib/types';

export interface ColumnHeaderActionsProps {
  columnName: string;
  taskCount: number;
  isConfiguredColumn: boolean;
  currentColor: ColumnColor;
  onColorSelect: (color: ColumnColor) => void;
  onCreateTask: () => void;
  onRenameColumn: () => void;
  onDeleteColumn: () => void;
  onAddColumn: () => void;
  /** 📖 Bulk actions are exposed only on the configured terminal column. */
  isTerminalColumn?: boolean;
  bulkTaskCount?: number;
  onArchiveAll?: () => void;
  onDeleteAll?: () => void;
  className?: string;
}

export function ColumnHeaderActions({
  columnName,
  taskCount,
  isConfiguredColumn,
  currentColor,
  onColorSelect,
  onCreateTask,
  onRenameColumn,
  onDeleteColumn,
  onAddColumn,
  isTerminalColumn = false,
  bulkTaskCount = taskCount,
  onArchiveAll,
  onDeleteAll,
  className = '',
}: ColumnHeaderActionsProps) {
  const { t } = useTranslation();
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(event.target as Node)) {
        setBulkMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBulkMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [bulkMenuOpen]);

  const hasBulkActions = isTerminalColumn && !!onArchiveAll && !!onDeleteAll;
  const runBulkAction = (action: () => void) => {
    setBulkMenuOpen(false);
    action();
  };

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {hasBulkActions && (
        <div ref={bulkMenuRef} className="relative">
          <button
            type="button"
            aria-label={t('column.bulkActions')}
            aria-haspopup="menu"
            aria-expanded={bulkMenuOpen}
            disabled={bulkTaskCount === 0}
            onClick={event => {
              event.stopPropagation();
              setBulkMenuOpen(open => !open);
            }}
            className="w-6 h-6 inline-flex items-center justify-center text-fg-muted hover:bg-black/[0.05] dark:hover:bg-white/[0.1] hover:text-fg rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            title={t('column.bulkActions')}
          >
            <Icon.Archive size={14} />
          </button>
          {bulkMenuOpen && bulkTaskCount > 0 && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-xl"
              onClick={event => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => runBulkAction(onArchiveAll!)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] text-fg-muted transition-colors hover:bg-bg-2 hover:text-fg"
              >
                <Icon.Archive size={14} />
                <span>{t('column.archiveAll')}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runBulkAction(onDeleteAll!)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Icon.Trash size={14} />
                <span>{t('column.deleteAll')}</span>
              </button>
            </div>
          )}
        </div>
      )}
      {!isConfiguredColumn && (
        <button
          onClick={onAddColumn}
          className="h-6 rounded-md px-2 text-[11px] font-medium text-fg-muted transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.1] hover:text-fg"
          title={t('column.addToSettings')}
        >
          {t('column.addColumn')}
        </button>
      )}
      <button
        onClick={onCreateTask}
        className="w-6 h-6 inline-flex items-center justify-center text-fg-muted hover:bg-black/[0.05] dark:hover:bg-white/[0.1] hover:text-fg rounded-md transition-colors"
        title={t('column.addTask')}
      >
        <Icon.Plus size={14} />
      </button>
      <ColumnColorMenu
        columnName={columnName}
        currentColor={currentColor}
        onSelect={onColorSelect}
      />
      <button
        onClick={onRenameColumn}
        className="w-6 h-6 inline-flex items-center justify-center text-fg-muted hover:bg-black/[0.05] dark:hover:bg-white/[0.1] hover:text-fg rounded-md transition-colors"
        title={t('column.renameColumn')}
      >
        <span className="text-[11px] leading-none">✎</span>
      </button>
      <button
        onClick={onDeleteColumn}
        className="w-6 h-6 inline-flex items-center justify-center text-fg-muted hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"
        title={t('column.deleteColumn')}
      >
        <span className="text-[13px] leading-none">×</span>
      </button>
    </div>
  );
}
