/**
 * @file App header
 * @description Top navigation bar for project switching, task search, filters,
 * view mode, density, settings, command palette, reload, and task creation.
 *
 * 📖 The header now owns the compact search input and active filter chips that
 * previously lived in a separate FilterBar below the header. This keeps the
 * board/list area maximally spacious while keeping filters one click away.
 * 📖 The header is intentionally thin: it reads state from the store, delegates
 * commands to store actions, and lets the board/list/drawer handle the actual
 * task presentation.
 *
 * @functions
 *  → LogoSvg — inline Kandown mark used in the header
 *  → Header — primary app toolbar with search, filters, and recent-project menu
 *
 * @exports Header
 * @see src/lib/store.ts
 * @see src/hooks/useAnimatedNumber.ts
 */

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { useStore } from '../lib/store';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { KANDOWN_VERSION } from '../lib/version';
import type { OwnerType } from '../lib/types';

const LogoSvg = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 150 150"
    className={className}
    fill="currentColor"
  >
    <path d="m57.6 64.6 0.1-0.1v-31.3c-0.1-3.5-2.7-5.6-5.7-5.6h-16.3v59.6c0.2-1.3 0.9-2.6 1.7-3.2l20.2-19.4z"/>
    <path d="m87.6 43.8c-3.4 0.1-7.1 1.3-9.9 3.7l-38.5 38.7c-2.1 2.1-3.4 4.8-3.5 7.5v26.7l77.5-76.4v-0.2h-25.6z"/>
    <path d="m108.1 96.4-6 5-22.4-20.8-14.6 14.2 21.1 21.4-5 4.1c-0.6 0.5-0.3 0.9 0.2 0.9h27.6c0.4 0 0.7-0.4 0.7-0.6v-24.8c0-0.7-1.1-0.3-1.6 0.3v0.3z"/>
  </svg>
);

