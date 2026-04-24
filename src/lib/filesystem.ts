/**
 * @file Browser file-system adapter
 * @description Wraps the File System Access API, `.kandown` discovery/creation,
 * task reads and writes, project config persistence, and recent-project
 * IndexedDB storage. Also provides server-mode helpers that proxy all file
 * operations to the CLI REST API when window.__KANDOWN_ROOT__ is set.
 *
 * 📖 All browser file handles pass through this module. UI and store code should
 * call these helpers instead of touching File System Access APIs directly.
 *
 * 📖 In server mode (when served via `npx kandown`), all filesystem operations
 * are routed through the CLI REST API instead of using FileSystemDirectoryHandle.
 * This allows the web app to work without user interaction.
 *
 * @functions
 *  → supportsFileSystemAccess — detects compatible Chromium browsers
 *  → isServerMode — returns true when serving via CLI (window.__KANDOWN_ROOT__ set)
 *  → getServerRoot — returns window.__KANDOWN_ROOT__ path or null
 *  → pickDirectory — prompts for a writable project directory
 *  → pickProjectDirectory — opens or creates `.kandown`
 *  → getKandownHandle — resolves `.kandown` from a remembered project handle
 *  → readConfigFile / writeConfigFile — load and persist kandown.json
 *  → listTaskIds — scans tasks/*.md and returns task ids
 *  → readTaskFile / writeTaskFile / deleteTaskFile — task file helpers
 *  → saveRecentProject / listRecentProjects / removeRecentProject — IndexedDB recent projects
 *  → verifyPermission — requests persisted read/write access
 *  → serverReadBoard / serverWriteBoard — board.md via REST
 *  → serverReadConfig / serverWriteConfig — kandown.json via REST
 *  → serverListTasks — list task IDs via REST
 *  → serverReadTask / serverWriteTask / serverDeleteTask — task CRUD via REST
 *
 * @exports supportsFileSystemAccess, isServerMode, getServerRoot, pickDirectory, pickProjectDirectory, getKandownHandle, ensureTasksDir, listTaskIds, readConfigFile, writeConfigFile, readTaskFile, writeTaskFile, deleteTaskFile, saveRecentProject, listRecentProjects, removeRecentProject, verifyPermission, serverReadBoard, serverWriteBoard, serverReadConfig, serverWriteConfig, serverListTasks, serverReadTask, serverReadTaskFile, serverWriteTask, serverDeleteTask
 * @see src/lib/store.ts
 * @see src/lib/parser.ts
 */

import type { KandownConfig, TaskFrontmatter } from './types';
import { DEFAULT_CONFIG } from './types';
import { serializeTaskFile } from './serializer';
import { parseTaskFile } from './parser';
import { normalizeFontId, normalizeSkinId, normalizeThemeMode } from './theme';

declare global {
  interface Window {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    /** 📖 Set by the CLI server when serving the web app. Contains the absolute path to .kandown/. */
    __KANDOWN_ROOT__?: string;
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
  return 'showDirectoryPicker' in window;
}

/**
 * 📖 True when the CLI server is serving this page (window.__KANDOWN_ROOT__ is set).
 * Indicates the app is running in "server mode" — the CLI knows the project path.
 */
export function isServerMode(): boolean {
  return typeof window !== 'undefined' && typeof window.__KANDOWN_ROOT__ === 'string' && window.__KANDOWN_ROOT__.length > 0;
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
 * 📖 Central fetch wrapper for the Kandown REST API.
 * Throws with a descriptive message on non-OK responses.
 */
async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, options);
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

/**
 * @description Lists all task IDs via the CLI server.
 */
export async function serverListTasks(): Promise<string[]> {
  const res = await apiFetch('/api/tasks');
  return res.json() as Promise<string[]>;
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

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') return null;
    throw e;
  }
}

