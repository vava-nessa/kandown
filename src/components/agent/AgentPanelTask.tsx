/**
 * @file Agent panel: task tab (t337)
 * @description The right panel's task tab on the agent page: renders the task
 * currently open in the drawer store as a real, editable workspace inside the
 * panel column. Reuses TaskWorkspace in its compact `panel` variant (no task
 * navigator), which deliberately shares the drawer store, so autosave,
 * conflict detection and URL deep-links behave exactly like the page-level
 * editor. When no task is open the tab shows a quiet hint instead.
 *
 * @functions
 *  → AgentPanelTask: editable task view for the panel space
 *
 * @exports AgentPanelTask
 * @see src/components/agent/AgentPanelSpace.tsx: the tab registry host
 * @see src/components/TaskWorkspace.tsx: the shared editor (panel variant)
 */

import { useTranslation } from 'react-i18next';
import { IconNotes } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { TaskWorkspace } from '../TaskWorkspace';

export function AgentPanelTask() {
  const { t } = useTranslation();
  const drawerTaskId = useStore(s => s.drawerTaskId);
  const drawerData = useStore(s => s.drawerData);

  if (!drawerTaskId || !drawerData) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconNotes size={20} stroke={1.5} className="text-fg-faint" />
        <p className="text-[12.5px] leading-relaxed text-fg-muted">
          {t('agentChat.panelTaskEmpty', 'No task open. Click a task, or ask the agent about one and it will show up here.')}
        </p>
      </div>
    );
  }
  return <TaskWorkspace variant="panel" />;
}
