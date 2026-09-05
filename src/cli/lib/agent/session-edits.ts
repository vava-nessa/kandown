/**
 * @file Session edit tracker: which live harness session is touching which task
 * @description The daemon-side half of the live editing experience (t309). When
 * a harness session reports a `file_changed` event whose path lands on a task
 * file (active or archived), this module marks the (session, task) pair active
 * and broadcasts `agent_edit_started` on the board SSE channel. While the pair
 * is active, disk writes to that task file (reported by the content-hashing
 * file watcher) are broadcast as `task_diff` events so the web UI can show a
 * live before/after view. The pair clears when the turn ends (after a short
 * linger so trailing disk writes still land), when the session stops, or after
 * an idle timeout, each clearing broadcast exactly once as `agent_edit_ended`.
 *
 * 📖 Division of labor: this module never reads task files. It only watches
 * runtime events and owns the session-to-task mapping plus the active-pair
 * gating. The before/after text comes from the file watcher's content cache,
 * which calls recordChange when a task file actually changes on disk. That
 * split keeps this module pure enough to test with a fake runtime subscription
 * and a fake broadcaster, no filesystem writes needed.
 *
 * 📖 Path mapping reuses the shared filename policy: the candidate id comes
 * from the basename, and it is only accepted when resolveTaskFilename confirms
 * the id still answers to a file in the tasks directory (or its archive), so
 * stray Markdown from other tools never becomes a phantom "agent is editing"
 * state. Anything outside the tasks tree, including `.kandown/`, is ignored.
 *
 * @functions
 *  → createSessionEditTracker: the factory; attach/detach sessions, map paths
 *    to task ids, gate and broadcast task_diff, inspect pending pairs
 *
 * @exports DIFF_CHAR_CAP, IDLE_TIMEOUT_MS, TURN_LINGER_MS, SessionEditPair,
 *          SessionEditTrackerOptions, SessionEventSubscriber, SessionEditTracker,
 *          createSessionEditTracker
 * @see src/cli/lib/agent/agent-runtime.ts: the session events consumed here
 * @see src/cli/lib/file-watcher.ts: the disk writes fed into recordChange
 * @see src/cli/lib/server.ts: the wiring and the board SSE channel
 */

import { basename, isAbsolute, join, resolve as resolvePath, sep } from 'node:path';
import { listTaskFilenames } from '../board-reader.js';
import { isTaskFilename, resolveTaskFilename, taskIdFromFilename } from '../../../lib/task-filename.js';
import { subscribeAgentSession } from './agent-runtime.js';
import type { AgentEvent } from './types.js';

/** 📖 Hard cap for each side of a task_diff payload, in characters. Beyond
 *  this the text is clipped and the `truncated` flag tells the UI the diff is
 *  a window, not the whole file. */
export const DIFF_CHAR_CAP = 24000;

/** 📖 How long an untouched (session, task) pair stays active with no new
 *  file_changed event and no disk write: two minutes, then it clears itself. */
export const IDLE_TIMEOUT_MS = 120000;

/** 📖 Grace period after turn_completed before a pair clears: harnesses write
 *  files slightly before announcing the end of the turn, and the disk watcher
 *  observes the write slightly after, so the last diffs of a turn must still
 *  find their pair alive. */
export const TURN_LINGER_MS = 10000;

/** 📖 How long a tasks-directory listing is trusted before it is refreshed.
 *  Bursts of edits must not readdir on every event, but a fresh task file has
 *  to become mappable quickly. */
const LISTING_TTL_MS = 1000;

/** 📖 One active (session, task) pair, exposed for tests and introspection.
 *  Timestamps are ISO strings; the millisecond values live only internally. */
export interface SessionEditPair {
  sessionId: string;
  taskId: string;
  harnessId: string;
  startedAt: string;
  lastActivityAt: string;
}

/** 📖 Injectable runtime subscription, so tests can drive session events
 *  without spawning a harness. Defaults to subscribeAgentSession. */
export type SessionEventSubscriber = (
  sessionId: string,
  listener: (event: AgentEvent) => void,
) => (() => void) | null;

export interface SessionEditTrackerOptions {
  /** Idle timeout override (tests use small values). Default IDLE_TIMEOUT_MS. */
  idleTimeoutMs?: number;
  /** Turn-end linger override (tests use small values). Default TURN_LINGER_MS. */
  turnLingerMs?: number;
  /** Runtime subscription override. Default subscribeAgentSession. */
  subscribe?: SessionEventSubscriber;
  /** Clock override for timestamps (ISO output). Default Date. */
  now?: () => number;
}

