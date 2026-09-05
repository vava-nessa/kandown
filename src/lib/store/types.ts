/**
 * @file Zustand store — shared types
 * @description State shape and supporting interfaces used across every store
 * slice. Split out of store.ts so slice files can import the `State` type
 * without a circular dependency on the store module itself.
 */

import type { Column, Filters, BoardTask, Density, ViewMode, Subtask, TaskFrontmatter, KandownConfig, TaskContent, SearchMatch, SessionIndexEntryPayload, DetectedHarness, PermissionMode } from '../types';
import type { RecentProject, ServerAgentHook, SkillPayload } from '../filesystem';
import type { ConflictType, AgentEditsBoardEvent, AgentAutopilotEvent } from '../watcher';
import type { AgentChatEvent, ChatFoldState } from '../agent-chat-events';

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

/** 📖 Per-session chat state for the agent chat sidebar (t308). `status`
 * mirrors the daemon session lifecycle ('starting' | 'running' | 'completed' |
 * 'stopped' | 'failed' | 'stopping'), `fold` is the rendered conversation. */
export interface AgentChatLiveSession {
  status: string;
  fold: ChatFoldState;
}

/** 📖 The skill a chat session was launched from (t310). Kept after the
 * questions turn so the UI keeps showing the skill chip through the fusion
 * step; cleared on new conversation or on a start without a skill. */
export interface ActiveSkillRef {
  skillId: string;
  label: string;
  interactive: boolean;
}

/** 📖 One chat-launchable skill button (t310): the lean UI projection of a
 * SkillPayload that declares a `chat` block on /api/skills. */
export interface ChatSkillButton {
  skillId: string;
  label: string;
  icon?: string;
  scope: 'task' | 'board';
  interactive: boolean;
}

/** 📖 Presence marker set when a completed assistant turn carried a
 * `[show: tXXX]` directive: the chat has (or is about to) open that task and
 * the session's blobatar hovers near its editor header while the session
 * stays the active one. This is presence only: it never locks the editor (the
 * live-edit lock in agentEdits is a separate, stronger signal). */
export interface AgentShowTaskPresence {
  /** Chat session that emitted the directive. */
  sessionId: string;
  /** Task the directive points at (canonical lowercase id, e.g. `t42`). */
  taskId: string;
  /** Section to scroll to, when the directive carried a known anchor. */
  anchor: 'description' | 'subtasks' | 'report' | null;
  /** Increments per directive so re-showing the same task re-triggers the
   * scroll effect in the editor headers. */
  nonce: number;
  /** Tail of the assistant message that carried the directive: an SSE history
   * replay of the same turn_completed has the same fingerprint and is
   * ignored, a fresh directive always differs. */
  fingerprint: string;
}

/** 📖 Everything the agent chat sidebar reads. Chat state lives here, never in
 * tasks/: harnesses own their transcripts, this is session state only. */
export interface AgentChatState {
  sidebarOpen: boolean;
  /** Session index for this project, newest activity first. */
  sessions: SessionIndexEntryPayload[];
  activeSessionId: string | null;
  /** Folded chat state per session id, kept across sidebar close/reopen within
   * the page life so reopening the sidebar never loses the conversation. */
  live: Record<string, AgentChatLiveSession>;
  /** 'unknown' before the first index fetch, 'no-daemon' outside server mode /
   * demo / old daemon, 'available' once the index answered, 'stale-auth' when
   * a daemon is alive but rejects this page's token (it restarted and minted
   * a fresh one: the sidebar offers a reload instead of the daemon card). */
  guard: 'unknown' | 'available' | 'no-daemon' | 'stale-auth';
  /** Permission mode the active session was started with (project default). */
  permissionModeSnapshot: PermissionMode | null;
  /** Task the sidebar was opened for ("Ask the agent" on a card / editor). */
  preContextTaskId: string | null;
  /** 📖 Daemon advisory from the last session create: the project root is not
   *  a git work tree, so agent edits have no safety net (t309). */
  gitWarning: 'not-a-git-repo' | null;
  /** Installed harnesses for the new-conversation selector (lazy, on open). */
  harnesses: DetectedHarness[];
  /** Installed skills declaring a chat button, for the sidebar pill row (t310,
   * lazy, fetched once on first sidebar use). */
  chatSkills: ChatSkillButton[];
  /** 📖 Full /api/skills payload (round 3), backing the read-only SkillsModal:
   * every installed skill, chat-capable or not, with active state and
   * compatibility reasons. Same lazy fetch as chatSkills, which is projected
   * from this list. */
  skills: SkillPayload[];
  /** Skill the active session was launched from, kept through the fusion step. */
  activeSkill: ActiveSkillRef | null;
  /** 📖 Presence from the last `[show: tXXX]` directive (see
   * AgentShowTaskPresence): null until an assistant turn asks the app to open
   * a task, reset on conversation switches. */
  showTask: AgentShowTaskPresence | null;
  /** True when the answer form is visible (interactive skill asked questions). */
  answersRequested: boolean;
  /** Questions captured from the interactive first turn, backing the form and
   * the sendAnswers fallback when the live fold cannot be parsed. */
  skillQuestions: string[];
  /** True once the interactive question phase is over (answers sent or form
   * dismissed), so a later turn_completed never reopens the form. */
  answersSent: boolean;
  starting: boolean;
  sending: boolean;
}

