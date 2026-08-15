/**
 * @file Browser file-system adapter
 * @description Wraps the File System Access API, project discovery, task reads
 * and writes, project config persistence, and recent-project IndexedDB storage.
 * Also provides server-mode helpers that proxy all file operations to the CLI
 * REST API when window.__KANDOWN_ROOT__ is set.
 *
 * 📖 All browser file handles pass through this module. UI and store code should
 * call these helpers instead of touching File System Access APIs directly.
 *
 * 📖 Layout (v0.12+):
 *   - `.kandown/` holds config (`kandown.json`), web UI (`kandown.html`),
 *     and project-local workflow instructions (`kandown_work.md`).
 *   - `./tasks/` (project root, sibling of `.kandown/`) holds the markdown
 *     task files and `./tasks/archive/` for archived ones.
 *   The user picks the **project root** in the file picker — we derive
 *   `.kandown/` and `tasks/` from it.
 *
 * 📖 In server mode (when served via `npx kandown`), all filesystem operations
 * are routed through the CLI REST API instead of using FileSystemDirectoryHandle.
 * This allows the web app to work without user interaction.
 *
 * 📖 There is a third backend, used only by the website demo: an in-memory
 * implementation of the same REST API. It plugs in at `apiFetch` via
 * {@link registerDemoApi}, which is why nothing else in the codebase needs to
 * know the demo exists. See `src/lib/demoBackend.ts`.
 *
 * @functions
 *  → supportsFileSystemAccess — detects any available Kandown backend
 *  → supportsLocalFileSystemAccess — detects direct local-folder access
 *  → switchDemoToLocalFileSystem — disconnects the sample backend after folder selection
 *  → isServerMode — returns true when a managed backend answers /api/* (CLI or demo)
 *  → isDemoMode — returns true in the website demo build (no disk behind the app)
 *  → registerDemoApi — routes apiFetch into an in-process backend
 *  → getServerRoot — returns window.__KANDOWN_ROOT__ path or null
 *  → pickDirectory — prompts for a writable project directory
 *  → pickProjectDirectory — opens the project root, derives `.kandown` and `tasks/`
 *  → getKandownHandle — resolves `.kandown` from a project handle
 *  → getTasksDirHandle — resolves `./tasks/` from a project handle
 *  → readConfigFile / writeConfigFile — load and persist kandown.json
 *  → listTaskIds — scans tasks/*.md and returns task ids
 *  → readTaskFile / writeTaskFile / deleteTaskFile — task file helpers
 *  → saveRecentProject / listRecentProjects / removeRecentProject — IndexedDB recent projects
 *  → verifyPermission — requests persisted read/write access
 *  → serverReadBoard / serverWriteBoard — board.md via REST
 *  → serverReadConfig / serverWriteConfig — kandown.json via REST
 *  → serverListTasks: list task IDs via REST
 *  → serverReadTask / serverWriteTask / serverDeleteTask: task CRUD via REST
 *  → serverMoveTask: authoritative managed move intent
 *  → serverLoadExtensionRuntime: field/panel defs and batched badges
 *  → serverSetExtensionField: persist one host-validated plugins field
 *  → serverReadExtensionFile: authenticated source read for Blob import
 *  → serverReportExtensionOutcome: persistent browser failure health
 *  → serverMigrateTasks: triggers the legacy to new layout migration via REST
 *  → readProjectInstructions / writeProjectInstructions — edits `.kandown/kandown_work.md`
 *
 * @exports supportsFileSystemAccess, supportsLocalFileSystemAccess, switchDemoToLocalFileSystem, isServerMode, isDemoMode, registerDemoApi, getServerRoot, pickDirectory, pickProjectDirectory, getKandownHandle, getTasksDirHandle, ensureTasksDir, listTaskIds, readConfigFile, writeConfigFile, readProjectInstructions, writeProjectInstructions, readTaskFile, writeTaskFile, deleteTaskFile, saveRecentProject, listRecentProjects, removeRecentProject, verifyPermission, serverReadBoard, serverWriteBoard, serverReadConfig, serverWriteConfig, serverListTasks, serverReadTask, serverReadTaskFile, serverMoveTask, serverLoadExtensionRuntime, serverSetExtensionField, serverReadExtensionFile, serverReportExtensionOutcome, serverWriteTask, serverDeleteTask, serverMigrateTasks
 * @see src/lib/store.ts
 * @see src/lib/parser.ts
 */

import type { KandownConfig, TaskFrontmatter, ParsedTask, DetectedAgent, MoveTaskResult } from './types';
import type { ExtensionHealth, ExtensionRuntimePayload, ExtensionRuntimeSummary } from './extensions/types';
import type { LoadedWorkflowPackage } from './workflows';
import type { KandownWorkDiagnostic, KandownWorkStats } from './kandown-work';
export type { MoveTaskResult } from './types';
import { normalizeKandownConfig } from './config';
import { serializeTaskFile } from './serializer';
import { stampUpdated } from './task-meta';
import { parseTaskFile } from './parser';
import { buildTaskFilename, isTaskFilename, resolveTaskFilename, taskIdFromFilename } from './task-filename';
import { PermissionDeniedError, DiskFullError, CorruptedDataError, FileReadError } from './errors';

declare global {
  interface Window {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    /** 📖 Set by the CLI server when serving the web app. Contains the absolute path to .kandown/. */
    __KANDOWN_ROOT__?: string;
    /** 📖 Per-daemon API auth token injected by the CLI server alongside the
     * root. Sent as `X-Kandown-Token` on every API call — see apiFetch. */
    __KANDOWN_TOKEN__?: string;
    /** 📖 Set by the website demo build only. Marks a session with no disk
     * behind it: the API is served from memory and nothing is persisted.
     * @see src/lib/demoBackend.ts */
    __KANDOWN_DEMO__?: boolean;
  }
  interface FileSystemDirectoryHandle {
    name: string;
    getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string): Promise<void>;
    queryPermission(opts?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>;
    requestPermission(opts?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>;
    values(): AsyncIterableIterator<FileSystemHandle>;
  }
  interface FileSystemFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
  }
  interface FileSystemWritableFileStream {
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
  }
}

