/**
 * @file Node.js file watcher for CLI
 * @description Uses chokidar for filesystem events and SHA-256 content
 * hashing to detect actual content changes. Fires silent events (no status bar
 * flash) so the board reloads are invisible to the user. Cursor position is
 * preserved across reloads.
 *
 * 📖 Events are silent — no statusMsg, no notification. The board simply
 * refreshes. Only new task detection fires a brief status message since that
 * is user-relevant information.
 *
 * @functions
 *  → FileWatcher       — content-hashing watcher class
 *  → createWatcher     — factory, returns ready-to-use watcher
 *
 * @exports FileWatcher, createWatcher
 */

import { createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { watch, FSWatcher } from 'chokidar';
import { listTaskIds } from './board-reader.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CliWatcherEvents {
  /** Fired when any task file content actually changed (not just touched). */
  taskChanged: (taskId: string) => void;
  /** Fired when a new task file is detected for the first time. */
  newTaskDetected: (taskId: string) => void;
  /** Fired when kandown.json content changed. */
  configChanged: () => void;
  /** Fired when the watcher is fully stopped and cleaned up. */
  stopped: () => void;
}

type EventHandler<K extends keyof CliWatcherEvents> = CliWatcherEvents[K];

// ─── Hash helper ──────────────────────────────────────────────────────────────

