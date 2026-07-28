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
 *     and agent docs (`AGENT.md`, `AGENT_KANDOWN.md`).
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
 *  → serverListTasks — list task IDs via REST
 *  → serverReadTask / serverWriteTask / serverDeleteTask — task CRUD via REST
 *  → serverMigrateTasks — triggers the legacy → new layout migration via REST
 *  → readProjectInstructions / writeProjectInstructions — edits `.kandown/instructions.md`
 *
 * @exports supportsFileSystemAccess, supportsLocalFileSystemAccess, switchDemoToLocalFileSystem, isServerMode, isDemoMode, registerDemoApi, getServerRoot, pickDirectory, pickProjectDirectory, getKandownHandle, getTasksDirHandle, ensureTasksDir, listTaskIds, readConfigFile, writeConfigFile, readProjectInstructions, writeProjectInstructions, readTaskFile, writeTaskFile, deleteTaskFile, saveRecentProject, listRecentProjects, removeRecentProject, verifyPermission, serverReadBoard, serverWriteBoard, serverReadConfig, serverWriteConfig, serverListTasks, serverReadTask, serverReadTaskFile, serverWriteTask, serverDeleteTask, serverMigrateTasks
 * @see src/lib/store.ts
 * @see src/lib/parser.ts
 */

import type { KandownConfig, TaskFrontmatter, ParsedTask, DetectedAgent } from './types';
import { DEFAULT_CONFIG, DEFAULT_WORK_OUTPUT } from './types';
import { serializeTaskFile } from './serializer';
import { stampUpdated } from './task-meta';
import { parseTaskFile } from './parser';
import { normalizeFontId, normalizeSkinId, normalizeThemeMode } from './theme';
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
 * 📖 Central fetch wrapper for the Kandown REST API.
 * Throws with a descriptive message on non-OK responses.
 * Attaches the daemon auth token (`X-Kandown-Token`) injected by the CLI
 * server — every route except `GET /api/daemon` requires it.
 *
 * 📖 The demo short-circuits here, above the network. That single branch is why
 * the demo needs no changes anywhere else: every server-mode call in the store
 * already funnels through this function.
 */
async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  if (demoApiHandler) {
    const res = await demoApiHandler(path, options);
    if (!res.ok) {
      const body = await res.clone().text().catch(() => '');
      throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status}${body ? ': ' + body : ''}`);
    }
    return res;
  }
  const token = typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
    : null;
  const headers: HeadersInit = {
    ...(options?.headers as Record<string, string> | undefined),
    ...(token ? { 'X-Kandown-Token': token } : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status}${text ? ': ' + text : ''}`);
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
  return res.json() as Promise<KandownConfig>;
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

/** Summary of one installed extension, mirroring the daemon's /api/extensions shape. */
export interface ExtensionSummary {
  id: string;
  name: string;
  version: string;
  source: 'global' | 'project';
  health: string;
  error?: string;
  fields: string[];
  panels: string[];
  commands: string[];
  gates: number;
  syncs: number;
}

/** 📖 Lists installed extensions via the daemon. Returns null outside server mode
 *  (standalone File System Access and demo modes have no extension host). */
export async function serverListExtensions(): Promise<ExtensionSummary[] | null> {
  if (!isServerMode() || isDemoMode()) return null;
  try {
    const res = await apiFetch('/api/extensions');
    if (!res.ok) return null;
    const data = (await res.json()) as { extensions?: ExtensionSummary[] };
    return data.extensions ?? [];
  } catch {
    return null;
  }
}

/** 📖 Enables an extension by id; returns the refreshed summaries, or null on failure. */
export async function serverEnableExtension(id: string): Promise<ExtensionSummary[] | null> {
  if (!isServerMode() || isDemoMode()) return null;
  const res = await apiFetch(`/api/extensions/${encodeURIComponent(id)}/enable`, { method: 'POST' });
  if (!res.ok) return null;
  const data = (await res.json()) as { summary?: ExtensionSummary[] };
  return data.summary ?? null;
}