export interface SessionEditTracker {
  /** 📖 Starts watching one session's events. Every file_changed event whose
   *  path maps to a task activates the pair (broadcasting agent_edit_started
   *  once); turn_completed schedules the linger close; stopped detaches. */
  attachSession(sessionId: string, harnessId: string): void;
  /** 📖 Ends every pair of the session (agent_edit_ended each) and stops
   *  listening. Idempotent. */
  detachSession(sessionId: string): void;
  /** 📖 The live-edit query the file watcher (or any surface) can ask: does
   *  this absolute path belong to a task currently edited by an agent?
   *  Null when the path is not a task file or no pair is active for it. */
  isTaskBeingEditedByAgent(absolutePath: string): { taskId: string; sessionId: string } | null;
  /** 📖 Reports one disk write to a file. When the path maps to a task with an
   *  active pair, broadcasts one task_diff per owning pair. `before` is the
   *  watcher's cached previous content, undefined on first sight (sent as an
   *  empty string). Also counts as pair activity for the idle timeout. */
  recordChange(absolutePath: string, before: string | undefined, after: string): void;
  /** 📖 Snapshot of every active pair, for tests. */
  pendingPairs(): SessionEditPair[];
  /** 📖 Detaches every session and clears all timers. */
  dispose(): void;
}

/** 📖 Broadcast event contract (frozen, the UI codes against these keys):
 *  agent_edit_started { sessionId, taskId, harnessId, at },
 *  agent_edit_ended { sessionId, taskId, at },
 *  task_diff { taskId, sessionId, path, before, after, truncated, at }. */
export type SessionEditBroadcaster = (event: Record<string, unknown>) => void;

/** 📖 Internal pair state; the exported view is derived from it. */
interface ActivePair {
  taskId: string;
  harnessId: string;
  startedAtMs: number;
  lastActivityMs: number;
}

function pairKey(sessionId: string, taskId: string): string {
  return `${sessionId}::${taskId}`;
}

/** 📖 Creates the tracker. One per daemon process (the server wires it with
 *  broadcastSseEvent and the file watcher). All timers are unref'd so tests
 *  and short-lived processes never hang on them. */
