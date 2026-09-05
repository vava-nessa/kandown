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
 *  → getProjectNameFromServerRoot — derives the project label from the CLI `.kandown` path
 *  → useStore — Zustand store with file, board, config, search, and UI actions
 *
 * @exports useStore
 * @see src/lib/filesystem.ts
 * @see src/lib/parser.ts
 * @see src/lib/theme.ts
 * @see src/lib/watcher.ts
 */

import { create } from 'zustand';
import type { Column, Filters, BoardTask, Density, ViewMode, Subtask, TaskFrontmatter, KandownConfig, TaskContent, SearchMatch, SessionIndexEntryPayload } from './types';
import { DEFAULT_CONFIG } from './types';
import {
  pickProjectDirectory,
  getKandownHandle,
  getTasksDirHandle,
  listTaskIds,
  readConfigFile,
  readConfigFileStrict,
  writeConfigFile,
  readTaskFile as fsReadTaskFile,
  readTaskFileStrict,
  writeTaskFile as fsWriteTaskFile,
  deleteTaskFile as fsDeleteTaskFile,
  archiveTaskFile as fsArchiveTaskFile,
  unarchiveTaskFile as fsUnarchiveTaskFile,
  saveRecentProject,
  listRecentProjects,
  removeRecentProject,
  verifyPermission,
  isServerMode,
  isDemoMode,
  supportsLocalFileSystemAccess,
  switchDemoToLocalFileSystem,
  getServerRoot,
  serverReadBoard,
  serverReadConfig,
  serverListTasks,
  serverReadTaskFile,
  serverMoveTask,
  serverMigrateTasks,
  serverGetDaemonInfo,
  serverSendTaskToAgent,
  type ServerAgentHook,
  type RecentProject,
} from './filesystem';
import { buildColumnsFromTasks, extractSubtasks, injectSubtasks, searchTaskContent, extractArchivedTasks } from './parser';
import { resolveTransition, resolveDependencyStatus } from './dependencies';
import { applyProjectTheme } from './theme';
import { fileWatcher } from './watcher';
import { emitKandownNotification } from './notifications';
import type { ConflictType } from './watcher';
import {
  supportsFileSystemAccess,
} from './filesystem';
import { BrowserNotSupportedError, PermissionDeniedError, DiskFullError } from './errors';
import { withRetry } from './retry';
import { parseQuickAddInput } from './quick-add-parser';
import { parseTaskTitle } from './task-title-category';
import { buildBoardUrl, buildTaskUrl, getTaskIdFromLocation } from './task-url';
import { createAgentChatSlice, createInitialAgentChatState } from './store/agentChatSlice';
import { createAgentEditsSlice, createInitialAgentEditsState } from './store/agentEditsSlice';
import { createAutopilotSlice, createInitialAutopilotState } from './store/autopilotSlice';
import type { AgentChatState, AgentChatStartInput, AgentEditsState, AutopilotState } from './store/types';
import type { AgentChatEvent } from './agent-chat-events';
import type { AgentEditsBoardEvent, AgentAutopilotEvent } from './watcher';

function updateBrowserUrl(nextUrl: string, replace = false): void {
  if (typeof window === 'undefined') return;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === nextUrl) return;
  if (replace) {
    window.history.replaceState({}, '', nextUrl);
  } else {
    window.history.pushState({}, '', nextUrl);
  }
  window.dispatchEvent(new Event('kandown:urlchange'));
}

function updateProjectBoardUrl(projectName: string): void {
  if (typeof window !== 'undefined' && getTaskIdFromLocation(window.location)) return;
  updateBrowserUrl(buildBoardUrl(projectName));
}

/** 📖 Toast severity. `warning` is used for partial-failure / corruption /
 * disk-full situations where the user must be informed but the app keeps
 * running. `error` is reserved for hard failures. */
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
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

/** 📖 A metadata change applied in bulk to one or more tasks. Each field is
 * optional — only the provided ones are merged into each task's frontmatter.
 * - `priority` / `assignee` / `due`: overwrite the value (pass `''` to clear).
 * - `tags.add`: union new tags onto the existing list (dedup, preserve order).
 * - `tags.remove`: subtract the given tags.
 * Tags are intentionally add/remove deltas instead of a full overwrite so a
 * bulk "add #backend" never clobbers tags the tasks already had. */
export interface BulkMetadataPatch {
  priority?: string;
  assignee?: string;
  due?: string;
  tags?: { add?: string[]; remove?: string[] };
}

