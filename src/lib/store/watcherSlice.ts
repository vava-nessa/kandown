/**
 * @file Zustand store slice — file watcher wiring
 * @description Starts either the browser file-system watcher or the
 * server-mode REST polling loop, translates watcher events into board
 * reloads / conflict detection / notifications, and exposes a manual restart
 * for when the watcher auto-disables itself after repeated failures (t107).
 */

import type { StateCreator } from 'zustand';
import type { TaskFrontmatter } from '../types';
import { readTaskFile as fsReadTaskFile, isDemoMode, isServerMode } from '../filesystem';
import { extractSubtasks } from '../parser';
import { fileWatcher } from '../watcher';
import type { ConflictType } from '../watcher';
import { emitKandownNotification } from '../notifications';
import type { LoadedTask, State } from './types';
import {
  buildNotificationSnapshot,
  didTaskBodyChange,
  getCompletedSubtaskCount,
  notificationSnapshots,
  serverPollInterval,
  setServerPollInterval,
  taskEditTimers,
} from './helpers';

export interface WatcherSlice {
  setupWatcher: State['setupWatcher'];
  restartWatcher: State['restartWatcher'];
}

export const createWatcherSlice: StateCreator<State, [], [], WatcherSlice> = (set, get) => ({
  setupWatcher: () => {
    // 📖 Demo mode — the "filesystem" is a Map inside this tab, so this store is
    // the only writer that exists. Polling it would burn a full board reload
    // every 2s to discover changes we made ourselves, and the re-render can
    // land mid-drag. Nothing to watch, so we do not watch.
    if (isDemoMode()) return;

    // 📖 Server mode — use REST API polling (no FileSystemDirectoryHandle available)
    if (isServerMode()) {
      if (serverPollInterval) clearInterval(serverPollInterval);
      setServerPollInterval(setInterval(() => {
        void get().reloadBoard();
      }, 2000));
      return;
    }

    const { dirHandle, tasksDirHandle } = get();
    if (!dirHandle || !tasksDirHandle) return;

    fileWatcher.stop();
    taskEditTimers.forEach(timer => clearTimeout(timer));
    taskEditTimers.clear();
    fileWatcher.start(dirHandle, tasksDirHandle);

    const scheduleTaskEditNotification = (taskId: string, title: string) => {
      const existing = taskEditTimers.get(taskId);
      if (existing) clearTimeout(existing);

      const delay = Math.max(2000, get().config.notifications.editDebounceMs);
      const timer = setTimeout(() => {
        taskEditTimers.delete(taskId);
        const latestConfig = get().config;
        if (!latestConfig.notifications.taskEdits) return;
        emitKandownNotification({
          title: 'Task edited',
          body: `${title} changed on disk.`,
          config: latestConfig,
        });
      }, delay);
      taskEditTimers.set(taskId, timer);
    };

    const notifyTaskChange = async (taskId: string) => {
      const { tasksDirHandle: tdh, config } = get();
      if (!tdh) return;

      // 📖 Guard the read — a corrupted/revoked file should not kill the
      // watcher's taskChanged pipeline. We fall back to the ghost task and
      // skip the notification diff (t107).
      let frontmatter: TaskFrontmatter;
      let body: string;
      try {
        ({ frontmatter, body } = await fsReadTaskFile(tdh, taskId));
      } catch (e) {
        console.warn(`[Watcher] notifyTaskChange: failed to read ${taskId}:`, e);
        return;
      }
      const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
      const task: LoadedTask = {
        id: taskId,
        frontmatter: {
          ...frontmatter,
          id: frontmatter.id || taskId,
          status: frontmatter.status || 'Backlog',
        },
        body: bodyWithoutSubtasks,
        subtasks,
      };
      const current = buildNotificationSnapshot(task);
      const previous = notificationSnapshots.get(taskId);

      if (!previous) {
        notificationSnapshots.set(taskId, current);
        return;
      }

      if (config.notifications.statusChanges && previous.status !== current.status) {
        emitKandownNotification({
          title: 'Task status changed',
          body: `${current.title}: ${previous.status} → ${current.status}`,
          config,
        });
      }

      const completedSubtasks = getCompletedSubtaskCount(previous.subtasks, current.subtasks);
      if (config.notifications.subtaskCompletions && completedSubtasks > 0) {
        emitKandownNotification({
          title: 'Subtask completed',
          body: completedSubtasks === 1
            ? `${current.title}: 1 subtask completed.`
            : `${current.title}: ${completedSubtasks} subtasks completed.`,
          config,
        });
      }

      if (didTaskBodyChange(previous, current)) {
        scheduleTaskEditNotification(taskId, current.title);
      }

      notificationSnapshots.set(taskId, current);
    };

    fileWatcher.on('configChanged', () => {
      try {
        void get().loadConfig();
        get().toast('Settings updated externally', 'info');
      } catch (e) {
        console.error('[Watcher] configChanged handler error:', e);
      }
    });

    fileWatcher.on('taskChanged', async (taskId) => {
      try {
        const { drawerTaskId, drawerBaseVersion, tasksDirHandle: tdh } = get();
        await notifyTaskChange(taskId);
        if (drawerTaskId === taskId && drawerBaseVersion && tdh) {
          let frontmatter: TaskFrontmatter;
          let body: string;
          try {
            ({ frontmatter, body } = await fsReadTaskFile(tdh, taskId));
          } catch (e) {
            console.warn(`[Watcher] taskChanged: failed to re-read ${taskId}:`, e);
            return;
          }
          const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
          const base = drawerBaseVersion;
          const fmChanged = JSON.stringify(base.frontmatter) !== JSON.stringify(frontmatter);
          const bodyChanged = base.body !== bodyWithoutSubtasks;
          const subsChanged = JSON.stringify(base.subtasks) !== JSON.stringify(subtasks);

          if (!fmChanged && !bodyChanged && !subsChanged) return;

          let type: ConflictType = 'none';
          if (fmChanged && (bodyChanged || subsChanged)) type = 'full';
          else if (fmChanged) type = 'metadata-only';
          else if (bodyChanged || subsChanged) type = 'body-only';

          set({
            conflictState: { taskId, type, local: base, remote: { frontmatter, body: bodyWithoutSubtasks, subtasks } },
            showConflictModal: type === 'full',
          });
        } else {
          await get().reloadBoard();
        }
      } catch (e) {
        console.error(`[Watcher] taskChanged handler error for ${taskId}:`, e);
      }
    });

    fileWatcher.on('newTaskDetected', async (taskId) => {
      try {
        const { tasksDirHandle: tdh } = get();
        if (tdh) {
          let frontmatter: TaskFrontmatter;
          let body: string;
          try {
            ({ frontmatter, body } = await fsReadTaskFile(tdh, taskId));
          } catch (e) {
            console.warn(`[Watcher] newTaskDetected: failed to read ${taskId}:`, e);
            get().toast(`New task ${taskId} detected but could not be loaded`, 'warning');
            return;
          }
          const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
          notificationSnapshots.set(taskId, buildNotificationSnapshot({
            id: taskId,
            frontmatter: {
              ...frontmatter,
              id: frontmatter.id || taskId,
              status: frontmatter.status || 'Backlog',
            },
            body: bodyWithoutSubtasks,
            subtasks,
          }));
        }
        await get().reloadBoard();
      } catch (e) {
        console.error(`[Watcher] newTaskDetected handler error for ${taskId}:`, e);
      }
    });

    // 📖 Watcher self-disabled after repeated failures (t107). Surface a
    // banner in the Header and offer a manual restart.
    fileWatcher.on('watcherError', (message) => {
      set({ watcherError: message });
      get().toast(message, 'warning', 10000);
    });
  },

  restartWatcher: () => {
    const { dirHandle, tasksDirHandle } = get();
    if (!dirHandle || !tasksDirHandle) return;
    set({ watcherError: null });
    get().setupWatcher();
    get().toast('File watcher restarted');
  },
});