export function supportsFileSystemAccess(): boolean {
  if (isServerMode()) return true;
  return supportsLocalFileSystemAccess();
}

export function supportsLocalFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * 📖 True when a managed backend answers `/api/*` and the project path is
 * already known — i.e. no file picker is needed.
 *
 * 📖 Two things satisfy this. Normally it is the CLI server, which sets
 * `window.__KANDOWN_ROOT__` to the real `.kandown/` path. In the website demo
 * build it is the in-memory backend, which sets the same global to a synthetic
 * path so the whole store boots through this one code path instead of growing a
 * third set of branches. Read this predicate as "we have a backend", not
 * literally "an HTTP server exists".
 *
 * @see src/lib/demoBackend.ts
 */
export function isServerMode(): boolean {
  return typeof window !== 'undefined' && typeof window.__KANDOWN_ROOT__ === 'string' && window.__KANDOWN_ROOT__.length > 0;
}

/**
 * 📖 True only in the website demo: the app is running with no disk behind it.
 * Use this to hide affordances that cannot work without the CLI (the folder
 * picker, the updater, the daemon panel) — never to change how data is read,
 * which is the demo backend's job.
 */
export function isDemoMode(): boolean {
  return typeof window !== 'undefined' && window.__KANDOWN_DEMO__ === true;
}

/**
 * 📖 Returns the absolute path to the .kandown/ directory when in server mode,
 * or null if not in server mode.
 */
export function getServerRoot(): string | null {
  if (!isServerMode()) return null;
  return window.__KANDOWN_ROOT__ ?? null;
}

/**
 * 📖 Base path for server API calls — relative so it works on any port.
 */
const API_BASE = '';

/**
 * 📖 Signature of a backend that can answer Kandown API requests. Deliberately
 * the same shape as `fetch` so the demo implementation is a drop-in.
 */
export type KandownApi = (path: string, options?: RequestInit) => Promise<Response>;

/**
 * 📖 Set by the demo backend at startup. When present, every API call is served
 * from memory instead of the network. Null in every shipped CLI build — the
 * demo backend is dead code there and never reaches the bundle.
 * @see src/lib/demoBackend.ts
 */
let demoApiHandler: KandownApi | null = null;

/**
 * @description Points {@link apiFetch} at an in-process backend. Called once,
 * before React mounts, by `installDemoBackend()`.
 */
export function registerDemoApi(handler: KandownApi): void {
  demoApiHandler = handler;
}

/**
 * @description Leaves the disposable sample backend after the visitor has
 * selected a real folder. The picker runs first, so cancelling it keeps the
 * sample project intact. Every later read and write then follows the existing
 * File System Access path with the handles stored by `openFolder`.
 */
export function switchDemoToLocalFileSystem(projectName: string): void {
  demoApiHandler = null;
  delete window.__KANDOWN_DEMO__;
  delete window.__KANDOWN_ROOT__;
  delete window.__KANDOWN_TOKEN__;
  if (window.parent !== window) {
    window.parent.postMessage(
      { type: 'kandown:local-project-opened', projectName },
      window.location.origin,
    );
  }
}

/**
 * 📖 Raw transport for Kandown API calls. It attaches the daemon token and
 * routes demo requests in-process, but leaves HTTP status handling to callers.
 * `apiFetch` below preserves the usual throw-on-error contract.
 */
