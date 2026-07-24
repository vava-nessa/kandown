/**
 * @file Zustand store — shared types
 * @description State shape and supporting interfaces used across every store
 * slice. Split out of store.ts so slice files can import the `State` type
 * without a circular dependency on the store module itself.
 */

import type { Column, Filters, BoardTask, Density, ViewMode, Subtask, TaskFrontmatter, KandownConfig, TaskContent, SearchMatch } from '../types';
import type { RecentProject, ServerAgentHook } from '../filesystem';
import type { ConflictType } from '../watcher';

/** 📖 Toast severity. `warning` is used for partial-failure / corruption /
 * disk-full situations where the user must be informed but the app keeps
 * running. `error` is reserved for hard failures. */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export interface DrawerSnapshot {
  frontmatter: TaskFrontmatter;
  subtasks: Subtask[];
  body: string;
  savedAt: number;
}

export interface LoadedTask {
  id: string;
  frontmatter: TaskFrontmatter;
  body: string;
  subtasks: Subtask[];
}

export interface NotificationTaskSnapshot {
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

export interface State {
  isOpen: boolean;
  loading: boolean;
  dirHandle: FileSystemDirectoryHandle | null;
  projectName: string | null;
  tasksDirHandle: FileSystemDirectoryHandle | null;
  boardTitle: string;
  columns: Column[];
  /** Tasks with `archived: true` — hidden from the active board, shown in the
   * dedicated archive view. Backed by files in tasks/archive/. */
  archivedTasks: BoardTask[];
  /** When true the board renders the archive view instead of the active board. */
  showArchives: boolean;
  /** Master switch for the per-card metadata block. When true (default) the
 * metadata block stays hidden and cards show only id + title + progress. Toggling
 * it false reveals every frontmatter metadata field (priority, assignee, tags,
 * due, ownerType, tools, plus any custom key) inside a single block per card. */
  showMetadata: boolean;

  // Content search cache (loaded lazily when >10 tasks, eagerly otherwise)
  taskContents: Map<string, TaskContent>;
  searchMatches: Map<string, SearchMatch[]>;

  // UI state
  viewMode: ViewMode;
  density: Density;
  filters: Filters;
  commandOpen: boolean;
  cheatsheetOpen: boolean;
  drawerTaskId: string | null;
  drawerData: { frontmatter: TaskFrontmatter; subtasks: Subtask[]; body: string } | null;
  currentPage: 'board' | 'settings';

  // Project config
  config: KandownConfig;

  // Recent projects
  recentProjects: RecentProject[];

  // Agent hook (server mode only). null when not configured; the UI hides
  // the "Send to Agent" button when null.
  agentHook: ServerAgentHook | null;

  // Toasts
  toasts: Toast[];

  // 📖 Resilience state. `isReloading` lets the UI show a loading indicator
  // during reloadBoard; `lastReloadError` is non-null when the most recent
  // reload failed (previous board state preserved). `failedTaskIds` lists task
  // ids that could not be parsed on the last load so the UI can flag them.
  isReloading: boolean;
  lastReloadError: string | null;
  failedTaskIds: string[];
  /** 📖 Set when the file watcher auto-disabled itself after repeated tick
   * failures (t107). The Header shows a banner + a restart button. */
  watcherError: string | null;

  // 📖 Drawer save recovery. `hasUnsavedDrawerEdits` is true when the drawer
  // holds edits that have not been persisted; `lastSaveError` carries the most
  // recent save failure message; `drawerRecoveryData` keeps a per-task copy of
  // unsaved drawer data so it can be restored if the drawer is force-closed
  // (e.g. by opening another task) before a successful save.
  hasUnsavedDrawerEdits: boolean;
  lastSaveError: string | null;
  drawerRecoveryData: Map<string, { frontmatter: TaskFrontmatter; subtasks: Subtask[]; body: string }>;

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
  reorderColumns: (fromIndex: number, toIndex: number) => Promise<void>;
  deleteColumn: (name: string) => Promise<void>;
  createTask: (colName?: string, quickAddInput?: string) => Promise<string | null>;
  deleteTask: (taskId: string) => Promise<void>;
  /** Archives a task: sets `archived: true` and moves the file to tasks/archive/. */
  archiveTask: (taskId: string) => Promise<void>;
  /** Restores an archived task: removes the flag and moves the file back to tasks/. */
  unarchiveTask: (taskId: string) => Promise<void>;
  /** Toggles between the active board and the archive view. */
  setShowArchives: (show: boolean) => void;
  /** Master switch for the per-card metadata block (see showMetadata). */
  setShowMetadata: (show: boolean) => void;

  selectedTaskIds: string[];
  toggleTaskSelection: (id: string) => void;
  clearTaskSelection: () => void;
  bulkMoveTasks: (targetColumn: string) => Promise<void>;
  bulkDeleteTasks: (taskIds?: string[]) => Promise<void>;
  bulkArchiveTasks: (taskIds: string[]) => Promise<void>;

  openDrawer: (taskId: string, options?: { syncUrl?: boolean; replace?: boolean }) => Promise<void>;
  closeDrawer: (options?: { syncUrl?: boolean; replace?: boolean }) => void;
  updateDrawerData: (updater: (data: NonNullable<State['drawerData']>) => NonNullable<State['drawerData']>) => void;
  saveDrawer: () => Promise<void>;
  saveDrawerMetadata: () => Promise<void>;
  /** Marks the drawer as having unsaved edits (called from Drawer on each change). */
  markDrawerDirty: () => void;
  /** Forcibly closes the drawer even when there are unsaved edits, after
   * stashing them into the recovery buffer keyed by task id. */
  forceCloseDrawer: () => void;

  setViewMode: (mode: ViewMode) => void;
  setDensity: (density: Density) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;

  setCommandOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
  setCurrentPage: (page: 'board' | 'settings') => void;

  loadTaskContents: (taskIds: string[]) => Promise<void>;
  computeSearchMatches: (query: string) => void;

  /** Sends the current drawer task to the configured agent hook (no-op when null). */
  sendTaskToAgent: (taskId: string) => Promise<void>;
  /** Fetches the daemon's agent hook info and stores it on the state. */
  refreshAgentHook: () => Promise<void>;

  toast: (message: string, type?: ToastType, durationMs?: number) => void;
  dismissToast: (id: number) => void;
  resolveConflict: (resolution: 'reload' | 'overwrite' | 'cancel') => Promise<void>;
  setupWatcher: () => void;
  /** 📖 Restarts the file watcher after it auto-disabled itself (t107). */
  restartWatcher: () => void;
}
