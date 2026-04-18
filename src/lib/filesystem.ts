/**
 * @file Browser file-system adapter
 * @description Wraps the File System Access API, `.kandown` discovery/creation,
 * task reads and writes, project config persistence, and recent-project
 * IndexedDB storage.
 *
 * 📖 All browser file handles pass through this module. UI and store code should
 * call these helpers instead of touching File System Access APIs directly.
 *
 * @functions
 *  → supportsFileSystemAccess — detects compatible Chromium browsers
 *  → pickDirectory — prompts for a writable project directory
 *  → pickProjectDirectory — opens or creates `.kandown`
 *  → getKandownHandle — resolves `.kandown` from a remembered project handle
 *  → readConfigFile / writeConfigFile — load and persist kandown.json
 *  → listTaskIds — scans tasks/*.md and returns task ids
 *  → readTaskFile / writeTaskFile / deleteTaskFile — task file helpers
 *  → saveRecentProject / listRecentProjects / removeRecentProject — IndexedDB recent projects
 *  → verifyPermission — requests persisted read/write access
 *
 * @exports supportsFileSystemAccess, pickDirectory, pickProjectDirectory, getKandownHandle, ensureTasksDir, listTaskIds, readConfigFile, writeConfigFile, readTaskFile, writeTaskFile, deleteTaskFile, saveRecentProject, listRecentProjects, removeRecentProject, verifyPermission
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
  return 'showDirectoryPicker' in window;
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

export async function readConfigFile(kandownHandle: FileSystemDirectoryHandle): Promise<KandownConfig | null> {
  try {
    const h = await kandownHandle.getFileHandle('kandown.json');
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
    };
  } catch {
    return null;
  }
}

export async function writeConfigFile(kandownHandle: FileSystemDirectoryHandle, config: KandownConfig): Promise<void> {
  const h = await kandownHandle.getFileHandle('kandown.json', { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify(config, null, 2) + '\n');
  await w.close();
}

export async function ensureTasksDir(dirHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return await dirHandle.getDirectoryHandle('tasks', { create: true });
}

export async function listTaskIds(tasksDir: FileSystemDirectoryHandle): Promise<string[]> {
  const ids: string[] = [];
  for await (const entry of tasksDir.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      ids.push(entry.name.slice(0, -3));
    }
  }
  return ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function readTaskFile(tasksDir: FileSystemDirectoryHandle, id: string) {
  try {
    const h = await tasksDir.getFileHandle(`${id}.md`);
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
      body: `# ${id}\n\n## Context\n\n\n## Subtasks\n\n`,
    };
  }
}

export async function writeTaskFile(
  tasksDir: FileSystemDirectoryHandle,
  id: string,
  frontmatter: TaskFrontmatter,
  body: string
): Promise<void> {
  const h = await tasksDir.getFileHandle(`${id}.md`, { create: true });
  const w = await h.createWritable();
  await w.write(serializeTaskFile(frontmatter, body));
  await w.close();
}

export async function deleteTaskFile(tasksDir: FileSystemDirectoryHandle, id: string): Promise<void> {
  try {
    await tasksDir.removeEntry(`${id}.md`);
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
