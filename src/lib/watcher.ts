/**
 * @file File watcher for Kandown
 * @description 500ms polling watcher using content hashing (SHA-256).
 * Detects external changes to kandown.json and tasks/*.md. Fires events for
 * silent board reloads, notification checks, and conflict detection.
 *
 * 📖 Uses SHA-256 content hashing to avoid parsing on every tick — only
 * triggers a reload event when the file content actually changed.
 *
 * 📖 Layout (v0.12+): the watcher takes the project root handle plus a
 * separate `tasksDirHandle` (sibling of `.kandown/`). `kandown.json` is
 * read from a derived `.kandown/` handle.
 *
 * @functions
 *  → FileWatcher — polling watcher with content hashing
 *  → fileWatcher — singleton instance
 *  → readConfigFileText / readTaskFileText — raw text helpers
 *
 * @exports FileWatcher, fileWatcher
 */

import { isServerMode } from './filesystem';

export type ConflictType = 'none' | 'body-only' | 'metadata-only' | 'full';

export interface WatcherEvents {
  configChanged: () => void;
  taskChanged: (taskId: string) => void;
  newTaskDetected: (taskId: string) => void;
  /** 📖 Fired when the watcher stops itself after repeated tick failures, or
   * when it encounters a fatal error. The UI uses this to show a "watcher
   * disabled" banner (t107). */
  watcherError: (message: string) => void;
}

type EventHandler<K extends keyof WatcherEvents> = WatcherEvents[K];

export class FileWatcher {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private tasksDirHandle: FileSystemDirectoryHandle | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private configHash: string | null = null;
  private taskHashes: Map<string, string> = new Map();
  private knownTaskIds: Set<string> = new Set();
  private listeners: Map<keyof WatcherEvents, Set<unknown>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceDelay = 150;
  /** 📖 Consecutive tick failures. Reset to 0 on any successful tick. Once it
   * reaches {@link maxConsecutiveErrors} the watcher stops itself and emits
   * `watcherError` so the UI can offer a manual restart (t107). */
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 5;
  /** 📖 True once the watcher has auto-disabled itself; cleared on restart. */
  private disabled = false;
  private eventSource: EventSource | null = null;

  start(dirHandle: FileSystemDirectoryHandle | null, tasksDirHandle: FileSystemDirectoryHandle | null): void {
    this.dirHandle = dirHandle;
    this.tasksDirHandle = tasksDirHandle;
    this.consecutiveErrors = 0;
    this.disabled = false;
    if (isServerMode()) {
      this.startServerSse();
    }
    if (dirHandle && tasksDirHandle) {
      void this.initHashes();
      this.intervalId = setInterval(() => void this.tick(), 300);
    }
  }