export function createSessionEditTracker(
  projectRoot: string,
  tasksDir: string,
  broadcast: SessionEditBroadcaster,
  options: SessionEditTrackerOptions = {},
): SessionEditTracker {
  const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const turnLingerMs = options.turnLingerMs ?? TURN_LINGER_MS;
  const subscribe: SessionEventSubscriber = options.subscribe ?? subscribeAgentSession;
  const now = options.now ?? (() => Date.now());

  const archiveDir = join(tasksDir, 'archive');
  const sessions = new Map<string, Map<string, ActivePair>>();
  const unsubscribes = new Map<string, () => void>();
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const closeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  let listingCache: { dir: string; names: string[]; atMs: number } | null = null;

  const iso = (): string => new Date(now()).toISOString();

  function listTaskNames(dir: string): string[] {
    if (listingCache && listingCache.dir === dir && now() - listingCache.atMs < LISTING_TTL_MS) {
      return listingCache.names;
    }
    const names = listTaskFilenames(dir);
    listingCache = { dir, names, atMs: now() };
    return names;
  }

  /** 📖 Maps an absolute path onto a task id, trusting only paths that sit
   *  directly inside the tasks tree and whose basename the shared filename
   *  policy resolves to a live file there. Null for everything else. */
  function taskIdForPath(absolutePath: string): string | null {
    let normalized: string;
    try {
      normalized = resolvePath(absolutePath);
    } catch {
      return null;
    }
    // 📖 The archive lives INSIDE the tasks tree, so it must be tested first:
    // an archive path also carries the tasks prefix, and the right answer is
    // the deepest directory (whose listing actually holds the file).
    for (const dir of [archiveDir, tasksDir]) {
      const dirNormalized = resolvePath(dir);
      const prefix = dirNormalized.endsWith(sep) ? dirNormalized : dirNormalized + sep;
      if (!normalized.startsWith(prefix)) continue;
      const name = basename(normalized);
      if (!isTaskFilename(name)) return null;
      const id = taskIdFromFilename(name);
      if (!id) return null;
      const match = resolveTaskFilename(id, listTaskNames(dirNormalized));
      return match ? id : null;
    }
    return null;
  }

  function clearTimers(key: string): void {
    const idle = idleTimers.get(key);
    if (idle) {
      clearTimeout(idle);
      idleTimers.delete(key);
    }
    const close = closeTimers.get(key);
    if (close) {
      clearTimeout(close);
      closeTimers.delete(key);
    }
  }

  function armIdleTimer(sessionId: string, taskId: string): void {
    const key = pairKey(sessionId, taskId);
    const existing = idleTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      idleTimers.delete(key);
      deactivate(sessionId, taskId);
    }, idleTimeoutMs);
    timer.unref?.();
    idleTimers.set(key, timer);
  }

  /** 📖 Activates or refreshes a pair. Broadcasts agent_edit_started only on
   *  the transition from inactive to active, so the UI never sees duplicates. */
  function activatePair(sessionId: string, taskId: string, harnessId: string): void {
    const byTask = sessions.get(sessionId) ?? new Map<string, ActivePair>();
    const existing = byTask.get(taskId);
    const pendingClose = closeTimers.get(pairKey(sessionId, taskId));
    if (pendingClose) {
      // 📖 Activity during the turn-end linger re-opens the pair: cancel the
      // close instead of letting a fresh edit die with the old turn.
      clearTimeout(pendingClose);
      closeTimers.delete(pairKey(sessionId, taskId));
    }
    if (!existing) {
      byTask.set(taskId, { taskId, harnessId, startedAtMs: now(), lastActivityMs: now() });
      sessions.set(sessionId, byTask);
      broadcast({
        type: 'agent_edit_started',
        sessionId,
        taskId,
        harnessId,
        at: iso(),
      });
    } else {
      existing.lastActivityMs = now();
    }
    armIdleTimer(sessionId, taskId);
  }

  /** 📖 Clears one pair and broadcasts agent_edit_ended. Silent no-op when the
   *  pair is already gone, which is what makes ended broadcasts idempotent. */
  function deactivate(sessionId: string, taskId: string): void {
    const byTask = sessions.get(sessionId);
    if (!byTask?.delete(taskId)) return;
    if (byTask.size === 0) sessions.delete(sessionId);
    clearTimers(pairKey(sessionId, taskId));
    broadcast({
      type: 'agent_edit_ended',
      sessionId,
      taskId,
      at: iso(),
    });
  }

  function deactivateSession(sessionId: string): void {
    const byTask = sessions.get(sessionId);
    if (!byTask) return;
    for (const taskId of [...byTask.keys()]) deactivate(sessionId, taskId);
  }

  function clip(text: string): { text: string; clipped: boolean } {
    return text.length > DIFF_CHAR_CAP
      ? { text: text.slice(0, DIFF_CHAR_CAP), clipped: true }
      : { text, clipped: false };
  }

  const tracker: SessionEditTracker = {
    attachSession(sessionId, harnessId) {
      if (unsubscribes.has(sessionId)) return;
      const unsubscribe = subscribe(sessionId, (event: AgentEvent) => {
        if (event.type === 'file_changed') {
          // 📖 Harnesses report either absolute paths or paths relative to the
          // project root; only the tasks tree is interesting here.
          const absolute = isAbsolute(event.path) ? event.path : join(projectRoot, event.path);
          const taskId = taskIdForPath(absolute);
          if (taskId) activatePair(sessionId, taskId, harnessId);
        } else if (event.type === 'turn_completed') {
          // 📖 Linger before ending so disk writes that race the turn-end
          // announcement still produce their diffs. New file_changed events
          // during the linger cancel the close.
          const byTask = sessions.get(sessionId);
          if (!byTask) return;
          for (const taskId of [...byTask.keys()]) {
            const key = pairKey(sessionId, taskId);
            const existing = closeTimers.get(key);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              closeTimers.delete(key);
              deactivate(sessionId, taskId);
            }, turnLingerMs);
            timer.unref?.();
            closeTimers.set(key, timer);
          }
        } else if (event.type === 'stopped') {
          tracker.detachSession(sessionId);
        }
      });
      if (!unsubscribe) return;
      unsubscribes.set(sessionId, unsubscribe);
    },

    detachSession(sessionId) {
      const unsubscribe = unsubscribes.get(sessionId);
      if (unsubscribe) {
        unsubscribe();
        unsubscribes.delete(sessionId);
      }
      deactivateSession(sessionId);
    },

    isTaskBeingEditedByAgent(absolutePath) {
      const taskId = taskIdForPath(absolutePath);
      if (!taskId) return null;
      for (const [sessionId, byTask] of sessions) {
        if (byTask.has(taskId)) return { taskId, sessionId };
      }
      return null;
    },

    recordChange(absolutePath, before, after) {
      const taskId = taskIdForPath(absolutePath);
      if (!taskId) return;
      for (const [sessionId, byTask] of sessions) {
        const pair = byTask.get(taskId);
        if (!pair) continue;
        // 📖 A disk write is proof of life: refresh the idle clock.
        pair.lastActivityMs = now();
        armIdleTimer(sessionId, taskId);
        const clippedBefore = clip(before ?? '');
        const clippedAfter = clip(after);
        broadcast({
          type: 'task_diff',
          taskId,
          sessionId,
          path: absolutePath,
          before: clippedBefore.text,
          after: clippedAfter.text,
          truncated: clippedBefore.clipped || clippedAfter.clipped,
          at: iso(),
        });
      }
    },

    pendingPairs() {
      const result: SessionEditPair[] = [];
      for (const [sessionId, byTask] of sessions) {
        for (const pair of byTask.values()) {
          result.push({
            sessionId,
            taskId: pair.taskId,
            harnessId: pair.harnessId,
            startedAt: new Date(pair.startedAtMs).toISOString(),
            lastActivityAt: new Date(pair.lastActivityMs).toISOString(),
          });
        }
      }
      return result;
    },

    dispose() {
      for (const sessionId of [...unsubscribes.keys()]) tracker.detachSession(sessionId);
      for (const timer of idleTimers.values()) clearTimeout(timer);
      for (const timer of closeTimers.values()) clearTimeout(timer);
      idleTimers.clear();
      closeTimers.clear();
      sessions.clear();
      listingCache = null;
    },
  };

  return tracker;
}