/** 📖 Everything startSession accepts. `message` becomes the first user turn
 * appended under the compiled task/board context the daemon builds. `skillId`
 * (t310) is passed through to createAgentSession so the daemon folds the
 * skill's instructions into the compiled prompt; `label` and `interactive` are
 * UI-only (they drive the skill chip and the answer form, never sent).
 * `mentionedTaskIds` (round 3) rides along on the create call so the daemon
 * inlines the integral task files into the first prompt. */
export interface AgentChatStartInput {
  harnessId: string;
  taskId?: string;
  message?: string;
  skillId?: string;
  label?: string;
  interactive?: boolean;
  mentionedTaskIds?: string[];
}

/** 📖 One live agent edit on a task (t309): the session touching the file,
 * its harness, and when the edit started. Keyed by task id in AgentEditsState. */
export interface AgentEditSession {
  sessionId: string;
  harnessId: string;
  /** ISO 8601 instant the edit started (from the board event). */
  since: string;
}

/** 📖 Latest before/after snapshot for a task the agent has written, as
 * delivered by `task_diff` board events. Rendered by the DiffOverlay panel. */
export interface AgentEditDiff {
  before: string;
  after: string;
  truncated: boolean;
  path: string;
  /** ISO 8601 instant of the write (from the board event). */
  at: string;
}

/** 📖 A pending harness permission request waiting for Approve / Reject.
 * Rendered as a card in the fixed bottom-right stack. */
export interface AgentPermissionRequest {
  sessionId: string;
  permissionId: string;
  title: string;
  kind: string;
  /** ISO 8601 instant the request arrived (from the board event or fetch). */
  at: string;
}

/** 📖 Everything the live-editing experience reads (t309). Presence per task,
 * the latest diff per task, and the pending permission queue. Diffs are pruned
 * to the 20 most recently touched tasks; permissions are ephemeral UI state,
 * the daemon owns the authoritative pending list. */
export interface AgentEditsState {
  /** Task id → the agent session currently editing it. */
  edits: Record<string, AgentEditSession>;
  /** Task id → latest known before/after diff. */
  diffs: Record<string, AgentEditDiff>;
  /** Pending permission requests, oldest first. */
  permissions: AgentPermissionRequest[];
}

/** 📖 One task an autopilot session is currently working on (t311). */
export interface AutopilotActiveEntry {
  taskId: string;
  sessionId: string;
}

/** 📖 Accumulated autopilot usage for the current run (t311). */
export interface AutopilotTotals {
  tokens: number;
  costUsd: number;
}

/** 📖 The latest autopilot orchestration snapshot (t311), from the board SSE
 * event or the /api/agent/autopilot endpoints. `state` is wire truth
 * ('idle' | 'running'); a user-initiated stop is tracked separately by
 * AutopilotState.stopping, never by mangling this union. */
export interface AutopilotSnapshot {
  state: 'idle' | 'running';
  /** Harness the run was started with, when the daemon reported one. */
  harnessId?: string;
  /** Sessions currently working, one entry per task. */
  active: AutopilotActiveEntry[];
  /** Task ids waiting for a free slot. */
  queue: string[];
  /** Task ids with a live session that no longer belongs to the run. */
  orphans: string[];
  /** Run usage, accumulated across snapshots (deltas) since the run started. */
  totals: AutopilotTotals;
  /** ISO 8601 instant of the snapshot. */
  at: string;
}

/** 📖 Everything the autopilot UI reads (t311): the latest snapshot plus the
 * kill-switch in-flight flag. `stopping` is true between the stop click and
 * the daemon's confirmation (or the rollback after a failure). */
export interface AutopilotState {
  snapshot: AutopilotSnapshot | null;
  stopping: boolean;
}

/** 📖 A metadata change applied in bulk to one or more tasks (t116). Each field
 * is optional: only the provided ones are merged into each task's frontmatter.
 * Mirrored in store.ts; kept here so the shared State declaration is complete. */
