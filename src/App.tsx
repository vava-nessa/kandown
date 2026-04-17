import { useEffect } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { Board } from './components/Board';
import { ListView } from './components/ListView';
import { EmptyState } from './components/EmptyState';
import { Drawer } from './components/Drawer';
import { CommandPalette } from './components/CommandPalette';
import { Settings } from './components/Settings';
import { Toaster } from './components/Toaster';
import { useStore } from './lib/store';

export function App() {
  const dirHandle = useStore(s => s.dirHandle);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const commandOpen = useStore(s => s.commandOpen);
  const setCommandOpen = useStore(s => s.setCommandOpen);
  const createTask = useStore(s => s.createTask);
  const reloadBoard = useStore(s => s.reloadBoard);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);

  // Handle URL hydration on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectSlug = params.get('p');
    if (projectSlug && !dirHandle) {
      const match = recentProjects.find(p => p.name === projectSlug);
      if (match) {
        openRecentProject(match);
      }
    }
  }, [recentProjects, dirHandle, openRecentProject]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable);

      // ⌘K / Ctrl+K always
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(!commandOpen);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setViewMode('board');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setViewMode('list');
        return;
      }

      if (isTyping || drawerTaskId || commandOpen) return;

      if (e.key === 'n' && dirHandle) {
        e.preventDefault();
        createTask();
      }
      if (e.key === 'r' && dirHandle) {
        e.preventDefault();
        reloadBoard();
      }
      if (e.key === '/' && dirHandle) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder="Search tasks..."]'
        );
        input?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dirHandle, commandOpen, drawerTaskId, setCommandOpen, setViewMode, createTask, reloadBoard]);

  return (
    <div className="flex flex-col h-screen">
      <Header />
      {dirHandle ? (
        <>
          <FilterBar />
          {viewMode === 'board' ? <Board /> : <ListView />}
        </>
      ) : (
        <EmptyState />
      )}
      <Drawer />
      <CommandPalette />
      <Settings />
      <Toaster />
    </div>
  );
}
