import { create } from 'zustand';
import type { Column, Filters, BoardTask, Density, ViewMode, Subtask, TaskFrontmatter, KandownConfig } from './types';
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
import { parseBoard, extractSubtasks, injectSubtasks } from './parser';
import { serializeBoard } from './serializer';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface State {
  dirHandle: FileSystemDirectoryHandle | null;
  projectName: string | null;
  tasksDirHandle: FileSystemDirectoryHandle | null;
  boardTitle: string;
  columns: Column[];

  // UI state
  viewMode: ViewMode;
  density: Density;
  filters: Filters;
  commandOpen: boolean;
  drawerTaskId: string | null;
  drawerData: { frontmatter: TaskFrontmatter; subtasks: Subtask[]; body: string } | null;
  settingsOpen: boolean;

  // Project config
  config: KandownConfig;

  // Recent projects
  recentProjects: RecentProject[];

  // Toasts
  toasts: Toast[];

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
  setSettingsOpen: (open: boolean) => void;

  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: number) => void;
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

function applyTheme(theme: 'auto' | 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

let toastIdCounter = 0;

export const useStore = create<State>((set, get) => ({
  dirHandle: null,
  projectName: null,
  tasksDirHandle: null,
  boardTitle: 'Project Kanban',
  columns: [],

  viewMode: (localStorage.getItem('kandown:view') as ViewMode) || 'board',
  density: (localStorage.getItem('kandown:density') as Density) || 'comfortable',
  filters: { search: '', priority: null, tag: null, assignee: null, ownerType: null },
  commandOpen: false,
  drawerTaskId: null,
  drawerData: null,
  settingsOpen: false,

  config: DEFAULT_CONFIG,

  recentProjects: [],
  toasts: [],

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
  },

  loadConfig: async () => {
    const { dirHandle } = get();
    if (!dirHandle) return;
    try {
      const config = await readConfigFile(dirHandle);
      if (config) {
        set({ config });
        applyTheme(config.ui.theme);
      }
    } catch (e) {
      // ignore - use defaults
    }
  },

  updateConfig: async (updater) => {
    const { dirHandle, config } = get();
    if (!dirHandle) return;
    const newConfig = updater(config);
    set({ config: newConfig });
    try {
      await writeConfigFile(dirHandle, newConfig);
      applyTheme(newConfig.ui.theme);
    } catch (e) {
      get().toast('Failed to save config: ' + (e as Error).message, 'error');
    }
  },

  reloadBoard: async () => {
    const { dirHandle } = get();
    if (!dirHandle) return;
    try {
      let text = await readBoardFile(dirHandle);
      if (text === null) {
        text = defaultBoardTemplate();
        await writeBoardFile(dirHandle, text);
      }
      const parsed = parseBoard(text);
      set({ boardTitle: parsed.title, columns: parsed.columns });
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
    const { columns, dirHandle, tasksDirHandle, boardTitle } = get();
    if (!dirHandle || !tasksDirHandle || !columns.length) return null;
    const targetColName = colName || columns[0].name;
    const id = nextTaskId(columns);
    const task: BoardTask = {
      id,
      title: 'New task',
      checked: false,
      tags: [],
      assignee: null,
      priority: null,
      ownerType: '',
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
        priority: '',
        tags: [],
        assignee: '',
        created: new Date().toISOString().slice(0, 10),
        ownerType: '',
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
    const { columns, dirHandle, tasksDirHandle, boardTitle } = get();
    if (!dirHandle || !tasksDirHandle) return;
    const newColumns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => t.id !== taskId) }));
    set({ columns: newColumns });
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
      set({
        drawerTaskId: taskId,
        drawerData: { frontmatter, subtasks, body: bodyWithoutSubtasks },
      });
    } catch (e) {
      get().toast('Failed to open: ' + (e as Error).message, 'error');
    }
  },

  closeDrawer: () => set({ drawerTaskId: null, drawerData: null }),

  updateDrawerData: (updater) => {
    const { drawerData } = get();
    if (!drawerData) return;
    set({ drawerData: updater(drawerData) });
  },

  saveDrawer: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle } = get();
    if (!drawerTaskId || !drawerData || !tasksDirHandle) return;

    const fullBody = injectSubtasks(drawerData.body, drawerData.subtasks);
    const fm = { ...drawerData.frontmatter, id: drawerTaskId };
    try {
      await fsWriteTaskFile(tasksDirHandle, drawerTaskId, fm, fullBody);
      get().toast('Saved');
      set({ drawerTaskId: null, drawerData: null });
    } catch (e) {
      get().toast('Failed to save: ' + (e as Error).message, 'error');
    }
  },

  saveDrawerMetadata: async () => {
    const { drawerTaskId, drawerData, tasksDirHandle, columns, dirHandle, boardTitle } = get();
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
  },
  clearFilters: () =>
    set({ filters: { search: '', priority: null, tag: null, assignee: null, ownerType: null } }),

  setCommandOpen: (open) => set({ commandOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  toast: (message, type = 'success') => {
    const id = ++toastIdCounter;
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, 2500);
  },
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));

// Hydrate recent projects on load
listRecentProjects().then(items => {
  useStore.setState({ recentProjects: items });
});
