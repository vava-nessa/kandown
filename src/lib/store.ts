/**
 * @file Kandown Zustand store
 * @description Central state container for project handles, task-derived board data,
 * config, filters, task drawer editing, content-search cache, recent projects,
 * toast notifications, and watcher-driven browser/audio notifications.
 *
 * 📖 This is the behavioral core of the web UI. Components should call store
 * actions instead of writing markdown directly, because these actions handle
 * optimistic updates, rollback, config theme application, and cache refreshes.
 *
 * 📖 The file watcher (watcher.ts) runs a 500ms polling loop that detects
 * external changes to kandown.json and tasks/*.md. When a change is
 * detected, the watcher fires an event which this store handles — either silently
 * reloading, sending configured notifications, or showing a conflict modal if
 * the user is actively editing.
 *
 * @functions
 *  → nextTaskId — finds the next zero-padded task id
 *  → persistColumnOrder — writes status/order metadata back to task files
 *  → applyConfigTheme — applies persisted project appearance settings
 *  → syncNotificationSnapshots — seeds task snapshots without notifying
 *  → useStore — Zustand store with file, board, config, search, and UI actions
 *
 * @exports useStore
 * @see src/lib/filesystem.ts
 * @see src/lib/parser.ts
 * @see src/lib/theme.ts
 * @see src/lib/watcher.ts
 */

import { create } from 'zustand';
import type { Column, Filters, BoardTask, Density, ViewMode, Subtask, TaskFrontmatter, KandownConfig, TaskContent, SearchMatch } from './types';
import { DEFAULT_CONFIG } from './types';
import {
  pickProjectDirectory,
  getKandownHandle,
  ensureTasksDir,
  listTaskIds,
  readConfigFile,
  writeConfigFile,
  readTaskFile as fsReadTaskFile,
  writeTaskFile as fsWriteTaskFile,
  deleteTaskFile as fsDeleteTaskFile,
  saveRecentProject,
  listRecentProjects,
  verifyPermission,
  isServerMode,
  getServerRoot,
  serverReadBoard,
  serverReadConfig,
  serverListTasks,
  serverReadTaskFile,
  type RecentProject,
} from './filesystem';
import { buildColumnsFromTasks, extractSubtasks, injectSubtasks, searchTaskContent } from './parser';
import { applyProjectTheme } from './theme';
import { fileWatcher } from './watcher';
import { emitKandownNotification } from './notifications';
import type { ConflictType } from './watcher';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface DrawerSnapshot {
  frontmatter: TaskFrontmatter;
  subtasks: Subtask[];
  body: string;
  savedAt: number;
}

interface LoadedTask {
  id: string;
  frontmatter: TaskFrontmatter;
  body: string;
  subtasks: Subtask[];
}

interface NotificationTaskSnapshot {
  title: string;
  status: string;
  body: string;
  subtasks: Subtask[];
}

export interface ConflictState {
  taskId: string;
  type: ConflictType;
  local: DrawerSnapshot;
  remote: { frontmatter: TaskFrontmatter; body: string; subtasks: Subtask[] };
}

interface State {
  isOpen: boolean;
  loading: boolean;
  dirHandle: FileSystemDirectoryHandle | null;
  projectName: string | null;
  tasksDirHandle: FileSystemDirectoryHandle | null;
  boardTitle: string;
  columns: Column[];

  // Content search cache (loaded lazily when >10 tasks, eagerly otherwise)
  taskContents: Map<string, TaskContent>;
  searchMatches: Map<string, SearchMatch[]>;

  // UI state
  viewMode: ViewMode;
  density: Density;
  filters: Filters;
  commandOpen: boolean;
  drawerTaskId: string | null;
  drawerData: { frontmatter: TaskFrontmatter; subtasks: Subtask[]; body: string } | null;
  currentPage: 'board' | 'settings';

  // Project config
  config: KandownConfig;

  // Recent projects
  recentProjects: RecentProject[];

  // Toasts
  toasts: Toast[];

  // File watcher support
  drawerBaseVersion: DrawerSnapshot | null;
  conflictState: ConflictState | null;
  showConflictModal: boolean;

  // Actions
  openFolder: () => Promise<void>;
  openRecentProject: (project: RecentProject) => Promise<void>;
  openServerProject: () => Promise<void>;
  tryAutoOpenServerProject: () => Promise<void>;
  reloadBoard: () => Promise<void>;
  loadConfig: () => Promise<void>;
  updateConfig: (updater: (config: KandownConfig) => KandownConfig) => Promise<void>;