async function rawApiFetch(path: string, options?: RequestInit): Promise<Response> {
  if (demoApiHandler) return demoApiHandler(path, options);

  const token = typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
    : null;
  const headers: HeadersInit = {
    ...(options?.headers as Record<string, string> | undefined),
    ...(token ? { 'X-Kandown-Token': token } : {}),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await rawApiFetch(path, options);
  if (!res.ok) {
    const body = await res.clone().text().catch(() => '');
    throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status}${body ? ': ' + body : ''}`);
  }
  return res;
}

/* ═════════════ Server-mode REST API helpers ═════════════ */
/**
 * @description Fetches board.md content via the CLI server.
 */
export async function serverReadBoard(): Promise<string> {
  const res = await apiFetch('/api/board');
  return res.text();
}

/**
 * @description Writes board.md content via the CLI server.
 */
export async function serverWriteBoard(content: string): Promise<void> {
  await apiFetch('/api/board', { method: 'PUT', body: content, headers: { 'Content-Type': 'text/plain' } });
}

/**
 * @description Fetches and parses kandown.json via the CLI server.
 */
export async function serverReadConfig(): Promise<KandownConfig> {
  const res = await apiFetch('/api/config');
  return normalizeKandownConfig(await res.json());
}

/**
 * @description Writes kandown.json via the CLI server.
 */
async function serverWriteConfig(config: KandownConfig): Promise<void> {
  await apiFetch('/api/config', { method: 'PUT', body: JSON.stringify(config, null, 2), headers: { 'Content-Type': 'application/json' } });
}

async function serverReadProjectInstructions(): Promise<string> {
  const res = await apiFetch('/api/instructions');
  return res.text();
}

async function serverWriteProjectInstructions(content: string): Promise<void> {
  await apiFetch('/api/instructions', { method: 'PUT', body: content, headers: { 'Content-Type': 'text/plain' } });
}

export interface WorkflowSummaryPayload {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'built-in' | 'local' | 'store';
  active: boolean;
  valid: boolean;
  errors: string[];
}

export interface BoardPresetPreviewPayload {
  workflowId: string;
  currentColumns: string[];
  targetColumns: string[];
  statusMapping: Record<string, string>;
  taskMoves: Array<{ from: string; to: string; count: number }>;
  preservedColumns: string[];
}

export interface WorkflowWorkspacePayload {
  workflows: WorkflowSummaryPayload[];
  selected: LoadedWorkflowPackage;
  preview: string;
  stats: KandownWorkStats;
  diagnostics: KandownWorkDiagnostic[];
  boardPresetPreview: BoardPresetPreviewPayload | null;
}

export interface SkillPayload {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'built-in' | 'global' | 'project';
  active: boolean;
  content: string;
  compatible: boolean;
  compatibilityReason?: string;
}
export interface WorkflowRegistryEntryPayload { id: string; name: string; description?: string; author: string; repo: string; ref: string; capsule: string; sha256: string; version: string }
export interface WorkflowUpdatePreviewPayload { id: string; currentVersion: string; nextVersion: string; changed: boolean; diff: string; entry: WorkflowRegistryEntryPayload }

/** Loads the exact daemon-backed workflow workspace used by Settings. */
export async function serverLoadWorkflowWorkspace(): Promise<WorkflowWorkspacePayload | null> {
  if (!isServerMode() || isDemoMode()) return null;
  const response = await apiFetch('/api/workflows');
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<WorkflowWorkspacePayload>;
}

/** Runs one explicit workflow mutation and returns its JSON response. */
export async function serverWorkflowAction(
  action: 'use' | 'fork' | 'edit' | 'apply-preset',
  body: { id: string; path?: string; content?: string; confirm?: boolean },
): Promise<Record<string, unknown>> {
  const response = await apiFetch(`/api/workflows/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Workflow action failed (${response.status}).`);
  return payload;
}

/** Lists installed global and project Markdown skills. */
export async function serverListWorkflowSkills(): Promise<SkillPayload[]> {
  if (!isServerMode() || isDemoMode()) return [];
  const response = await apiFetch('/api/skills');
  if (!response.ok) return [];
  const payload = await response.json() as { skills?: SkillPayload[] };
  return Array.isArray(payload.skills) ? payload.skills : [];
}

/** Explicitly fetches the approved workflow registry. */
export async function serverFetchWorkflowRegistry(): Promise<{ entries: WorkflowRegistryEntryPayload[]; error?: string }> {
  if (!isServerMode() || isDemoMode()) return { entries: [] };
  const response = await apiFetch('/api/workflows/registry');
  if (!response.ok) return { entries: [], error: `HTTP ${response.status}` };
  return response.json() as Promise<{ entries: WorkflowRegistryEntryPayload[]; error?: string }>;
}

/** Installs a checksum-verified pinned workflow from the approved registry. */
export async function serverInstallStoreWorkflow(entry: WorkflowRegistryEntryPayload): Promise<void> {
  const response = await apiFetch('/api/workflows/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry }) });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Workflow install failed.');
}

/** Previews or explicitly applies a checksum-verified store workflow update. */
export async function serverUpdateStoreWorkflow(
  entry: WorkflowRegistryEntryPayload,
  confirm: boolean,
): Promise<{ preview?: WorkflowUpdatePreviewPayload }> {
  const response = await apiFetch('/api/workflows/update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry, confirm }),
  });
  const payload = await response.json() as { error?: string; preview?: WorkflowUpdatePreviewPayload };
  if (!response.ok) throw new Error(payload.error ?? 'Workflow update failed.');
  return payload;
}

/**
 * 📖 Fetches the detected agent catalog from the backend (`/api/agents`). The
 * browser can't run `which`, so detection always happens server-side (daemon
 * or Vite dev middleware). Returns `null` when not in server mode or the
 * route is unavailable, so callers can gracefully fall back to a plain
 * free-text assignee field. */
export async function fetchDetectedAgents(): Promise<DetectedAgent[] | null> {
  if (!isServerMode()) return null;
  try {
    const res = await apiFetch('/api/agents');
    if (!res.ok) return null;
    const data = await res.json() as { agents?: DetectedAgent[] };
    return data.agents ?? null;
  } catch {
    return null;
  }
}

/**
 * @description Lists all task IDs via the CLI server.
 */
export async function serverListTasks(): Promise<string[]> {
  const res = await apiFetch('/api/tasks');
  return res.json() as Promise<string[]>;
}

/** Browser-safe installed summary shared with the extension runtime. */
export type ExtensionSummary = ExtensionRuntimeSummary;

/** Loads fields, panels and Node-computed badges in one request. */
export async function serverLoadExtensionRuntime(): Promise<ExtensionRuntimePayload | null> {
  if (!isServerMode() || isDemoMode()) return null;
  try {
    const res = await apiFetch('/api/extensions');
    const data = (await res.json()) as Partial<ExtensionRuntimePayload>;
    return {
      extensions: Array.isArray(data.extensions) ? data.extensions : [],
      badges: data.badges && typeof data.badges === 'object' ? data.badges : {},
    };
  } catch {
    return null;
  }
}

/** 📖 Lists installed extensions via the daemon. Returns null outside server mode. */
export async function serverListExtensions(): Promise<ExtensionSummary[] | null> {
  return (await serverLoadExtensionRuntime())?.extensions ?? null;
}

/** 📖 Enables an extension by id; returns the refreshed summaries, or null on failure. */
export async function serverEnableExtension(id: string): Promise<ExtensionSummary[] | null> {
  if (!isServerMode() || isDemoMode()) return null;
  const res = await apiFetch(`/api/extensions/${encodeURIComponent(id)}/enable`, { method: 'POST' });
  if (!res.ok) return null;
  const data = (await res.json()) as { summary?: ExtensionSummary[] };
  window.dispatchEvent(new Event('kandown:extensions-changed'));
  return data.summary ?? null;
}

/** 📖 Disables an extension by id. */
export async function serverDisableExtension(id: string): Promise<boolean> {
  if (!isServerMode() || isDemoMode()) return false;
  const res = await apiFetch(`/api/extensions/${encodeURIComponent(id)}/disable`, { method: 'POST' });
  window.dispatchEvent(new Event('kandown:extensions-changed'));
  return res.ok;
}

/** Reads an extension asset through authenticated fetch before Blob import. */
export async function serverReadExtensionFile(extId: string, relativePath: string): Promise<string> {
  const path = relativePath.replace(/^\.\//, '').split('/').filter(Boolean);
  if (path.length === 0 || path.some((part) => part === '..')) throw new Error('invalid extension file path');
  const encoded = path.map(encodeURIComponent).join('/');
  const res = await apiFetch(`/api/extensions/${encodeURIComponent(extId)}/files/${encoded}`);
  return res.text();
}

/** Reports browser panel health so the host can persist consecutive failures. */
export async function serverReportExtensionOutcome(
  extId: string,
  outcome: 'success' | 'failure',
  message?: string,
): Promise<{ health: ExtensionHealth; failures: number; error?: string } | null> {
  if (!isServerMode() || isDemoMode()) return null;
  const res = await apiFetch(`/api/extensions/${encodeURIComponent(extId)}/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome, surface: 'webPanel', message }),
  });
  return res.json() as Promise<{ health: ExtensionHealth; failures: number; error?: string }>;
}