interface State {
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
  /** 📖 Flips to `true` after `loadConfig()` resolves with the persisted
   * `kandown.json` (or after a corrupted/empty file falls back to
   * `DEFAULT_CONFIG`). Until then, any component that reads
   * `config.ui.*` is looking at the DEFAULT placeholder, not the user's
   * real preferences. Used by the onboarding modal to avoid auto-showing
   * itself with the default `onboardingCompleted: false` while the real
   * value is still in flight. */
  configLoaded: boolean;

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
  /** Replaces the whole selection with the given ids (used by select-all and
   * shift-range selection in the list/board views). */
  setTaskSelection: (ids: string[]) => void;
  /** Adds `ids` to the current selection (set union, dedup). Lets a parent
   *  checkbox on a collapsed CardStack select the whole group without
   *  clobbering whatever else the user already had selected. */
  selectTasks: (ids: string[]) => void;
  /** Removes `ids` from the current selection. Mirror of `selectTasks` for
   *  the "uncheck the stack" case. */
  deselectTasks: (ids: string[]) => void;
  clearTaskSelection: () => void;
  bulkMoveTasks: (targetColumn: string) => Promise<void>;
  bulkDeleteTasks: (taskIds?: string[]) => Promise<void>;
  bulkArchiveTasks: (taskIds: string[]) => Promise<void>;
  /** Applies a metadata patch (priority, assignee, due date, tag add/remove)
   * to every selected task — or to `taskIds` when explicitly provided. Reads
   * each file strictly, merges the frontmatter, persists with retry, and
   * tolerates per-task failures so one locked file never aborts the batch. */
  bulkUpdateMetadata: (patch: BulkMetadataPatch, taskIds?: string[]) => Promise<void>;

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

  // Agent chat sidebar (t308). Full shape documented in store/types.ts; this
  // inline mirror exists because store.ts still owns its own State declaration.
  agentChat: AgentChatState;
  openSidebar: (preTaskId?: string) => void;
  closeSidebar: () => void;
  refreshSessions: () => Promise<void>;
  startSession: (input: AgentChatStartInput) => Promise<void>;
  resumeSession: (entry: SessionIndexEntryPayload) => Promise<void>;
  newConversation: () => void;
  sendMessage: (text: string) => Promise<void>;
  /** Interactive skill answers (t310): format + forward as a follow-up. */
  sendAnswers: (answers: string[]) => Promise<void>;
  /** Hides the interactive answer form without sending (t310). */
  dismissAnswers: () => void;
  stopSession: (id: string) => Promise<void>;
  forgetSession: (id: string) => Promise<void>;
  ingestAgentEvent: (sessionId: string, event: AgentChatEvent) => void;

  // Live agent edit presence (t309). Full shape documented in store/types.ts;
  // this inline mirror exists because store.ts still owns its own State
  // declaration (same pattern as the agentChat block above).
  agentEdits: AgentEditsState;
  setupAgentEdits: () => void;
  ingestAgentEditEvent: (event: AgentEditsBoardEvent) => void;
  fetchPendingPermissions: (sessionId: string) => Promise<void>;
  dismissPermission: (permissionId: string) => void;
  resolvePermission: (sessionId: string, permissionId: string, approve: boolean) => Promise<void>;

  // Autopilot orchestration (t311). Full shape documented in store/types.ts;
  // same inline-mirror pattern as the blocks above.
  autopilot: AutopilotState;
  setupAutopilot: () => void;
  ingestAutopilotEvent: (event: AgentAutopilotEvent) => void;
  fetchAutopilotSnapshot: () => Promise<void>;
  startAutopilot: (harnessId?: string) => Promise<void>;
  stopAutopilot: () => Promise<void>;
  stopAutopilotSession: (sessionId: string) => Promise<boolean>;
}

