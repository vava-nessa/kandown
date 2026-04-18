/**
 * @file Kandown Zustand store
 * @description Central state container for project handles, parsed board data,
 * config, filters, task drawer editing, content-search cache, recent projects,
 * and toast notifications.
 *
 * 📖 This is the behavioral core of the web UI. Components should call store
 * actions instead of writing markdown directly, because these actions handle
 * optimistic updates, rollback, config theme application, and cache refreshes.
 *
 * 📖 The file watcher (watcher.ts) runs a 500ms polling loop that detects
 * external changes to board.md, kandown.json, and tasks/*.md. When a change is
 * detected, the watcher fires an event which this store handles — either silently
 * reloading or showing a conflict modal if the user is actively editing.
 *
 * @functions
 *  → defaultBoardTemplate — creates a minimal board when none exists
 *  → nextTaskId — finds the next zero-padded task id
 *  → applyConfigTheme — applies persisted project appearance settings
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
  readBoardFile,
  writeBoardFile,
  readConfigFile,
  writeConfigFile,
  readTaskFile as fsReadTaskFile,
  writeTaskFile as fsWriteTaskFile,
  deleteTaskFile as fsDeleteTaskFile,
  saveRecentProject,
  listRecentProjects,
  verifyPermission,
  type RecentProject,
} from './filesystem';
import { parseBoard, extractSubtasks, injectSubtasks, searchTaskContent } from './parser';
import { serializeBoard } from './serializer';
import { applyProjectTheme } from './theme';
import { fileWatcher } from './watcher';
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

export interface ConflictState {
  taskId: string;
  type: ConflictType;
  local: DrawerSnapshot;
  remote: { frontmatter: TaskFrontmatter; body: string; subtasks: Subtask[] };
}

interface State {
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
  orphanTaskIds: string[];

  // Actions
  openFolder: () => Promise<void>;
  openRecentProject: (project: RecentProject) => Promise<void>;
  reloadBoard: () => Promise<void>;
  loadConfig: () => Promise<void>;
  updateConfig: (updater: (config: KandownConfig) => KandownConfig) => Promise<void>;

  moveTask: (taskId: string, fromCol: string, toCol: string, toIndex?: number) => Promise<void>;
  reorderInColumn: (colName: string, fromIndex: number, toIndex: number) => Promise<void>;
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
  dismissOrphan: (taskId: string) => void;
  setupWatcher: () => void;
}

function defaultBoardTemplate(): string {
  return `---
kanban: v1
columns: [Backlog, Todo, In Progress, Done]
---

# Project Kanban

## Backlog

## Todo

## In Progress

## Done
`;
}

function nextTaskId(columns: Column[]): string {
  let maxN = -1;
  for (const col of columns) {
    for (const t of col.tasks) {
      const m = t.id.match(/^t-(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
  }
  return 't-' + String(maxN + 1).padStart(3, '0');
}

function applyConfigTheme(config: KandownConfig): void {
  applyProjectTheme(config.ui.theme, config.ui.skin, config.ui.font, config.ui.background);
}

let toastIdCounter = 0;

export const useStore = create<State>((set, get) => ({
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
  orphanTaskIds: [],

  openFolder: async () => {
    const result = await pickProjectDirectory();
    if (!result) return;
    const { projectHandle, kandownHandle } = result;
    const tasksDir = await ensureTasksDir(kandownHandle);
    const projectName = projectHandle.name;
    set({ dirHandle: kandownHandle, tasksDirHandle: tasksDir, projectName });
    window.history.pushState({}, '', `?p=${encodeURIComponent(projectName)}`);
    await saveRecentProject({
      id: projectHandle.name,
      name: projectHandle.name,
      handle: projectHandle,
      lastOpened: Date.now(),
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
    const { dirHandle, tasksDirHandle } = get();
    if (!dirHandle) return;
    try {
      let text = await readBoardFile(dirHandle);
      if (text === null) {
        text = defaultBoardTemplate();
        await writeBoardFile(dirHandle, text);
      }
      const parsed = parseBoard(text);
      set({ boardTitle: parsed.title, columns: parsed.columns });

      // Load all task contents eagerly if <= 10 tasks total
      const totalTasks = parsed.columns.reduce((acc, col) => acc + col.tasks.length, 0);
      if (tasksDirHandle && totalTasks <= 10) {
        const ids = parsed.columns.flatMap(col => col.tasks.map(t => t.id));
        await get().loadTaskContents(ids);
      }
    } catch (e) {
      get().toast('Failed to load board: ' + (e as Error).message, 'error');
    }
  },

  moveTask: async (taskId, fromCol, toCol, toIndex) => {
    const { columns, dirHandle, boardTitle } = get();
    if (!dirHandle) return;
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
      await writeBoardFile(dirHandle, serializeBoard(boardTitle, newColumns));
    } catch (e) {
      get().toast('Failed to save: ' + (e as Error).message, 'error');
      // Rollback
      set({ columns });
    }
  },

  reorderInColumn: async (colName, fromIndex, toIndex) => {
    const { columns, dirHandle, boardTitle } = get();
    if (!dirHandle) return;
    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const col = newColumns.find(c => c.name === colName);
    if (!col) return;
    const [task] = col.tasks.splice(fromIndex, 1);
    col.tasks.splice(toIndex, 0, task);
    set({ columns: newColumns });
    try {
      await writeBoardFile(dirHandle, serializeBoard(boardTitle, newColumns));
    } catch (e) {
      get().toast('Failed to save: ' + (e as Error).message, 'error');
      set({ columns });
    }
  },

  createTask: async (colName) => {
    const { columns, dirHandle, tasksDirHandle, boardTitle, config } = get();
    if (!dirHandle || !tasksDirHandle || !columns.length) return null;
    const targetColName = colName || columns[0].name;
    const id = nextTaskId(columns);
    const task: BoardTask = {
      id,
      title: 'New task',
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
        title: 'New task',
        status: targetColName,
        priority: config.fields.priority ? config.board.defaultPriority : '',
        tags: [],
        assignee: '',
        created: new Date().toISOString().slice(0, 10),
        ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
        tools: '',
      };
      const body = `# New task\n\n## Context\n\n\n## Subtasks\n\n`;
      await fsWriteTaskFile(tasksDirHandle, id, fm, body);
      await writeBoardFile(dirHandle, serializeBoard(boardTitle, newColumns));
      get().toast(`Created ${id.toUpperCase()}`);
      return id;
    } catch (e) {
      get().toast('Failed to create: ' + (e as Error).message, 'error');
      set({ columns });
      return null;
    }
  },

  deleteTask: async (taskId) => {
    const { columns, dirHandle, tasksDirHandle, boardTitle, taskContents } = get();
    if (!dirHandle || !tasksDirHandle) return;
    const newColumns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => t.id !== taskId) }));
    set({ columns: newColumns });

    // Remove from content cache
    const newContents = new Map(taskContents);
    newContents.delete(taskId);
    const newMatches = new Map(get().searchMatches);
    newMatches.delete(taskId);
    set({ taskContents: newContents, searchMatches: newMatches });

    try {
      await fsDeleteTaskFile(tasksDirHandle, taskId);
      await writeBoardFile(dirHandle, serializeBoard(boardTitle, newColumns));
      get().toast('Deleted');
    } catch (e) {
      get().toast('Failed to delete: ' + (e as Error).message, 'error');
      set({ columns });
    }
  },

  openDrawer: async (taskId) => {
    const { tasksDirHandle } = get();
    if (!tasksDirHandle) return;
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
    const { drawerTaskId, drawerData, tasksDirHandle, columns, dirHandle, boardTitle, taskContents } = get();
    if (!drawerTaskId || !drawerData || !tasksDirHandle || !dirHandle) return;

    const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
    const fm = { ...drawerData.frontmatter, id: drawerTaskId };
    try {
      await fsWriteTaskFile(tasksDirHandle, drawerTaskId, fm, fullBody);

      const total = drawerData.subtasks.length;
      const done = drawerData.subtasks.filter(s => s.done).length;
      const newColumns = columns.map(c => ({
        ...c,
        tasks: c.tasks.map(t =>
          t.id === drawerTaskId
            ? {
                ...t,
                title: (fm.title as string) || t.title,
                priority: (fm.priority as BoardTask['priority']) || null,
                assignee: (fm.assignee as string) || null,
                tags: (fm.tags as string[]) || [],
                ownerType: ((fm.ownerType as BoardTask['ownerType']) || '') as BoardTask['ownerType'],
                progress: total > 0 ? { done, total } : null,
              }
            : t
        ),
      })) as Column[];
      set({ columns: newColumns });
      await writeBoardFile(dirHandle, serializeBoard(boardTitle, newColumns));

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
    } catch (e) {
      get().toast('Failed to save: ' + (e as Error).message, 'error');
    }
  },

  saveDrawerMetadata: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle, columns, dirHandle, boardTitle, taskContents } = get();
    if (!drawerTaskId || !drawerData || !tasksDirHandle || !dirHandle) return;

    const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
    const fm = { ...drawerData.frontmatter, id: drawerTaskId };
    try {
      await fsWriteTaskFile(tasksDirHandle, drawerTaskId, fm, fullBody);

      const total = drawerData.subtasks.length;
      const done = drawerData.subtasks.filter(s => s.done).length;
      const newColumns = columns.map(c => ({
        ...c,
        tasks: c.tasks.map(t =>
          t.id === drawerTaskId
            ? {
                ...t,
                title: (fm.title as string) || t.title,
                priority: (fm.priority as BoardTask['priority']) || null,
                assignee: (fm.assignee as string) || null,
                tags: (fm.tags as string[]) || [],
                ownerType: ((fm.ownerType as BoardTask['ownerType']) || '') as BoardTask['ownerType'],
                progress: total > 0 ? { done, total } : null,
              }
            : t
        ),
      })) as Column[];
      set({ columns: newColumns });
      await writeBoardFile(dirHandle, serializeBoard(boardTitle, newColumns));

      // Update content cache
      const newContents = new Map(taskContents);
      newContents.set(drawerTaskId, {
        frontmatter: fm,
        subtasks: drawerData.subtasks,
        body: drawerData.body,
      });
      set({ taskContents: newContents });
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

  dismissOrphan: (taskId) => set(state => ({ orphanTaskIds: state.orphanTaskIds.filter(id => id !== taskId) })),

  // ── File watcher setup (called after project open) ─────────────────────────

  setupWatcher: () => {
    const { dirHandle, tasksDirHandle } = get();
    if (!dirHandle || !tasksDirHandle) return;

    fileWatcher.stop();
    fileWatcher.start(dirHandle, tasksDirHandle);

    fileWatcher.on('boardChanged', () => {
      get().reloadBoard();
    });

    fileWatcher.on('configChanged', () => {
      get().loadConfig();
      get().toast('Settings updated externally', 'info');
    });

    fileWatcher.on('taskChanged', async (taskId) => {
      const { drawerTaskId, drawerBaseVersion, tasksDirHandle: tdh } = get();
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

    fileWatcher.on('newTaskDetected', (taskId) => {
      get().toast(`New task file detected: ${taskId}`, 'info');
    });

    fileWatcher.on('orphanTasksDetected', (taskIds) => {
      set(state => ({ orphanTaskIds: [...new Set([...state.orphanTaskIds, ...taskIds])] }));
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