/** A community extension registry entry. */
export interface RegistryEntry {
  id: string;
  name: string;
  author?: string;
  description?: string;
  repo: string;
  path?: string;
  ref?: string;
  minKandownVersion?: string;
}

/** The daemon's registry fetch result (entries + canonical URL + optional error). */
export interface RegistryResult {
  entries: RegistryEntry[];
  url: string;
  error?: string;
}

/** 📖 Fetches the community extensions index via the daemon. Returns null outside server mode. */
export async function serverFetchRegistry(): Promise<RegistryResult | null> {
  if (!isServerMode() || isDemoMode()) return null;
  try {
    const res = await apiFetch('/api/extensions/registry');
    if (!res.ok) return { entries: [], url: '', error: `HTTP ${res.status}` };
    return (await res.json()) as RegistryResult;
  } catch (e) {
    return { entries: [], url: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export interface InstallResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** 📖 Installs an extension by registry entry (one-click) or by GitHub URL. */
export async function serverInstallExtension(input: { entry?: RegistryEntry; url?: string }): Promise<InstallResult | null> {
  if (!isServerMode() || isDemoMode()) return null;
  const res = await apiFetch('/api/extensions/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await res.json()) as InstallResult;
  if (result.ok) window.dispatchEvent(new Event('kandown:extensions-changed'));
  return result;
}

/** Persists one registered extension field through the authoritative host. */
export async function serverSetExtensionField(
  taskId: string,
  extId: string,
  key: string,
  value: unknown,
): Promise<{ plugins?: Record<string, unknown> }> {
  const res = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extId, key, value }),
  });
  return res.json() as Promise<{ plugins?: Record<string, unknown> }>;
}

/**
 * @description Fetches a single task file via the CLI server and parses it.
 * @throws Error if the task is not found (404).
 */
export async function serverReadTaskFile(id: string) {
  const text = await serverReadTask(id);
  return parseTaskFile(text);
}

/**
 * @description Fetches a single task file via the CLI server.
 * @throws Error if the task is not found (404).
 */
export async function serverReadTask(id: string): Promise<string> {
  const res = await apiFetch(`/api/tasks/${encodeURIComponent(id)}`);
  return res.text();
}

/** 📖 Sends a move intent to the managed backend. Gate refusals are domain
 * results rather than thrown transport errors, so the store can roll back its
 * optimistic state and show the exact reason. */
