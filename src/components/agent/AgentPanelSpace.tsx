/**
 * @file Agent right panel space (t337)
 * @description The retractable panel column next to the chat on the agent
 * page, in the spirit of the code-harness side panels: a tab strip at the
 * top, one conversation's content below. The panel is a generic space meant
 * to grow new usages, so everything is driven by a small registry: a new
 * panel joins by adding a member to AgentPanelTab (store/types.ts) and one
 * entry in AGENT_PANEL_REGISTRY. Which tabs are open, and which is showing,
 * is stored per conversation (agentPanel slice), so switching conversations
 * restores that conversation's own layout.
 *
 * @functions
 *  → AgentPanelSpace: the tab strip + active tab content for the current
 *    conversation; renders null when the panel is closed or tab-less
 *
 * @exports AgentPanelSpace
 * @see src/components/agent/AgentPanelTask.tsx
 * @see src/components/agent/AgentPanelChanges.tsx
 * @see src/lib/store/agentPanelSlice.ts: the per-conversation tab state
 */

import { useTranslation } from 'react-i18next';
import { IconFileDiff, IconNotes, IconX } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import type { AgentPanelTab } from '../../lib/store/types';
import { AGENT_PANEL_DRAFT_KEY } from '../../lib/store/agentPanelSlice';
import { AgentPanelTask } from './AgentPanelTask';
import { AgentPanelChanges } from './AgentPanelChanges';

/** 📖 One entry of the panel registry: label, icon and the content renderer
 * for a tab. The sessionId argument lets a tab scope itself to the active
 * conversation (the task tab reads the drawer store instead, which is the
 * single "task being viewed" signal). */
interface AgentPanelDefinition {
  labelKey: string;
  fallback: string;
  icon: React.ReactNode;
  render: (sessionId: string | null) => React.ReactNode;
}

// 📖 The extension point for future panel usages (vava, t337: "un panel
// espace qui peut servir à plusieurs usages"). Add a tab + an entry here.
const AGENT_PANEL_REGISTRY: Record<AgentPanelTab, AgentPanelDefinition> = {
  task: {
    labelKey: 'agentChat.panelTask',
    fallback: 'Task',
    icon: <IconNotes size={12} stroke={1.8} />,
    render: () => <AgentPanelTask />,
  },
  changes: {
    labelKey: 'agentChat.panelChanges',
    fallback: 'Changes',
    icon: <IconFileDiff size={12} stroke={1.8} />,
    render: sessionId => <AgentPanelChanges sessionId={sessionId} />,
  },
};

export function AgentPanelSpace() {
  const { t } = useTranslation();
  const activeSessionId = useStore(s => s.agentChat.activeSessionId);
  const panel = useStore(s => s.agentPanel);
  const closeAgentPanelTab = useStore(s => s.closeAgentPanelTab);
  const setActiveAgentPanelTab = useStore(s => s.setActiveAgentPanelTab);

  const key = activeSessionId ?? AGENT_PANEL_DRAFT_KEY;
  const session = panel.bySession[key];
  const openTabs = session?.openTabs ?? [];
  const activeTab = openTabs.includes(session?.activeTab ?? 'task')
    ? session!.activeTab
    : openTabs[0];

  if (!panel.open || openTabs.length === 0 || !activeTab) return null;

  return (
    <aside
      aria-label={t('agentChat.panelLabel', 'Conversation panel')}
      className="flex w-[min(400px,38vw)] flex-none flex-col border-l border-border bg-bg-1/30"
    >
      {/* Tab strip: one chip per open tab, close on the active one. */}
      <div className="flex flex-none items-center gap-1 border-b border-border px-2 py-1.5">
        {openTabs.map(tab => {
          const def = AGENT_PANEL_REGISTRY[tab];
          const active = tab === activeTab;
          return (
            <div
              key={tab}
              className={`group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] transition-colors ${
                active ? 'bg-secondary text-fg' : 'text-fg-muted hover:bg-secondary/60 hover:text-fg'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveAgentPanelTab(tab)}
                className="flex min-w-0 items-center gap-1.5"
                title={t(def.labelKey, def.fallback)}
              >
                {def.icon}
                <span className="truncate">{t(def.labelKey, def.fallback)}</span>
              </button>
              <button
                type="button"
                onClick={() => closeAgentPanelTab(tab)}
                className={`flex-none rounded p-0.5 text-fg-faint transition-opacity hover:text-fg ${
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title={t('common.close', 'Close')}
                aria-label={`${t('common.close', 'Close')} ${t(def.labelKey, def.fallback)}`}
              >
                <IconX size={11} stroke={2} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {AGENT_PANEL_REGISTRY[activeTab].render(activeSessionId)}
      </div>
    </aside>
  );
}
