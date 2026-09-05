/**
 * @file Zustand store slice — task drawer
 * @description Opening/closing the task detail drawer, editing its in-memory
 * data, saving (full or metadata-only autosave), the unsaved-edits recovery
 * buffer used when the drawer is force-closed before a save completes (t110),
 * and the round-4 write-conflict guard: the drawer remembers the hash of the
 * raw file it loaded and sends it on every save, so a harness holding stale
 * content gets a 409 and the ConflictModal instead of silently overwriting a
 * human edit.
 *
 * 📖 Mirrors store.ts: the drawer actions still live inline in store.ts (the
 * slices extraction is incremental), so every change here must be applied to
 * the inline implementation there as well. See the fan-out table in AGENTS.md.
 */

import type { StateCreator } from 'zustand';
import {
  readTaskFile as fsReadTaskFile,
  readTaskFileRaw as fsReadTaskFileRaw,
  writeTaskFile as fsWriteTaskFile,
  isServerMode,
} from '../filesystem';
import { contentHash } from '../task-content-hash';
import { extractSubtasks, injectSubtasks, parseTaskFile } from '../parser';
import { DiskFullError } from '../errors';
import { withRetry } from '../retry';
import { buildBoardUrl, buildTaskUrl } from '../task-url';
import type { ConflictState, DrawerSnapshot, State } from './types';
import { updateBrowserUrl } from './helpers';

export interface DrawerSlice {
  openDrawer: State['openDrawer'];
  closeDrawer: State['closeDrawer'];
  updateDrawerData: State['updateDrawerData'];
  saveDrawer: State['saveDrawer'];
  saveDrawerMetadata: State['saveDrawerMetadata'];
  raiseWriteConflict: State['raiseWriteConflict'];
  markDrawerDirty: State['markDrawerDirty'];
  forceCloseDrawer: State['forceCloseDrawer'];
}

/** 📖 Parses the file text a 409 carried back into the remote half of the
 * conflict state. Never throws: an unparsable remote still shows, with the
 * raw text as its body, so the user can always choose "reload from disk". */
function remoteSnapshotFromContent(taskId: string, content: string): ConflictState['remote'] {
  try {
    const parsed = parseTaskFile(content);
    const { subtasks, bodyWithoutSubtasks } = extractSubtasks(parsed.body);
    return { frontmatter: parsed.frontmatter, body: bodyWithoutSubtasks, subtasks };
  } catch {
    return { frontmatter: { id: taskId, title: '' }, body: content, subtasks: [] };
  }
}

export const createDrawerSlice: StateCreator<State, [], [], DrawerSlice> = (set, get) => ({
  openDrawer: async (taskId, options = {}) => {
    const { tasksDirHandle, projectName } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    try {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, taskId);
      const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
      // 📖 Round 4: hash the raw file as it is RIGHT NOW, so every save from
      // this drawer session can be checked against disk. Null (unreadable)
      // just means the next save goes out unguarded, like before.
      const raw = await fsReadTaskFileRaw(tasksDirHandle, taskId);
      const loadedBaseHash = raw !== null ? contentHash(raw) : null;
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
        loadedBaseHash,
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
      loadedBaseHash: null,
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

  /** 📖 Fills conflictState from a 409's currentContent and shows the
   * ConflictModal (type 'full'). The drawer keeps the user's edits intact:
   * the modal's overwrite/reload actions decide what happens next. */
  raiseWriteConflict: (taskId, currentContent) => {
    const { drawerData, drawerBaseVersion } = get();
    if (!drawerData) return;
    const remote = remoteSnapshotFromContent(taskId, currentContent);
    const local: DrawerSnapshot = drawerBaseVersion
      ? drawerBaseVersion
      : { frontmatter: drawerData.frontmatter, subtasks: drawerData.subtasks, body: drawerData.body, savedAt: Date.now() };
    set({
      conflictState: { taskId, type: 'full', local, remote },
      showConflictModal: true,
    });
  },

  saveDrawer: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle, taskContents, loadedBaseHash } = get();
    if (!drawerTaskId || !drawerData) return;

    const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
    const fm = { ...drawerData.frontmatter, id: drawerTaskId };
    try {
      // 📖 Round 4: the save carries the hash of the content the drawer
      // loaded. A 409 means the file changed on disk underneath the editor;
      // the conflict modal opens and the edits stay in the drawer. A refused
      // write (401/404/5xx) throws inside the retried closure so it keeps the
      // exact pre-guard behavior: retries, error toast, edits intact.
      const result = await withRetry(async () => {
        const write = await fsWriteTaskFile(tasksDirHandle || null, drawerTaskId, fm, fullBody, { baseHash: loadedBaseHash ?? undefined });
        if (!write.ok && write.kind === 'error') throw new Error('write refused by the kandown backend');
        return write;
      }, { maxAttempts: 3 });
      if (!result.ok && result.kind === 'conflict') {
        get().raiseWriteConflict(drawerTaskId, result.currentContent);
        set({ lastSaveError: null });
        return;
      }

      get().toast('Saved');
      // Clear recovery data for this task now that the save succeeded.
      const newRecovery = new Map(get().drawerRecoveryData);
      newRecovery.delete(drawerTaskId);
      updateBrowserUrl(buildBoardUrl(get().projectName));
      // 📖 Refresh the base hash from the bytes now on disk so the NEXT save
      // keeps its guard. Re-serializing locally would not do: `updated:` is
      // stamped at write time, so a local re-hash could drift from the file.
      const freshRaw = await fsReadTaskFileRaw(tasksDirHandle || null, drawerTaskId);
      set({
        drawerTaskId: null,
        drawerData: null,
        loadedBaseHash: freshRaw !== null ? contentHash(freshRaw) : null,
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
    const { drawerTaskId, drawerData, tasksDirHandle, taskContents, loadedBaseHash } = get();
    if (!drawerTaskId || !drawerData) return;
    try {
      const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
      const fm = { ...drawerData.frontmatter, id: drawerTaskId };
      // 📖 Same guarded save as saveDrawer (round 4): an autosave that hits a
      // 409 opens the conflict modal instead of overwriting, and flags the
      // unsaved state so the drawer footer stays honest. Refused writes throw
      // inside the retried closure (same retry + banner behavior as before).
      const result = await withRetry(async () => {
        const write = await fsWriteTaskFile(tasksDirHandle || null, drawerTaskId, fm, fullBody, { baseHash: loadedBaseHash ?? undefined });
        if (!write.ok && write.kind === 'error') throw new Error('write refused by the kandown backend');
        return write;
      }, { maxAttempts: 3 });
      if (!result.ok && result.kind === 'conflict') {
        get().raiseWriteConflict(drawerTaskId, result.currentContent);
        set({ hasUnsavedDrawerEdits: true, lastSaveError: null });
        return;
      }

      // 📖 Keep the guard live across consecutive autosaves (see saveDrawer).
      const freshRaw = await fsReadTaskFileRaw(tasksDirHandle || null, drawerTaskId);

      // Update content cache
      const newContents = new Map(taskContents);
      newContents.set(drawerTaskId, {
        frontmatter: fm,
        subtasks: drawerData.subtasks,
        body: drawerData.body,
      });
      set({
        taskContents: newContents,
        loadedBaseHash: freshRaw !== null ? contentHash(freshRaw) : null,
        hasUnsavedDrawerEdits: false,
        lastSaveError: null,
      });
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