export async function serverMoveTask(
  id: string,
  to: string,
  toIndex?: number,
): Promise<MoveTaskResult> {
  const res = await rawApiFetch(`/api/tasks/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, ...(toIndex === undefined ? {} : { toIndex }) }),
  });
  let result: MoveTaskResult;
  try {
    result = await res.json() as MoveTaskResult;
  } catch {
    throw new Error(`Move API returned ${res.status} without a JSON result`);
  }
  if (typeof result !== 'object' || result === null || typeof result.ok !== 'boolean') {
    throw new Error(`Move API returned an invalid result (${res.status})`);
  }
  return result;
}

/**
 * @description Writes a task file via the CLI server.
 */
async function serverWriteTask(id: string, content: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: content, headers: { 'Content-Type': 'text/plain' } });
}

/**
 * @description Deletes a task file via the CLI server.
 */
async function serverDeleteTask(id: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * 📖 One-time migration helper. Triggers the CLI server to move any legacy
 * `.kandown/tasks/*.md` to the project-root `./tasks/`. Idempotent — safe
 * to call on every web app startup. Returns the migration result or null
 * if the server is unreachable.
 */
export async function serverMigrateTasks(): Promise<{ moved: number; cleanedUp: boolean; skipped: boolean } | null> {
  try {
    const res = await apiFetch('/api/migrate-tasks', { method: 'POST' });
    return await res.json() as { moved: number; cleanedUp: boolean; skipped: boolean };
  } catch {
    return null;
  }
}

/**
 * 📖 Fetches the daemon's public info. Includes the agent hook label when
 * KANDOWN_AGENT_HOOK_URL is set on the daemon — the UI uses this to
 * conditionally surface the "Send to Agent" button.
 *
 * Returns null when the server is unreachable so the UI can fall back to a
 * non-hook experience without erroring.
 */
export interface ServerAgentHook {
  enabled: true;
  label: string;
}

export interface ServerDaemonInfo {
  ok: true;
  pid: number;
  kandownDir: string;
  version: string | null;
  startedAt: string;
  agentHook: ServerAgentHook | null;
}

export async function serverGetDaemonInfo(): Promise<ServerDaemonInfo | null> {
  try {
    const res = await apiFetch('/api/daemon');
    return await res.json() as ServerDaemonInfo;
  } catch {
    return null;
  }
}

/**
 * 📖 Sends a task to the agent hook configured on the CLI daemon. The daemon
 * posts the full task markdown + context to KANDOWN_AGENT_HOOK_URL.
 * Returns the JSON response from the daemon, or null on network failure.
 */
export async function serverSendTaskToAgent(id: string): Promise<{ ok: boolean; error?: string } | null> {
  try {
    const res = await apiFetch(`/api/tasks/${encodeURIComponent(id)}/agent`, { method: 'POST' });
    return await res.json() as { ok: boolean; error?: string };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    const err = e as Error;
    // User dismissed the picker — benign, return null so callers can no-op.
    if (err.name === 'AbortError') return null;
    // Permission refused or sandbox/security block — surface a typed error so
    // the store can show an actionable toast instead of a raw stack trace.
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      throw new PermissionDeniedError('directory access');
    }
    throw e;
  }
}

export async function pickProjectDirectory(): Promise<{ projectHandle: FileSystemDirectoryHandle; kandownHandle: FileSystemDirectoryHandle; tasksHandle: FileSystemDirectoryHandle } | null> {
  const projectHandle = await pickDirectory();
  if (!projectHandle) return null;

  // 📖 The user picks the project root. We then derive `.kandown/` (config)
  // and `tasks/` (tasks, sibling of `.kandown/`) from it. This keeps config
  // and data cleanly separated.
  const kandownHandle = await getKandownHandle(projectHandle);
  const tasksHandle = await getTasksDirHandle(projectHandle);
  return { projectHandle, kandownHandle, tasksHandle };
}

export async function getKandownHandle(projectHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return await projectHandle.getDirectoryHandle('.kandown', { create: false });
}

/**
 * 📖 Returns the tasks directory handle, creating it on demand. Tasks live
 * at the project root in `./tasks/`, NOT inside `.kandown/`. This keeps
 * config (in `.kandown/`) and data (in `./tasks/`) cleanly separated.
 */
export async function getTasksDirHandle(projectHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return await projectHandle.getDirectoryHandle('tasks', { create: true });
}

/* ═════════════ Config (kandown.json) ═════════════ */

/** 📖 Outcome of {@link readConfigFileStrict}. `not-found` is the benign first-run
 * case; `corrupted` means the file exists but couldn't be parsed and should be
 * backed up before falling back to defaults (t111). */
export type ConfigReadResult =
  | { ok: true; config: KandownConfig }
  | { ok: false; reason: 'not-found'; rawContent?: string }
  | { ok: false; reason: 'corrupted'; rawContent?: string; error: Error };

/**
 * 📖 Strict config reader. Distinguishes "file not found" (benign first run)
 * from "corrupted JSON" (actionable: caller should back up + warn the user).
 * Null-safe spreading means `"board": null` in the file no longer crashes
 * (t111).
 *
 * Prefer this over {@link readConfigFile} in new code; the legacy helper is
 * kept for callers that just want `null` on any failure.
 */
export async function readConfigFileStrict(
  _kandownHandle: FileSystemDirectoryHandle | null,
): Promise<ConfigReadResult> {
  if (isServerMode()) {
    try {
      const config = await serverReadConfig();
      return { ok: true, config };
    } catch (e) {
      return { ok: false, reason: 'corrupted', error: e as Error };
    }
  }
  let text: string;
  try {
    const h = await _kandownHandle!.getFileHandle('kandown.json');
    const file = await h.getFile();
    text = await file.text();
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotFoundError') return { ok: false, reason: 'not-found' };
    // Permission denied / disk error — treat as corrupted so the caller warns.
    return { ok: false, reason: 'corrupted', error: e as Error };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'corrupted', rawContent: text, error: e as Error };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      reason: 'corrupted',
      rawContent: text,
      error: new Error('kandown.json must be a JSON object'),
    };
  }

  return { ok: true, config: normalizeKandownConfig(raw) };
}

export async function readConfigFile(_kandownHandle: FileSystemDirectoryHandle | null): Promise<KandownConfig | null> {
  const result = await readConfigFileStrict(_kandownHandle);
  return result.ok ? result.config : null;
}

export async function writeConfigFile(_kandownHandle: FileSystemDirectoryHandle | null, config: KandownConfig): Promise<void> {
  if (isServerMode()) return serverWriteConfig(config);
  try {
    const h = await _kandownHandle!.getFileHandle('kandown.json', { create: true });
    const w = await h.createWritable();
    try {
      await w.write(JSON.stringify(config, null, 2) + '\n');
    } finally {
      await w.close();
    }
  } catch (e) {
    // 📖 Map quota / disk-full DOM errors to a typed DiskFullError so callers
    // can show an actionable message instead of a generic stack trace (t105).
    throw toWriteError(e, 'kandown.json');
  }
}

export async function readProjectInstructions(_kandownHandle: FileSystemDirectoryHandle | null): Promise<string> {
  if (isServerMode()) return serverReadProjectInstructions();
  try {
    const h = await _kandownHandle!.getFileHandle('kandown_work.md');
    const file = await h.getFile();
    return await file.text();
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotFoundError') return '';
    throw e;
  }
}

export async function writeProjectInstructions(_kandownHandle: FileSystemDirectoryHandle | null, content: string): Promise<void> {
  if (isServerMode()) return serverWriteProjectInstructions(content);
  try {
    const h = await _kandownHandle!.getFileHandle('kandown_work.md', { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content.trim() ? content.replace(/\s+$/, '') + '\n' : '');
    } finally {
      await w.close();
    }
  } catch (e) {
    throw toWriteError(e, 'kandown_work.md');
  }
}

/**
 * 📖 Maps a filesystem write DOMException to a typed Kandown error. Quota /
 * disk-full → DiskFullError, permission revoked → PermissionDeniedError,
 * everything else rethrown as-is so callers still see the original.
 */
