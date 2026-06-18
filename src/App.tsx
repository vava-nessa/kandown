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
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { Icon } from './components/Icons';

import { Board } from './components/Board';
import { ArchiveView } from './components/ArchiveView';
import { ListView } from './components/ListView';
import { EmptyState } from './components/EmptyState';
import { Drawer } from './components/Drawer';
import { CommandPalette } from './components/CommandPalette';
import { Cheatsheet } from './components/Cheatsheet';
import { SettingsPage } from './components/SettingsPage';
import { Toaster } from './components/Toaster';
import { ConflictModal } from './components/ConflictModal';

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
  const cheatsheetOpen = useStore(s => s.cheatsheetOpen);
  const setCheatsheetOpen = useStore(s => s.setCheatsheetOpen);
  const createTask = useStore(s => s.createTask);
  const { t } = useTranslation();
  const reloadBoard = useStore(s => s.reloadBoard);
  const recentProjects = useStore(s => s.recentProjects);
  const openRecentProject = useStore(s => s.openRecentProject);
  const tryAutoOpenServerProject = useStore(s => s.tryAutoOpenServerProject);
  const currentPage = useStore(s => s.currentPage);
  const showArchives = useStore(s => s.showArchives);
  const showMetadata = useStore(s => s.showMetadata);
  const setShowMetadata = useStore(s => s.setShowMetadata);
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

      // 📖 `?` toggles the cheatsheet. Only outside text inputs to avoid
      // hijacking the actual `?` character when the user is typing.
      if (e.key === '?' && !isTyping && !drawerTaskId) {
        e.preventDefault();
        setCheatsheetOpen(!cheatsheetOpen);
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
  }, [isOpen, dirHandle, commandOpen, cheatsheetOpen, drawerTaskId, setCommandOpen, setCheatsheetOpen, setViewMode, createTask, reloadBoard]);

  return (
    <div className="flex flex-col h-screen">
      <Header />
      {currentPage === 'settings' ? (
        <SettingsPage />
      ) : isOpen || dirHandle ? (
        <div className="flex-1 relative overflow-hidden">
          {config.ui.background === 'static-gradient' && (
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
          )}
          <div className={`flex flex-col h-full relative ${config.ui.background === 'static-gradient' ? 'z-10' : ''}`}>
            {showArchives ? <ArchiveView /> : viewMode === 'board' ? <Board /> : <ListView />}
          </div>
          {/* 📖 Discreet bottom-right master switch for the per-card metadata
           * block. Hidden by default (showMetadata = true). When flipped, every
           * card on the board reveals its frontmatter metadata (priority,
           * assignee, tags, due, ownerType, tools, custom keys) in a single
           * collapsible block. Fixed so it never collides with the columns. */}
          <button
            type="button"
            onClick={() => setShowMetadata(!showMetadata)}
            title={showMetadata ? t('header.showMetadata') : t('header.hideMetadata')}
            className="fixed bottom-3 right-3 z-40 px-2.5 py-1 rounded-md bg-card/80 backdrop-blur border border-border text-[11px] text-fg-muted hover:text-fg hover:border-border-strong transition-colors flex items-center gap-1.5"
          >
            {showMetadata ? <Icon.Eye size={12} /> : <Icon.EyeOff size={12} />}
            <span>{showMetadata ? t('header.showMetadata') : t('header.hideMetadata')}</span>
          </button>
        </div>
      ) : (
        <EmptyState />
      )}
      <Drawer />
      <CommandPalette />
      <Cheatsheet />
      <Toaster />
      <ConflictModal />
    </div>
  );
}
