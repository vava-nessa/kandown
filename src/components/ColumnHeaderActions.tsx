/**
 * @file Column header actions toolbar
 * @description Standardized action buttons (Add Task, Color Picker, Rename, Delete,
 * Add to Settings) shared across Board and List view column headers.
 *
 * @exports ColumnHeaderActions
 * @see src/components/Column.tsx
 * @see src/components/ListView.tsx
 */

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
  className?: string;
}

export function ColumnHeaderActions({
  columnName,
  isConfiguredColumn,
  currentColor,
  onColorSelect,
  onCreateTask,
  onRenameColumn,
  onDeleteColumn,
  onAddColumn,
  className = '',
}: ColumnHeaderActionsProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
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