function toWriteError(e: unknown, path: string): unknown {
  const err = e as { name?: string; message?: string };
  const name = err?.name ?? '';
  const msg = err?.message ?? '';
  if (name === 'QuotaExceededError' || name === 'NoModificationAllowedError' || /quota|disk/i.test(msg)) {
    return new DiskFullError(path);
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new PermissionDeniedError(`write ${path}`);
  }
  return e;
}

/**
 * 📖 Kept for backwards compatibility: the old API took the `.kandown/`
 * handle and returned a `tasks` handle nested inside it. The new layout
 * derives tasks from the **project root** instead, so prefer
 * `getTasksDirHandle(projectHandle)` in new code. This helper still works
 * for any caller that has a project-root-like handle.
 */
export async function ensureTasksDir(dirHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return await dirHandle.getDirectoryHandle('tasks', { create: true });
}

/** Empty placeholder task returned when a file can't be read. */
function emptyTask(id: string): ParsedTask {
  return {
    frontmatter: {
      id,
      title: '',
      priority: '',
      tags: [],
      assignee: '',
      created: new Date().toISOString().slice(0, 10),
    } as TaskFrontmatter,
    body: `# ${id}\n\n## Context\n\n## Subtasks\n\n`,
  };
}

/**
 * 📖 The task filenames inside one directory handle. Same filter as the CLI, so
 * `README.md` and editor leftovers never become phantom tasks.
 */
async function listTaskFilenamesIn(dir: FileSystemDirectoryHandle | null): Promise<string[]> {
  if (!dir) return [];
  const names: string[] = [];
  try {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && isTaskFilename(entry.name)) names.push(entry.name);
    }
  } catch {
    // 📖 Permission revoked mid-scan: behave like an empty directory, the
    // caller's own error path already covers the read that follows.
  }
  return names;
}

/**
 * 📖 Which file in this directory holds a task id, over both the bare `t232.md`
 * and the descriptive `t232_remove_dead_code.md` form. Mirrors the CLI exactly:
 * both call the same pure resolver, only the directory listing differs.
 */
async function resolveTaskFilenameIn(dir: FileSystemDirectoryHandle | null, id: string): Promise<string | null> {
  const match = resolveTaskFilename(id, await listTaskFilenamesIn(dir));
  if (match?.ambiguousWith.length) {
    console.warn(`[kandown] Task ${id} is claimed by several files, using ${match.filename} (also: ${match.ambiguousWith.join(', ')})`);
  }
  return match?.filename ?? null;
}

/**
 * 📖 The filename to write for a task: the one it already occupies, or a fresh
 * descriptive name built from its title and category when the task is being
 * created.
 */
async function writeTargetFilename(
  dir: FileSystemDirectoryHandle | null,
  id: string,
  title?: string | null,
  category?: string | null,
): Promise<string> {
  const existing = await resolveTaskFilenameIn(dir, id);
  if (existing) return existing;
  return buildTaskFilename(id, title, category, await listTaskFilenamesIn(dir));
}