  moveTask: (taskId: string, fromCol: string, toCol: string, toIndex?: number) => Promise<void>;
  reorderInColumn: (colName: string, fromIndex: number, toIndex: number) => Promise<void>;
  addColumn: (name: string) => Promise<void>;
  renameColumn: (oldName: string, newName: string) => Promise<void>;
  deleteColumn: (name: string) => Promise<void>;
  createTask: (colName?: string) => Promise<string | null>;
  deleteTask: (taskId: string) => Promise<void>;

  openDrawer: (taskId: string) => Promise<void>;
  closeDrawer: () => void;
  updateDrawerData: (updater: (data: NonNullable<State['drawerData']>) => NonNullable<State['drawerData']>) => void;
  saveDrawer: () => Promise<void>;
  saveDrawerMetadata: () => Promise<void>;

  setViewMode: (mode: ViewMode) => void;
  setDensity: (density: Density) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;

  setCommandOpen: (open: boolean) => void;
  setCurrentPage: (page: 'board' | 'settings') => void;

  loadTaskContents: (taskIds: string[]) => Promise<void>;
  computeSearchMatches: (query: string) => void;

  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: number) => void;
  resolveConflict: (resolution: 'reload' | 'overwrite' | 'cancel') => Promise<void>;
  setupWatcher: () => void;
}