  startServerSse(): void {
    if (typeof window === 'undefined' || !isServerMode()) return;
    if (this.eventSource) return;
    const token = window.__KANDOWN_TOKEN__;
    const url = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
    try {
      this.eventSource = new EventSource(url);
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'change') {
            if (data.taskId) {
              this.emit('taskChanged', data.taskId);
            } else {
              this.emit('configChanged');
              this.emit('taskChanged', '');
            }
          }
        } catch {
          // ignore heartbeats
        }
      };
    } catch (e) {
      console.warn('[Watcher] EventSource init failed:', e);
    }
  }

  stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.configHash = null;
    this.taskHashes.clear();
    this.knownTaskIds.clear();
    this.listeners.clear();
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
    this.consecutiveErrors = 0;
    this.disabled = false;
  }

  /** 📖 True when the watcher has auto-disabled itself after repeated errors. */
  isDisabled(): boolean {
    return this.disabled;
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

    try {
      const configText = await readConfigFileText(this.dirHandle);
      if (configText !== null) {
        this.configHash = await this.hash(configText);
      }
      await this.syncTaskDir(false);
    } catch (e) {
      console.warn('[Watcher] initHashes error:', e);
      // Non-fatal — the tick loop will retry. Don't bump consecutiveErrors
      // here because init runs once and a single failure shouldn't disable.
    }
  }

  private async tick(): Promise<void> {
    if (!this.dirHandle || !this.tasksDirHandle) return;
    if (this.disabled) return;

    try {
      // Check kandown.json (lives inside .kandown/, which the caller passes as
      // dirHandle). The tasks dir is a sibling of .kandown/ at the project root.
      const configText = await readConfigFileText(this.dirHandle);
      if (configText !== null) {
        const newHash = await this.hash(configText);
        if (this.configHash !== null && newHash !== this.configHash) {
          this.configHash = newHash;
          this.debouncedEmit('configChanged');
        }
      }

      // 📖 Check each known task file individually so one unreadable file
      // doesn't abort the whole tick (t107). Snapshot the ids first because we
      // may drop a dead id mid-loop.
      for (const taskId of [...this.knownTaskIds]) {
        try {
          const taskText = await readTaskFileText(this.tasksDirHandle, taskId);
          if (taskText !== null) {
            const newHash = await this.hash(taskText);
            const oldHash = this.taskHashes.get(taskId);
            if (oldHash !== undefined && newHash !== oldHash) {
              this.taskHashes.set(taskId, newHash);
              this.debouncedEmit('taskChanged', taskId);
            }
          }
        } catch (e) {
          console.warn(`[Watcher] Error reading task ${taskId}:`, e);
          // Continue to the next task.
        }
      }

      await this.syncTaskDir(true);

      // 📖 Successful tick — reset the consecutive-error counter so a flaky
      // failure doesn't accumulate toward auto-disable (t107).
      this.consecutiveErrors = 0;
    } catch (e) {
      // Whole-tick failure (e.g. dirHandle revoked). Bump the counter and
      // auto-disable after the threshold so we don't spin forever.
      this.consecutiveErrors++;
      console.error(`[Watcher] Tick failed (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, e);
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.disable(`File watcher stopped after ${this.maxConsecutiveErrors} consecutive errors: ${(e as Error).message}`);
      }
    }
  }

  /** 📖 Stops the polling loop and emits `watcherError`. The store can surface
   * a banner + a manual "restart watcher" button (t107). */
  private disable(message: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.disabled = true;
    this.emit('watcherError', message);
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

  private async syncTaskDir(emitNewTasks: boolean): Promise<void> {
    if (!this.tasksDirHandle) return;

    let entries: AsyncIterableIterator<FileSystemHandle>;
    try {
      entries = this.tasksDirHandle.values();
    } catch (e) {
      // Directory handle revoked — let the tick caller decide what to do.
      throw e;
    }
    // 📖 Iterate defensively: a single unreadable entry should not abort the
    // directory scan (t107).
    for await (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
      const id = entry.name.replace('.md', '');
      if (this.knownTaskIds.has(id)) continue;
      try {
        this.knownTaskIds.add(id);
        const taskText = await readTaskFileText(this.tasksDirHandle, id);
        if (taskText !== null) {
          this.taskHashes.set(id, await this.hash(taskText));
          if (emitNewTasks) {
            this.debouncedEmit('newTaskDetected', id);
          }
        }
      } catch (e) {
        console.warn(`[Watcher] syncTaskDir: failed to read ${id}:`, e);
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
    handlers?.forEach(handler => {
      if (event === 'configChanged') {
        (handler as WatcherEvents['configChanged'])();
        return;
      }
      if (event === 'taskChanged') {
        const [taskId] = args as Parameters<WatcherEvents['taskChanged']>;
        (handler as WatcherEvents['taskChanged'])(taskId);
        return;
      }
      if (event === 'newTaskDetected') {
        const [taskId] = args as Parameters<WatcherEvents['newTaskDetected']>;
        (handler as WatcherEvents['newTaskDetected'])(taskId);
        return;
      }
      // watcherError
      const [message] = args as Parameters<WatcherEvents['watcherError']>;
      (handler as WatcherEvents['watcherError'])(message);
    });
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