/** Reads a task file from the archive subfolder. Returns null if absent. */
async function tryArchiveRead(tasksDir: FileSystemDirectoryHandle, id: string): Promise<string | null> {
  try {
    const archiveDir = await tasksDir.getDirectoryHandle('archive', { create: false });
    const name = await resolveTaskFilenameIn(archiveDir, id);
    if (!name) return null;
    const h = await archiveDir.getFileHandle(name);
    const file = await h.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

/** Returns true when the task currently lives in tasks/archive/. */
async function taskIsInArchive(tasksDir: FileSystemDirectoryHandle, id: string): Promise<boolean> {
  try {
    const archiveDir = await tasksDir.getDirectoryHandle('archive', { create: false });
    return (await resolveTaskFilenameIn(archiveDir, id)) !== null;
  } catch {
    return false;
  }
}

/** Returns the tasks/archive/ directory handle, creating it when `create`. */
async function getArchiveDirHandle(tasksDir: FileSystemDirectoryHandle, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await tasksDir.getDirectoryHandle('archive', { create });
  } catch {
    return null;
  }
}

export async function listTaskIds(_tasksDir: FileSystemDirectoryHandle | null): Promise<string[]> {
  if (isServerMode()) return serverListTasks();
  const ids = new Set<string>();
  for (const name of await listTaskFilenamesIn(_tasksDir)) {
    const id = taskIdFromFilename(name);
    if (id) ids.add(id);
  }
  // 📖 Also surface archived tasks (tasks/archive/*.md) so the archive view can
  // list them. The server endpoint already merges both dirs; this mirrors it
  // for the browser (File System Access API) backend.
  try {
    const archiveDir = await _tasksDir!.getDirectoryHandle('archive', { create: false });
    for (const name of await listTaskFilenamesIn(archiveDir)) {
      const id = taskIdFromFilename(name);
      if (id) ids.add(id);
    }
  } catch {
    // archive/ doesn't exist yet — no archived tasks
  }
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function readTaskFile(_tasksDir: FileSystemDirectoryHandle | null, id: string) {
  if (isServerMode()) {
    try {
      const text = await serverReadTask(id);
      return parseTaskFile(text);
    } catch {
      return emptyTask(id);
    }
  }
  // 📖 Try the active dir first, then archive/ (archived tasks live there).
  const tryRead = async (dir: FileSystemDirectoryHandle): Promise<string | null> => {
    try {
      const name = await resolveTaskFilenameIn(dir, id);
      if (!name) return null;
      const h = await dir.getFileHandle(name);
      const file = await h.getFile();
      return await file.text();
    } catch {
      return null;
    }
  };
  const activeText = await tryRead(_tasksDir!);
  const text = activeText ?? (await tryArchiveRead(_tasksDir!, id));
  if (text === null) return emptyTask(id);
  const parsed = parseTaskFile(text);
  // 📖 Path is the source of truth for archive: if the active lookup missed
  // and archive/ hit, force the flag so a `git mv` without a frontmatter
  // edit is still recognised as archived. Mirrors `readTask` in
  // board-reader.ts.
  if (activeText === null) parsed.frontmatter.archived = true;
  return parsed;
}

/** 📖 Outcome of {@link readTaskFileStrict}. `not-found` is benign (file was
 * deleted externally); every other reason means the file exists but is broken
 * and the caller should warn the user (t102). */
export type TaskReadResult =
  | { ok: true; task: ParsedTask }
  | { ok: false; reason: 'not-found' | 'permission-denied' | 'corrupted' | 'unknown'; error?: Error };

/**
 * 📖 Strict task reader returning a typed Result. Distinguishes the benign
 * "file deleted externally" case (not-found) from actionable failures
 * (permission revoked, corrupted/empty content, disk error). Use this in new
 * code where the caller wants to know WHY a read failed; the legacy
 * {@link readTaskFile} still returns a ghost task for back-compat.
 */
export async function readTaskFileStrict(
  _tasksDir: FileSystemDirectoryHandle | null,
  id: string,
): Promise<TaskReadResult> {
  if (isServerMode()) {
    try {
      const text = await serverReadTask(id);
      return { ok: true, task: parseTaskFile(text) };
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === 'NotFoundError') return { ok: false, reason: 'not-found' };
      return { ok: false, reason: 'unknown', error: e as Error };
    }
  }
  // Try active dir, then archive.
  let text: string | null = null;
  let activeHit = false;
  try {
    const name = await resolveTaskFilenameIn(_tasksDir, id);
    if (!name) throw new Error('not in active');
    const h = await _tasksDir!.getFileHandle(name);
    const file = await h.getFile();
    text = await file.text();
    activeHit = true;
  } catch {
    // Fall through to archive lookup.
  }
  if (text === null) {
    try {
      text = await tryArchiveRead(_tasksDir!, id);
    } catch (e) {
      return { ok: false, reason: 'unknown', error: e as Error };
    }
  }
  if (text === null) return { ok: false, reason: 'not-found' };
  // 📖 Empty file = a ghost from a previous silent error — flag as corrupted
  // so the user knows the file is broken instead of genuinely blank (t102).
  if (text.trim() === '') {
    return { ok: false, reason: 'corrupted', error: new Error(`Task file ${id}.md is empty`) };
  }
  try {
    const parsed = parseTaskFile(text);
    // 📖 Path-as-truth for archive: an archive/ hit without a frontmatter
    // flag is still recognised as archived. Same invariant as readTaskFile
    // and the CLI's readTask — the three readers must agree.
    if (!activeHit) parsed.frontmatter.archived = true;
    return { ok: true, task: parsed };
  } catch (e) {
    return { ok: false, reason: 'corrupted', error: e as Error };
  }
}

export async function writeTaskFile(
  _tasksDir: FileSystemDirectoryHandle | null,
  id: string,
  frontmatter: TaskFrontmatter,
  body: string
): Promise<void> {
  // 📖 Every web write stamps `updated:` too, so the TUI Age column stays
  // honest whichever interface touched the task last (see task-meta.ts).
  const content = serializeTaskFile(stampUpdated(frontmatter), body);
  if (isServerMode()) return serverWriteTask(id, content);
  try {
    // 📖 Write in place: an archived task stays inside archive/ on save so its
    // file location never drifts from its archived flag.
    const targetDir = (await taskIsInArchive(_tasksDir!, id))
      ? (await getArchiveDirHandle(_tasksDir!, true))!
      : _tasksDir!;
    // 📖 An existing task keeps its filename, slug frozen: editing a title never
    // renames a file (server mode renames on category change via
    // writeTaskContent in board-reader.ts). A task created from the web gets
    // the descriptive name.
    const name = await writeTargetFilename(targetDir, id, frontmatter.title, frontmatter.category);
    const h = await targetDir.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content);
    } finally {
      await w.close();
    }
  } catch (e) {
    throw toWriteError(e, `${id}.md`);
  }
}

export async function deleteTaskFile(_tasksDir: FileSystemDirectoryHandle | null, id: string): Promise<void> {
  if (isServerMode()) return serverDeleteTask(id);
  // 📖 Remove from whichever location holds the file (active or archive).
  try {
    const name = await resolveTaskFilenameIn(_tasksDir, id);
    if (name) await _tasksDir!.removeEntry(name);
  } catch { /* not in active */ }
  try {
    const archiveDir = await _tasksDir!.getDirectoryHandle('archive', { create: false });
    const name = await resolveTaskFilenameIn(archiveDir, id);
    if (name) await archiveDir.removeEntry(name);
  } catch { /* not in archive */ }
}

/** 📖 Moves a task into tasks/archive/ via the CLI server. The body already
 * carries `archived: true` in frontmatter — server writes it to archive/ then
 * unlinks the active copy. */
