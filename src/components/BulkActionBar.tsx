/**
 * @file Floating Bulk Action Bar component
 * @description Appears when one or more tasks are selected in the web UI.
 * Allows moving or deleting multiple tasks at once.
 *
 * @functions
 *  → BulkActionBar — floating action bar at bottom of screen
 *
 * @exports BulkActionBar
 */

import { useStore } from '../lib/store';
import { IconTrash, IconArrowRight, IconX } from '@tabler/icons-react';

export function BulkActionBar() {
  const selectedTaskIds = useStore(s => s.selectedTaskIds);
  const clearTaskSelection = useStore(s => s.clearTaskSelection);
  const bulkMoveTasks = useStore(s => s.bulkMoveTasks);
  const bulkDeleteTasks = useStore(s => s.bulkDeleteTasks);
  const config = useStore(s => s.config);

  if (!selectedTaskIds || selectedTaskIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200">
      <span className="text-xs font-semibold text-fg px-2 py-1 rounded-md bg-fg/10 tabular-nums">
        {selectedTaskIds.length} selected
      </span>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-muted font-medium mr-1">Move to:</span>
        {config.board.columns.map(col => (
          <button
            key={col}
            onClick={() => bulkMoveTasks(col)}
            className="px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors"
          >
            {col}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-border" />

      <button
        onClick={() => bulkDeleteTasks()}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
      >
        <IconTrash size={14} />
        Delete
      </button>

      <button
        onClick={clearTaskSelection}
        className="p-1 text-fg-muted hover:text-fg hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors"
        title="Clear selection"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}