export function Header() {
  const { t } = useTranslation();
  const dirHandle = useStore(s => s.dirHandle);
  const projectName = useStore(s => s.projectName);
  const columns = useStore(s => s.columns);
  const openFolder = useStore(s => s.openFolder);
  const reloadBoard = useStore(s => s.reloadBoard);
  const createTask = useStore(s => s.createTask);
  const setCommandOpen = useStore(s => s.setCommandOpen);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const density = useStore(s => s.density);
  const setDensity = useStore(s => s.setDensity);
  const setCurrentPage = useStore(s => s.setCurrentPage);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);
  const filters = useStore(s => s.filters);
  const setFilter = useStore(s => s.setFilter);
  const clearFilters = useStore(s => s.clearFilters);
  const fields = useStore(s => s.config.fields);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totalTasks = columns.reduce((sum, c) => sum + c.tasks.length, 0);
  const displayCount = useAnimatedNumber(totalTasks);

  const chips: Array<{ type: keyof typeof filters; label: string; value: string }> = [];
  if (fields.priority && filters.priority) chips.push({ type: 'priority', label: filters.priority, value: filters.priority });
  if (fields.tags && filters.tag) chips.push({ type: 'tag', label: '#' + filters.tag, value: filters.tag });
  if (fields.assignee && filters.assignee) chips.push({ type: 'assignee', label: '@' + filters.assignee, value: filters.assignee });

  const ownerOptions: Array<{ label: string; value: OwnerType }> = [
    { label: t('filterBar.ownerAll'), value: '' },
    { label: t('filterBar.ownerHuman'), value: 'human' },
    { label: t('filterBar.ownerAI'), value: 'ai' },
  ];

  const hasFilters = chips.length > 0 || filters.search || (fields.ownerType && filters.ownerType);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="flex items-center justify-between px-5 h-[64px] border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-xl relative z-10">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            onClick={() => window.history.pushState({}, '', window.location.pathname)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <LogoSvg className="w-[34px] h-[34px] dark:text-white text-black" />
            <span className="text-[15px] font-semibold tracking-tight text-fg">kandown</span>
            <span className="inline-flex items-center h-5 px-1.5 text-[10.5px] font-semibold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/15 rounded-md">
              v{KANDOWN_VERSION}
            </span>
          </button>
        </div>

        {dirHandle && (
          <>
            <div className="w-px h-[20px] bg-black/[0.08] dark:bg-white/[0.08] flex-shrink-0" />

            {/* Premium search bar */}
            <div className="flex items-center gap-2 px-3 h-9 bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] rounded-xl min-w-[200px] max-w-[280px] focus-within:border-black/[0.14] dark:focus-within:border-white/[0.18] focus-within:bg-white dark:focus-within:bg-white/10 transition-all">
              <Icon.Search size={14} className="text-fg-muted/60 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                placeholder={t('filterBar.searchPlaceholder')}
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
                className="bg-transparent border-none outline-none text-fg text-[13px] w-full placeholder:text-fg-muted/60"
              />
              {filters.search ? (
                <button
                  onClick={() => setFilter('search', '')}
                  className="text-fg-muted/60 hover:text-fg flex-shrink-0"
                >
                  <Icon.X size={14} />
                </button>
              ) : (
                <kbd className="inline-flex items-center h-5 px-1.5 text-[10px] font-medium text-fg-muted/50 bg-black/[0.04] dark:bg-white/[0.08] rounded border border-black/[0.06] dark:border-white/[0.1]">
                  ⌘K
                </kbd>
              )}
            </div>

            {/* Active filter chips */}
            <div className="flex items-center gap-1.5 flex-wrap overflow-hidden">
              <AnimatePresence>
                {chips.map(chip => (
                  <motion.button
                    key={chip.type + chip.value}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setFilter(chip.type as never, null as never)}
                    className="inline-flex items-center gap-1 h-6 px-2.5 text-[12px] text-fg bg-black/[0.05] dark:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.12] rounded-lg hover:bg-black/[0.08] dark:hover:bg-white/[0.15] transition-colors"
                  >
                    {chip.label}
                    <Icon.X size={10} className="text-fg-muted/60" />
                  </motion.button>
                ))}
              </AnimatePresence>

              {fields.ownerType && (
                <div className="flex items-center h-6 border border-black/[0.06] dark:border-white/[0.1] rounded-lg overflow-hidden">
                  {ownerOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFilter('ownerType', opt.value)}
                      className={`h-full px-2.5 text-[12px] transition-colors ${filters.ownerType === opt.value ? 'bg-black/[0.06] dark:bg-white/[0.12] text-fg' : 'text-fg-muted/70 hover:text-fg'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[12px] text-fg-muted/60 hover:text-fg transition-colors"
                >
                  {t('filterBar.clearAll')}
                </button>
              )}
            </div>
          </>
        )}

        {dirHandle && (
          <>
            <div className="w-px h-[20px] bg-black/[0.08] dark:bg-white/[0.08] flex-shrink-0" />
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-fg-muted hover:text-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] rounded-lg transition-colors border border-transparent hover:border-black/[0.06] dark:hover:border-white/[0.1]"
              >
                <Icon.Folder size={13} className="text-fg-muted/70" />
                <span className="font-medium">.{dirHandle.name}</span>
                <Icon.ChevronDown size={11} className="opacity-50" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 mt-2 min-w-[240px] glass rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    <div className="py-1.5">
                      {recentProjects.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted/60">
                            {t('header.recentProjects')}
                          </div>
                          {recentProjects.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setMenuOpen(false);
                                openRecentProject(p);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[13.5px] text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                            >
                              <Icon.Folder size={12} className="text-fg-muted/60" />
                              <span className="truncate">{p.name}</span>
                              {p.id === dirHandle.name && (
                                <Icon.Check size={12} className="ml-auto text-emerald-500" />
                              )}
                            </button>
                          ))}
                          <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] my-1.5 mx-2" />
                        </>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          openFolder();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[13.5px] text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                      >
                        <Icon.Plus size={12} className="text-fg-muted/60" />
                        <span>{t('header.openFolder...')}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {dirHandle ? (
          <>
            <div className="flex items-center gap-2 mr-2 text-[12.5px] text-fg-muted/70">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <motion.span className="tabular-nums font-medium">{displayCount}</motion.span>
              <span>{t('header.tasks')}</span>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] rounded-xl p-0.5 h-10">
              <button
                onClick={() => setViewMode('board')}
                className={`w-9 h-9 inline-flex items-center justify-center rounded-lg transition-all ${
                  viewMode === 'board'
                    ? 'bg-white dark:bg-white/20 text-fg shadow-sm'
                    : 'text-fg-muted/70 hover:text-fg'
                }`}
                title={t('common.board')}
              >
                <Icon.LayoutBoard size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-9 h-9 inline-flex items-center justify-center rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-white/20 text-fg shadow-sm'
                    : 'text-fg-muted/70 hover:text-fg'
                }`}
                title={t('common.list')}
              >
                <Icon.LayoutList size={18} />
              </button>
            </div>

            <KbdButton
              variant="icon"
              icon="Density"
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
              title={`Density: ${density}`}
            />

            <KbdButton
              variant="icon"
              icon="Settings"
              onClick={() => setCurrentPage('settings')}
              title={t('common.settings')}
            />

            <div className="w-px h-5 bg-black/[0.08] dark:bg-white/[0.08] mx-1" />

            <KbdButton
              variant="secondary"
              icon="Search"
              label={t('common.search')}
              shortcut="⌘K"
              onClick={() => setCommandOpen(true)}
              title="Command palette (⌘K)"
            />

            <KbdButton
              variant="icon"
              icon="Refresh"
              onClick={reloadBoard}
              title={`${t('common.reload')} (R)`}
            />

            <KbdButton
              variant="primary"
              icon="Plus"
              label={t('common.newTask')}
              shortcut="N"
              onClick={() => createTask()}
            />
          </>
        ) : (
          <KbdButton
            variant="primary"
            label={t('common.openFolder')}
            onClick={openFolder}
          />
        )}
      </div>
    </header>
  );
}
