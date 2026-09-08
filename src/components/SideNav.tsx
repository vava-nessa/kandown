/**
 * @file Left navigation rail (t332, conversations list added by t337)
 * @description Collapsed-by-default icon rail that expands to a full sidebar on
 * click. Owns the primary view navigation (board, list, archives, agent page),
 * the project's conversation list (the only session switcher since t337),
 * the settings entry, the light/dark mode switch and the git footer showing
 * the active branch plus a worktree marker. Replaces the header's row of
 * icon-only view toggles so the header stays a thin search/action bar.
 *
 * 📖 Expansion state lives in the store (`sidebarExpanded`, persisted to
 * localStorage) so the choice survives reloads. Git facts come from the
 * read-only `/api/git` route; the footer hides itself whenever the info is
 * unavailable (demo mode, non-git project, static file usage), so it can
 * never render an error state.
 *
 * 📖 Conversations (t337): the expanded rail lists the project's agent chat
 * sessions straight from the session index, always visible whatever the
 * active view. A row resumes its conversation and opens the agent page;
 * the hover trash button forgets the index entry. The section, like the
 * Agent nav item, hides entirely when `agent.useAgents` is off. Below 768px
 * the agent still opens as the mobile overlay, mirroring openSidebar's own
 * routing.
 *
 * @functions
 *  → SideNavItem — one rail entry, icon-only when collapsed, icon + label expanded
 *  → GitFooter — active branch + worktree marker, click to copy
 *  → ConversationRow — one indexed conversation in the expanded rail
 *  → SideNav — the rail itself
 *
 * @exports SideNav
 * @see src/components/Header.tsx
 * @see src/components/agent/AgentPage.tsx
 * @see src/lib/store.ts
 * @see src/lib/filesystem.ts
 */

