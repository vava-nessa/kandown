/**
 * @file Web application shell
 * @description Composes the Kandown web UI, hydrates recent projects from the
 * URL, and owns global keyboard shortcuts for board navigation, creation,
 * reload, search focus, and command palette access.
 *
 * 📖 This component does not read markdown files directly. It delegates all
 * project state, persistence, and file-system behavior to the Zustand store so
 * the visual shell stays small and predictable.
 *
 * @functions
 *  → App — root React component for the browser UI
 *
 * @exports App
 * @see src/lib/store.ts
 * @see src/components/Header.tsx
 * @see src/components/SettingsPage.tsx
 */

import { useEffect } from 'react';
import { Header } from './components/Header';

import { Board } from './components/Board';
import { ListView } from './components/ListView';
import { EmptyState } from './components/EmptyState';
import { Drawer } from './components/Drawer';
import { CommandPalette } from './components/CommandPalette';
import { SettingsPage } from './components/SettingsPage';
import { Toaster } from './components/Toaster';
import { ConflictModal } from './components/ConflictModal';
import LiquidEther from './components/LiquidEther';
import { useStore } from './lib/store';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './lib/i18n';
import i18n from './lib/i18n';

export function App() {
  const dirHandle = useStore(s => s.dirHandle);
  const isOpen = useStore(s => s.isOpen);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const commandOpen = useStore(s => s.commandOpen);
  const setCommandOpen = useStore(s => s.setCommandOpen);
  const createTask = useStore(s => s.createTask);
  const reloadBoard = useStore(s => s.reloadBoard);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);
  const tryAutoOpenServerProject = useStore(s => s.tryAutoOpenServerProject);
  const currentPage = useStore(s => s.currentPage);
  const config = useStore(s => s.config);

  // Sync language from config to i18n
  useEffect(() => {
    const lang = config.ui.language;
    if (lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage) && i18n.language !== lang) {
      void changeLanguage(lang as SupportedLanguage);
    }
  }, [config.ui.language]);

  // Handle URL hydration on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectSlug = params.get('p');
    if (projectSlug && !isOpen && !dirHandle) {
      const match = recentProjects.find(p => p.name === projectSlug);
      if (match) {
        openRecentProject(match);
      }
    }
  }, [recentProjects, isOpen, dirHandle, openRecentProject]);

  // 📖 When served via `npx kandown`, window.__KANDOWN_ROOT__ is set. Try to auto-open
  // the matching recent project (if user previously granted access) without showing the picker.
  useEffect(() => {
    void tryAutoOpenServerProject();
  }, [tryAutoOpenServerProject]);
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

      if (e.key === 'n' && (isOpen || dirHandle)) {
        e.preventDefault();
        createTask();
      }
      if (e.key === 'r' && (isOpen || dirHandle)) {
        e.preventDefault();
        reloadBoard();
      }
      if (e.key === '/' && (isOpen || dirHandle)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'header input[type="text"]'
        );
        input?.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, dirHandle, commandOpen, drawerTaskId, setCommandOpen, setViewMode, createTask, reloadBoard]);

  return (
    <div className="flex flex-col h-screen">
      <Header />
      {currentPage === 'settings' ? (
        <SettingsPage />
      ) : isOpen || dirHandle ? (
        <div className="flex-1 relative overflow-hidden">
          {config.ui.background === 'liquid-ether' && (
            <LiquidEther
              className="z-0"
              mouseForce={12}
              cursorSize={45}
              isViscous
              viscous={30}
              colors={['#28098f', '#351131', '#2c1818']}
              autoDemo
              autoSpeed={0.3}
              autoIntensity={0.9}
              isBounce={false}
              resolution={0.5}
            />
          )}
          <div className={`flex flex-col h-full relative ${config.ui.background === 'liquid-ether' ? 'z-10' : ''}`}>
            {viewMode === 'board' ? <Board /> : <ListView />}
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
      <Drawer />
      <CommandPalette />
      <Toaster />
      <ConflictModal />
    </div>
  );
}
