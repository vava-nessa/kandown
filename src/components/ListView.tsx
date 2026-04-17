import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../lib/store';
import type { BoardTask } from '../lib/types';

const priorityColors: Record<string, string> = {
  P1: '#e5484d',
  P2: '#e9a23b',
  P3: '#3e63dd',
  P4: '#6e6e6e',
};

export function ListView() {
  const columns = useStore(s => s.columns);
  const filters = useStore(s => s.filters);
  const openDrawer = useStore(s => s.openDrawer);

  const rows = useMemo(() => {
    const result: Array<{ task: BoardTask; column: string }> = [];
    for (const col of columns) {
      for (const t of col.tasks) {
        if (filters.search) {
          const q = filters.search.toLowerCase();
          if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) continue;
        }
        if (filters.priority && t.priority !== filters.priority) continue;
        if (filters.tag && !(t.tags || []).includes(filters.tag)) continue;
        if (filters.assignee && t.assignee !== filters.assignee) continue;
        if (filters.ownerType && t.ownerType !== filters.ownerType) continue;
        result.push({ task: t, column: col.name });
      }
    }
    return result;
  }, [columns, filters]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto"
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Header row */}
        <div className="grid grid-cols-[80px_40px_1fr_140px_120px_120px_80px] gap-3 px-6 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint border-b border-border sticky top-0 bg-bg z-10">
          <div>ID</div>
          <div></div>
          <div>Title</div>
          <div>Status</div>
          <div>Tags</div>
          <div>Assignee</div>
          <div>Progress</div>
        </div>

        <AnimatePresence>
          {rows.map(({ task, column }, i) => (
            <motion.button
              key={task.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: Math.min(i * 0.012, 0.2), duration: 0.2 }}
              onClick={() => openDrawer(task.id)}
              className="w-full grid grid-cols-[80px_40px_1fr_140px_120px_120px_80px] gap-3 px-6 py-2.5 text-[12.5px] border-b border-border hover:bg-bg-1 transition-colors text-left items-center"
            >
              <span className="font-mono text-[10.5px] text-fg-muted">{task.id.toUpperCase()}</span>
              <span className="flex items-center gap-1.5">
                {task.priority && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: priorityColors[task.priority] }}
                    title={task.priority}
                  />
                )}
              </span>
              <span className={`truncate ${task.checked ? 'line-through text-fg-muted' : 'text-fg'}`}>
                {task.title}
              </span>
              <span className="text-fg-dim text-[11.5px]">{column}</span>
              <span className="flex flex-wrap gap-1">
                {task.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10.5px] px-1.5 py-0.5 rounded-[3px] bg-bg-2 border border-border text-fg-dim">
                    {tag}
                  </span>
                ))}
              </span>
              <span className="text-[11.5px] text-fg-dim">
                {task.assignee ? `@${task.assignee}` : ''}
              </span>
              <span className="text-[11px] font-mono text-fg-muted tabular-nums">
                {task.progress ? `${task.progress.done}/${task.progress.total}` : ''}
              </span>
            </motion.button>
          ))}
        </AnimatePresence>

        {rows.length === 0 && (
          <div className="py-20 text-center text-[12.5px] text-fg-muted">No matching tasks</div>
        )}
      </div>
    </motion.div>
  );
}
