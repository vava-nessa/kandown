import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './Icons';
import { useStore } from '../lib/store';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

export function Header() {
  const dirHandle = useStore(s => s.dirHandle);
  const columns = useStore(s => s.columns);
  const openFolder = useStore(s => s.openFolder);
  const reloadBoard = useStore(s => s.reloadBoard);
  const createTask = useStore(s => s.createTask);
  const setCommandOpen = useStore(s => s.setCommandOpen);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const density = useStore(s => s.density);
  const setDensity = useStore(s => s.setDensity);
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
    <header className="flex items-center justify-between px-5 h-12 border-b border-border bg-bg relative z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-[18px] h-[18px] rounded-[4px] bg-gradient-to-br from-white to-[#888] text-bg text-[10px] font-extrabold flex items-center justify-center">
            K
          </div>
          <span className="text-[13px] font-semibold tracking-tight">Kanban</span>
        </div>

        {dirHandle && (
          <>
            <div className="w-px h-[18px] bg-border" />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-2 py-1 text-[13px] text-fg-dim hover:text-fg hover:bg-bg-2 rounded-[6px] transition-colors"
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
                          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
                            Recent projects
                          </div>
                          {recentProjects.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setMenuOpen(false);
                                openRecentProject(p);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-left hover:bg-bg-3 transition-colors"
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
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-left hover:bg-bg-3 transition-colors"
                      >
                        <Icon.Plus size={12} className="text-fg-muted" />
                        <span>Open folder...</span>
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
            <div className="flex items-center gap-2 mr-2 text-[12px] text-fg-muted">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
              <motion.span className="tabular-nums">{displayCount}</motion.span>
              <span>tasks</span>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center bg-bg-2 border border-border rounded-[6px] p-0.5">
              <button
                onClick={() => setViewMode('board')}
                className={`w-6 h-6 inline-flex items-center justify-center rounded-[4px] transition-all ${
                  viewMode === 'board'
                    ? 'bg-bg-3 text-fg'
                    : 'text-fg-muted hover:text-fg'
                }`}
                title="Board view (⌘1)"
              >
                <Icon.LayoutBoard size={12} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`w-6 h-6 inline-flex items-center justify-center rounded-[4px] transition-all ${
                  viewMode === 'list'
                    ? 'bg-bg-3 text-fg'
                    : 'text-fg-muted hover:text-fg'
                }`}
                title="List view (⌘2)"
              >
                <Icon.LayoutList size={12} />
              </button>
            </div>

            {/* Density toggle */}
            <button
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
              className="btn-icon"
              title={`Density: ${density}`}
            >
              <Icon.Density size={12} />
            </button>

            <button
              onClick={() => setCommandOpen(true)}
              className="btn-secondary"
              title="Command palette (⌘K)"
            >
              <Icon.Search size={12} />
              Search
              <span className="kbd ml-1">⌘K</span>
            </button>

            <button onClick={reloadBoard} className="btn-icon" title="Reload (R)">
              <Icon.Refresh size={12} />
            </button>

            <button onClick={() => createTask()} className="btn-primary">
              <Icon.Plus size={12} />
              New task
              <span className="kbd ml-1" style={{ color: 'rgba(0,0,0,0.5)', background: 'rgba(0,0,0,0.1)', borderColor: 'rgba(0,0,0,0.15)' }}>N</span>
            </button>
          </>
        ) : (
          <button onClick={openFolder} className="btn-primary">
            Open folder
          </button>
        )}
      </div>
    </header>
  );
}
