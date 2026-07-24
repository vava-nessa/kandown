/**
 * @file Zustand store slice — content search, agent hook, conflict resolution
 * @description Lazy content-loading for search (>10 tasks defers full reads
 * until search is used), the CLI daemon's optional "send to agent" hook, and
 * resolving a drawer edit-conflict flagged by the file watcher.
 */

import type { StateCreator } from 'zustand';
import type { SearchMatch, TaskFrontmatter } from '../types';
import {
  readTaskFile as fsReadTaskFile,
  writeTaskFile as fsWriteTaskFile,
  isServerMode,
  serverGetDaemonInfo,
  serverSendTaskToAgent,
} from '../filesystem';
import { extractSubtasks, injectSubtasks, searchTaskContent } from '../parser';
import type { State } from './types';

export interface AgentSearchSlice {
  loadTaskContents: State['loadTaskContents'];
  computeSearchMatches: State['computeSearchMatches'];
  sendTaskToAgent: State['sendTaskToAgent'];
  refreshAgentHook: State['refreshAgentHook'];
  resolveConflict: State['resolveConflict'];
}

export const createAgentSearchSlice: StateCreator<State, [], [], AgentSearchSlice> = (set, get) => ({
  loadTaskContents: async (taskIds: string[]) => {
    const { tasksDirHandle } = get();
    if (!tasksDirHandle) return;
    const newContents = new Map(get().taskContents);
    await Promise.all(taskIds.map(async (id) => {
      if (newContents.has(id)) return;
      try {
        const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, id);
        const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
        newContents.set(id, { frontmatter, subtasks, body: bodyWithoutSubtasks });
      } catch {
        // ignore errors for individual tasks
      }
    }));
    set({ taskContents: newContents });
  },

  computeSearchMatches: (query: string) => {
    if (!query.trim()) {
      set({ searchMatches: new Map() });
      return;
    }
    const { taskContents } = get();
    const matches = new Map<string, SearchMatch[]>();
    const q = query.toLowerCase();
    for (const [id, content] of taskContents) {
      const found = searchTaskContent(content, q);
      if (found.length > 0) matches.set(id, found);
    }
    set({ searchMatches: matches });
  },

  refreshAgentHook: async () => {
    // 📖 Server mode only — the agent hook is a CLI-daemon feature. In browser
    // mode the hook never exists, so we explicitly clear the state to keep
    // the UI honest (no stale "send to agent" button if the user toggles modes).
    if (!isServerMode()) {
      set({ agentHook: null });
      return;
    }
    const info = await serverGetDaemonInfo();
    set({ agentHook: info?.agentHook ?? null });
  },

  sendTaskToAgent: async (taskId) => {
    const hook = get().agentHook;
    if (!hook) {
      get().toast('Agent hook not configured', 'error');
      return;
    }
    get().toast(`Sending to ${hook.label}…`);
    const result = await serverSendTaskToAgent(taskId);
    if (result === null) {
      get().toast('Could not reach the daemon', 'error');
      return;
    }
    if (result.ok) {
      get().toast(`Sent to ${hook.label}`);
    } else {
      get().toast(result.error || 'Agent hook failed', 'error');
    }
  },

  resolveConflict: async (resolution) => {
    const { conflictState, drawerData, tasksDirHandle, drawerTaskId, drawerBaseVersion } = get();
    if (!conflictState || !tasksDirHandle || !drawerTaskId) return;

    if (resolution === 'reload') {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, drawerTaskId);
      const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
      set({
        drawerData: { frontmatter, subtasks, body: bodyWithoutSubtasks },
        drawerBaseVersion: { frontmatter, subtasks, body: bodyWithoutSubtasks, savedAt: Date.now() },
        conflictState: null,
        showConflictModal: false,
      });
      get().toast('Reloaded from disk');
    } else if (resolution === 'overwrite') {
      if (drawerData && drawerTaskId && drawerBaseVersion) {
        const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
        const fm: TaskFrontmatter = { ...drawerData.frontmatter, id: drawerTaskId };
        try {
          await fsWriteTaskFile(tasksDirHandle, drawerTaskId, fm, fullBody);
          set({
            drawerBaseVersion: { ...drawerData, savedAt: Date.now() },
            conflictState: null,
            showConflictModal: false,
          });
          get().toast('Overwritten remote changes');
        } catch (e) {
          get().toast('Failed to overwrite: ' + (e as Error).message, 'error');
        }
      }
    } else {
      set({ conflictState: null, showConflictModal: false });
    }
  },
});
