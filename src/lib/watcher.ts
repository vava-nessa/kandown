/**
 * @file File watcher for Kandown
 * @description 500ms polling watcher using content hashing (SHA-256).
 * Detects external changes to kandown.json and tasks/*.md. Fires events for
 * silent board reloads and conflict detection.
 *
 * 📖 Uses SHA-256 content hashing to avoid parsing on every tick — only
 * triggers a reload event when the file content actually changed.
 *
 * @functions
 *  → FileWatcher — polling watcher with content hashing
 *  → fileWatcher — singleton instance
 *  → readConfigFileText / readTaskFileText — raw text helpers
 *
 * @exports FileWatcher, fileWatcher
 */

export type ConflictType = 'none' | 'body-only' | 'metadata-only' | 'full';

export interface WatcherEvents {
  configChanged: () => void;
  taskChanged: (taskId: string) => void;
  newTaskDetected: (taskId: string) => void;
}

type EventHandler<K extends keyof WatcherEvents> = WatcherEvents[K];

export class FileWatcher {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private tasksDirHandle: FileSystemDirectoryHandle | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private configHash: string | null = null;
  private taskHashes: Map<string, string> = new Map();
  private knownTaskIds: Set<string> = new Set();
  private listeners: Map<string, Set<EventHandler<any>>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceDelay = 200;

  start(dirHandle: FileSystemDirectoryHandle, tasksDirHandle: FileSystemDirectoryHandle): void {
    this.dirHandle = dirHandle;
    this.tasksDirHandle = tasksDirHandle;
    void this.initHashes();
    this.intervalId = setInterval(() => void this.tick(), 500);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.configHash = null;
    this.taskHashes.clear();
    this.knownTaskIds.clear();
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
  }

  on<K extends keyof WatcherEvents>(event: K, handler: EventHandler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  getKnownTaskIds(): string[] {
    return Array.from(this.knownTaskIds);
  }

  private async initHashes(): Promise<void> {
    if (!this.dirHandle || !this.tasksDirHandle) return;

    const configText = await readConfigFileText(this.dirHandle);
    if (configText !== null) {
      this.configHash = await this.hash(configText);
    }

    await this.syncTaskDir();
  }

  private async tick(): Promise<void> {
    if (!this.dirHandle || !this.tasksDirHandle) return;

    // Check kandown.json
    const configText = await readConfigFileText(this.dirHandle);
    if (configText !== null) {
      const newHash = await this.hash(configText);
      if (this.configHash !== null && newHash !== this.configHash) {
        this.configHash = newHash;
        this.debouncedEmit('configChanged');
      }
    }

    // Check each known task file
    for (const taskId of this.knownTaskIds) {
      const taskText = await readTaskFileText(this.tasksDirHandle, taskId);
      if (taskText !== null) {
        const newHash = await this.hash(taskText);
        const oldHash = this.taskHashes.get(taskId);
        if (oldHash !== undefined && newHash !== oldHash) {
          this.taskHashes.set(taskId, newHash);
          this.debouncedEmit('taskChanged', taskId);
        }
      }
    }

    await this.syncTaskDir();
  }

  private debouncedEmit<K extends keyof WatcherEvents>(event: K, ...args: Parameters<WatcherEvents[K]>): void {
    const key = event + JSON.stringify(args);
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.emit(event, ...args);
    }, this.debounceDelay);
    this.debounceTimers.set(key, timer);
  }

  private async syncTaskDir(): Promise<void> {
    if (!this.tasksDirHandle) return;

    for await (const entry of this.tasksDirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const id = entry.name.replace('.md', '');
        if (!this.knownTaskIds.has(id)) {
          this.knownTaskIds.add(id);
          const taskText = await readTaskFileText(this.tasksDirHandle, id);
          if (taskText !== null) {
            this.taskHashes.set(id, await this.hash(taskText));
            this.debouncedEmit('newTaskDetected', id);
          }
        }
      }
    }
  }

  private async hash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private emit<K extends keyof WatcherEvents>(event: K, ...args: Parameters<WatcherEvents[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => (handler as any)(...args));
    }
  }
}

async function readConfigFileText(dirHandle: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const h = await dirHandle.getFileHandle('kandown.json');
    const file = await h.getFile();
    return await file.text();
  } catch { return null; }
}

async function readTaskFileText(tasksDir: FileSystemDirectoryHandle, id: string): Promise<string | null> {
  try {
    const h = await tasksDir.getFileHandle(`${id}.md`);
    const file = await h.getFile();
    return await file.text();
  } catch { return null; }
}

export const fileWatcher = new FileWatcher();
