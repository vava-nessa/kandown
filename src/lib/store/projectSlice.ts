/**
 * @file Zustand store slice — project lifecycle
 * @description Opening a project (file-picker or recent), server-mode
 * auto-open, config load/update, and the full board reload. These are the
 * actions that establish `dirHandle`/`tasksDirHandle`/`isOpen` — everything
 * else in the store assumes one of these ran first.
 */

import type { StateCreator } from 'zustand';
import type { TaskContent, KandownConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';
import {
  pickProjectDirectory,
  getKandownHandle,
  getTasksDirHandle,
  readConfigFileStrict,
  writeConfigFile,
  saveRecentProject,
  listRecentProjects,
  removeRecentProject,
  verifyPermission,
  isServerMode,
  getServerRoot,
  serverReadConfig,
  serverListTasks,
  serverReadTaskFile,
  serverMigrateTasks,
  supportsFileSystemAccess,
  type RecentProject,
} from '../filesystem';
import { buildColumnsFromTasks, extractSubtasks, injectSubtasks, extractArchivedTasks } from '../parser';
import { BrowserNotSupportedError, PermissionDeniedError, DiskFullError } from '../errors';
import type { State } from './types';
import {
  applyConfigTheme,
  getProjectNameFromServerRoot,
  readAllTasks,
  readAllTasksServer,
  syncNotificationSnapshots,
  updateProjectBoardUrl,
} from './helpers';

export interface ProjectSlice {
  openFolder: State['openFolder'];
  openRecentProject: State['openRecentProject'];
  openServerProject: State['openServerProject'];
  tryAutoOpenServerProject: State['tryAutoOpenServerProject'];
  loadConfig: State['loadConfig'];
  updateConfig: State['updateConfig'];
  reloadBoard: State['reloadBoard'];
}

export const createProjectSlice: StateCreator<State, [], [], ProjectSlice> = (set, get) => ({
  openFolder: async () => {
    // 📖 Refuse to even try on unsupported browsers — calling
    // window.showDirectoryPicker on Firefox/Safari throws a TypeError that
    // would otherwise bubble up as an unhandled rejection. The empty-state
    // screen also gates this, but the store stays defensive.
    if (!supportsFileSystemAccess()) {
      const browser = navigator.userAgent || 'this browser';
      get().toast(new BrowserNotSupportedError(browser).message, 'error', 8000);
      return;
    }
    let result;
    try {
      result = await pickProjectDirectory();
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        get().toast('Permission denied — please grant access to the project folder', 'error');
      } else {
        get().toast('Failed to open folder: ' + (e as Error).message, 'error');
      }
      return;
    }
    if (!result) return;
    const { projectHandle, kandownHandle, tasksHandle } = result;
    const projectName = projectHandle.name;
    // 📖 Layout (v0.12+): `dirHandle` is `.kandown/` (for kandown.json);
    // `tasksDirHandle` is the project-root `./tasks/` (sibling of `.kandown/`).
    set({ dirHandle: kandownHandle, tasksDirHandle: tasksHandle, projectName });
    updateProjectBoardUrl(projectName);
    const serverRoot = isServerMode() ? getServerRoot() : null;
    // 📖 Saving to recent projects is a convenience, not a requirement — if
    // IndexedDB is blocked (private browsing), we still open the folder.
    try {
      await saveRecentProject({
        id: projectHandle.name,
        name: projectHandle.name,
        handle: projectHandle,
        lastOpened: Date.now(),
        ...(serverRoot ? { kandownDir: serverRoot } : {}),
      });
    } catch (e) {
      console.warn('[Store] Failed to save recent project:', e);
    }
    await get().loadConfig();
    await get().reloadBoard();
    try {
      const recent = await listRecentProjects();
      set({ recentProjects: recent });
    } catch (e) {
      console.warn('[Store] Failed to load recent projects:', e);
    }
    void get().setupWatcher();
  },

  openRecentProject: async (project: RecentProject) => {
    // 📖 Capture previous state so we can roll back to it if anything fails
    // after we start mutating handles — otherwise the store ends up in a
    // half-initialized state (project name set but no handles).
    const prev = {
      dirHandle: get().dirHandle,
      tasksDirHandle: get().tasksDirHandle,
      projectName: get().projectName,
    };
    // 📖 verifyPermission now swallows internal throws (revoked handles) and
    // returns false. To distinguish "user denied the prompt" from "handle is
    // dead", we attempt to resolve the child handles — if that throws, the
    // entry is unrecoverable and we remove it (t109).
    const ok = await verifyPermission(project.handle, true);
    if (!ok) {
      let handleAlive = false;
      try {
        await getKandownHandle(project.handle);
        handleAlive = true;
      } catch {
        handleAlive = false;
      }
      if (!handleAlive) {
        get().toast(`"${project.name}" is no longer accessible. Removed from recent projects.`, 'warning', 8000);
        try {
          await removeRecentProject(project.id);
          const updated = await listRecentProjects();
          set({ recentProjects: updated });
        } catch {
          // IDB unavailable — nothing more we can do.
        }
        return;
      }
      get().toast('Permission denied — please grant access to the folder', 'error');
      return;
    }
    try {
      // 📖 Layout (v0.12+): derive both `.kandown/` and `./tasks/` from the
      // project root that was remembered in IndexedDB.
      const kandownHandle = await getKandownHandle(project.handle);
      const tasksHandle = await getTasksDirHandle(project.handle);
      const projectName = project.handle.name;
      set({ dirHandle: kandownHandle, tasksDirHandle: tasksHandle, projectName });
      updateProjectBoardUrl(projectName);
      try {
        await saveRecentProject({ ...project, lastOpened: Date.now() });
      } catch (e) {
        console.warn('[Store] Failed to update recent project:', e);
      }
      await get().loadConfig();
      await get().reloadBoard();
      void get().setupWatcher();
    } catch (e) {
      // Roll back the half-applied state and tell the user what happened.
      set(prev);
      get().toast(`Failed to open project: ${(e as Error).message}`, 'error');
    }
  },

  /** 📖 Opens a project in server mode using the CLI REST API — no file picker needed. */
  openServerProject: async () => {
    set({ loading: true });
    try {
      const serverRoot = getServerRoot();
      if (!serverRoot) throw new Error('No server root');
      // 📖 One-time silent migration: the CLI may have legacy tasks in
      // `.kandown/tasks/`. Trigger the migration endpoint before reading.
      // Idempotent — safe on every startup.
      await serverMigrateTasks();
      const projectName = getProjectNameFromServerRoot(serverRoot);
      const config = await serverReadConfig();
      applyConfigTheme(config);
      const ids = await serverListTasks();
      const tasks = await Promise.all(ids.map(async (id) => {
        const { frontmatter, body } = await serverReadTaskFile(id);
        const normalizedFrontmatter = {
          ...frontmatter,
          id: frontmatter.id || id,
          status: frontmatter.status || 'Backlog',
        };
        const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
        return { id, frontmatter: normalizedFrontmatter, body: bodyWithoutSubtasks, subtasks };
      }));
      syncNotificationSnapshots(tasks);
      const parsedTasks = tasks.map(task => ({
        frontmatter: task.frontmatter,
        body: injectSubtasks(task.body, task.subtasks),
      }));
      const columns = buildColumnsFromTasks(parsedTasks, config.board.columns);
      const archivedTasks = extractArchivedTasks(parsedTasks);
      const totalTasks = columns.reduce((acc, col) => acc + col.tasks.length, 0);
      const nextContents = new Map<string, TaskContent>();
      if (totalTasks <= 10) {
        for (const task of tasks) {
          nextContents.set(task.frontmatter.id, {
            frontmatter: task.frontmatter,
            subtasks: task.subtasks,
            body: task.body,
          });
        }
      }
      set({
        loading: false,
        isOpen: true,
        config,
        columns,
        archivedTasks,
        boardTitle: 'Project Kanban',
        projectName,
        taskContents: nextContents,
        searchMatches: new Map(),
      });
      updateProjectBoardUrl(projectName);
      void get().setupWatcher();
      // 📖 Fetch the agent hook config in parallel so the UI can render the
      // "Send to Agent" button as soon as the project is open. Failure is
      // non-fatal — the button stays hidden and the user can still work.
      void get().refreshAgentHook();
    } catch (err) {
      set({ loading: false, isOpen: false });
      get().toast('Impossible de charger le projet. Relancez `kandown`.', 'error');
    }
  },

  /** 📖 Called on mount when isServerMode() is true. Finds the matching recent project by its .kandown path and auto-opens it. */
  tryAutoOpenServerProject: async () => {
    if (!isServerMode()) return;
    const serverRoot = getServerRoot();
    if (!serverRoot) return;
    // 📖 One-time silent migration: trigger the CLI migration endpoint so any
    // legacy `.kandown/tasks/*.md` is moved to `./tasks/` before we read.
    // Idempotent — safe to call on every web app startup.
    await serverMigrateTasks();
    const recent = await listRecentProjects();
    const match = recent.find(p => p.kandownDir === serverRoot);
    if (!match) {
      await get().openServerProject();
      return;
    }
    const ok = await verifyPermission(match.handle, true);
    if (!ok) {
      await get().openServerProject();
      return;
    }
    // 📖 Layout (v0.12+): derive both `.kandown/` and `./tasks/` from the
    // project root that was remembered in IndexedDB.
    const kandownHandle = await getKandownHandle(match.handle);
    const tasksHandle = await getTasksDirHandle(match.handle);
    const projectName = match.handle.name;
    set({ dirHandle: kandownHandle, tasksDirHandle: tasksHandle, projectName, recentProjects: recent, isOpen: true });
    updateProjectBoardUrl(projectName);
    await saveRecentProject({ ...match, lastOpened: Date.now() });
    await get().loadConfig();
    await get().reloadBoard();
    void get().setupWatcher();
  },

  loadConfig: async () => {
    const { dirHandle } = get();
    if (!dirHandle && !isServerMode()) return;
    try {
      const result = await readConfigFileStrict(dirHandle);
      if (result.ok) {
        set({ config: result.config });
        applyConfigTheme(result.config);
        return;
      }
      // 📖 Distinguish "first run, no config" (silent) from "config is
      // corrupted" (warn + back up the bad file before falling back). Null
      // sub-objects can't crash the merge anymore (t111).
      if (result.reason === 'corrupted') {
        // Best-effort backup so the user can recover their custom columns/theme.
        if (result.rawContent && dirHandle) {
          try {
            const backup = await dirHandle.getFileHandle('kandown.json.backup', { create: true });
            const w = await backup.createWritable();
            try {
              await w.write(result.rawContent);
            } finally {
              await w.close();
            }
          } catch {
            // Backup write itself failed — don't block startup, just warn.
          }
        }
        get().toast(
          'kandown.json is corrupted — using default settings. A backup was saved as kandown.json.backup.',
          'warning',
          10000,
        );
      }
      set({ config: DEFAULT_CONFIG });
      applyConfigTheme(DEFAULT_CONFIG);
    } catch (e) {
      set({ config: DEFAULT_CONFIG });
      applyConfigTheme(DEFAULT_CONFIG);
    }
  },

  updateConfig: async (updater: (config: KandownConfig) => KandownConfig) => {
    const { dirHandle, config } = get();
    if (!dirHandle && !isServerMode()) return;
    const newConfig = updater(config);
    set({ config: newConfig });
    applyConfigTheme(newConfig);
    try {
      await writeConfigFile(dirHandle, newConfig);
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — settings were not saved.', 'error', 8000);
      } else {
        get().toast('Failed to save config: ' + err.message, 'error');
      }
    }
  },

  reloadBoard: async () => {
    const { tasksDirHandle, config } = get();
    // 📖 Mark as loading + clear the previous error so the UI can show a
    // spinner. We do NOT clear columns here — if the reload fails we want to
    // keep showing the last good board (t106).
    set({ isReloading: true, lastReloadError: null });
    try {
      if (isServerMode()) {
        const tasks = await readAllTasksServer();
        syncNotificationSnapshots(tasks);
        const parsedTasks = tasks.map(task => ({
          frontmatter: task.frontmatter,
          body: injectSubtasks(task.body, task.subtasks),
        }));
        const columns = buildColumnsFromTasks(parsedTasks, config.board.columns);
        const archivedTasks = extractArchivedTasks(parsedTasks);
        set({ boardTitle: 'Project Kanban', columns, archivedTasks });

        const totalTasks = columns.reduce((acc, col) => acc + col.tasks.length, 0);
        const nextContents = new Map<string, TaskContent>();
        if (totalTasks <= 10) {
          for (const task of tasks) {
            nextContents.set(task.frontmatter.id, {
              frontmatter: task.frontmatter,
              subtasks: task.subtasks,
              body: task.body,
            });
          }
        }
        set({ taskContents: nextContents, searchMatches: new Map(), failedTaskIds: [], isReloading: false });
      } else if (tasksDirHandle) {
        const { tasks, failedIds } = await readAllTasks(tasksDirHandle);
        syncNotificationSnapshots(tasks);
        const parsedTasks = tasks.map(task => ({
          frontmatter: task.frontmatter,
          body: injectSubtasks(task.body, task.subtasks),
        }));
        const columns = buildColumnsFromTasks(parsedTasks, config.board.columns);
        const archivedTasks = extractArchivedTasks(parsedTasks);
        set({ boardTitle: 'Project Kanban', columns, archivedTasks });

        const totalTasks = columns.reduce((acc, col) => acc + col.tasks.length, 0);
        const nextContents = new Map<string, TaskContent>();
        if (totalTasks <= 10) {
          for (const task of tasks) {
            nextContents.set(task.frontmatter.id, {
              frontmatter: task.frontmatter,
              subtasks: task.subtasks,
              body: task.body,
            });
          }
        }
        // 📖 Partial-failure reporting: if some task files were unreadable we
        // keep the readable ones on the board and warn the user (t102/t116).
        if (failedIds.length > 0) {
          const msg = failedIds.length === 1
            ? `Task ${failedIds[0]} could not be loaded`
            : `${failedIds.length} tasks could not be loaded`;
          get().toast(msg, 'warning', 8000);
        }
        set({ taskContents: nextContents, searchMatches: new Map(), failedTaskIds: failedIds, isReloading: false });
      } else {
        // No handle and not in server mode — nothing to reload.
        set({ isReloading: false });
      }
    } catch (e) {
      // 📖 Preserve the previous board state — do NOT clear columns. The user
      // keeps their current view and gets a clear error they can act on (t106).
      const message = (e as Error).message || String(e);
      set({
        isReloading: false,
        lastReloadError: `Failed to reload board: ${message}`,
      });
      get().toast(`Board reload failed — showing last loaded state (${message})`, 'warning', 8000);
    }
  },
});