/** 📖 Disables an extension by id. */
export async function serverDisableExtension(id: string): Promise<boolean> {
  if (!isServerMode() || isDemoMode()) return false;
  const res = await apiFetch(`/api/extensions/${encodeURIComponent(id)}/disable`, { method: 'POST' });
  return res.ok;
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
  return (await res.json()) as InstallResult;
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
 * 📖 Safe object-spread helper. `{ ...null }` throws TypeError, so when the
 * user (or a botched manual edit) writes `"board": null` in kandown.json we
 * must guard each spread. Returns `{}` for any non-plain-object value (t111).
 */
function safeObject<T extends Record<string, unknown>>(value: unknown): Partial<T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<T>
    : {};
}

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

  const partial = raw as Partial<KandownConfig>;
  const ui = { ...DEFAULT_CONFIG.ui, ...safeObject(partial.ui) };
  const agentRaw = safeObject(partial.agent);
  const workOutputRaw = safeObject(agentRaw.workOutput);
  const boardDigestRaw = safeObject(workOutputRaw.boardDigest);
  const boardRaw = safeObject(partial.board);
  const config: KandownConfig = {
    ui: {
      ...ui,
      theme: normalizeThemeMode(ui.theme),
      skin: normalizeSkinId(ui.skin),
      font: normalizeFontId(ui.font),
    },
    agent: {
      ...DEFAULT_CONFIG.agent,
      ...agentRaw,
      workOutput: {
        ...DEFAULT_WORK_OUTPUT,
        ...workOutputRaw,
        mode: workOutputRaw.mode === 'raw' ? 'raw' : 'blocks',
        baseRulesMode: workOutputRaw.baseRulesMode === 'concise' ? 'concise' : 'full',
        sectionOrder: Array.isArray(workOutputRaw.sectionOrder)
          ? workOutputRaw.sectionOrder.filter((id): id is typeof DEFAULT_WORK_OUTPUT.sectionOrder[number] => (
            id === 'baseRules' || id === 'projectInstructions' || id === 'boardDigest'
          ))
          : DEFAULT_WORK_OUTPUT.sectionOrder,
        rawTemplate: typeof workOutputRaw.rawTemplate === 'string'
          ? workOutputRaw.rawTemplate
          : DEFAULT_WORK_OUTPUT.rawTemplate,
        boardDigest: { ...DEFAULT_WORK_OUTPUT.boardDigest, ...boardDigestRaw },
      },
    },
    board: {
      ...DEFAULT_CONFIG.board,
      ...boardRaw,
      columns: Array.isArray(boardRaw.columns) && boardRaw.columns.length > 0
        ? boardRaw.columns.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        : DEFAULT_CONFIG.board.columns,
    },
    fields: { ...DEFAULT_CONFIG.fields, ...safeObject(partial.fields) },
    notifications: { ...DEFAULT_CONFIG.notifications, ...safeObject(partial.notifications) },
  };
  // 📖 Preserve optional `agents` block if present and object-shaped. Cast
  // through `unknown` because the web KandownConfig type doesn't declare it
  // (the CLI type does) — we still want to round-trip it untouched.
  const extra = partial as unknown as Record<string, unknown>;
  if (extra.agents && typeof extra.agents === 'object') {
    (config as unknown as Record<string, unknown>).agents = extra.agents;
  }
  return { ok: true, config };
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
    const h = await _kandownHandle!.getFileHandle('instructions.md');
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
    const h = await _kandownHandle!.getFileHandle('instructions.md', { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content.trim() ? content.replace(/\s+$/, '') + '\n' : '');
    } finally {
      await w.close();
    }
  } catch (e) {
    throw toWriteError(e, 'instructions.md');
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

/** Reads a task file from the archive subfolder. Returns null if absent. */
async function tryArchiveRead(tasksDir: FileSystemDirectoryHandle, id: string): Promise<string | null> {
  try {
    const archiveDir = await tasksDir.getDirectoryHandle('archive', { create: false });
    const h = await archiveDir.getFileHandle(`${id}.md`);
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
    await archiveDir.getFileHandle(`${id}.md`);
    return true;
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
  for await (const entry of _tasksDir!.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      ids.add(entry.name.slice(0, -3));
    }
  }
  // 📖 Also surface archived tasks (tasks/archive/*.md) so the archive view can
  // list them. The server endpoint already merges both dirs; this mirrors it
  // for the browser (File System Access API) backend.
  try {
    const archiveDir = await _tasksDir!.getDirectoryHandle('archive', { create: false });
    for await (const entry of archiveDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        ids.add(entry.name.slice(0, -3));
      }
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
      const h = await dir.getFileHandle(`${id}.md`);
      const file = await h.getFile();
      return await file.text();
    } catch {
      return null;
    }
  };
  const text = (await tryRead(_tasksDir!)) ?? (await tryArchiveRead(_tasksDir!, id));
  if (text !== null) return parseTaskFile(text);
  return emptyTask(id);
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
  try {
    const h = await _tasksDir!.getFileHandle(`${id}.md`);
    const file = await h.getFile();
    text = await file.text();
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
    return { ok: true, task: parseTaskFile(text) };
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
    const h = await targetDir.getFileHandle(`${id}.md`, { create: true });
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
  try { await _tasksDir!.removeEntry(`${id}.md`); } catch { /* not in active */ }
  try {
    const archiveDir = await _tasksDir!.getDirectoryHandle('archive', { create: false });
    await archiveDir.removeEntry(`${id}.md`);
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
    const h = await archiveDir.getFileHandle(`${id}.md`, { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content);
    } finally {
      await w.close();
    }
    try { await _tasksDir!.removeEntry(`${id}.md`); } catch { /* already absent */ }
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
    const h = await _tasksDir!.getFileHandle(`${id}.md`, { create: true });
    const w = await h.createWritable();
    try {
      await w.write(content);
    } finally {
      await w.close();
    }
    try {
      const archiveDir = await _tasksDir!.getDirectoryHandle('archive', { create: false });
      await archiveDir.removeEntry(`${id}.md`);
    } catch { /* already absent */ }
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

export async function serverApplyUpdate(): Promise<{ ok: boolean; version?: string; message?: string } | null> {
  try {
    const res = await apiFetch('/api/update/apply', { method: 'POST' });
    return await res.json();
  } catch {
    return null;
  }
}