async function serverArchiveTask(id: string, content: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: content,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/** 📖 Moves a task back from tasks/archive/ to tasks/ via the CLI server. */
async function serverUnarchiveTask(id: string, content: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(id)}/unarchive`, {
    method: 'POST',
    body: content,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * Archives a task: writes the (already flag-updated) content into
 * tasks/archive/<id>.md and removes the active tasks/<id>.md.
 * Works in both server and browser (File System Access API) modes.
 */
export async function archiveTaskFile(
  _tasksDir: FileSystemDirectoryHandle | null,
  id: string,
  frontmatter: TaskFrontmatter,
  body: string
): Promise<void> {
  // 📖 Every web write stamps `updated:` too, so the TUI Age column stays
  // honest whichever interface touched the task last (see task-meta.ts).
  const content = serializeTaskFile(stampUpdated(frontmatter), body);
  if (isServerMode()) return serverArchiveTask(id, content);
  try {
    const archiveDir = (await getArchiveDirHandle(_tasksDir!, true))!;
    // 📖 The file keeps its name across the move, so the archive folder stays as
    // readable as the board and a later restore is a plain move back.
    const activeName = await resolveTaskFilenameIn(_tasksDir, id);
    const name = activeName ?? (await writeTargetFilename(archiveDir, id, frontmatter.title));
    const h = await archiveDir.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content);
    } finally {
      await w.close();
    }
    if (activeName) {
      try { await _tasksDir!.removeEntry(activeName); } catch { /* already absent */ }
    }
  } catch (e) {
    throw toWriteError(e, `archive/${id}.md`);
  }
}

/**
 * Restores an archived task: writes the content into tasks/<id>.md and removes
 * the archived copy. Mirror of archiveTaskFile.
 */
export async function unarchiveTaskFile(
  _tasksDir: FileSystemDirectoryHandle | null,
  id: string,
  frontmatter: TaskFrontmatter,
  body: string
): Promise<void> {
  // 📖 Every web write stamps `updated:` too, so the TUI Age column stays
  // honest whichever interface touched the task last (see task-meta.ts).
  const content = serializeTaskFile(stampUpdated(frontmatter), body);
  if (isServerMode()) return serverUnarchiveTask(id, content);
  try {
    const archiveDirRead = await getArchiveDirHandle(_tasksDir!, false);
    const archivedName = archiveDirRead ? await resolveTaskFilenameIn(archiveDirRead, id) : null;
    const name = archivedName ?? (await writeTargetFilename(_tasksDir, id, frontmatter.title));
    const h = await _tasksDir!.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content);
    } finally {
      await w.close();
    }
    if (archiveDirRead && archivedName) {
      try { await archiveDirRead.removeEntry(archivedName); } catch { /* already absent */ }
    }
  } catch (e) {
    throw toWriteError(e, `${id}.md`);
  }
}

/* ═════════════ Recent projects via IndexedDB ═════════════ */

const DB_NAME = 'kanban-md';
const DB_VERSION = 1;
const STORE = 'recentProjects';

export interface RecentProject {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpened: number;
  /** 📖 Absolute path to the .kandown/ directory. Saved when in server mode for auto-open matching. */
  kandownDir?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * 📖 The recent-projects store is the one place the app writes to the visitor's
 * browser rather than to the project folder. In the demo that would leave real
 * data on the website's origin for a session the visitor was told is throwaway,
 * so all three entry points become no-ops. Returning an empty list also routes
 * demo startup straight into `openServerProject()`, which is what we want.
 */
export async function saveRecentProject(project: RecentProject): Promise<void> {
  if (isDemoMode()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  if (isDemoMode()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as RecentProject[]) || [];
      items.sort((a, b) => b.lastOpened - a.lastOpened);
      resolve(items.slice(0, 10));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeRecentProject(id: string): Promise<void> {
  if (isDemoMode()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  readWrite: boolean = true
): Promise<boolean> {
  const opts = { mode: readWrite ? 'readwrite' : 'read' } as const;
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  } catch (e) {
    console.warn('[FS] verifyPermission: handle is no longer valid:', e);
    return false;
  }
}

export interface UpdateCheckResult {
  /** 📖 The version installed on disk — what you get on the next launch. */
  current: string;
  /** 📖 The version the daemon process is actually running. Differs from
   * `current` when the package was updated underneath a live daemon. */
  running?: string;
  latest: string;
  /** 📖 True only when the registry has something newer than what is installed. */
  updateAvailable: boolean;
  /** 📖 True when `current` is ahead of `running`: already updated, but the
   * daemon still serves the old code and needs a restart to pick it up. */
  restartRequired?: boolean;
}

export async function serverCheckUpdate(): Promise<UpdateCheckResult | null> {
  try {
    const res = await apiFetch('/api/update/check');
    return await res.json() as UpdateCheckResult;
  } catch {
    return null;
  }
}

/* ═════════════ Community theme store ═════════════ */
/**
 * @description Theme payload as returned by `GET /api/themes`. The web app
 * calls `serverListThemes()` on startup and again after every install /
 * uninstall, then folds the result into the theme engine via
 * `registerCustomThemes` (see src/lib/theme.ts).
 */
export interface InstalledThemeSummary {
  id: string;
  name: string;
  author?: string;
  description?: string;
  isCustom?: boolean;
}

export async function serverListThemes(): Promise<InstalledThemeSummary[] | null> {
  try {
    const res = await apiFetch('/api/themes');
    const data = (await res.json()) as { themes?: InstalledThemeSummary[] };
    return Array.isArray(data.themes) ? data.themes : [];
  } catch {
    return null;
  }
}

export interface RegistryFetchResult {
  entries: Array<{
    id: string;
    name: string;
    author?: string;
    description?: string;
    repo: string;
    path: string;
    ref?: string;
    minKandownVersion?: string;
    tags?: string[];
  }>;
  url: string;
  error?: string;
}

export async function serverFetchThemeRegistry(): Promise<RegistryFetchResult | null> {
  try {
    const res = await apiFetch('/api/themes/registry');
    return (await res.json()) as RegistryFetchResult;
  } catch {
    return null;
  }
}

export async function serverInstallTheme(input: { entry?: { id: string; name: string; author?: string; repo: string; path: string; ref?: string }; url?: string }): Promise<{ ok: boolean; id?: string; error?: string } | null> {
  try {
    const res = await apiFetch('/api/themes/install', { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } });
    return (await res.json()) as { ok: boolean; id?: string; error?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function serverUninstallTheme(id: string): Promise<{ ok: boolean; error?: string } | null> {
  try {
    const res = await apiFetch(`/api/themes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return (await res.json()) as { ok: boolean; error?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function serverApplyUpdate(): Promise<{ ok: boolean; version?: string; message?: string } | null> {
  try {
    const res = await apiFetch('/api/update/apply', { method: 'POST' });
    return await res.json();
  } catch {
    return null;
  }
}
