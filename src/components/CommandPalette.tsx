import { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './Icons';
import { useStore } from '../lib/store';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  category: 'task' | 'action' | 'view';
  onSelect: () => void;
}

export function CommandPalette() {
  const commandOpen = useStore(s => s.commandOpen);
  const setCommandOpen = useStore(s => s.setCommandOpen);
  const columns = useStore(s => s.columns);
  const openDrawer = useStore(s => s.openDrawer);
  const createTask = useStore(s => s.createTask);
  const reloadBoard = useStore(s => s.reloadBoard);
  const setViewMode = useStore(s => s.setViewMode);
  const setDensity = useStore(s => s.setDensity);
  const clearFilters = useStore(s => s.clearFilters);

  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build command list
  const allCommands = useMemo<CommandItem[]>(() => {
    const taskCommands: CommandItem[] = columns.flatMap(col =>
      col.tasks.map(t => ({
        id: 'task:' + t.id,
        label: `${t.id.toUpperCase()} — ${t.title}`,
        hint: col.name,
        category: 'task' as const,
        onSelect: () => {
          setCommandOpen(false);
          openDrawer(t.id);
        },
      }))
    );

    const actionCommands: CommandItem[] = [
      {
        id: 'action:new',
        label: 'New task',
        hint: 'Create a new task',
        category: 'action',
        onSelect: () => {
          setCommandOpen(false);
          createTask();
        },
      },
      {
        id: 'action:reload',
        label: 'Reload board',
        hint: 'Re-read files from disk',
        category: 'action',
        onSelect: () => {
          setCommandOpen(false);
          reloadBoard();
        },
      },
      {
        id: 'action:clear',
        label: 'Clear filters',
        category: 'action',
        onSelect: () => {
          setCommandOpen(false);
          clearFilters();
        },
      },
    ];

    const viewCommands: CommandItem[] = [
      {
        id: 'view:board',
        label: 'Board view',
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setViewMode('board');
        },
      },
      {
        id: 'view:list',
        label: 'List view',
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setViewMode('list');
        },
      },
      {
        id: 'view:compact',
        label: 'Compact density',
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setDensity('compact');
        },
      },
      {
        id: 'view:comfortable',
        label: 'Comfortable density',
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setDensity('comfortable');
        },
      },
    ];

    return [...actionCommands, ...viewCommands, ...taskCommands];
  }, [columns, setCommandOpen, openDrawer, createTask, reloadBoard, clearFilters, setViewMode, setDensity]);

  // Fuzzy-ish filter
  const filtered = useMemo(() => {
    if (!query) return allCommands.slice(0, 50);
    const q = query.toLowerCase();
    return allCommands
      .filter(c => c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, allCommands]);

  useEffect(() => {
    if (commandOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [commandOpen]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    // Ensure selected item is in view
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selectedIdx]?.onSelect();
    }
  };

  // Group for display
  const grouped = useMemo(() => {
    const g: Record<string, CommandItem[]> = { action: [], view: [], task: [] };
    for (const c of filtered) g[c.category].push(c);
    return g;
  }, [filtered]);

  const labels: Record<string, string> = {
    action: 'Actions',
    view: 'View',
    task: 'Tasks',
  };

  return (
    <AnimatePresence>
      {commandOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCommandOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-[3px] z-[200]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
            className="fixed left-1/2 top-[15%] -translate-x-1/2 w-[min(640px,92vw)] z-[201] glass rounded-[10px] shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 h-11 border-b border-border">
              <Icon.Search size={14} className="text-fg-muted flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent border-none outline-none text-fg text-[14.5px] placeholder:text-fg-muted"
              />
              <span className="kbd">esc</span>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[420px] overflow-y-auto py-1.5">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-fg-muted">
                  No results
                </div>
              )}
              {(['action', 'view', 'task'] as const).map(cat =>
                grouped[cat].length > 0 ? (
                  <div key={cat} className="py-1">
                    <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
                      {labels[cat]}
                    </div>
                    {grouped[cat].map(cmd => {
                      const absoluteIdx = filtered.indexOf(cmd);
                      const isSelected = absoluteIdx === selectedIdx;
                      return (
                        <button
                          key={cmd.id}
                          data-idx={absoluteIdx}
                          onClick={cmd.onSelect}
                          onMouseEnter={() => setSelectedIdx(absoluteIdx)}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-[13.5px] text-left transition-colors ${
                            isSelected ? 'bg-bg-3 text-fg' : 'text-fg-dim'
                          }`}
                        >
                          <span className="truncate">{cmd.label}</span>
                          {cmd.hint && (
                            <span className="text-[12px] text-fg-muted ml-2 flex-shrink-0">
                              {cmd.hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 h-8 border-t border-border text-[12px] text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span className="kbd">↑↓</span> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="kbd">↵</span> select
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