export async function pickProjectDirectory(): Promise<{ projectHandle: FileSystemDirectoryHandle; kandownHandle: FileSystemDirectoryHandle } | null> {
  const projectHandle = await pickDirectory();
  if (!projectHandle) return null;

  try {
    const kandownHandle = await projectHandle.getDirectoryHandle('.kandown', { create: false });
    return { projectHandle, kandownHandle };
  } catch {
    // .kandown doesn't exist - create it
    const kandownHandle = await projectHandle.getDirectoryHandle('.kandown', { create: true });
    await ensureTasksDir(kandownHandle);
    return { projectHandle, kandownHandle };
  }
}

export async function getKandownHandle(projectHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  try {
    return await projectHandle.getDirectoryHandle('.kandown', { create: false });
  } catch {
    const kandownHandle = await projectHandle.getDirectoryHandle('.kandown', { create: true });
    await ensureTasksDir(kandownHandle);
    return kandownHandle;
  }
}

/* ═════════════ Config (kandown.json) ═════════════ */

export async function readConfigFile(_kandownHandle: FileSystemDirectoryHandle | null): Promise<KandownConfig | null> {
  if (isServerMode()) return serverReadConfig();
  try {
    const h = await _kandownHandle!.getFileHandle('kandown.json');
    const file = await h.getFile();
    const text = await file.text();
    const raw = JSON.parse(text) as Partial<KandownConfig>;
    const ui = { ...DEFAULT_CONFIG.ui, ...raw.ui };
    return {
      ui: {
        ...ui,
        theme: normalizeThemeMode(ui.theme),
        skin: normalizeSkinId(ui.skin),
        font: normalizeFontId(ui.font),
      },
      agent: { ...DEFAULT_CONFIG.agent, ...raw.agent },
      board: {
        ...DEFAULT_CONFIG.board,
        ...raw.board,
        columns: Array.isArray(raw.board?.columns) && raw.board.columns.length > 0
          ? raw.board.columns.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
          : DEFAULT_CONFIG.board.columns,
      },
      fields: { ...DEFAULT_CONFIG.fields, ...raw.fields },
      notifications: { ...DEFAULT_CONFIG.notifications, ...raw.notifications },
    };
  } catch {
    return null;
  }
}

export async function writeConfigFile(_kandownHandle: FileSystemDirectoryHandle | null, config: KandownConfig): Promise<void> {
  if (isServerMode()) return serverWriteConfig(config);
  const h = await _kandownHandle!.getFileHandle('kandown.json', { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify(config, null, 2) + '\n');
  await w.close();
}

export async function ensureTasksDir(dirHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return await dirHandle.getDirectoryHandle('tasks', { create: true });
}

export async function listTaskIds(_tasksDir: FileSystemDirectoryHandle | null): Promise<string[]> {
  if (isServerMode()) return serverListTasks();
  const ids: string[] = [];
  for await (const entry of _tasksDir!.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      ids.push(entry.name.slice(0, -3));
    }
  }
  return ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function readTaskFile(_tasksDir: FileSystemDirectoryHandle | null, id: string) {
  if (isServerMode()) {
    try {
      const text = await serverReadTask(id);
      return parseTaskFile(text);
    } catch {
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
  }
  try {
    const h = await _tasksDir!.getFileHandle(`${id}.md`);
    const file = await h.getFile();
    const text = await file.text();
    return parseTaskFile(text);
  } catch {
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
}

export async function writeTaskFile(
  _tasksDir: FileSystemDirectoryHandle | null,
  id: string,
  frontmatter: TaskFrontmatter,
  body: string
): Promise<void> {
  if (isServerMode()) return serverWriteTask(id, serializeTaskFile(frontmatter, body));
  const h = await _tasksDir!.getFileHandle(`${id}.md`, { create: true });
  const w = await h.createWritable();
  await w.write(serializeTaskFile(frontmatter, body));
  await w.close();
}

export async function deleteTaskFile(_tasksDir: FileSystemDirectoryHandle | null, id: string): Promise<void> {
  if (isServerMode()) return serverDeleteTask(id);
  try {
    await _tasksDir!.removeEntry(`${id}.md`);
  } catch {
    // ignore
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

export async function saveRecentProject(project: RecentProject): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRecentProjects(): Promise<RecentProject[]> {
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
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}
