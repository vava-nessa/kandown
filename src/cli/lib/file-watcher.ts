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
 * 📖 Live-edit support (t309): the watcher keeps a bounded LRU cache of recent
 * task file contents so it can hand real before/after text to an optional
 * `onTaskContentChange` callback. The daemon wires that callback to the agent
 * session edit tracker, which turns it into `task_diff` SSE events while a
 * harness session is editing the task. The callback is injected with a setter
 * (never imported) so this module stays free of agent-runtime dependencies,
 * and the existing hash/dedupe behavior is untouched when no callback is set.
 *
 * @functions
 *  → FileWatcher                  : content-hashing watcher class
 *  → setOnTaskContentChange       : optional live-diff callback (path, before, after)
 *  → createWatcher                : factory, returns ready-to-use watcher
 *
 * @exports FileWatcher, TaskContentChangeCallback, createWatcher
 */

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { watch, FSWatcher } from 'chokidar';
import { listTaskIds, listTaskFilenames, getTasksDir } from './board-reader.js';
import { resolveTaskFilename, taskIdFromFilename } from '../../lib/task-filename.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** 📖 Max files kept in the before/after content cache. A board has dozens of
 *  small files; 200 covers every realistic project with room to spare. */
const CONTENT_CACHE_LIMIT = 200;

/** 📖 Files larger than this never enter the content cache: the point is real
 *  before/after text for task files, not a general-purpose file cache. */
const CONTENT_CACHE_MAX_BYTES = 512 * 1024;

/** 📖 Live-edit hook (t309): called after a task file's content actually
 *  changed on disk. `before` is the previously cached content, undefined when
 *  the watcher sees the file for the first time (a brand-new task file). */
export type TaskContentChangeCallback = (
  absolutePath: string,
  before: string | undefined,
  after: string,
) => void;

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

/** 📖 Returns the active or archived path for a task id. */
/**
 * 📖 Where the file for a task id currently lives, active directory first, in
 * either the bare `t232.md` or the descriptive `t232_remove_dead_code.md` form.
 * Falls back to the bare archived path so the caller's `statSync` still throws
 * the "file is gone" error it expects when the task really disappeared.
 */
function taskFilePath(tasksDir: string, taskId: string): string {
  for (const directory of [tasksDir, join(tasksDir, 'archive')]) {
    const match = resolveTaskFilename(taskId, listTaskFilenames(directory));
    if (match) return join(directory, match.filename);
  }
  return join(tasksDir, 'archive', `${taskId}.md`);
}

