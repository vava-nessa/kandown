/**
 * @file Pending permission queue for routed harness permission requests
 * @description When a harness session runs in accept-edits mode and the adapter
 * routes an edit-like permission request to kandown (t309), the daemon parks it
 * here until the web UI answers through the resolve endpoint. One FIFO list per
 * session, nothing more: no timers, no persistence, no protocol knowledge. The
 * adapter-specific reply (the JSON-RPC line for ACP, for example) is closed
 * inside the `respond` callback the daemon supplies at push time, so this
 * module stays pure and trivially testable.
 *
 * 📖 Lifecycle: push when the adapter routes, list from GET pending, resolve
 * once from POST resolve. A resolved entry is gone immediately, so a double
 * resolve is a clean 404 rather than a double answer to the harness. When the
 * session stops, the daemon drops the whole per-session list: a dead harness
 * must never receive a late approval, and an unanswered sheet must not leak.
 *
 * @functions
 *  → createPermissionQueue: the FIFO store factory (push, listPending, resolve, clearSession)
 *
 * @exports PermissionAnswer, PermissionQueueEntry, PendingPermissionView, PermissionQueue, createPermissionQueue
 * @see src/cli/lib/agent/adapters/acp.ts: where routed requests come from
 * @see src/cli/lib/server.ts: the endpoints that push and resolve
 */

import { randomUUID } from 'node:crypto';

/** 📖 The decision forwarded to the harness when a pending entry is resolved. */
export type PermissionAnswer = 'allow' | 'reject';

/** 📖 One parked permission request. `respond` is the adapter-bound continuation
 *  the daemon closes over; it is invoked exactly once, by resolve. */
export interface PermissionQueueEntry {
  permissionId: string;
  sessionId: string;
  title: string;
  kind: string;
  respond(answer: PermissionAnswer): void;
}

/** 📖 The JSON-safe projection the GET pending endpoint returns. `respond` is
 *  deliberately excluded: it is a server-side continuation, never data. */
export interface PendingPermissionView {
  permissionId: string;
  title: string;
  kind: string;
}

export interface PermissionQueue {
  /** 📖 Parks one request at the tail of its session's list. A missing
   *  permissionId gets a fresh `perm_` uuid; an explicit one is honored so
   *  tests (and future replays) can pin identities. Returns the stored entry. */
  push(entry: Omit<PermissionQueueEntry, 'permissionId'> & { permissionId?: string }): PermissionQueueEntry;
  /** 📖 The session's pending requests, oldest first, JSON-safe shape. */
  listPending(sessionId: string): PendingPermissionView[];
  /** 📖 Removes the entry and invokes its respond callback exactly once with
   *  the caller's decision. True when the id existed for that session; false
   *  (a no-op) for an unknown session, an unknown id, or an already resolved
   *  one. A throwing respond callback is swallowed: the queue's own state is
   *  already consistent by the time it runs. */
  resolve(sessionId: string, permissionId: string, approve: boolean): boolean;
  /** 📖 Drops every pending entry for a session without answering them. Used
   *  when the session stops: the harness is gone, so a late approval would be
   *  a write to a dead stdin at best. */
  clearSession(sessionId: string): void;
  /** 📖 Total number of parked requests across all sessions (test aid). */
  pendingCount(): number;
}

/** 📖 Creates an independent queue. The daemon and the dev mirror each hold one
 *  process-wide instance; there is no shared state between them. */
export function createPermissionQueue(): PermissionQueue {
  const bySession = new Map<string, PermissionQueueEntry[]>();

  return {
    push(entry) {
      const stored: PermissionQueueEntry = {
        ...entry,
        permissionId: entry.permissionId ?? `perm_${randomUUID()}`,
      };
      const list = bySession.get(stored.sessionId) ?? [];
      list.push(stored);
      bySession.set(stored.sessionId, list);
      return stored;
    },

    listPending(sessionId) {
      return (bySession.get(sessionId) ?? []).map(entry => ({
        permissionId: entry.permissionId,
        title: entry.title,
        kind: entry.kind,
      }));
    },

    resolve(sessionId, permissionId, approve) {
      const list = bySession.get(sessionId);
      if (!list) return false;
      const index = list.findIndex(entry => entry.permissionId === permissionId);
      if (index === -1) return false;
      const [entry] = list.splice(index, 1);
      if (list.length === 0) bySession.delete(sessionId);
      try {
        entry.respond(approve ? 'allow' : 'reject');
      } catch {
        // 📖 The continuation owns protocol I/O; its failure must not corrupt
        // the queue or surface as a 500 for an answer that was recorded.
      }
      return true;
    },

    clearSession(sessionId) {
      bySession.delete(sessionId);
    },

    pendingCount() {
      let total = 0;
      for (const list of bySession.values()) total += list.length;
      return total;
    },
  };
}