export interface BulkMetadataPatch {
  priority?: string;
  assignee?: string;
  due?: string;
  tags?: { add?: string[]; remove?: string[] };
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
  /** 📖 True once loadConfig() resolved with the persisted kandown.json (or the
   * corrupted-file fallback). Components use it to avoid acting on
   * DEFAULT_CONFIG while the real value is still in flight. */
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
  /** Replaces the whole selection with the given ids (select-all). */
  setTaskSelection: (ids: string[]) => void;
  /** Adds `ids` to the current selection (set union, dedup). */
  selectTasks: (ids: string[]) => void;
  /** Removes `ids` from the current selection. Mirror of selectTasks. */
  deselectTasks: (ids: string[]) => void;
  clearTaskSelection: () => void;
  bulkMoveTasks: (targetColumn: string) => Promise<void>;
  bulkDeleteTasks: (taskIds?: string[]) => Promise<void>;
  bulkArchiveTasks: (taskIds: string[]) => Promise<void>;
  /** Applies a metadata patch to every selected task (or `taskIds`). */
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

  // Agent chat sidebar (t308). State lives under `agentChat`.
  agentChat: AgentChatState;
  /** Opens the sidebar, optionally pre-contextualized to a task. */
  openSidebar: (preTaskId?: string) => void;
  /** Closes the sidebar. Closes the SSE stream but keeps chat state for reopen. */
  closeSidebar: () => void;
  /** Refreshes the session index + harness list; sets the daemon guard. */
  refreshSessions: () => Promise<void>;
  /** Starts a new harness session (and connects its SSE stream). */
  startSession: (input: AgentChatStartInput) => Promise<void>;
  /** Resumes an indexed conversation through its harness session id. */
  resumeSession: (entry: SessionIndexEntryPayload) => Promise<void>;
  /** Switches the sidebar to an empty draft: the next send starts a new session. */
  newConversation: () => void;
  /** Sends a follow-up message with optimistic append + rollback on failure.
   * `mentionedTaskIds` (@task mentions, round 3) rides along so the daemon
   * inlines the integral task files ahead of the message. */
  sendMessage: (text: string, mentionedTaskIds?: string[]) => Promise<void>;
  /** 📖 Sends the interactive skill answers (t310): formats them with the
   * captured questions and forwards as a normal follow-up message. */
  sendAnswers: (answers: string[]) => Promise<void>;
  /** 📖 Hides the interactive answer form without sending (t310). Ends the
   * question phase so a later turn never reopens it. */
  dismissAnswers: () => void;
  /** Stops a live session via POST /api/agent/sessions/:id/stop. */
  stopSession: (id: string) => Promise<void>;
  /** Forgets one session index entry (sidebar-only removal). */
  forgetSession: (id: string) => Promise<void>;
  /** Internal: folds one SSE event into the session's chat state. */
  ingestAgentEvent: (sessionId: string, event: AgentChatEvent) => void;

  // Live agent edit presence (t309). State lives under `agentEdits`.
  agentEdits: AgentEditsState;
  /** Subscribes the slice to the board SSE agent-edit events and starts the
   * stream in server mode. Called from setupWatcher (idempotent). */
  setupAgentEdits: () => void;
  /** Folds one board agent-edit event into the agentEdits state. */
  ingestAgentEditEvent: (event: AgentEditsBoardEvent) => void;
  /** Fetches pending permissions for one session (GET .../pending) and merges
   * them into the queue. Best-effort: silently no-ops when unreachable. */
  fetchPendingPermissions: (sessionId: string) => Promise<void>;
  /** Removes a permission request locally without answering it. */
  dismissPermission: (permissionId: string) => void;
  /** Answers a permission request (POST .../resolve). Optimistically removes
   * the card, restores it and toasts when the daemon cannot be reached. */
  resolvePermission: (sessionId: string, permissionId: string, approve: boolean) => Promise<void>;

  // Autopilot orchestration (t311). State lives under `autopilot`.
  autopilot: AutopilotState;
  /** Subscribes the slice to the board SSE autopilot events, starts the
   * stream in server mode and fetches the initial snapshot. Idempotent. */
  setupAutopilot: () => void;
  /** Folds one board autopilot event into the autopilot state. */
  ingestAutopilotEvent: (event: AgentAutopilotEvent) => void;
  /** GETs /api/agent/autopilot and applies the snapshot. Best-effort. */
  fetchAutopilotSnapshot: () => Promise<void>;
  /** Starts a run (POST .../start). Optimistic running state, rollback +
   * toast on failure. */
  startAutopilot: (harnessId?: string) => Promise<void>;
  /** Kill switch: stops the whole run (POST .../stop). Optimistic stopping
   * flag, rollback + toast on failure. */
  stopAutopilot: () => Promise<void>;
  /** Stops one task's session (POST /api/agent/sessions/:id/stop), the same
   * route the chat sidebar uses. Returns false and toasts on failure. */
  stopAutopilotSession: (sessionId: string) => Promise<boolean>;
}