import { useEffect, useState } from 'react';
import {
  IconArchive,
  IconGitBranch,
  IconLayoutBoard,
  IconLayoutList,
  IconMessage,
  IconLayoutSidebar,
  IconPlus,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import { MoonStarIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './ui/tooltip-card';
import { ThemeSwitcher } from './ui/theme-switcher-1';
import { LogoSvg } from './LogoSvg';
import { useStore } from '../lib/store';
import { fetchGitInfo } from '../lib/filesystem';
import { relativeTime } from '../lib/relative-time';
import type { SessionIndexEntryPayload } from '../lib/types';
import type { ThemeMode } from '../lib/types';

interface SideNavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  expanded: boolean;
  badge?: number;
  onClick: () => void;
}

function SideNavItem({ icon, label, active, expanded, badge, onClick }: SideNavItemProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full items-center rounded-lg transition-colors ${
        expanded ? 'gap-2.5 px-2.5 h-9' : 'justify-center h-9 w-9 mx-auto'
      } ${
        active
          ? 'bg-secondary text-fg'
          : 'text-fg-muted hover:text-fg hover:bg-secondary/60'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      {expanded && (
        <span className="text-[13px] font-medium truncate">{label}</span>
      )}
      {badge !== undefined && badge > 0 && (
        <span
          className={`text-[10.5px] font-semibold tabular-nums rounded-md px-1.5 py-px ${
            expanded ? 'ml-auto' : 'absolute translate-x-3 -translate-y-2'
          } ${active ? 'bg-primary/15 text-fg' : 'bg-secondary text-fg-muted'}`}
        >
          {badge}
        </span>
      )}
    </button>
  );

  if (expanded) return button;
  return <Tooltip content={label} containerClassName="w-full">{button}</Tooltip>;
}

/**
 * 📖 Git footer: fetches once on mount and again whenever the window regains
 * focus, because branch switches happen in a terminal while kandown stays
 * open. Purely informational: clicking copies the branch name.
 */
function GitFooter({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const toast = useStore(s => s.toast);
  const [git, setGit] = useState<{ branch: string; worktree: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchGitInfo().then(info => {
        if (!cancelled) setGit(info);
      });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, []);

  if (!git) return null;

  const copy = () => {
    void navigator.clipboard.writeText(git.branch).then(() => {
      toast(t('nav.branchCopied'), 'success', 2500);
    });
  };

  const content = (
    <button
      type="button"
      onClick={copy}
      title={t('nav.copyBranch')}
      className={`flex w-full items-center rounded-lg text-fg-muted hover:text-fg hover:bg-secondary/60 transition-colors ${
        expanded ? 'gap-2 px-2.5 h-8' : 'justify-center h-9 w-9'
      }`}
    >
      <IconGitBranch size={15} stroke={1.6} className="flex-shrink-0" />
      {expanded && (
        <>
          <span className="text-[12px] font-medium truncate tabular-nums">{git.branch}</span>
          {git.worktree && (
            <span
              title={t('nav.worktree')}
              className="ml-auto flex-shrink-0 inline-flex items-center h-[16px] px-1 rounded text-[9.5px] font-semibold uppercase tracking-wide bg-secondary text-fg-muted"
            >
              wt
            </span>
          )}
        </>
      )}
    </button>
  );

  if (expanded) return content;
  return <Tooltip content={`${git.branch}${git.worktree ? ' · ' + t('nav.worktree') : ''}`}>{content}</Tooltip>;
}

/** 📖 Collapsed-rail mode toggle (t332): the full ThemeSwitcher needs width,
 * so the icon-only rail gets a single button that cycles auto, light and dark
 * through the same config path. */
function CollapsedModeToggle() {
  const themeMode = useStore(s => s.config.ui.theme);
  const updateConfig = useStore(s => s.updateConfig);
  const next: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
  const cycle = () => {
    const target = next[themeMode];
    void updateConfig(current => ({
      ...current,
      ui: { ...current.ui, theme: target },
    }));
  };
  const label = themeMode === 'dark'
    ? 'dark'
    : themeMode === 'light'
      ? 'light'
      : 'system';
  return (
    <Tooltip content={`Theme mode: ${label}`}>
      <button
        type="button"
        onClick={cycle}
        aria-label={`Switch to ${label} theme`}
        className="flex mx-auto items-center justify-center w-9 h-9 rounded-lg text-fg-muted hover:text-fg hover:bg-secondary/60 transition-colors"
      >
        {themeMode === 'dark' ? <MoonStarIcon size={16} /> : <SunIcon size={16} />}
      </button>
    </Tooltip>
  );
}

/** 📖 One conversation row in the expanded rail (t337): title plus age on
 * two lines, click to resume and open the agent page, hover trash to forget
 * the index entry (a live harness session keeps running, this is a list
 * removal only, exactly like the old dropdown's forget). */
function ConversationRow({ entry, active, onSelect, onForget, untitledLabel, forgetLabel }: {
  entry: SessionIndexEntryPayload;
  active: boolean;
  onSelect: () => void;
  onForget: () => void;
  untitledLabel: string;
  forgetLabel: string;
}) {
  return (
    <div
      className={`group flex items-center rounded-lg pr-1 transition-colors ${
        active ? 'bg-secondary' : 'hover:bg-secondary/60'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start px-2.5 py-1.5 text-left"
        title={entry.title || untitledLabel}
      >
        <span className="w-full truncate text-[12px] leading-tight text-fg">
          {entry.title || untitledLabel}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-none text-fg-muted">
          <span className="rounded bg-bg-2 px-1 py-px font-mono uppercase">{entry.harnessId}</span>
          <span className="tabular-nums">{relativeTime(entry.updatedAt)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onForget}
        className="flex-none rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        title={forgetLabel}
        aria-label={forgetLabel}
      >
        <IconTrash size={11} stroke={1.8} />
      </button>
    </div>
  );
}

export function SideNav() {
  const { t } = useTranslation();
  const isOpen = useStore(s => s.isOpen);
  const dirHandle = useStore(s => s.dirHandle);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const showArchives = useStore(s => s.showArchives);
  const setShowArchives = useStore(s => s.setShowArchives);
  const archivedCount = useStore(s => s.archivedTasks.length);
  const sidebarExpanded = useStore(s => s.sidebarExpanded);
  const setSidebarExpanded = useStore(s => s.setSidebarExpanded);
  const setCurrentPage = useStore(s => s.setCurrentPage);
  const currentPage = useStore(s => s.currentPage);
  const useAgents = useStore(s => s.config.agent.useAgents !== false);
  const agentSessions = useStore(s => s.agentChat.sessions);
  const agentGuard = useStore(s => s.agentChat.guard);
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const resumeSession = useStore(s => s.resumeSession);
  const forgetSession = useStore(s => s.forgetSession);
  const newConversation = useStore(s => s.newConversation);
  const refreshSessions = useStore(s => s.refreshSessions);
  const openAgentSidebar = useStore(s => s.openSidebar);

  const projectOpen = isOpen || !!dirHandle;
  const expanded = sidebarExpanded;

  const goTo = (mode: 'board' | 'list') => {
    setCurrentPage('board');
    setShowArchives(false);
    setViewMode(mode);
  };

  // 📖 t337: desktop navigates to the full-page agent view; below 768px the
  // agent is still the fullscreen overlay (openSidebar routes both ways too,
  // this keeps rail clicks, ⌘J and card buttons on the same path).
  const goToAgent = () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setCurrentPage('agent');
      void refreshSessions();
    } else {
      openAgentSidebar();
    }
  };

  // 📖 The conversation list needs the session index: one fetch when the rail
  // first shows a project with agents enabled (refreshSessions sets the guard,
  // so a demo / no-daemon project simply never shows the section).
  useEffect(() => {
    if (projectOpen && useAgents && useStore.getState().agentChat.guard === 'unknown') {
      void refreshSessions();
    }
  }, [projectOpen, useAgents, refreshSessions]);

  const navItems = projectOpen ? (
    <>
      <SideNavItem
        icon={<IconLayoutBoard size={17} stroke={1.6} />}
        label={t('common.board')}
        active={currentPage === 'board' && !showArchives && viewMode === 'board'}
        expanded={expanded}
        onClick={() => goTo('board')}
      />
      <SideNavItem
        icon={<IconLayoutList size={17} stroke={1.6} />}
        label={t('common.list')}
        active={currentPage === 'board' && !showArchives && viewMode === 'list'}
        expanded={expanded}
        onClick={() => goTo('list')}
      />
      <SideNavItem
        icon={<IconArchive size={17} stroke={1.6} />}
        label={t('header.archives')}
        active={currentPage === 'board' && showArchives}
        expanded={expanded}
        badge={archivedCount}
        onClick={() => {
          setCurrentPage('board');
          setShowArchives(true);
        }}
      />
      {useAgents && (
        <SideNavItem
          icon={<IconMessage size={17} stroke={1.6} />}
          label={t('agentChat.title', 'Agent')}
          active={currentPage === 'agent'}
          expanded={expanded}
          onClick={goToAgent}
        />
      )}
      {/* 📖 Conversations (t337): the only session switcher, always visible in
       * the expanded rail whatever the active view. Hidden without a daemon
       * answer ('no-daemon', demo, stale auth): an unreachable list would
       * only be noise. */}
      {expanded && useAgents && projectOpen && (agentGuard === 'available' || agentSessions.length > 0) && (
        <div className="mt-4 flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-2.5 pb-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-faint">
              {t('agentChat.conversations', 'Conversations')}
            </span>
            <button
              type="button"
              onClick={() => {
                newConversation();
                goToAgent();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-fg-faint transition-colors hover:bg-secondary/60 hover:text-fg"
              title={t('agentChat.newChat', 'New chat')}
              aria-label={t('agentChat.newChat', 'New chat')}
            >
              <IconPlus size={12} stroke={1.8} />
            </button>
          </div>
          {agentSessions.length === 0 ? (
            <p className="px-2.5 text-[11px] leading-relaxed text-fg-faint">
              {t('agentChat.sessionsEmpty', 'No conversations yet')}
            </p>
          ) : (
            agentSessions.map(entry => (
              <ConversationRow
                key={entry.id}
                entry={entry}
                active={entry.id === activeSessionId && currentPage === 'agent'}
                onSelect={() => {
                  if (entry.id !== activeSessionId) void resumeSession(entry);
                  goToAgent();
                }}
                onForget={() => void forgetSession(entry.id)}
                untitledLabel={t('agentChat.sessionUntitled', 'Untitled conversation')}
                forgetLabel={t('agentChat.forget', 'Forget')}
              />
            ))
          )}
        </div>
      )}
    </>
  ) : null;

  return (
    <aside
      className="flex flex-col h-full flex-shrink-0 border-r border-border bg-card/40 transition-[width] duration-200 ease-in-out"
      style={{ width: expanded ? 228 : 56 }}
    >
      <div className={`flex items-center h-[64px] flex-shrink-0 ${expanded ? 'px-2.5 gap-2' : 'justify-center'}`}>
        <button
          type="button"
          onClick={() => setSidebarExpanded(!expanded)}
          aria-label={expanded ? t('nav.collapse') : t('nav.expand')}
          title={expanded ? t('nav.collapse') : t('nav.expand')}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-fg-muted hover:text-fg hover:bg-secondary/60 transition-colors"
        >
          <IconLayoutSidebar size={17} stroke={1.6} className={expanded ? 'rotate-180' : ''} />
        </button>
        {expanded && (
          <span className="flex items-center gap-2 min-w-0">
            <LogoSvg className="w-[26px] h-[26px] dark:text-white text-black flex-shrink-0" />
            <span className="text-[13.5px] font-semibold tracking-tight text-fg truncate">kandown</span>
          </span>
        )}
      </div>

      <nav className={`flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto pt-2 ${expanded ? 'px-2' : 'px-2'}`}>
        {navItems}
      </nav>

      <div className={`flex flex-col gap-1 flex-shrink-0 pb-3 pt-2 ${expanded ? 'px-2' : 'px-2'}`}>
        <SideNavItem
          icon={<IconSettings size={17} stroke={1.6} />}
          label={t('common.settings')}
          active={currentPage === 'settings'}
          expanded={expanded}
          onClick={() => setCurrentPage('settings')}
        />
        <GitFooter expanded={expanded} />
        {expanded ? (
          <div className="mt-1 px-1">
            <ThemeSwitcher />
          </div>
        ) : (
          <CollapsedModeToggle />
        )}
      </div>
    </aside>
  );
}
