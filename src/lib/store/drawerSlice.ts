/**
 * @file Zustand store slice — task drawer
 * @description Opening/closing the task detail drawer, editing its in-memory
 * data, saving (full or metadata-only autosave), and the unsaved-edits
 * recovery buffer used when the drawer is force-closed before a save
 * completes (t110).
 */

import type { StateCreator } from 'zustand';
import {
  readTaskFile as fsReadTaskFile,
  writeTaskFile as fsWriteTaskFile,
  isServerMode,
} from '../filesystem';
import { extractSubtasks, injectSubtasks } from '../parser';
import { DiskFullError } from '../errors';
import { withRetry } from '../retry';
import { buildBoardUrl, buildTaskUrl } from '../task-url';
import type { DrawerSnapshot, State } from './types';
import { updateBrowserUrl } from './helpers';

export interface DrawerSlice {
  openDrawer: State['openDrawer'];
  closeDrawer: State['closeDrawer'];
  updateDrawerData: State['updateDrawerData'];
  saveDrawer: State['saveDrawer'];
  saveDrawerMetadata: State['saveDrawerMetadata'];
  markDrawerDirty: State['markDrawerDirty'];
  forceCloseDrawer: State['forceCloseDrawer'];
}

export const createDrawerSlice: StateCreator<State, [], [], DrawerSlice> = (set, get) => ({
  openDrawer: async (taskId, options = {}) => {
    const { tasksDirHandle, projectName } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    try {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, taskId);
      const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
      const snapshot: DrawerSnapshot = {
        frontmatter,
        subtasks,
        body: bodyWithoutSubtasks,
        savedAt: Date.now(),
      };
      // 📖 Recovery (t110): if we have stashed unsaved edits for this task
      // (because the drawer was force-closed before a successful save), prefer
      // them over the on-disk version so the user's work is not lost.
      const recovery = get().drawerRecoveryData.get(taskId);
      const initialDrawerData = recovery
        ? { frontmatter: recovery.frontmatter, subtasks: recovery.subtasks, body: recovery.body }
        : { frontmatter, subtasks, body: bodyWithoutSubtasks };
      const newRecovery = new Map(get().drawerRecoveryData);
      newRecovery.delete(taskId);
      if (options.syncUrl !== false) {
        updateBrowserUrl(buildTaskUrl(taskId, projectName), options.replace);
      }
      set({
        drawerTaskId: taskId,
        drawerData: initialDrawerData,
        drawerBaseVersion: snapshot,
        conflictState: null,
        showConflictModal: false,
        hasUnsavedDrawerEdits: !!recovery,
        lastSaveError: null,
        drawerRecoveryData: newRecovery,
      });
      if (recovery) {
        get().toast('Restored your unsaved edits for this task', 'info');
      }
    } catch (e) {
      get().toast('Failed to open: ' + (e as Error).message, 'error');
    }
  },

  closeDrawer: (options = {}) => {
    if (options.syncUrl !== false) {
      updateBrowserUrl(buildBoardUrl(get().projectName), options.replace);
    }
    set({
      drawerTaskId: null,
      drawerData: null,
      drawerBaseVersion: null,
      conflictState: null,
      showConflictModal: false,
      hasUnsavedDrawerEdits: false,
      lastSaveError: null,
    });
  },

  /** 📖 Marks the drawer as having unsaved edits. Called from the Drawer on
   * every keystroke so the close-guard UI knows whether to prompt before
   * discarding (t110). */
  markDrawerDirty: () => set({ hasUnsavedDrawerEdits: true }),

  /** 📖 Force-closes the drawer after stashing unsaved edits into the recovery
   * buffer so they can be restored when the same task is reopened (t110). */
  forceCloseDrawer: () => {
    const { drawerTaskId, drawerData } = get();
    if (drawerTaskId && drawerData) {
      const recovery = new Map(get().drawerRecoveryData);
      recovery.set(drawerTaskId, {
        frontmatter: drawerData.frontmatter,
        subtasks: drawerData.subtasks,
        body: drawerData.body,
      });
      set({ drawerRecoveryData: recovery });
    }
    get().closeDrawer();
  },

  updateDrawerData: (updater) => {
    const { drawerData } = get();
    if (!drawerData) return;
    set({ drawerData: updater(drawerData) });
  },

  saveDrawer: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle, taskContents } = get();
    if (!drawerTaskId || !drawerData) return;

    const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
    const fm = { ...drawerData.frontmatter, id: drawerTaskId };
    try {
      await withRetry(() => fsWriteTaskFile(tasksDirHandle || null, drawerTaskId, fm, fullBody), { maxAttempts: 3 });

      get().toast('Saved');
      // Clear recovery data for this task now that the save succeeded.
      const newRecovery = new Map(get().drawerRecoveryData);
      newRecovery.delete(drawerTaskId);
      updateBrowserUrl(buildBoardUrl(get().projectName));
      set({
        drawerTaskId: null,
        drawerData: null,
        hasUnsavedDrawerEdits: false,
        lastSaveError: null,
        drawerRecoveryData: newRecovery,
      });

      // Update content cache
      const newContents = new Map(taskContents);
      newContents.set(drawerTaskId, {
        frontmatter: fm,
        subtasks: drawerData.subtasks,
        body: drawerData.body,
      });
      set({ taskContents: newContents });
      await get().reloadBoard();
    } catch (e) {
      const err = e as Error;
      const message = err instanceof DiskFullError
        ? 'Disk is full — your edits are kept. Free up space and retry.'
        : 'Failed to save: ' + err.message;
      get().toast(message, 'error', 8000);
      // 📖 Keep the drawer open with edits intact + flag unsaved so the close
      // guard can prompt the user (t110).
      set({ lastSaveError: message });
    }
  },

  saveDrawerMetadata: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle, taskContents } = get();
    if (!drawerTaskId || !drawerData) return;
    try {
      const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
      const fm = { ...drawerData.frontmatter, id: drawerTaskId };
      await withRetry(() => fsWriteTaskFile(tasksDirHandle || null, drawerTaskId, fm, fullBody), { maxAttempts: 3 });

      // Update content cache
      const newContents = new Map(taskContents);
      newContents.set(drawerTaskId, {
        frontmatter: fm,
        subtasks: drawerData.subtasks,
        body: drawerData.body,
      });
      set({ taskContents: newContents, hasUnsavedDrawerEdits: false, lastSaveError: null });
      await get().reloadBoard();
    } catch (e) {
      const err = e as Error;
      const message = err instanceof DiskFullError
        ? 'Disk is full — your edits are kept.'
        : 'Failed to save: ' + err.message;
      // Autosave background failures: flag unsaved + last error, but do NOT
      // spam a toast on every keystroke. The user will see the persistent
      // error banner in the drawer footer (t110).
      set({ hasUnsavedDrawerEdits: true, lastSaveError: message });
    }
  },
});