function nextTaskId(columns: Column[], archivedTasks: BoardTask[] = []): string {
  let maxN = -1;
  for (const task of [...columns.flatMap(column => column.tasks), ...archivedTasks]) {
    const m = task.id.match(/^t(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return 't' + (maxN + 1);
}

async function readAllTasksServer(defaultStatus: string): Promise<LoadedTask[]> {
  const ids = await serverListTasks();
  const tasks = await Promise.all(ids.map(async (id) => {
    const { frontmatter, body } = await serverReadTaskFile(id);
    const normalizedFrontmatter = {
      ...frontmatter,
      id: frontmatter.id || id,
      status: frontmatter.status || defaultStatus,
    };
    const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
    return { id, frontmatter: normalizedFrontmatter, body: bodyWithoutSubtasks, subtasks };
  }));
  return tasks;
}

async function readAllTasks(
  tasksDirHandle: FileSystemDirectoryHandle,
  defaultStatus: string,
): Promise<{ tasks: LoadedTask[]; failedIds: string[] }> {
  const ids = await listTaskIds(tasksDirHandle);
  // 📖 Use readTaskFileStrict per file so we can tell "file deleted externally"
  // (benign, skip silently) from "file exists but unreadable" (actionable,
  // report to failedIds) — see t102. Promise.allSettled would also work but the
  // per-file Result is more precise about the reason.
  const results = await Promise.all(
    ids.map(async (id) => {
      const result = await readTaskFileStrict(tasksDirHandle, id);
      return { id, result };
    }),
  );

  const tasks: LoadedTask[] = [];
  const failedIds: string[] = [];
  for (const { id, result } of results) {
    if (result.ok) {
      const frontmatter = {
        ...result.task.frontmatter,
        id: result.task.frontmatter.id || id,
        status: result.task.frontmatter.status || defaultStatus,
      };
      const { subtasks, bodyWithoutSubtasks } = extractSubtasks(result.task.body);
      tasks.push({ id, frontmatter, body: bodyWithoutSubtasks, subtasks });
    } else if (result.reason === 'not-found') {
      // File deleted externally — skip silently.
      continue;
    } else {
      failedIds.push(id);
    }
  }
  return { tasks, failedIds };
}

/**
 * 📖 Persists status + order metadata back to each affected task file.
 * Returns the list of ids that failed to persist so the caller can warn the
 * user and roll back the optimistic state (t116 / t104).
 */
async function persistColumnOrder(
  tasksDirHandle: FileSystemDirectoryHandle | null,
  columns: Column[],
  _columnNames: string[],
): Promise<{ failedIds: string[] }> {
  const writes: Array<{ id: string; promise: Promise<void> }> = [];

  for (const column of columns) {
    const status = column.name;
    column.tasks.forEach((task, index) => {
      const promise = (async () => {
        const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, task.id);
        await fsWriteTaskFile(tasksDirHandle, task.id, {
          ...frontmatter,
          id: task.id,
          status,
          order: index,
        }, body);
      })();
      writes.push({ id: task.id, promise });
    });
  }

  const settled = await Promise.allSettled(writes.map(w => w.promise));
  const failedIds: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'rejected') failedIds.push(writes[index].id);
  });
  return { failedIds };
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

function getProjectNameFromServerRoot(serverRoot: string): string {
  const parts = serverRoot.split(/[\\/]+/).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart === '.kandown') return parts[parts.length - 2] ?? 'Project';
  return lastPart ?? 'Project';
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
/** 📖 Server-mode polling interval for detecting external file changes via REST API. */
let serverPollInterval: ReturnType<typeof setInterval> | null = null;
/** 📖 Prevents two destructive batch operations from racing each other when a
 * user double-clicks a terminal-column action or a bulk-action-bar control. */
let bulkMutationInFlight = false;

function uniqueTaskIds(taskIds: string[]): string[] {
  return [...new Set(taskIds.filter(id => typeof id === 'string' && id.trim().length > 0))];
}

