/**
 * @file Zustand store slice: agent right panel space (t337)
 * @description Per-conversation tab state for the agent page's right panel.
 * The panel is a generic retractable space next to the chat: each conversation
 * keeps its own set of open tabs (task, changes, and future usages), so
 * switching conversations restores that conversation's own panel layout.
 * Conversations without a session yet (a fresh draft) share the 'draft' key.
 *
 * 📖 Deliberately UI-only: the panel never stores task or conversation data
 * (rule 6, no second source of truth). The task tab renders the drawer store's
 * open task, the changes tab folds live session events; this slice only tracks
 * which tabs the user left open, in memory for the page life.
 *
 * @functions
 *  → createInitialAgentPanelState: the closed panel seeded into the store
 *  → createAgentPanelSlice: open/close/activate actions, keyed per session
 *
 * @exports createAgentPanelSlice, createInitialAgentPanelState
 * @see src/components/agent/AgentPanelSpace.tsx: the renderer + tab registry
 * @see src/lib/store/types.ts: AgentPanelState shape
 */

import type { StateCreator } from 'zustand';
import type { State, AgentPanelSessionState, AgentPanelState, AgentPanelTab } from './types';

/** 📖 Key under which a conversation without an active session id keeps its
 * panel layout (a fresh draft the next send will turn into a session). */
export const AGENT_PANEL_DRAFT_KEY = 'draft';

/** 📖 Default layout for a conversation that has no panel state yet: the
 * panel starts closed, and opening a tab starts with just that tab. */
const EMPTY_SESSION_STATE: AgentPanelSessionState = { openTabs: [], activeTab: 'task' };

export interface AgentPanelSlice {
  openAgentPanelTab: State['openAgentPanelTab'];
  closeAgentPanelTab: State['closeAgentPanelTab'];
  setActiveAgentPanelTab: State['setActiveAgentPanelTab'];
  toggleAgentPanel: State['toggleAgentPanel'];
}

export function createInitialAgentPanelState(): AgentPanelState {
  return { open: false, bySession: {} };
}

export const createAgentPanelSlice: StateCreator<State, [], [], AgentPanelSlice> = (set, get) => {
  /** 📖 Session key for the conversation currently on the agent page, plus
   * its state (created on demand so every write has a full layout to patch). */
  const sessionState = (): { key: string; state: AgentPanelSessionState } => {
    const key = get().agentChat.activeSessionId ?? AGENT_PANEL_DRAFT_KEY;
    const existing = get().agentPanel.bySession[key];
    return { key, state: existing ? { ...existing } : { ...EMPTY_SESSION_STATE } };
  };

  const writeSessionState = (key: string, next: AgentPanelSessionState): void => {
    set(state => ({
      agentPanel: {
        ...state.agentPanel,
        open: next.openTabs.length > 0,
        bySession: { ...state.agentPanel.bySession, [key]: next },
      },
    }));
  };

  return {
    openAgentPanelTab: (tab) => {
      const { key, state: session } = sessionState();
      writeSessionState(key, {
        openTabs: session.openTabs.includes(tab) ? session.openTabs : [...session.openTabs, tab],
        activeTab: tab,
      });
    },

    closeAgentPanelTab: (tab) => {
      const { key, state: session } = sessionState();
      const openTabs = session.openTabs.filter(entry => entry !== tab);
      const activeTab = session.activeTab === tab
        ? openTabs[0] ?? session.activeTab
        : session.activeTab;
      writeSessionState(key, { openTabs, activeTab });
    },

    setActiveAgentPanelTab: (tab) => {
      const { key, state: session } = sessionState();
      if (!session.openTabs.includes(tab)) return;
      writeSessionState(key, { ...session, activeTab: tab });
    },

    toggleAgentPanel: () => {
      set(state => ({ agentPanel: { ...state.agentPanel, open: !state.agentPanel.open } }));
    },
  };
};