/** 📖 Compute SHA-256 hash of a file, returning hex string. */
function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** 📖 Sync (non-streaming) hash for when we just need a quick hash of a small file. */
function hashFileSync(filePath: string): string {
  const content = require('node:fs').readFileSync(filePath, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

// ─── FileWatcher ───────────────────────────────────────────────────────────────

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private taskHashes: Map<string, string> = new Map();
  private knownTaskIds: Set<string> = new Set();
  private listeners: Map<keyof CliWatcherEvents, Set<unknown>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceDelay = 50;
  private watchDebounceDelay = 100;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  /**
   * 📖 Start watching task files and kandown.json.
   * Uses chokidar for immediate FS event detection, plus a fallback 500ms
   * poll to catch any races or network-mounted file changes.
   */
  start(kandownDir: string): void {
    const tasksDir = join(kandownDir, 'tasks');
    const configPath = join(kandownDir, 'kandown.json');

    // Seed hashes for all existing task files
    const existingIds = listTaskIds(kandownDir);
    for (const id of existingIds) {
      this.knownTaskIds.add(id);
      try {
        const filePath = join(tasksDir, `${id}.md`);
        this.taskHashes.set(id, hashFileSync(filePath));
      } catch {
        // File may have been deleted between listTaskIds and now
      }
    }

    this.watcher = watch([join(tasksDir, '*.md'), configPath], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    });

    this.watcher.on('all', (event, path) => {
      this.handleFsEvent(event, path, kandownDir);
    });

    // Fallback 500ms poll to catch any missed updates (network mounts, etc.)
    this.pollInterval = setInterval(() => {
      this.pollHashes(kandownDir);
    }, 500);
  }

  /**
   * 📖 Stop watching and clean up all resources.
   */
  stop(): void {
    this.stopped = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
    this.taskHashes.clear();
    this.knownTaskIds.clear();
    this.emit('stopped');
  }

  /** 📖 Register an event handler. Returns an unsubscribe function. */
  on<K extends keyof CliWatcherEvents>(event: K, handler: EventHandler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /** 📖 Current set of known task IDs. */
  getKnownTaskIds(): string[] {
    return Array.from(this.knownTaskIds);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private handleFsEvent(event: string, filePath: string, kandownDir: string): void {
    if (this.stopped) return;

    const tasksDir = join(kandownDir, 'tasks');
    const configPath = join(kandownDir, 'kandown.json');

    if (filePath === configPath) {
      // Debounce config change detection
      const key = `config:${event}`;
      const existing = this.debounceTimers.get(key);
      if (existing) clearTimeout(existing);
      this.debounceTimers.set(key, setTimeout(() => {
        this.debounceTimers.delete(key);
        this.emit('configChanged');
      }, this.watchDebounceDelay));
      return;
    }

    // Task file event
    const taskId = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/, '') ?? '';
    if (!taskId) return;

    if (event === 'add' || event === 'change') {
      const key = `task:${taskId}:${event}`;
      const existing = this.debounceTimers.get(key);
      if (existing) clearTimeout(existing);
      this.debounceTimers.set(key, setTimeout(() => {
        this.debounceTimers.delete(key);
        void this.checkTaskContentChange(taskId, filePath, true);
      }, this.watchDebounceDelay));
    } else if (event === 'unlink') {
      // Task deleted — remove from tracking
      this.taskHashes.delete(taskId);
      this.knownTaskIds.delete(taskId);
      // Don't emit anything — board will re-read and the task will simply vanish
    }
  }

  private async checkTaskContentChange(taskId: string, filePath: string, isNew: boolean): Promise<void> {
    try {
      const newHash = await hashFile(filePath);
      const oldHash = this.taskHashes.get(taskId);

      if (isNew && !this.knownTaskIds.has(taskId)) {
        // New task file
        this.knownTaskIds.add(taskId);
        this.taskHashes.set(taskId, newHash);
        this.emit('newTaskDetected', taskId);
        return;
      }

      if (oldHash !== undefined && newHash !== oldHash) {
        // Content actually changed
        this.taskHashes.set(taskId, newHash);
        this.emit('taskChanged', taskId);
      } else if (oldHash === undefined) {
        // First time seeing this file
        this.knownTaskIds.add(taskId);
        this.taskHashes.set(taskId, newHash);
        if (isNew) {
          this.emit('newTaskDetected', taskId);
        }
      }
    } catch {
      // File may have been deleted between check and read
    }
  }

  /** 📖 Fallback poll — catches changes that chokidar missed (network mounts, exotic FS). */
  private async pollHashes(kandownDir: string): Promise<void> {
    if (this.stopped) return;

    const tasksDir = join(kandownDir, 'tasks');
    const configPath = join(kandownDir, 'kandown.json');

    // Check config
    try {
      const newHash = hashFileSync(configPath);
      // No config hash tracking currently — just trigger a silent read
      // The board will re-derive columns from the new config
    } catch {
      // Config may not exist
    }

    // Check known task files
    for (const taskId of this.knownTaskIds) {
      const filePath = join(tasksDir, `${taskId}.md`);
      try {
        statSync(filePath); // Quick existence check
        const newHash = await hashFile(filePath);
        const oldHash = this.taskHashes.get(taskId);
        if (oldHash !== undefined && newHash !== oldHash) {
          this.taskHashes.set(taskId, newHash);
          this.emit('taskChanged', taskId);
        }
      } catch {
        // File deleted — remove from tracking
        this.taskHashes.delete(taskId);
        this.knownTaskIds.delete(taskId);
      }
    }

    // Discover new task files
    const currentIds = listTaskIds(kandownDir);
    for (const id of currentIds) {
      if (!this.knownTaskIds.has(id)) {
        const filePath = join(tasksDir, `${id}.md`);
        try {
          const newHash = await hashFile(filePath);
          this.knownTaskIds.add(id);
          this.taskHashes.set(id, newHash);
          this.emit('newTaskDetected', id);
        } catch {
          // Skip
        }
      }
    }
  }

  private debouncedEmit<K extends keyof CliWatcherEvents>(event: K, ...args: Parameters<CliWatcherEvents[K]>): void {
    const key = event + JSON.stringify(args);
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.emit(event, ...args);
    }, this.debounceDelay);
    this.debounceTimers.set(key, timer);
  }

  private emit<K extends keyof CliWatcherEvents>(event: K, ...args: Parameters<CliWatcherEvents[K]>): void {
    if (this.stopped) return;
    const handlers = this.listeners.get(event);
    handlers?.forEach(handler => {
      if (event === 'configChanged') {
        (handler as CliWatcherEvents['configChanged'])();
      } else if (event === 'taskChanged') {
        (handler as CliWatcherEvents['taskChanged'])(...args as Parameters<CliWatcherEvents['taskChanged']>);
      } else if (event === 'newTaskDetected') {
        (handler as CliWatcherEvents['newTaskDetected'])(...args as Parameters<CliWatcherEvents['newTaskDetected']>);
      } else {
        (handler as CliWatcherEvents['stopped'])();
      }
    });
  }
}

/** 📖 Factory — creates a pre-configured watcher ready to start. */
export function createWatcher(): FileWatcher {
  return new FileWatcher();
}
