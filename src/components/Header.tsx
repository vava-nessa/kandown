/**
 * @file App header
 * @description Top navigation bar for project switching, task search, filters
 * (including the category dropdown next to the task count), view mode, density,
 * settings, command palette, reload, and task creation.
 *
 * 📖 The header now owns the compact search input and active filter chips that
 * previously lived in a separate FilterBar below the header. This keeps the
 * board/list area maximally spacious while keeping filters one click away.
 * 📖 The category dropdown next to the task count is a multi-select: every
 * selected category shows as a chip with a small X next to the toggle, and
 * drives `filters.category` (an array, empty = no filter); while non-empty the
 * board and list views show only the matching tasks, with stacks expanded and
 * locked (see CardStack.lockedExpanded).
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

import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { IconMessage } from '@tabler/icons-react';
import { Icon } from './Icons';
import { KbdButton } from './KbdButton';
import { CategoryChip } from './CategoryChip';
import { ThemeSwitcher } from './ui/theme-switcher-1';
import { Tooltip } from './ui/tooltip-card';
import { useStore } from '../lib/store';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { KANDOWN_VERSION } from '../lib/version';
import { MOTION } from '../lib/motion-presets';
import type { OwnerType } from '../lib/types';
import { LogoSvg } from './LogoSvg';
import { isDemoMode } from '../lib/filesystem';

export function Header() {
  const { t } = useTranslation();
  const dirHandle = useStore(s => s.dirHandle);
  const isOpen = useStore(s => s.isOpen);
  const projectName = useStore(s => s.projectName);
  const closeDrawer = useStore(s => s.closeDrawer);
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const saveDrawer = useStore(s => s.saveDrawer);
  const archivedCount = useStore(s => s.archivedTasks.length);
  const showArchives = useStore(s => s.showArchives);
  const setShowArchives = useStore(s => s.setShowArchives);
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
  const lastReloadError = useStore(s => s.lastReloadError);
  const watcherError = useStore(s => s.watcherError);
  const restartWatcher = useStore(s => s.restartWatcher);
  const sidebarOpen = useStore(s => s.agentChat.sidebarOpen);
  const openSidebar = useStore(s => s.openSidebar);
  const closeSidebar = useStore(s => s.closeSidebar);

  const [menuOpen, setMenuOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  // 📖 Boot splash: show the "kandown v<version>" title for 5s on load, then
  // hand the header title over to the open project name (the app's page title).
  const [bootShow, setBootShow] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totalTasks = columns.reduce((sum, c) => sum + c.tasks.length, 0);
  const displayCount = useAnimatedNumber(totalTasks);

  // 📖 Every category present on the board, alphabetically sorted with live
  // counts, powering the category filter dropdown next to the task count.
  // Tasks carry their canonical category (frontmatter first, legacy title
  // bracket fallback), so this is the same list the chips show. Case is
  // folded for the key (`WEB` and `web` are one category) while the first
  // casing seen is kept for display.
  const categories = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const col of columns) {
      for (const task of col.tasks) {
        const cat = (task.category ?? '').trim();
        if (!cat) continue;
        const key = cat.toLowerCase();
        const existing = byKey.get(key);
        if (existing) existing.count += 1;
        else byKey.set(key, { label: cat, count: 1 });
      }
    }
    return [...byKey.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, { label, count }]) => ({ key, label, count }));
  }, [columns]);

  const chips: Array<{ type: keyof typeof filters; label: string; value: string }> = [];
  if (fields.priority && filters.priority) chips.push({ type: 'priority', label: filters.priority, value: filters.priority });
  if (fields.tags && filters.tag) chips.push({ type: 'tag', label: '#' + filters.tag, value: filters.tag });
  if (fields.assignee && filters.assignee) chips.push({ type: 'assignee', label: '@' + filters.assignee, value: filters.assignee });

  const ownerOptions: Array<{ label: string; value: OwnerType }> = [
    { label: t('filterBar.ownerAll'), value: '' },
    { label: t('filterBar.ownerHuman'), value: 'human' },
    { label: t('filterBar.ownerAI'), value: 'ai' },
  ];

  // 📖 Multi-select category filter: `filters.category` is an array of display
  // labels, an empty array filters nothing. Selection is compared case-folded
  // so `web` and `WEB` can never both sit in it. The selected categories render
  // as removable chips right next to the dropdown toggle (NOT in the left
  // filter-chip row: that row only exists when a dirHandle is open, while this
  // cluster must also work in server and demo mode).
  const selectedCategoryKeys = useMemo(
    () => new Set(filters.category.map(c => c.trim().toLowerCase())),
    [filters.category],
  );
  const toggleCategoryFilter = (label: string) => {
    const key = label.trim().toLowerCase();
    const next = selectedCategoryKeys.has(key)
      ? filters.category.filter(c => c.trim().toLowerCase() !== key)
      : [...filters.category, label];
    setFilter('category', next);
  };

  const hasFilters =
    chips.length > 0 || filters.search || (fields.ownerType && filters.ownerType) || filters.category.length > 0;
  const demoMode = isDemoMode();

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

  // 📖 Same outside-click dismissal for the category filter dropdown.
  useEffect(() => {
    if (!catMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setCatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [catMenuOpen]);

  // 📖 Hide the kandown + version splash after 5s, leaving only the logo with
  // the open project name shown as the app's page title.
  useEffect(() => {
    const timer = setTimeout(() => setBootShow(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // 📖 Mirror the open project into the browser tab ("page title" of the app).
  useEffect(() => {
    document.title = projectName ? `${projectName} · Kandown` : 'Kandown';
  }, [projectName]);

  return (
    <>
    {(lastReloadError || watcherError) && (
      <div className="flex items-center gap-2 px-5 py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-[12px] text-amber-700 dark:text-amber-300">
        <span className="flex-1 truncate">
          {watcherError
            ? `⚠ ${watcherError}`
            : `⚠ ${lastReloadError}`}
        </span>
        {watcherError && (
          <button
            type="button"
            onClick={restartWatcher}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[11.5px] font-medium"
          >
            Restart watcher
          </button>
        )}
        <button
          type="button"
          onClick={reloadBoard}
          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[11.5px] font-medium"
        >
          Reload
        </button>
      </div>
    )}
    <header className="flex items-center justify-between px-5 h-[64px] border-b border-border bg-card/80 backdrop-blur-xl relative z-10">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            onClick={() => {
              if (drawerTaskId) {
                void saveDrawer();
              } else {
                closeDrawer({ replace: true });
              }
            }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <LogoSvg className="w-[34px] h-[34px] dark:text-white text-black" />
            {/* 📖 Boot splash (5s): logo + "kandown" + version, then fades out to
             * reveal just the logo with the open project name as page title. */}
            <AnimatePresence mode="wait" initial={false}>
              {bootShow ? (
                <motion.span
                  key="boot"
                  {...MOTION.headerCrossfade}
                  className="flex items-center gap-2"
                >
                  <span className="text-[15px] font-semibold tracking-tight text-fg">kandown</span>
                  <span className="inline-flex items-center h-5 px-1.5 text-[10.5px] font-semibold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/15 rounded-md">
                    v{KANDOWN_VERSION}
                  </span>
                </motion.span>
              ) : projectName ? (
                <motion.span
                  key="project"
                  {...MOTION.headerCrossfade}
                  className="text-[15px] font-semibold tracking-tight text-fg truncate max-w-[240px]"
                >
                  {projectName}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
          {drawerTaskId && (
            <button
              type="button"
              onClick={() => { void saveDrawer(); }}
              className="hidden md:inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-[13px] font-semibold text-fg shadow-sm transition-colors hover:border-border-strong hover:bg-bg-2"
              title={t('taskWorkspace.backToCards')}
            >
              <Icon.ArrowLeft size={15} />
              <span>{t('common.back')}</span>
            </button>
          )}
        </div>

        {dirHandle && (
          <>
            <div className="w-px h-[20px] bg-black/[0.08] dark:bg-white/[0.08] flex-shrink-0" />

            {/* Premium search bar */}
            <div className="flex items-center gap-2 px-3 h-9 bg-secondary/60 border border-border rounded-xl min-w-[200px] max-w-[280px] focus-within:border-border-focus focus-within:bg-secondary transition-all">
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
                    {...MOTION.chip}
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
                    {...MOTION.fade}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12, ease: MOTION.fade.transition.ease }}
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
        {demoMode && (
          <button
            type="button"
            onClick={() => { void openFolder(); }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md sm:px-4"
            title="Open a local Kandown project. Free, private, and no login required."
          >
            <Icon.Folder size={16} />
            <span>Open project</span>
            <span className="hidden text-[11px] font-medium opacity-70 2xl:inline">
              Local · no login
            </span>
          </button>
        )}
        {(isOpen || dirHandle) ? (
          <>
            <div className="flex items-center gap-2 mr-2 text-[12.5px] text-fg-muted/70">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {/* 📖 `displayCount` is a MotionValue, not a number: it has to be
                  rendered by a motion component, which subscribes to it and
                  writes the spring's output straight into the text node. A
                  plain span stringifies the object itself — which is what this
                  counter did, showing "[object Object] tasks" to everyone. */}
              <motion.span className="tabular-nums font-medium transition-colors duration-200">{displayCount}</motion.span>
              <span>{t('header.tasks')}</span>
            </div>

            {/* 📖 Multi-select category filter: the toggle lists every category
             * on the project with live counts; picking entries toggles them in
             * `filters.category` without closing the menu. Each selection shows
             * as a chip with a small X right here, so one or two can be removed
             * in a click; "All categories" (or Clear all) empties the selection.
             * While the selection is non-empty, board and list views show only
             * the matching tasks and their stacks render expanded and locked
             * (CardStack `lockedExpanded`). */}
            <div className="relative flex items-center gap-1.5 flex-shrink-0 mr-1" ref={catMenuRef}>
              {filters.category.map(label => (
                <span
                  key={label.toLowerCase()}
                  className="inline-flex items-center gap-0.5 h-7 pl-1 pr-0.5 rounded-lg border border-black/[0.08] dark:border-white/[0.12] bg-black/[0.04] dark:bg-white/[0.08]"
                >
                  <CategoryChip category={label} />
                  <button
                    type="button"
                    onClick={() => toggleCategoryFilter(label)}
                    title={`${t('common.remove')} ${label}`}
                    aria-label={`${t('common.remove')} ${label}`}
                    className="w-[18px] h-[18px] inline-flex items-center justify-center rounded-md text-fg-muted/60 hover:text-fg hover:bg-black/[0.08] dark:hover:bg-white/[0.15] transition-colors"
                  >
                    <Icon.X size={11} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setCatMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 h-9 px-2.5 text-[12.5px] rounded-xl border transition-colors ${
                  filters.category.length > 0
                    ? 'border-black/[0.12] dark:border-white/[0.16] bg-black/[0.05] dark:bg-white/[0.08] text-fg'
                    : 'border-black/[0.06] dark:border-white/[0.1] text-fg-muted hover:text-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
                aria-label={t('header.allCategories')}
                aria-expanded={catMenuOpen}
                aria-haspopup="listbox"
              >
                <Icon.Tag size={13} className={filters.category.length > 0 ? 'text-accent' : 'text-fg-muted/70'} />
                {filters.category.length === 0 ? (
                  <span className="font-medium">{t('header.allCategories')}</span>
                ) : (
                  <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[10.5px] font-semibold rounded-md bg-black/[0.06] dark:bg-white/[0.12] text-fg tabular-nums">
                    {filters.category.length}
                  </span>
                )}
                <Icon.ChevronDown size={11} className="opacity-50" />
              </button>
              <AnimatePresence>
                {catMenuOpen && (
                  <motion.div
                    {...MOTION.fade}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12, ease: MOTION.fade.transition.ease }}
                    role="listbox"
                    aria-multiselectable="true"
                    className="absolute top-full right-0 mt-2 min-w-[230px] max-h-[340px] overflow-y-auto glass rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-x-hidden z-50"
                  >
                    <div className="py-1.5">
                      <button
                        type="button"
                        role="option"
                        aria-selected={filters.category.length === 0}
                        onClick={() => {
                          setCatMenuOpen(false);
                          setFilter('category', []);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[13.5px] text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                      >
                        <span className="truncate font-medium">{t('header.allCategories')}</span>
                        {filters.category.length === 0 && <Icon.Check size={12} className="ml-auto text-emerald-500" />}
                      </button>
                      {categories.length > 0 && <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] my-1.5 mx-2" />}
                      {categories.map(cat => {
                        const active = selectedCategoryKeys.has(cat.key);
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => toggleCategoryFilter(cat.label)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                          >
                            <CategoryChip category={cat.label} />
                            <span className="ml-auto inline-flex items-center h-[18px] px-1.5 text-[10.5px] font-medium rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-fg-muted tabular-nums flex-none">
                              {cat.count}
                            </span>
                            {active && <Icon.Check size={12} className="ml-1 text-emerald-500 flex-none" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] rounded-xl p-0.5 h-10">
              <Tooltip content={t('common.board')}>
                <button
                  onClick={() => setViewMode('board')}
                  className={`w-9 h-9 inline-flex items-center justify-center rounded-lg transition-all ${
                    viewMode === 'board'
                      ? 'bg-card text-fg shadow-sm'
                      : 'text-fg-muted/70 hover:text-fg'
                  }`}
                  aria-label={t('common.board')}
                >
                  <Icon.LayoutBoard size={18} />
                </button>
              </Tooltip>
              <Tooltip content={t('common.list')}>
                <button
                  onClick={() => setViewMode('list')}
                  className={`w-9 h-9 inline-flex items-center justify-center rounded-lg transition-all ${
                    viewMode === 'list'
                      ? 'bg-card text-fg shadow-sm'
                      : 'text-fg-muted/70 hover:text-fg'
                  }`}
                  aria-label={t('common.list')}
                >
                  <Icon.LayoutList size={18} />
                </button>
              </Tooltip>
            </div>

            <Tooltip content={showArchives ? t('header.backToBoard') : `${t('header.archives')} (${archivedCount})`}>
              <KbdButton
                variant="icon"
                icon="Archive"
                onClick={() => setShowArchives(!showArchives)}
                className={showArchives ? 'text-accent' : ''}
              />
            </Tooltip>

            {/* 📖 Agent chat sidebar toggle (t308, ⌘J). Active tint while the
             * sidebar is open, mirroring the archives button. */}
            <Tooltip content={`${t('agentChat.title', 'Agent')} (⌘J)`}>
              <button
                type="button"
                onClick={() => (sidebarOpen ? closeSidebar() : openSidebar())}
                aria-label={t('agentChat.title', 'Agent')}
                aria-pressed={sidebarOpen}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  sidebarOpen ? 'bg-black/[0.06] text-accent dark:bg-white/[0.1]' : 'text-fg-muted/70 hover:text-fg'
                }`}
              >
                <IconMessage size={17} stroke={1.6} />
              </button>
            </Tooltip>

            <Tooltip content={`Densité: ${density === 'compact' ? 'Compacte' : 'Confortable'}`}>
              <KbdButton
                variant="icon"
                icon="Density"
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
              />
            </Tooltip>

            <Tooltip content={t('common.settings')}>
              <KbdButton
                variant="icon"
                icon="Settings"
                onClick={() => setCurrentPage('settings')}
              />
            </Tooltip>

            <Tooltip content="Changer de thème">
              <div>
                <ThemeSwitcher />
              </div>
            </Tooltip>

            <div className="w-px h-5 bg-black/[0.08] dark:bg-white/[0.08] mx-1" />

            <Tooltip content="Palette de commandes (⌘K)">
              <KbdButton
                variant="secondary"
                icon="Search"
                label={t('common.search')}
                shortcut="⌘K"
                onClick={() => setCommandOpen(true)}
              />
            </Tooltip>

            <Tooltip content={`${t('common.reload')} (R)`}>
              <KbdButton
                variant="icon"
                icon="Refresh"
                onClick={reloadBoard}
              />
            </Tooltip>

            <Tooltip content="Créer une nouvelle tâche (N)">
              <KbdButton
                variant="primary"
                icon="Plus"
                label={t('common.newTask')}
                shortcut="N"
                onClick={() => createTask()}
              />
            </Tooltip>
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
    </>
  );
}
