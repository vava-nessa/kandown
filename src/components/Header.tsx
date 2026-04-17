/**
 * @file App header
 * @description Top navigation bar for project switching, task counts, view mode,
 * density, settings, command palette, reload, and task creation.
 *
 * 📖 The header is intentionally thin: it reads state from the store, delegates
 * commands to store actions, and lets the board/list/drawer handle the actual
 * task presentation.
 *
 * @functions
 *  → LogoSvg — inline Kandown mark used in the header
 *  → Header — primary app toolbar and recent-project menu
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const totalTasks = columns.reduce((sum, c) => sum + c.tasks.length, 0);
  const displayCount = useAnimatedNumber(totalTasks);

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
    <header className="flex items-center justify-between px-5 h-14 border-b border-border bg-bg relative z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.history.pushState({}, '', window.location.pathname)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <LogoSvg className="w-[36px] h-[36px] dark:text-white text-black" />
            <span className="text-[15px] font-semibold tracking-tight">{t('app.name')}</span>
          </button>
        </div>

        {dirHandle && (
          <>
            <div className="w-px h-[18px] bg-border" />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-2 py-1 text-[14px] text-fg-dim hover:text-fg hover:bg-bg-2 rounded-[6px] transition-colors"
              >
                <Icon.Folder size={12} className="text-fg-muted" />
                <span>{dirHandle.name}</span>
                <Icon.ChevronDown size={10} className="opacity-60" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 mt-1.5 min-w-[240px] glass rounded-[8px] shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    <div className="py-1.5">
                      {recentProjects.length > 0 && (
                        <>
                          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
                            {t('header.recentProjects')}
                          </div>
                          {recentProjects.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setMenuOpen(false);
                                openRecentProject(p);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[13.5px] text-left hover:bg-bg-3 transition-colors"
                            >
                              <Icon.Folder size={12} className="text-fg-muted" />
                              <span className="truncate">{p.name}</span>
                              {p.id === dirHandle.name && (
                                <Icon.Check size={12} className="ml-auto text-success" />
                              )}
                            </button>
                          ))}
                          <div className="h-px bg-border my-1.5 mx-2" />
                        </>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          openFolder();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[13.5px] text-left hover:bg-bg-3 transition-colors"
                      >
                        <Icon.Plus size={12} className="text-fg-muted" />
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

      <div className="flex items-center gap-1.5">
        {dirHandle ? (
          <>
            <div className="flex items-center gap-2 mr-2 text-[13px] text-fg-muted">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
              <motion.span className="tabular-nums">{displayCount}</motion.span>
              <span>{t('header.tasks')}</span>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center bg-bg-2 border border-border rounded-[10px] p-0.5 h-11">
              <button
                onClick={() => setViewMode('board')}
                className={`w-10 h-10 inline-flex items-center justify-center rounded-[8px] transition-all ${
                  viewMode === 'board'
                    ? 'bg-bg-3 text-fg'
                    : 'text-fg-muted hover:text-fg'
                }`}
                title={t('common.board')}
              >
                <Icon.LayoutBoard size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-10 h-10 inline-flex items-center justify-center rounded-[8px] transition-all ${
                  viewMode === 'list'
                    ? 'bg-bg-3 text-fg'
                    : 'text-fg-muted hover:text-fg'
                }`}
                title={t('common.list')}
              >
                <Icon.LayoutList size={20} />
              </button>
            </div>

            {/* Density toggle */}
            <KbdButton
              variant="icon"
              icon="Density"
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
              title={`Density: ${density}`}
            />

            {/* Settings */}
            <KbdButton
              variant="icon"
              icon="Settings"
              onClick={() => setCurrentPage('settings')}
              title={t('common.settings')}
            />

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
