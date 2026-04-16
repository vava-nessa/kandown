import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './Icons';
import { useStore } from '../lib/store';
import type { Priority } from '../lib/types';

export function FilterBar() {
  const filters = useStore(s => s.filters);
  const setFilter = useStore(s => s.setFilter);
  const clearFilters = useStore(s => s.clearFilters);

  const chips: Array<{ type: keyof typeof filters; label: string; value: string }> = [];
  if (filters.priority) chips.push({ type: 'priority', label: filters.priority, value: filters.priority });
  if (filters.tag) chips.push({ type: 'tag', label: '#' + filters.tag, value: filters.tag });
  if (filters.assignee) chips.push({ type: 'assignee', label: '@' + filters.assignee, value: filters.assignee });

  const hasFilters = chips.length > 0 || filters.search;

  return (
    <div className="flex items-center gap-2 px-5 min-h-[42px] border-b border-border bg-bg">
      <div className="flex items-center gap-1.5 px-2.5 h-7 bg-bg-2 border border-border rounded-[6px] min-w-[220px] focus-within:border-border-focus focus-within:bg-bg-3 transition-colors">
        <Icon.Search size={12} className="text-fg-muted flex-shrink-0" />
        <input
          type="text"
          placeholder="Search tasks..."
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          className="bg-transparent border-none outline-none text-fg text-[12px] w-full placeholder:text-fg-muted"
        />
        {filters.search && (
          <button
            onClick={() => setFilter('search', '')}
            className="text-fg-muted hover:text-fg"
          >
            <Icon.X size={12} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <AnimatePresence>
          {chips.map(chip => (
            <motion.button
              key={chip.type + chip.value}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              onClick={() => setFilter(chip.type as never, null as never)}
              className="inline-flex items-center gap-1.5 h-6 px-2 text-[11px] text-fg bg-bg-3 border border-border-strong rounded-[4px] hover:bg-bg-hover transition-colors"
            >
              {chip.label}
              <Icon.X size={10} className="text-fg-muted" />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="ml-auto text-[11px] text-fg-muted hover:text-fg transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
