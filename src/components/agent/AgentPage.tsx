/**
 * @file Agent full-page view (t337)
 * @description The agent as a real page, the way code harnesses lay it out:
 * the conversation runs as a centered column filling the main area, the left
 * rail keeps the navigation plus the conversation list, and a retractable
 * per-conversation panel space sits on the right. Owns the page header
 * (conversation title, harness chip, live-turn marker, usage badge, autopilot
 * controls, panel tab toggles, new conversation) while the chat body itself
 * is the shared AgentChatSurface.
 *
 * 📖 Rail collapse is agent-view-only by decision: the expand button lives in
 * this header and the App shell hides the rail while the flag is set, so
 * Board / List / Archives always render the rail again. Opening a task while
 * on this page (card click, [show: tXXX] directive, "ask the agent") routes
 * it into the panel's task tab instead of the page-level editor: the top
 * navigation buttons stay the normal mode for editing tasks.
 *
 * @functions
 *  → AgentPage: the desktop full-page agent view
 *
 * @exports AgentPage
 * @see src/components/agent/AgentChatSurface.tsx: the conversation body
 * @see src/components/agent/AgentPanelSpace.tsx: the right panel registry
 * @see src/components/SideNav.tsx: the conversation list that navigates here
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFileDiff, IconLayoutSidebar, IconMessage, IconNotes, IconPlus } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import type { AgentPanelTab } from '../../lib/store/types';
import { AGENT_PANEL_DRAFT_KEY } from '../../lib/store/agentPanelSlice';
import { relativeTime } from '../../lib/relative-time';
import { AssigneeAvatar } from '../agentIcons';
import { AgentChatSurface } from './AgentChatSurface';
import { AgentPanelSpace } from './AgentPanelSpace';
import { UsageBadge } from './UsageBadge';
import { AutopilotControls } from './AutopilotControls';

export function AgentPage() {
  const { t } = useTranslation();
  const sessions = useStore(s => s.agentChat.sessions);
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const live = useStore(s => s.agentChat.live);
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const panel = useStore(s => s.agentPanel);
  const agentRailCollapsed = useStore(s => s.agentRailCollapsed);
  const setAgentRailCollapsed = useStore(s => s.setAgentRailCollapsed);
  const newConversation = useStore(s => s.newConversation);
  const refreshSessions = useStore(s => s.refreshSessions);
  const openAgentPanelTab = useStore(s => s.openAgentPanelTab);
  const closeAgentPanelTab = useStore(s => s.closeAgentPanelTab);
  const setActiveAgentPanelTab = useStore(s => s.setActiveAgentPanelTab);

  // 📖 Entering the page refreshes the index (a conversation may have been
  // created from another surface) the same way the old sidebar open did.
  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  // 📖 A task opened while the page is showing (card click, [show: tXXX]
  // directive, "ask the agent" with the page already up) lands in the
  // panel's task tab instead of hijacking the whole main area.
  useEffect(() => {
    if (drawerTaskId) openAgentPanelTab('task');
  }, [drawerTaskId, openAgentPanelTab]);

  const key = activeSessionId ?? AGENT_PANEL_DRAFT_KEY;
  const sessionState = panel.bySession[key];
  const openTabs = sessionState?.openTabs ?? [];
  const requestedTab = sessionState?.activeTab ?? 'task';
  const activeTab = openTabs.includes(requestedTab) ? requestedTab : openTabs[0];

  const activeEntry = activeSessionId ? sessions.find(entry => entry.id === activeSessionId) : undefined;
  const fold = activeSessionId ? live[activeSessionId]?.fold : undefined;
  const turnActive = fold?.turnActive ?? false;

  /** 📖 Header tab behavior, harness-style: click an open tab activates it,
   * click the active tab closes it, click a closed tab opens it. */
  const toggleTab = (tab: AgentPanelTab) => {
    if (!openTabs.includes(tab)) {
      openAgentPanelTab(tab);
    } else if (tab === activeTab) {
      closeAgentPanelTab(tab);
    } else {
      setActiveAgentPanelTab(tab);
    }
  };

  const title = activeEntry?.title || t('agentChat.sessionUntitled', 'Untitled conversation');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[52px] flex-none items-center gap-2 border-b border-border px-3">
        {/* 📖 Zcode-style rail toggle (t337), agent-view-only: hides the whole
         * rail for a distraction-free chat, brings it back with the same
         * button. Every other view shows the rail again regardless. */}
        <button
          type="button"
          onClick={() => setAgentRailCollapsed(!agentRailCollapsed)}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-secondary/60 hover:text-fg"
          title={agentRailCollapsed ? t('nav.expand', 'Expand sidebar') : t('nav.collapse', 'Collapse sidebar')}
          aria-label={agentRailCollapsed ? t('nav.expand', 'Expand sidebar') : t('nav.collapse', 'Collapse sidebar')}
        >
          <IconLayoutSidebar size={16} stroke={1.6} className={agentRailCollapsed ? '' : 'rotate-180'} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconMessage size={14} stroke={1.8} className="flex-none text-fg-muted" />
          <span className="min-w-0 truncate text-[13.5px] font-medium text-fg" title={title}>
            {title}
          </span>
          {activeEntry && (
            <span title={activeEntry.harnessId}>
              {/* 📖 Brand logo instead of the harness name (vava, t337 round 2):
               * the glyph reads at a glance where the uppercase text chip used
               * to shout; the name stays on hover. */}
              <AssigneeAvatar assignee={activeEntry.harnessId} size={15} />
            </span>
          )}
          {activeEntry && (
            <span className="flex-none text-[10.5px] tabular-nums text-fg-faint">
              {relativeTime(activeEntry.updatedAt)}
            </span>
          )}
          {turnActive && (
            <span
              className="flex-none h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"
              title={t('agentChat.working', 'Working')}
              aria-label={t('agentChat.working', 'Working')}
            />
          )}
        </div>
        {activeSessionId && fold && <UsageBadge totals={fold.totals} />}
        <AutopilotControls />
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={() => toggleTab('task')}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              openTabs.includes('task')
                ? 'bg-secondary text-fg'
                : 'text-fg-muted hover:bg-secondary/60 hover:text-fg'
            }`}
            title={t('agentChat.panelTask', 'Task')}
            aria-label={t('agentChat.panelTask', 'Task')}
          >
            <IconNotes size={15} stroke={1.7} />
          </button>
          <button
            type="button"
            onClick={() => toggleTab('changes')}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              openTabs.includes('changes')
                ? 'bg-secondary text-fg'
                : 'text-fg-muted hover:bg-secondary/60 hover:text-fg'
            }`}
            title={t('agentChat.panelChanges', 'Changes')}
            aria-label={t('agentChat.panelChanges', 'Changes')}
          >
            <IconFileDiff size={15} stroke={1.7} />
          </button>
          <button
            type="button"
            onClick={newConversation}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-secondary/60 hover:text-fg"
            title={t('agentChat.newChat', 'New chat')}
            aria-label={t('agentChat.newChat', 'New chat')}
          >
            <IconPlus size={16} stroke={1.7} />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 justify-center">
          {/* 📖 The centered harness column: the conversation body capped to
           * chat-page proportions, full height, whatever the window width. */}
          <div className="bui relative flex h-full w-full max-w-[780px] flex-col">
            <AgentChatSurface active />
          </div>
        </div>
        <AgentPanelSpace />
      </div>
    </div>
  );
}