// ─── FileWatcher ───────────────────────────────────────────────────────────────

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private taskHashes: Map<string, string> = new Map();
  private knownTaskIds: Set<string> = new Set();
  private listeners: Map<keyof CliWatcherEvents, Set<unknown>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceDelay = 30;
  private watchDebounceDelay = 75;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  /** 📖 Bounded LRU of recent task file contents, keyed by absolute path.
   *  Insertion order is the recency order: a hit re-inserts, an overflow
   *  evicts the oldest entry. */
  private contentCache: Map<string, string> = new Map();
  private onTaskContentChange: TaskContentChangeCallback | null = null;

  /** 📖 Wires the live-diff callback (the daemon connects this to the agent
   *  session edit tracker). Pass null to disconnect. Never throws. */
  setOnTaskContentChange(callback: TaskContentChangeCallback | null): void {
    this.onTaskContentChange = callback;
  }

  /**
   * 📖 Start watching task files and kandown.json.
   * Uses chokidar for immediate FS event detection, plus a fallback 500ms
   * poll to catch any races or network-mounted file changes.
   *
   * Tasks live at the project root (`./tasks/`, sibling of `.kandown/`);
   * kandown.json lives inside `.kandown/`.
   */
  start(kandownDir: string): void {
    const tasksDir = getTasksDir(kandownDir);
    const configPath = join(kandownDir, 'kandown.json');

    // Seed hashes for all existing task files
    const existingIds = listTaskIds(kandownDir);
    for (const id of existingIds) {
      this.knownTaskIds.add(id);
      try {
        const filePath = taskFilePath(tasksDir, id);
        this.taskHashes.set(id, hashFileSync(filePath));
        // 📖 Seed the content cache silently (no callback): the file did not
        // just change, but the FIRST future change needs a real before text.
        const content = this.readSmallFile(filePath);
        if (content !== undefined) this.contentCacheSet(filePath, content);
      } catch {
        // File may have been deleted between listTaskIds and now
      }
    }

    this.watcher = watch([join(tasksDir, '*.md'), join(tasksDir, 'archive', '*.md'), configPath], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 25, pollInterval: 25 },
      alwaysStat: true,
    });

    this.watcher.on('all', (event, path) => {
      this.handleFsEvent(event, path, kandownDir);
    });

    // 📖 Aggressive fallback poll (300ms) to catch any updates missed by chokidar.
    // This is the workhorse — chokidar may silently fail on some macOS configs,
    // so we run a tight polling loop with SHA-256 content comparison.
    this.pollInterval = setInterval(() => {
      this.pollHashes(kandownDir);
    }, 300);
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
    this.contentCache.clear();
    this.onTaskContentChange = null;
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

    const tasksDir = getTasksDir(kandownDir);
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

    // 📖 Task file event. The id comes from the shared filename policy, so a
    // descriptive name maps back to `t232` instead of being treated as a
    // brand-new task called `t232_remove_dead_code`.
    const taskId = taskIdFromFilename(basename(filePath.replace(/\\/g, '/')));
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
      this.contentCache.delete(filePath);
      // Don't emit anything — board will re-read and the task will simply vanish
    }
  }

  // ─── Content cache (live-edit support) ──────────────────────────────────────

  /** 📖 Reads a file only when it is small enough to cache; undefined when it
   *  is too big, unreadable or gone. */
  private readSmallFile(filePath: string): string | undefined {
    try {
      if (statSync(filePath).size > CONTENT_CACHE_MAX_BYTES) return undefined;
      return readFileSync(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }

  private contentCacheGet(filePath: string): string | undefined {
    const hit = this.contentCache.get(filePath);
    if (hit !== undefined) {
      // 📖 Re-insert to mark the entry most recently used.
      this.contentCache.delete(filePath);
      this.contentCache.set(filePath, hit);
    }
    return hit;
  }

  private contentCacheSet(filePath: string, content: string): void {
    this.contentCache.delete(filePath);
    this.contentCache.set(filePath, content);
    while (this.contentCache.size > CONTENT_CACHE_LIMIT) {
      const oldest = this.contentCache.keys().next();
      if (oldest.done) break;
      this.contentCache.delete(oldest.value);
    }
  }

  /** 📖 After a real content change: read the fresh text, pair it with the
   *  cached before text and notify the live-edit callback. Also refreshes the
   *  cache so the NEXT change has a real before text. Silent no-op when the
   *  file is gone or too big to read. */
  private noteContent(filePath: string): void {
    const after = this.readSmallFile(filePath);
    if (after === undefined) return;
    const before = this.contentCacheGet(filePath);
    this.contentCacheSet(filePath, after);
    if (before !== after) this.onTaskContentChange?.(filePath, before, after);
  }

  private async checkTaskContentChange(taskId: string, filePath: string, isNew: boolean): Promise<void> {
    try {
      const newHash = await hashFile(filePath);
      const oldHash = this.taskHashes.get(taskId);

      if (isNew && !this.knownTaskIds.has(taskId)) {
        // New task file
        this.knownTaskIds.add(taskId);
        this.taskHashes.set(taskId, newHash);
        // 📖 First sight: before is unknown (undefined), the diff callback
        // still fires so an agent-created task shows up as a live edit.
        this.noteContent(filePath);
        this.emit('newTaskDetected', taskId);
        return;
      }

      if (oldHash !== undefined && newHash !== oldHash) {
        // Content actually changed
        this.taskHashes.set(taskId, newHash);
        this.noteContent(filePath);
        this.emit('taskChanged', taskId);
      } else if (oldHash === undefined) {
        // First time seeing this file
        this.knownTaskIds.add(taskId);
        this.taskHashes.set(taskId, newHash);
        this.noteContent(filePath);
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

    const tasksDir = getTasksDir(kandownDir);
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
      const filePath = taskFilePath(tasksDir, taskId);
      try {
        statSync(filePath); // Quick existence check
        const newHash = await hashFile(filePath);
        const oldHash = this.taskHashes.get(taskId);
        if (oldHash !== undefined && newHash !== oldHash) {
          this.taskHashes.set(taskId, newHash);
          this.noteContent(filePath);
          this.emit('taskChanged', taskId);
        }
      } catch {
        // File deleted — remove from tracking
        this.taskHashes.delete(taskId);
        this.knownTaskIds.delete(taskId);
        this.contentCache.delete(filePath);
      }
    }

    // Discover new task files
    const currentIds = listTaskIds(kandownDir);
    for (const id of currentIds) {
      if (!this.knownTaskIds.has(id)) {
        const filePath = taskFilePath(tasksDir, id);
        try {
          const newHash = await hashFile(filePath);
          this.knownTaskIds.add(id);
          this.taskHashes.set(id, newHash);
          this.noteContent(filePath);
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
