/**
 * @file Command palette
 * @description Provides global quick actions, view switching, task lookup, and
 * content-aware task search with highlighted snippets.
 *
 * 📖 The palette lazily loads task file content only when needed, so small
 * boards feel instant and large boards avoid reading every markdown file until
 * the user searches.
 *
 * @functions
 *  → HighlightedText — highlights matched text in task search previews
 *  → CommandPalette — modal command/search interface opened by Cmd/Ctrl+K
 *
 * @exports CommandPalette
 * @see src/lib/store.ts
 * @see src/lib/parser.ts
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { useStore } from '../lib/store';
import type { SearchMatch } from '../lib/types';
import { searchTaskContent } from '../lib/parser';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  preview?: SearchMatch[];
  category: 'task' | 'action' | 'view';
  onSelect: () => void;
  boldPrefix?: boolean;
}

function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200/60 text-fg rounded px-0.5 font-semibold">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function CommandPalette() {
  const { t } = useTranslation();
  const commandOpen = useStore(s => s.commandOpen);
  const setCommandOpen = useStore(s => s.setCommandOpen);
  const columns = useStore(s => s.columns);
  const openDrawer = useStore(s => s.openDrawer);
  const createTask = useStore(s => s.createTask);
  const reloadBoard = useStore(s => s.reloadBoard);
  const setViewMode = useStore(s => s.setViewMode);
  const setDensity = useStore(s => s.setDensity);
  const clearFilters = useStore(s => s.clearFilters);
  const taskContents = useStore(s => s.taskContents);
  const loadTaskContents = useStore(s => s.loadTaskContents);

  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load all task contents when command palette opens with a query
  useEffect(() => {
    if (commandOpen && query.length > 0) {
      const allIds = columns.flatMap(col => col.tasks.map(t => t.id));
      const missingIds = allIds.filter(id => !taskContents.has(id));
      if (missingIds.length > 0) {
        loadTaskContents(missingIds);
      }
    }
  }, [commandOpen, query, columns, taskContents, loadTaskContents]);

  // Build command list
  const allCommands = useMemo<CommandItem[]>(() => {
    const taskCommands: CommandItem[] = columns.flatMap(col =>
      col.tasks.map(t => ({
        id: 'task:' + t.id,
        label: `${t.id.replace(/^t/, '')} — ${t.title}`,
        boldPrefix: true,
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
        label: t('commandPalette.newTask'),
        hint: t('commandPalette.createNew'),
        category: 'action',
        onSelect: () => {
          setCommandOpen(false);
          createTask();
        },
      },
      {
        id: 'action:reload',
        label: t('commandPalette.reloadBoard'),
        hint: t('commandPalette.readFromDisk'),
        category: 'action',
        onSelect: () => {
          setCommandOpen(false);
          reloadBoard();
        },
      },
      {
        id: 'action:clear',
        label: t('commandPalette.clearFilters'),
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
        label: t('commandPalette.boardView'),
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setViewMode('board');
        },
      },
      {
        id: 'view:list',
        label: t('commandPalette.listView'),
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setViewMode('list');
        },
      },
      {
        id: 'view:compact',
        label: t('commandPalette.compactDensity'),
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setDensity('compact');
        },
      },
      {
        id: 'view:comfortable',
        label: t('commandPalette.comfortableDensity'),
        category: 'view',
        onSelect: () => {
          setCommandOpen(false);
          setDensity('comfortable');
        },
      },
    ];

    return [...actionCommands, ...viewCommands, ...taskCommands];
  }, [columns, setCommandOpen, openDrawer, createTask, reloadBoard, clearFilters, setViewMode, setDensity]);

  // Compute search matches for tasks
  const searchMatchesMap = useMemo(() => {
    if (!query.trim()) return new Map<string, SearchMatch[]>();
    const q = query.toLowerCase();
    const matches = new Map<string, SearchMatch[]>();
    for (const cmd of allCommands) {
      if (cmd.category !== 'task') continue;
      const taskId = cmd.id.replace('task:', '');
      const content = taskContents.get(taskId);
      if (!content) continue;
      const found = searchTaskContent(content, q);
      if (found.length > 0) matches.set(taskId, found);
    }
    return matches;
  }, [query, allCommands, taskContents]);

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
    action: t('commandPalette.actions'),
    view: t('commandPalette.view'),
    task: t('commandPalette.tasks'),
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
            className="fixed inset-0 m-auto h-fit w-[min(640px,92vw)] z-[201] glass rounded-[10px] shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
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
                placeholder={t('commandPalette.placeholder')}
                className="flex-1 bg-transparent border-none outline-none text-fg text-[14.5px] placeholder:text-fg-muted"
              />
              <span className="kbd">esc</span>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[420px] overflow-y-auto py-1.5">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-[13px] text-fg-muted">
                  {t('common.noResults')}
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
                      const matches = cat === 'task' ? searchMatchesMap.get(cmd.id.replace('task:', '')) : undefined;
                      return (
                        <div key={cmd.id}>
                          <button
                            data-idx={absoluteIdx}
                            onClick={cmd.onSelect}
                            onMouseEnter={() => setSelectedIdx(absoluteIdx)}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-[13.5px] text-left transition-colors ${
                              isSelected ? 'bg-bg-3 text-fg' : 'text-fg-dim'
                            }`}
                          >
                            <span className={`truncate ${cmd.boldPrefix ? 'font-bold' : ''}`}>{cmd.label}</span>
                            {cmd.hint && (
                              <span className="text-[12px] text-fg-muted ml-2 flex-shrink-0">
                                {cmd.hint}
                              </span>
                            )}
                          </button>
                          {/* Search preview */}
                          {isSelected && matches && matches.length > 0 && (
                            <div className="px-3 pb-2">
                              <div className="flex flex-col gap-1 bg-bg rounded border border-border p-2">
                                {matches.slice(0, 2).map((match, i) => (
                                  <div key={i} className="text-[12px] text-fg-dim">
<span className="text-[10.5px] font-medium text-fg-muted uppercase tracking-wide mr-1.5">
                                        {t(`sectionLabels.${match.section}`) || match.section}
                                      </span>
                                    <HighlightedText text={match.snippet} keyword={match.keyword} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 h-8 border-t border-border text-[12px] text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span className="kbd">↑↓</span> {t('commandPalette.navigate')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="kbd">↵</span> {t('commandPalette.select')}
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