export const useStore = create<State>((set, get, api) => ({
  isOpen: false,
  loading: false,
  dirHandle: null,
  projectName: null,
  tasksDirHandle: null,
  boardTitle: 'Project Kanban',
  columns: [],
  archivedTasks: [],
  showArchives: false,
  showMetadata: true,

  taskContents: new Map(),
  searchMatches: new Map(),

  viewMode: (localStorage.getItem('kandown:view') as ViewMode) || 'board',
  density: (localStorage.getItem('kandown:density') as Density) || 'comfortable',
  filters: { search: '', priority: null, tag: null, assignee: null, ownerType: null },
  commandOpen: false,
  cheatsheetOpen: false,
  drawerTaskId: null,
  drawerData: null,
  currentPage: 'board',

  config: DEFAULT_CONFIG,
  configLoaded: false,

  recentProjects: [],
  toasts: [],

  agentHook: null,

  isReloading: false,
  lastReloadError: null,
  failedTaskIds: [],
  watcherError: null,

  hasUnsavedDrawerEdits: false,
  lastSaveError: null,
  drawerRecoveryData: new Map(),

  selectedTaskIds: [],
  toggleTaskSelection: (id: string) => {
    set(state => {
      const exists = state.selectedTaskIds.includes(id);
      const next = exists ? state.selectedTaskIds.filter(i => i !== id) : [...state.selectedTaskIds, id];
      return { selectedTaskIds: next };
    });
  },

  // 📖 Replaces the whole selection with the given ids. Used by select-all and
  // shift-range selection in the list/board views.
  setTaskSelection: (ids: string[]) => set({ selectedTaskIds: Array.from(new Set(ids)) }),

  // 📖 Adds `ids` to the current selection (set union, dedup). Use when picking
  // a whole group — e.g. select every task in a CardStack — without
  // clobbering whatever else is already selected.
  selectTasks: (ids: string[]) => set(state => ({
    selectedTaskIds: Array.from(new Set([...state.selectedTaskIds, ...ids])),
  })),

  // 📖 Removes `ids` from the current selection. Mirrors `selectTasks` for the
  // deselect-the-group case (uncheck the parent stack checkbox).
  deselectTasks: (ids: string[]) => set(state => ({
    selectedTaskIds: state.selectedTaskIds.filter(i => !ids.includes(i)),
  })),

  clearTaskSelection: () => set({ selectedTaskIds: [] }),

  bulkMoveTasks: async (targetColumn: string) => {
    const { selectedTaskIds, columns, moveTask } = get();
    for (const id of selectedTaskIds) {
      // Find source column for task
      let sourceCol = columns[0]?.name ?? '';
      for (const col of columns) {
        if (col.tasks.some(t => t.id === id)) {
          sourceCol = col.name;
          break;
        }
      }
      await moveTask(id, sourceCol, targetColumn);
    }
    set({ selectedTaskIds: [] });
  },

  bulkDeleteTasks: async (taskIds?: string[]) => {
    const { selectedTaskIds, tasksDirHandle, drawerTaskId } = get();
    const ids = uniqueTaskIds(taskIds ?? selectedTaskIds);
    if (ids.length === 0 || (!tasksDirHandle && !isServerMode())) return;
    if (bulkMutationInFlight) {
      get().toast('Another bulk action is already running', 'warning');
      return;
    }

    bulkMutationInFlight = true;
    try {
      const settled = await Promise.allSettled(
        ids.map(id => withRetry(
          () => fsDeleteTaskFile(tasksDirHandle || null, id),
          { maxAttempts: 3 },
        )),
      );
      const succeededIds = ids.filter((_, index) => settled[index]?.status === 'fulfilled');
      const failedIds = ids.filter((_, index) => settled[index]?.status === 'rejected');

      if (drawerTaskId && succeededIds.includes(drawerTaskId)) get().closeDrawer();
      set(state => ({
        selectedTaskIds: state.selectedTaskIds.filter(id => !succeededIds.includes(id)),
      }));
      await get().reloadBoard();

      if (failedIds.length > 0) {
        get().toast(`${succeededIds.length} deleted, ${failedIds.length} could not be deleted`, 'warning', 8000);
      } else {
        get().toast(`Deleted ${succeededIds.length} task${succeededIds.length === 1 ? '' : 's'}`);
      }
    } finally {
      bulkMutationInFlight = false;
    }
  },

  bulkArchiveTasks: async (taskIds: string[]) => {
    const { tasksDirHandle, drawerTaskId } = get();
    const ids = uniqueTaskIds(taskIds);
    if (ids.length === 0 || (!tasksDirHandle && !isServerMode())) return;
    if (bulkMutationInFlight) {
      get().toast('Another bulk action is already running', 'warning');
      return;
    }

    bulkMutationInFlight = true;
    try {
      const settled = await Promise.allSettled(ids.map(async id => {
        // 📖 Strict reads prevent a failed read from turning into an empty
        // placeholder task that could overwrite real data during archiving.
        const result = await readTaskFileStrict(tasksDirHandle || null, id);
        if (!result.ok) {
          throw new Error(`Task ${id} could not be read (${result.reason})`);
        }
        await withRetry(
          () => fsArchiveTaskFile(
            tasksDirHandle || null,
            id,
            { ...result.task.frontmatter, id, archived: true },
            result.task.body,
          ),
          { maxAttempts: 3 },
        );
      }));
      const succeededIds = ids.filter((_, index) => settled[index]?.status === 'fulfilled');
      const failedIds = ids.filter((_, index) => settled[index]?.status === 'rejected');

      if (drawerTaskId && succeededIds.includes(drawerTaskId)) get().closeDrawer();
      set(state => ({
        selectedTaskIds: state.selectedTaskIds.filter(id => !succeededIds.includes(id)),
      }));
      await get().reloadBoard();

      if (failedIds.length > 0) {
        get().toast(`${succeededIds.length} archived, ${failedIds.length} could not be archived`, 'warning', 8000);
      } else {
        get().toast(`Archived ${succeededIds.length} task${succeededIds.length === 1 ? '' : 's'}`);
      }
    } finally {
      bulkMutationInFlight = false;
    }
  },

  bulkUpdateMetadata: async (patch: BulkMetadataPatch, taskIds?: string[]) => {
    const { selectedTaskIds, tasksDirHandle } = get();
    const ids = uniqueTaskIds(taskIds ?? selectedTaskIds);
    if (ids.length === 0 || (!tasksDirHandle && !isServerMode())) return;
    if (bulkMutationInFlight) {
      get().toast('Another bulk action is already running', 'warning');
      return;
    }

    // 📖 Pre-compute the tag delta once. `add` is a unique set, `remove` is a
    // set for O(1) lookups. Empty deltas mean "no tag change".
    const addTags = patch.tags?.add ? Array.from(new Set(patch.tags.add.map(s => s.trim()).filter(Boolean))) : [];
    const removeTags = patch.tags?.remove ? new Set(patch.tags.remove.map(s => s.trim()).filter(Boolean)) : new Set<string>();
    const hasTagChange = addTags.length > 0 || removeTags.size > 0;

    bulkMutationInFlight = true;
    try {
      const settled = await Promise.allSettled(ids.map(async id => {
        // 📖 Strict reads prevent a failed read from turning into an empty
        // placeholder task that could overwrite real data during the merge.
        const result = await readTaskFileStrict(tasksDirHandle || null, id);
        if (!result.ok) {
          throw new Error(`Task ${id} could not be read (${result.reason})`);
        }
        const fm = { ...result.task.frontmatter, id };

        if (patch.priority !== undefined) fm.priority = patch.priority;
        if (patch.assignee !== undefined) fm.assignee = patch.assignee;
        if (patch.due !== undefined) fm.due = patch.due;

        if (hasTagChange) {
          // 📖 Preserve existing tags, append the new ones, drop removed ones.
          // The parser keeps tags as a string[] in frontmatter; fall back to []
          // for tasks that never had any.
          const current: string[] = Array.isArray(fm.tags) ? [...fm.tags] : [];
          let next = current.filter(t => !removeTags.has(t));
          for (const add of addTags) {
            if (!next.includes(add)) next.push(add);
          }
          fm.tags = next;
        }

        // 📖 Only persist fields the project actually has enabled, matching the
        // single-task drawer behaviour. We still keep already-present values
        // so we never strip data on projects that disabled a field later.
        await withRetry(
          () => fsWriteTaskFile(tasksDirHandle || null, id, fm, result.task.body),
          { maxAttempts: 3 },
        );
      }));
      const succeededIds = ids.filter((_, index) => settled[index]?.status === 'fulfilled');
      const failedIds = ids.filter((_, index) => settled[index]?.status === 'rejected');

      set(state => ({
        selectedTaskIds: state.selectedTaskIds, // keep selection so follow-up edits are easy
      }));
      await get().reloadBoard();

      if (failedIds.length > 0) {
        get().toast(`Updated ${succeededIds.length}, ${failedIds.length} could not be updated`, 'warning', 8000);
      } else {
        get().toast(`Updated ${succeededIds.length} task${succeededIds.length === 1 ? '' : 's'}`);
      }
    } finally {
      bulkMutationInFlight = false;
    }
  },

  drawerBaseVersion: null,
  conflictState: null,
  showConflictModal: false,

  openFolder: async () => {
    // 📖 Refuse to even try on unsupported browsers — calling
    // window.showDirectoryPicker on Firefox/Safari throws a TypeError that
    // would otherwise bubble up as an unhandled rejection. The empty-state
    // screen also gates this, but the store stays defensive.
    if (!supportsFileSystemAccess() || (isDemoMode() && !supportsLocalFileSystemAccess())) {
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
    if (isDemoMode()) {
      switchDemoToLocalFileSystem(projectHandle.name);
      set({ toasts: [] });
    }
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

  openRecentProject: async (project) => {
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
          status: frontmatter.status || config.board.columns[0] || 'Backlog',
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
        configLoaded: true,
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
        set({ config: result.config, configLoaded: true });
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
      set({ config: DEFAULT_CONFIG, configLoaded: true });
      applyConfigTheme(DEFAULT_CONFIG);
    } catch (e) {
      set({ config: DEFAULT_CONFIG, configLoaded: true });
      applyConfigTheme(DEFAULT_CONFIG);
    }
  },

  updateConfig: async (updater) => {
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
        const tasks = await readAllTasksServer(config.board.columns[0] || 'Backlog');
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
        const { tasks, failedIds } = await readAllTasks(tasksDirHandle, config.board.columns[0] || 'Backlog');
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

  moveTask: async (taskId, fromCol, toCol, toIndex) => {
    const { columns, config, taskContents, searchMatches, archivedTasks } = get();
    const isServer = isServerMode();
    if (!isServer && !get().tasksDirHandle) return;
    const fromColObj = columns.find(c => c.name === fromCol);
    const toColObj = columns.find(c => c.name === toCol);
    if (!fromColObj || !toColObj) return;
    const taskIdx = fromColObj.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return;
    const movingTask = fromColObj.tasks[taskIdx];
    if (!movingTask) return;

    // 📖 Standalone mode has no Node extension host. Keep the pure dependency
    // policy locally, including archived tasks, and let extension gates degrade
    // open as documented. Managed backends run both gate layers authoritatively.
    if (!isServer) {
      const activeTasks = columns.flatMap((col) => col.tasks.map((task) => ({
        id: task.id,
        status: col.name,
        depends_on: task.dependsOn,
      })));
      const archived = archivedTasks.map((task) => ({
        id: task.id,
        status: 'archived',
        depends_on: task.dependsOn,
        archived: true,
      }));
      const verdict = resolveTransition(
        { id: taskId, status: fromCol, depends_on: movingTask.dependsOn },
        toCol,
        resolveDependencyStatus([...activeTasks, ...archived], config),
        config,
      );
      if (!verdict.allowed) {
        const list = verdict.blockedBy.length === 1
          ? verdict.blockedBy[0]
          : `${verdict.blockedBy.slice(0, -1).join(', ')} and ${verdict.blockedBy[verdict.blockedBy.length - 1]}`;
        get().toast(`Cannot move ${taskId} to ${toCol}: blocked by ${list}`, 'error');
        return;
      }
    }

    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const newFrom = newColumns.find(c => c.name === fromCol)!;
    const newTo = newColumns.find(c => c.name === toCol)!;
    const [removedTask] = newFrom.tasks.splice(taskIdx, 1);
    if (!removedTask) return;
    // 📖 Clone the task object too. Mutating the shared object made a rollback
    // restore the old columns while keeping the optimistic checked value.
    const task = { ...removedTask, checked: /done|termin|closed|complet/i.test(toCol) };
    if (toIndex !== undefined) newTo.tasks.splice(toIndex, 0, task);
    else newTo.tasks.push(task);

    set({ columns: newColumns });
    try {
      if (isServer) {
        const result = await serverMoveTask(taskId, toCol, toIndex);
        if (!result.ok) {
          get().toast(result.reason, 'error', 8000);
          set({ columns, taskContents, searchMatches });
          return;
        }
        if (result.failedIds.length > 0) {
          const msg = result.failedIds.length === 1
            ? `Could not save order for ${result.failedIds[0]}`
            : `${result.failedIds.length} task orders could not be saved`;
          get().toast(msg, 'warning', 8000);
          await get().reloadBoard();
        }
        return;
      }

      const { tasksDirHandle } = get();
      if (!tasksDirHandle) return;
      const affected = fromCol === toCol
        ? newColumns.filter(c => c.name === toCol)
        : newColumns.filter(c => c.name === fromCol || c.name === toCol);
      const { failedIds } = await withRetry(
        () => persistColumnOrder(tasksDirHandle, affected, config.board.columns),
        { maxAttempts: 3 },
      );

      if (failedIds.length > 0) {
        const msg = failedIds.length === 1
          ? `Could not save move for ${failedIds[0]}`
          : `${failedIds.length} tasks could not be moved`;
        get().toast(msg, 'warning', 8000);
        await get().reloadBoard();
      }
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full: move was not saved. Free up space and try again.', 'error', 8000);
      } else {
        get().toast('Failed to save: ' + err.message, 'error');
      }
      set({ columns, taskContents, searchMatches });
    }
  },

  reorderInColumn: async (colName, fromIndex, toIndex) => {
    const { columns, tasksDirHandle, config, taskContents, searchMatches } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const col = newColumns.find(c => c.name === colName);
    if (!col) return;
    const [task] = col.tasks.splice(fromIndex, 1);
    col.tasks.splice(toIndex, 0, task);
    set({ columns: newColumns });
    try {
      const { tasksDirHandle } = get();
      const isServer = isServerMode();
      if (!tasksDirHandle && !isServer) return;
      const { failedIds } = await withRetry(
        () => persistColumnOrder(tasksDirHandle ?? null, [col], config.board.columns),
        { maxAttempts: 3 },
      );
      if (failedIds.length > 0) {
        get().toast(`Could not save reorder for ${failedIds.length} task(s)`, 'warning', 8000);
        await get().reloadBoard();
      }
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — reorder was not saved.', 'error', 8000);
      } else {
        get().toast('Failed to save: ' + err.message, 'error');
      }
      // 📖 Restore columns + caches captured pre-mutation (t104).
      set({ columns, taskContents, searchMatches });
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
        // 📖 Tolerate per-task failures so one unreadable file doesn't abort a
        // column rename (t116).
        const settled = await Promise.allSettled(targetColumn.tasks.map(async (task, index) => {
          const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, task.id);
          await fsWriteTaskFile(tasksDirHandle, task.id, {
            ...frontmatter,
            id: task.id,
            status: cleanName,
            order: index,
          }, body);
        }));
        const failed = settled.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          get().toast(`${failed} task(s) could not be renamed`, 'warning', 8000);
        }
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

  reorderColumns: async (fromIndex, toIndex) => {
    const { config, columns, tasksDirHandle } = get();
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= columns.length || toIndex >= columns.length || fromIndex === toIndex) return;
    if (!tasksDirHandle && !isServerMode()) return;

    // Build reordered columns array
    const reordered = Array.from(columns);
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    set({ columns: reordered });

    // 📖 Persist the visible column order, not the old config array indices.
    // Unknown task statuses can appear as columns after parsing; if vava drags
    // one, it should become a real configured column instead of corrupting the
    // config by splicing `undefined` from a shorter array.
    const colOrder = reordered.map(col => col.name);

    try {
      await get().updateConfig(c => ({ ...c, board: { ...c.board, columns: colOrder } }));
      // Reload board to reflect new order from config
      await get().reloadBoard();
    } catch (e) {
      get().toast('Failed to reorder columns: ' + (e as Error).message, 'error');
      // Restore previous state
      set({ columns });
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
      // 📖 Tolerate per-task delete failures so one locked file doesn't abort
      // the whole column delete (t116).
      const settled = await Promise.allSettled(
        target.tasks.map(task => fsDeleteTaskFile(tasksDirHandle, task.id)),
      );
      const failed = settled.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        get().toast(`${failed} task(s) could not be deleted`, 'warning', 8000);
      }
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

  createTask: async (colName, quickAddInput) => {
    const { columns, tasksDirHandle, config, taskContents, searchMatches, archivedTasks } = get();
    if (!tasksDirHandle && !isServerMode()) return null;
    if (!columns.length) return null;
    const targetColName = colName || config.board.columns[0] || columns[0].name;
    const id = nextTaskId(columns, archivedTasks);
    const targetOrder = columns.find(c => c.name === targetColName)?.tasks.length ?? 0;
    const parsed = quickAddInput ? parseQuickAddInput(quickAddInput) : null;
    // 📖 A leading `[CATEGORY]` bracket in the quick-add title is normalized
    // into the `category:` field and stripped from the prose, matching the
    // CLI create path (src/lib/task-title-category.ts).
    const parsedTitle = parseTaskTitle(parsed?.title || '');
    const category = parsedTitle.category;
    const cleanTitle = parsedTitle.cleanTitle || parsed?.title || '';
    const task: BoardTask = {
      id,
      title: cleanTitle,
      checked: false,
      category,
      // 📖 Optimistic card for a task being created right now, so its age is
      // "just now" until the write lands and the real `updated:` is parsed back.
      updatedAt: Date.now(),
      dependsOn: parsed?.depends_on || [],
      tags: parsed?.tags || [],
      assignee: parsed?.assignee || null,
      priority: (parsed?.priority as BoardTask['priority']) || (config.fields.priority ? (config.board.defaultPriority as BoardTask['priority']) : null),
      ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
      progress: null,
      frontmatter: {},
    };
    const newColumns = columns.map(c =>
      c.name === targetColName ? { ...c, tasks: [...c.tasks, task] } : c
    );
    // Optimistic update — both columns and the content cache.
    const newContents = new Map(taskContents);
    const fm: TaskFrontmatter = {
      id,
      title: cleanTitle,
      status: targetColName,
      order: targetOrder,
      priority: parsed?.priority || (config.fields.priority ? config.board.defaultPriority : ''),
      category: category ?? '',
      tags: parsed?.tags || [],
      assignee: parsed?.assignee || '',
      due: parsed?.due || '',
      depends_on: parsed?.depends_on || [],
      created: new Date().toISOString().slice(0, 10),
      ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
      tools: '',
    };
    const body = '';
    newContents.set(id, { frontmatter: fm, subtasks: [], body });
    set({ columns: newColumns, taskContents: newContents });
    try {
      const handle = tasksDirHandle || null;
      await withRetry(() => fsWriteTaskFile(handle, id, fm, body), { maxAttempts: 3 });
      get().toast(`Created ${id.replace(/^t/, '')}`);

      // Auto-open drawer for the newly created task
      await get().openDrawer(id);

      return id;
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — task was not created.', 'error', 8000);
      } else {
        get().toast('Failed to create: ' + err.message, 'error');
      }
      // 📖 Roll back columns AND the content cache we mutated optimistically
      // (t104). searchMatches captured too for full consistency.
      set({ columns, taskContents, searchMatches });
      return null;
    }
  },

  deleteTask: async (taskId) => {
    // 📖 Capture ALL pre-mutation state so we can restore everything if the
    // filesystem delete fails (t104).
    const { columns, tasksDirHandle, taskContents, searchMatches } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const newColumns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => t.id !== taskId) }));
    set({ columns: newColumns });

    // Remove from content cache
    const newContents = new Map(taskContents);
    newContents.delete(taskId);
    const newMatches = new Map(searchMatches);
    newMatches.delete(taskId);
    set({ taskContents: newContents, searchMatches: newMatches });

    try {
      await fsDeleteTaskFile(tasksDirHandle || null, taskId);
      get().toast('Deleted');
    } catch (e) {
      const err = e as Error;
      get().toast('Failed to delete: ' + err.message, 'error');
      // 📖 Restore columns + both caches so the store matches disk again (t104).
      set({ columns, taskContents, searchMatches });
    }
  },

  // 📖 Archive = flip the frontmatter flag on, move the file into
  // tasks/archive/, close any open drawer on it, then reload the board so it
  // disappears from the active columns and appears in the archive view.
  archiveTask: async (taskId) => {
    const { tasksDirHandle } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    try {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle || null, taskId);
      await fsArchiveTaskFile(tasksDirHandle || null, taskId, { ...frontmatter, archived: true }, body);
      if (get().drawerTaskId === taskId) get().closeDrawer();
      await get().reloadBoard();
      get().toast('Archived');
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — task was not archived.', 'error', 8000);
      } else {
        get().toast('Failed to archive: ' + err.message, 'error');
      }
    }
  },

  // 📖 Restore = drop the archived flag, move the file back to tasks/, reload.
  unarchiveTask: async (taskId) => {
    const { tasksDirHandle } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    try {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle || null, taskId);
      const restored = { ...frontmatter };
      delete restored.archived;
      await fsUnarchiveTaskFile(tasksDirHandle || null, taskId, restored, body);
      await get().reloadBoard();
      get().toast('Restored');
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — task was not restored.', 'error', 8000);
      } else {
        get().toast('Failed to restore: ' + err.message, 'error');
      }
    }
  },

  setShowArchives: (show) => set({ showArchives: show }),
  setShowMetadata: (show) => set({ showMetadata: show }),

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
  setCheatsheetOpen: (open) => set({ cheatsheetOpen: open }),

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

  toast: (message, type = 'success', durationMs) => {
    const id = ++toastIdCounter;
    // 📖 Severity-aware duration: warnings and errors stay longer because they
    // carry information the user must act on; info/success flash briefly.
    const auto = durationMs ?? (type === 'error' || type === 'warning' ? 6000 : 2500);
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, auto);
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

  // ── File watcher setup (called after project open) ─────────────────────────

  setupWatcher: () => {
    // 📖 Server mode — use REST API polling (no FileSystemDirectoryHandle available)
    if (isServerMode()) {
      if (serverPollInterval) clearInterval(serverPollInterval);
      serverPollInterval = setInterval(() => {
        void get().reloadBoard();
      }, 2000);
      // 📖 t309: wire the live agent-edit slice (subscribes to the board SSE
      // events and opens the /api/events stream, the only server-mode reader).
      get().setupAgentEdits();
      // 📖 t311: wire the autopilot slice the same way (subscribe, start the
      // stream, fetch the initial snapshot).
      get().setupAutopilot();
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
          status: frontmatter.status || config.board.columns[0] || 'Backlog',
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
              status: frontmatter.status || get().config.board.columns[0] || 'Backlog',
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

    // 📖 t309: subscribe the live agent-edit slice after fileWatcher.start()
    // (stop() above clears every listener, so the slice must resubscribe after
    // it). In local mode startServerSse is a no-op: there is no daemon.
    get().setupAgentEdits();
    // 📖 t311: same resubscription discipline for the autopilot slice.
    get().setupAutopilot();
  },

  restartWatcher: () => {
    const { dirHandle, tasksDirHandle } = get();
    if (!dirHandle || !tasksDirHandle) return;
    set({ watcherError: null });
    get().setupWatcher();
    get().toast('File watcher restarted');
  },

  // 📖 t308 agent chat sidebar: the slice owns sidebar open state, the session
  // index, the per-session chat folds and the SSE lifecycle. store.ts still
  // declares its own inline `State` (the slices extraction is incremental and
  // mirrors live in store/types.ts); the two declarations are kept structurally
  // identical so the slice composes with no casts.
  agentChat: createInitialAgentChatState(),
  ...createAgentChatSlice(set, get, api),

  // 📖 t309 live agent edits: presence per task, latest diff per task and the
  // pending permission queue. setupWatcher wires the slice to the board SSE
  // stream (and starts it in server mode).
  agentEdits: createInitialAgentEditsState(),
  ...createAgentEditsSlice(set, get, api),

  // 📖 t311 autopilot orchestration: latest run snapshot (active sessions per
  // task, queue, orphans, accumulated totals) plus the kill-switch transport.
  // setupWatcher wires the slice to the board SSE stream the same way.
  autopilot: createInitialAutopilotState(),
  ...createAutopilotSlice(set, get, api),
}));

// Hydrate recent projects on load. IndexedDB may be unavailable (private
// browsing, browser blocking, quota) — in that case we degrade silently to an
// empty recent list rather than crashing the store init.
listRecentProjects()
  .then(items => {
    useStore.setState({ recentProjects: items });
  })
  .catch(e => {
    console.warn('[Store] Failed to hydrate recent projects:', e);
  });

applyConfigTheme(DEFAULT_CONFIG);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyConfigTheme(useStore.getState().config);
});