function nextTaskId(columns: Column[]): string {
  let maxN = -1;
  for (const col of columns) {
    for (const t of col.tasks) {
      const m = t.id.match(/^t(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  }
  return 't' + (maxN + 1);
}

async function readAllTasksServer(): Promise<LoadedTask[]> {
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
  return tasks;
}

async function readAllTasks(
  tasksDirHandle: FileSystemDirectoryHandle,
): Promise<LoadedTask[]> {
  const ids = await listTaskIds(tasksDirHandle);
  const tasks = await Promise.all(ids.map(async (id) => {
    const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, id);
    const normalizedFrontmatter = {
      ...frontmatter,
      id: frontmatter.id || id,
      status: frontmatter.status || 'Backlog',
    };
    const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
    return { id, frontmatter: normalizedFrontmatter, body: bodyWithoutSubtasks, subtasks };
  }));
  return tasks;
}

async function persistColumnOrder(
  tasksDirHandle: FileSystemDirectoryHandle,
  columns: Column[],
  _columnNames: string[],
): Promise<void> {
  const writes: Promise<void>[] = [];

  for (const column of columns) {
    const status = column.name;
    column.tasks.forEach((task, index) => {
      writes.push((async () => {
        const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, task.id);
        await fsWriteTaskFile(tasksDirHandle, task.id, {
          ...frontmatter,
          id: task.id,
          status,
          order: index,
        }, body);
      })());
    });
  }

  await Promise.all(writes);
}

function applyConfigTheme(config: KandownConfig): void {
  applyProjectTheme(config.ui.theme, config.ui.skin, config.ui.font, config.ui.background);
}

function buildNotificationSnapshot(task: LoadedTask): NotificationTaskSnapshot {
  return {
    title: task.frontmatter.title || task.id,
    status: task.frontmatter.status || 'Backlog',
    body: task.body,
    subtasks: task.subtasks,
  };
}

function syncNotificationSnapshots(tasks: LoadedTask[]): void {
  notificationSnapshots.clear();
  tasks.forEach(task => {
    notificationSnapshots.set(task.id, buildNotificationSnapshot(task));
  });
}

function getCompletedSubtaskCount(previous: Subtask[], current: Subtask[]): number {
  return current.reduce((count, subtask, index) => {
    const wasDone = previous[index]?.done ?? false;
    return count + (subtask.done && !wasDone ? 1 : 0);
  }, 0);
}

function didTaskBodyChange(previous: NotificationTaskSnapshot, current: NotificationTaskSnapshot): boolean {
  const previousSubtaskText = previous.subtasks.map(subtask => ({
    text: subtask.text,
    description: subtask.description ?? '',
    report: subtask.report ?? '',
  }));
  const currentSubtaskText = current.subtasks.map(subtask => ({
    text: subtask.text,
    description: subtask.description ?? '',
    report: subtask.report ?? '',
  }));

  return (
    previous.title !== current.title ||
    previous.body !== current.body ||
    JSON.stringify(previousSubtaskText) !== JSON.stringify(currentSubtaskText)
  );
}

let toastIdCounter = 0;
const notificationSnapshots = new Map<string, NotificationTaskSnapshot>();
const taskEditTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useStore = create<State>((set, get) => ({
  isOpen: false,
  loading: false,
  dirHandle: null,
  projectName: null,
  tasksDirHandle: null,
  boardTitle: 'Project Kanban',
  columns: [],

  taskContents: new Map(),
  searchMatches: new Map(),

  viewMode: (localStorage.getItem('kandown:view') as ViewMode) || 'board',
  density: (localStorage.getItem('kandown:density') as Density) || 'comfortable',
  filters: { search: '', priority: null, tag: null, assignee: null, ownerType: null },
  commandOpen: false,
  drawerTaskId: null,
  drawerData: null,
  currentPage: 'board',

  config: DEFAULT_CONFIG,

  recentProjects: [],
  toasts: [],

  drawerBaseVersion: null,
  conflictState: null,
  showConflictModal: false,

  openFolder: async () => {
    const result = await pickProjectDirectory();
    if (!result) return;
    const { projectHandle, kandownHandle } = result;
    const tasksDir = await ensureTasksDir(kandownHandle);
    const projectName = projectHandle.name;
    set({ dirHandle: kandownHandle, tasksDirHandle: tasksDir, projectName });
    window.history.pushState({}, '', `?p=${encodeURIComponent(projectName)}`);
    const serverRoot = isServerMode() ? getServerRoot() : null;
    await saveRecentProject({
      id: projectHandle.name,
      name: projectHandle.name,
      handle: projectHandle,
      lastOpened: Date.now(),
      ...(serverRoot ? { kandownDir: serverRoot } : {}),
    });
    await get().loadConfig();
    await get().reloadBoard();
    const recent = await listRecentProjects();
    set({ recentProjects: recent });
    void get().setupWatcher();
  },

  openRecentProject: async (project) => {
    const ok = await verifyPermission(project.handle, true);
    if (!ok) {
      get().toast('Permission denied', 'error');
      return;
    }
    const kandownHandle = await getKandownHandle(project.handle);
    const tasksDir = await ensureTasksDir(kandownHandle);
    const projectName = project.handle.name;
    set({ dirHandle: kandownHandle, tasksDirHandle: tasksDir, projectName });
    window.history.pushState({}, '', `?p=${encodeURIComponent(projectName)}`);
    await saveRecentProject({ ...project, lastOpened: Date.now() });
    await get().loadConfig();
    await get().reloadBoard();
    void get().setupWatcher();
  },

  /** 📖 Opens a project in server mode using the CLI REST API — no file picker needed. */
  openServerProject: async () => {
    set({ loading: true });
    try {
      const serverRoot = getServerRoot();
      if (!serverRoot) throw new Error('No server root');
      const projectName = serverRoot.split('/').filter(Boolean).pop() ?? 'Project';
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
        boardTitle: 'Project Kanban',
        projectName,
        taskContents: nextContents,
        searchMatches: new Map(),
      });
      window.history.pushState({}, '', `?p=${encodeURIComponent(projectName)}`);
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
    const kandownHandle = await getKandownHandle(match.handle);
    const tasksDir = await ensureTasksDir(kandownHandle);
    const projectName = match.handle.name;
    set({ dirHandle: kandownHandle, tasksDirHandle: tasksDir, projectName, recentProjects: recent });
    window.history.pushState({}, '', `?p=${encodeURIComponent(projectName)}`);
    await saveRecentProject({ ...match, lastOpened: Date.now() });
    await get().loadConfig();
    await get().reloadBoard();
    void get().setupWatcher();
  },

  loadConfig: async () => {
    const { dirHandle } = get();
    if (!dirHandle) return;
    try {
      const config = await readConfigFile(dirHandle);
      if (config) {
        set({ config });
        applyConfigTheme(config);
      } else {
        set({ config: DEFAULT_CONFIG });
        applyConfigTheme(DEFAULT_CONFIG);
      }
    } catch (e) {
      set({ config: DEFAULT_CONFIG });
      applyConfigTheme(DEFAULT_CONFIG);
    }
  },

  updateConfig: async (updater) => {
    const { dirHandle, config } = get();
    if (!dirHandle) return;
    const newConfig = updater(config);
    set({ config: newConfig });
    applyConfigTheme(newConfig);
    try {
      await writeConfigFile(dirHandle, newConfig);
    } catch (e) {
      get().toast('Failed to save config: ' + (e as Error).message, 'error');
    }
  },

  reloadBoard: async () => {
    const { tasksDirHandle, config } = get();
    if (!isServerMode()) return;
    try {
      const tasks = await readAllTasksServer();
      syncNotificationSnapshots(tasks);
      const parsedTasks = tasks.map(task => ({
        frontmatter: task.frontmatter,
        body: injectSubtasks(task.body, task.subtasks),
      }));
      const columns = buildColumnsFromTasks(parsedTasks, config.board.columns);
      set({ boardTitle: 'Project Kanban', columns });

      // Load all task contents eagerly if <= 10 tasks total
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
      set({ taskContents: nextContents, searchMatches: new Map() });
    } catch (e) {
      get().toast('Failed to load board: ' + (e as Error).message, 'error');
    }
  },

  moveTask: async (taskId, fromCol, toCol, toIndex) => {
    const { columns, config } = get();
    const isServer = isServerMode();
    if (!isServer && !get().tasksDirHandle) return;
    const fromColObj = columns.find(c => c.name === fromCol);
    const toColObj = columns.find(c => c.name === toCol);
    if (!fromColObj || !toColObj) return;
    const taskIdx = fromColObj.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return;
    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const newFrom = newColumns.find(c => c.name === fromCol)!;
    const newTo = newColumns.find(c => c.name === toCol)!;
    const [task] = newFrom.tasks.splice(taskIdx, 1);
    if (/done|termin|closed|complet/i.test(toCol)) task.checked = true;
    else task.checked = false;
    if (toIndex !== undefined) newTo.tasks.splice(toIndex, 0, task);
    else newTo.tasks.push(task);

    // Optimistic
    set({ columns: newColumns });
    try {
      if (isServerMode()) return; // server mode: handled by REST API on save
      const { tasksDirHandle } = get();
      if (!tasksDirHandle) return;
      const affected = fromCol === toCol
        ? newColumns.filter(c => c.name === toCol)
        : newColumns.filter(c => c.name === fromCol || c.name === toCol);
      await persistColumnOrder(tasksDirHandle, affected, config.board.columns);
    } catch (e) {
      get().toast('Failed to save: ' + (e as Error).message, 'error');
      // Rollback
      set({ columns });
    }
  },

  reorderInColumn: async (colName, fromIndex, toIndex) => {
    const { columns, tasksDirHandle, config } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const col = newColumns.find(c => c.name === colName);
    if (!col) return;
    const [task] = col.tasks.splice(fromIndex, 1);
    col.tasks.splice(toIndex, 0, task);
    set({ columns: newColumns });
    try {
      if (isServerMode()) return;
      const { tasksDirHandle } = get();
      if (!tasksDirHandle) return;
      await persistColumnOrder(tasksDirHandle, [col], config.board.columns);
    } catch (e) {
      get().toast('Failed to save: ' + (e as Error).message, 'error');
      set({ columns });
    }
  },

  addColumn: async (name) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const { config } = get();
    if (config.board.columns.some(col => col.toLowerCase() === cleanName.toLowerCase())) return;
    await get().updateConfig(current => ({
      ...current,
      board: {
        ...current.board,
        columns: [...current.board.columns, cleanName],
      },
    }));
    await get().reloadBoard();
  },

  renameColumn: async (oldName, newName) => {
    const cleanName = newName.trim();
    const { columns, tasksDirHandle, config } = get();
    if (!tasksDirHandle || !cleanName || cleanName.toLowerCase() === oldName.toLowerCase()) return;
    if (columns.some(col => col.name.toLowerCase() === cleanName.toLowerCase())) {
      get().toast('Column already exists', 'error');
      return;
    }

    const oldColumns = columns;
    const renamedColumns = columns.map(col =>
      col.name === oldName ? { ...col, name: cleanName } : col
    );
    set({ columns: renamedColumns });

    try {
      const targetColumn = oldColumns.find(col => col.name === oldName);
      if (targetColumn) {
        await Promise.all(targetColumn.tasks.map(async (task, index) => {
          const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, task.id);
          await fsWriteTaskFile(tasksDirHandle, task.id, {
            ...frontmatter,
            id: task.id,
            status: cleanName,
            order: index,
          }, body);
        }));
      }

      await get().updateConfig(current => {
        const nextColumnColors = { ...(current.board.columnColors ?? {}) };
        const oldColor = nextColumnColors[oldName.toLowerCase()];
        if (oldColor) {
          nextColumnColors[cleanName.toLowerCase()] = oldColor;
          delete nextColumnColors[oldName.toLowerCase()];
        }
        const currentColumns = current.board.columns.some(col => col.toLowerCase() === oldName.toLowerCase())
          ? current.board.columns
          : [...current.board.columns, oldName];
        return {
          ...current,
          board: {
            ...current.board,
            columns: currentColumns.map(col => col.toLowerCase() === oldName.toLowerCase() ? cleanName : col),
            columnColors: nextColumnColors,
          },
        };
      });
      await get().reloadBoard();
    } catch (e) {
      get().toast('Failed to rename column: ' + (e as Error).message, 'error');
      set({ columns: oldColumns });
    }
  },

  deleteColumn: async (name) => {
    const { columns, tasksDirHandle } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const target = columns.find(col => col.name === name);
    if (!target) return;
    const oldColumns = columns;
    set({ columns: columns.filter(col => col.name !== name) });

    try {
      await Promise.all(target.tasks.map(task => fsDeleteTaskFile(tasksDirHandle, task.id)));
      await get().updateConfig(current => {
        const nextColumnColors = { ...(current.board.columnColors ?? {}) };
        delete nextColumnColors[name.toLowerCase()];
        return {
          ...current,
          board: {
            ...current.board,
            columns: current.board.columns.filter(col => col.toLowerCase() !== name.toLowerCase()),
            columnColors: nextColumnColors,
          },
        };
      });
      await get().reloadBoard();
      get().toast('Column deleted');
    } catch (e) {
      get().toast('Failed to delete column: ' + (e as Error).message, 'error');
      set({ columns: oldColumns });
    }
  },

  createTask: async (colName) => {
    const { columns, tasksDirHandle, config, taskContents } = get();
    if (!tasksDirHandle && !isServerMode()) return null;
    if (!columns.length) return null;
    const targetColName = colName || config.board.columns[0] || columns[0].name;
    const id = nextTaskId(columns);
    const targetOrder = columns.find(c => c.name === targetColName)?.tasks.length ?? 0;
    const task: BoardTask = {
      id,
      title: '',
      checked: false,
      tags: [],
      assignee: null,
      priority: config.fields.priority ? (config.board.defaultPriority as BoardTask['priority']) : null,
      ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
      progress: null,
    };
    const newColumns = columns.map(c =>
      c.name === targetColName ? { ...c, tasks: [...c.tasks, task] } : c
    );
    set({ columns: newColumns });
    try {
      const fm: TaskFrontmatter = {
        id,
        title: '',
        status: targetColName,
        order: targetOrder,
        priority: config.fields.priority ? config.board.defaultPriority : '',
        tags: [],
        assignee: '',
        created: new Date().toISOString().slice(0, 10),
        ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
        tools: '',
      };
      const body = '';
      const handle = tasksDirHandle || null;
      await fsWriteTaskFile(handle, id, fm, body);
      const newContents = new Map(taskContents);
      newContents.set(id, { frontmatter: fm, subtasks: [], body });
      set({ taskContents: newContents });
      get().toast(`Created ${id.replace(/^t/, '')}`);
      
      // Auto-open drawer for the newly created task
      await get().openDrawer(id);
      
      return id;
    } catch (e) {
      get().toast('Failed to create: ' + (e as Error).message, 'error');
      set({ columns });
      return null;
    }
  },

  deleteTask: async (taskId) => {
    const { columns, tasksDirHandle, taskContents } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const newColumns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => t.id !== taskId) }));
    set({ columns: newColumns });

    // Remove from content cache
    const newContents = new Map(taskContents);
    newContents.delete(taskId);
    const newMatches = new Map(get().searchMatches);
    newMatches.delete(taskId);
    set({ taskContents: newContents, searchMatches: newMatches });

    try {
      await fsDeleteTaskFile(tasksDirHandle || null, taskId);
      get().toast('Deleted');
    } catch (e) {
      get().toast('Failed to delete: ' + (e as Error).message, 'error');
      set({ columns });
    }
  },

  openDrawer: async (taskId) => {
    const { tasksDirHandle } = get();
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
      set({
        drawerTaskId: taskId,
        drawerData: { frontmatter, subtasks, body: bodyWithoutSubtasks },
        drawerBaseVersion: snapshot,
        conflictState: null,
        showConflictModal: false,
      });
    } catch (e) {
      get().toast('Failed to open: ' + (e as Error).message, 'error');
    }
  },

  closeDrawer: () => set({ drawerTaskId: null, drawerData: null, drawerBaseVersion: null, conflictState: null, showConflictModal: false }),

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
      await fsWriteTaskFile(tasksDirHandle || null, drawerTaskId, fm, fullBody);

      get().toast('Saved');
      set({ drawerTaskId: null, drawerData: null });

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
      get().toast('Failed to save: ' + (e as Error).message, 'error');
    }
  },

  saveDrawerMetadata: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle, taskContents } = get();
    if (!drawerTaskId || !drawerData) return;
    try {
      const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
      const fm = { ...drawerData.frontmatter, id: drawerTaskId };
      await fsWriteTaskFile(tasksDirHandle || null, drawerTaskId, fm, fullBody);

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
      get().toast('Failed to save: ' + (e as Error).message, 'error');
    }
  },

  setViewMode: (mode) => {
    localStorage.setItem('kandown:view', mode);
    set({ viewMode: mode });
  },
  setDensity: (density) => {
    localStorage.setItem('kandown:density', density);
    set({ density });
  },
  setFilter: (key, value) => {
    set(state => ({ filters: { ...state.filters, [key]: value } }));
    if (key === 'search') {
      const { columns, tasksDirHandle, taskContents } = get();
      const query = value as string;
      const allIds = columns.flatMap(col => col.tasks.map(t => t.id));
      // Load contents for all tasks if not already loaded (lazy mode for >10 tasks)
      if (tasksDirHandle) {
        const missingIds = allIds.filter(id => !taskContents.has(id));
        if (missingIds.length > 0) {
          get().loadTaskContents(missingIds).then(() => {
            get().computeSearchMatches(query);
          });
        } else {
          get().computeSearchMatches(query);
        }
      }
    }
  },
  clearFilters: () =>
    set({ filters: { search: '', priority: null, tag: null, assignee: null, ownerType: null }, searchMatches: new Map() }),

  setCommandOpen: (open) => set({ commandOpen: open }),
  setCurrentPage: (page) => set({ currentPage: page }),

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

  toast: (message, type = 'success') => {
    const id = ++toastIdCounter;
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, 2500);
  },
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

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
        const fm = { ...drawerData.frontmatter, id: drawerTaskId };
        await fsWriteTaskFile(tasksDirHandle, drawerTaskId, fm, fullBody);
        set({
          drawerBaseVersion: { ...drawerData, savedAt: Date.now() },
          conflictState: null,
          showConflictModal: false,
        });
        get().toast('Overwritten remote changes');
      }
    } else {
      set({ conflictState: null, showConflictModal: false });
    }
  },

  // ── File watcher setup (called after project open) ─────────────────────────

  setupWatcher: () => {
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

      const { frontmatter, body } = await fsReadTaskFile(tdh, taskId);
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
      get().loadConfig();
      get().toast('Settings updated externally', 'info');
    });

    fileWatcher.on('taskChanged', async (taskId) => {
      const { drawerTaskId, drawerBaseVersion, tasksDirHandle: tdh } = get();
      await notifyTaskChange(taskId);
      if (drawerTaskId === taskId && drawerBaseVersion && tdh) {
        const { frontmatter, body } = await fsReadTaskFile(tdh, taskId);
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
        get().reloadBoard();
      }
    });

    fileWatcher.on('newTaskDetected', async (taskId) => {
      const { tasksDirHandle: tdh } = get();
      if (tdh) {
        const { frontmatter, body } = await fsReadTaskFile(tdh, taskId);
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
      get().reloadBoard();
    });
  },
}));

// Hydrate recent projects on load
listRecentProjects().then(items => {
  useStore.setState({ recentProjects: items });
});

applyConfigTheme(DEFAULT_CONFIG);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyConfigTheme(useStore.getState().config);
});
