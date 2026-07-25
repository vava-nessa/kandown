/**
 * @file DependenciesHeaderMenu component
 * @description Compact hoverable & clickable popover menu in the task header for
 * managing dependencies with autocompletion.
 *
 * 📖 Displays a compact badge in the task header (e.g., "Deps: 2" or "No deps").
 * Hovering or clicking opens a popover listing current dependencies with status
 * indicators, quick deletion, and an autocompleting task search input.
 *
 * @functions
 *  → DependenciesHeaderMenu — compact header popover for task dependencies
 *
 * @exports DependenciesHeaderMenu
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { useStore } from '../lib/store';

interface DependenciesHeaderMenuProps {
  currentTaskId: string;
  dependsOn: string[];
  depResolution: Map<string, { exists: boolean; resolved: boolean }>;
  onUpdateDependencies: (nextDeps: string[]) => void;
}

export function DependenciesHeaderMenu({
  currentTaskId,
  dependsOn,
  depResolution,
  onUpdateDependencies,
}: DependenciesHeaderMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const columns = useStore(s => s.columns);

  // 📖 Collect all available tasks across columns (excluding current task & already added deps)
  const allTasks = useMemo(() => {
    const list: Array<{ id: string; title: string }> = [];
    for (const col of columns) {
      for (const task of col.tasks) {
        if (task.id !== currentTaskId && !dependsOn.includes(task.id)) {
          list.push({ id: task.id, title: task.title });
        }
      }
    }
    return list;
  }, [columns, currentTaskId, dependsOn]);

  // Filter tasks based on input
  const suggestions = useMemo(() => {
    const q = inputValue.trim().toLowerCase().replace(/^#/, '');
    if (!q) return allTasks.slice(0, 6);
    return allTasks
      .filter(t => t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allTasks, inputValue]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  const addDependency = (depId: string) => {
    const cleaned = depId.trim().replace(/^#/, '');
    if (!cleaned || cleaned === currentTaskId || dependsOn.includes(cleaned)) return;
    onUpdateDependencies([...dependsOn, cleaned]);
    setInputValue('');
    setHighlightedIndex(0);
  };

  const removeDependency = (index: number) => {
    const next = dependsOn.filter((_, i) => i !== index);
    onUpdateDependencies(next);
  };

  const unresolvedCount = dependsOn.filter(depId => !(depResolution.get(depId)?.resolved ?? false)).length;

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header Button Badge */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
          if (!isOpen) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[12px] font-medium transition-colors border ${
          dependsOn.length === 0
            ? 'border-border/60 bg-bg-2/50 text-fg-muted hover:text-fg hover:bg-bg-2'
            : unresolvedCount > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
        }`}
        title={t('dependencies.label')}
      >
        <Icon.Link size={12} className="opacity-70" />
        <span>
          {dependsOn.length === 0
            ? t('dependencies.label')
            : `${t('dependencies.label')} (${dependsOn.length})`}
        </span>
        {unresolvedCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        )}
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 z-50 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-3 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2 flex items-center justify-between">
            <span>{t('dependencies.label')}</span>
            <span className="font-mono text-[10px] text-fg-faint">{dependsOn.length} total</span>
          </div>

          {/* Active Chips List */}
          {dependsOn.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-3 max-h-32 overflow-y-auto pr-1">
              {dependsOn.map((depId, index) => {
                const isResolved = depResolution.get(depId)?.resolved ?? false;
                const exists = depResolution.get(depId)?.exists ?? true;
                return (
                  <span
                    key={`${depId}-${index}`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-mono border ${
                      !exists
                        ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                        : isResolved
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    }`}
                    title={!exists ? t('dependencies.unknown') : isResolved ? t('dependencies.resolved') : t('dependencies.unresolved')}
                  >
                    <span>{depId}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDependency(index);
                      }}
                      className="ml-0.5 hover:text-red-500 text-current opacity-60 hover:opacity-100 font-bold"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-fg-faint mb-2 italic">
              {t('dependencies.none')}
            </div>
          )}

          {/* Add Dependency Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (suggestions.length > 0) {
                    setHighlightedIndex(prev => (prev + 1) % suggestions.length);
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (suggestions.length > 0) {
                    setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestions.length > 0 && suggestions[highlightedIndex]) {
                    addDependency(suggestions[highlightedIndex].id);
                  } else if (inputValue.trim()) {
                    addDependency(inputValue);
                  }
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              placeholder={t('dependencies.addPlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-fg placeholder:text-fg-faint focus:outline-none focus:border-border-strong"
            />

            {/* Autocomplete Suggestions Dropdown */}
            {inputValue.trim() && suggestions.length > 0 && (
              <div className="mt-1 rounded-lg border border-border bg-bg-1 shadow-lg max-h-40 overflow-y-auto py-1">
                {suggestions.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addDependency(item.id)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 text-[12px] transition-colors ${
                      i === highlightedIndex ? 'bg-accent/15 text-fg' : 'text-fg-muted hover:bg-bg-2 hover:text-fg'
                    }`}
                  >
                    <span className="font-mono text-[11px] font-semibold px-1 rounded bg-bg-2 border border-border text-fg-dim">
                      {item.id}
                    </span>
                    <span className="truncate flex-1 text-[11.5px]">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
