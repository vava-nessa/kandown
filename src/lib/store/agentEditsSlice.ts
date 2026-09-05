/**
 * @file Zustand store slice: live agent edit presence (t309)
 * @description Makes agent edits visible on the board: tracks which task each
 * agent session is currently editing (border beam + blobatar), keeps the
 * latest before/after diff per task (live diff panel in the editor shells) and
 * queues harness permission requests (fixed bottom-right approval stack).
 *
 * 📖 Transport: the four board SSE events (`agent_edit_started`,
 * `agent_edit_ended`, `task_diff`, `agent_permission`) are parsed and narrowed
 * by src/lib/watcher.ts on the shared `/api/events` stream; this slice
 * subscribes through {@link setupAgentEdits}, which the store's setupWatcher
 * calls in every mode. It also starts the stream itself in server mode, where
 * nothing else opens the board EventSource.
 *
 * 📖 HTTP: the two permission routes have no helper in filesystem.ts (frozen
 * for this task), so the slice performs them directly with the same auth the
 * shared rawApiFetch uses: the `X-Kandown-Token` header from
 * window.__KANDOWN_TOKEN__. Never throws; failures surface as toasts and roll
 * the optimistic removal back.
 *
 * 📖 Pure core: the event fold ({@link applyAgentEditsEvent}), the permission
 * queue helpers and the dependency-free line diff ({@link computeLineDiff},
 * rendered by the DiffOverlay component) are pure and unit-tested in
 * src/lib/__tests__/agent-edits.spec.ts.
 *
 * @functions
 *  → createInitialAgentEditsState: empty agentEdits state
 *  → createAgentEditsSlice: SSE wiring, pending-permission fetch, resolve
 *  → applyAgentEditsEvent: fold one board event into the state (pure)
 *  → mergePermissions / withoutPermission / restorePermissions: queue helpers (pure)
 *  → pruneDiffs: keep the 20 most recently touched task diffs (pure)
 *  → computeLineDiff: LCS-free line diff with collapsed context (pure)
 *
 * @exports AgentEditsSlice, createAgentEditsSlice, createInitialAgentEditsState,
 * applyAgentEditsEvent, mergePermissions, withoutPermission, restorePermissions,
 * pruneDiffs, computeLineDiff, DiffRow
 * @see src/lib/watcher.ts: the SSE parsing + type guards
 * @see src/lib/store/types.ts: AgentEditsState shape
 * @see src/components/agent/DiffOverlay.tsx: renders computeLineDiff output
 */

import type { StateCreator } from 'zustand';
import { fileWatcher } from '../watcher';
import type { AgentEditsBoardEvent } from '../watcher';
import type { State, AgentEditsState, AgentEditDiff, AgentPermissionRequest } from './types';

/** 📖 Diffs kept per task. Old task ids fall off the tail so a long session
 * writing many tasks cannot grow the store without bound. */
const MAX_DIFFS = 20;

/* ═════════════ Transport helpers ═════════════ */

function daemonToken(): string | null {
  return typeof window !== 'undefined' && typeof window.__KANDOWN_TOKEN__ === 'string'
    ? window.__KANDOWN_TOKEN__
   : null;
}

/**
 * 📖 POST helper for the permission routes filesystem.ts does not cover.
 * Mirrors rawApiFetch's transport: JSON body + token header, never throws.
 */
async function agentApiPost(path: string, body: unknown): Promise<Response | null> {
  const token = daemonToken();
  try {
    return await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Kandown-Token': token } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

/* ═════════════ Pure state transitions ═════════════ */

/**
 * 📖 Folds one board agent-edit event into the agentEdits state. Pure: the
 * input state is never mutated. Tolerates replays: an `agent_edit_ended` from
 * a stale session never clears a newer session's edit, and a repeated
 * `agent_permission` for the same permissionId is ignored.
 */
export function applyAgentEditsEvent(state: AgentEditsState, event: AgentEditsBoardEvent): AgentEditsState {
  switch (event.type) {
    case 'agent_edit_started': {
      // 📖 A second session taking over the same task simply replaces the
      // first: the UI keys presence per task, one edit at a time.
      return {
        ...state,
        edits: {
          ...state.edits,
          [event.taskId]: { sessionId: event.sessionId, harnessId: event.harnessId, since: event.at },
        },
      };
    }
    case 'agent_edit_ended': {
      const current = state.edits[event.taskId];
      if (!current || current.sessionId !== event.sessionId) return state;
      const edits = { ...state.edits };
      delete edits[event.taskId];
      return { ...state, edits };
    }
    case 'task_diff': {
      const diffs = { ...state.diffs };
      // 📖 Delete before assign: JS objects keep a key's original insertion
      // position on overwrite, and recency ordering is what pruneDiffs relies on.
      delete diffs[event.taskId];
      diffs[event.taskId] = {
        before: event.before,
        after: event.after,
        truncated: event.truncated,
        path: event.path,
        at: event.at,
      };
      return { ...state, diffs: pruneDiffs(diffs) };
    }
    case 'agent_permission': {
      const permissions = mergePermissions(state.permissions, [{
        sessionId: event.sessionId,
        permissionId: event.permissionId,
        title: event.title,
        kind: event.kind,
        at: event.at,
      }]);
      if (permissions === state.permissions) return state;
      return { ...state, permissions };
    }
  }
}

/** 📖 Appends permission requests that are not queued yet, keyed by
 * permissionId. Existing entries are kept untouched so a replayed event never
 * refreshes an older request's position. Pure. */
export function mergePermissions(current: AgentPermissionRequest[], incoming: AgentPermissionRequest[]): AgentPermissionRequest[] {
  const known = new Set(current.map(request => request.permissionId));
  const additions = incoming.filter(request => !known.has(request.permissionId));
  return additions.length === 0 ? current : [...current, ...additions];
}

/** 📖 Removes one request by permissionId. Returns the same reference when
 * nothing matched, so callers can set state without churn. Pure. */
export function withoutPermission(current: AgentPermissionRequest[], permissionId: string): AgentPermissionRequest[] {
  const next = current.filter(request => request.permissionId !== permissionId);
  return next.length === current.length ? current : next;
}

/** 📖 Restores requests from a pre-optimistic-removal snapshot that are still
 * missing (by permissionId), keeping current entries in place. Used when the
 * resolve POST fails and the card must come back. Pure. */
export function restorePermissions(current: AgentPermissionRequest[], snapshot: AgentPermissionRequest[]): AgentPermissionRequest[] {
  const present = new Set(current.map(request => request.permissionId));
  const missing = snapshot.filter(request => !present.has(request.permissionId));
  return missing.length === 0 ? current : [...current, ...missing];
}

/** 📖 Keeps at most `max` diffs, dropping the oldest task ids first (JS
 * objects preserve insertion order, and applyAgentEditsEvent refreshes the
 * position of every updated task). Pure. */
export function pruneDiffs(diffs: Record<string, AgentEditDiff>, max: number = MAX_DIFFS): Record<string, AgentEditDiff> {
  const ids = Object.keys(diffs);
  if (ids.length <= max) return diffs;
  const dropped = new Set(ids.slice(0, ids.length - max));
  const next: Record<string, AgentEditDiff> = {};
  for (const [id, diff] of Object.entries(diffs)) {
    if (!dropped.has(id)) next[id] = diff;
  }
  return next;
}

/* ═════════════ Line diff (pure, rendered by DiffOverlay) ═════════════ */

/** 📖 One rendered row of the live diff. `collapsed` marks hidden runs of
 * unchanged context; `text` then carries a placeholder glyph. */
export interface DiffRow {
  kind: 'same' | 'removed' | 'added' | 'collapsed';
  text: string;
}

/**
 * 📖 LCS-free line diff: strips the common prefix and suffix, then reports the
 * remaining middle as removed lines followed by added lines. Up to
 * `contextSize` unchanged lines are kept around the change; longer unchanged
 * runs collapse into a single marker row. Reads top to bottom, good enough to
 * follow what the agent just wrote, and deterministic. Pure.
 */
export function computeLineDiff(before: string, after: string, contextSize: number = 2): DiffRow[] {
  const a = before.length > 0 ? before.split('\n') : [];
  const b = after.length > 0 ? after.split('\n') : [];

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

  const removed = a.slice(prefix, a.length - suffix);
  const added = b.slice(prefix, b.length - suffix);
  if (removed.length === 0 && added.length === 0) return [];

  const rows: DiffRow[] = [];

  // Leading context: the tail of the common prefix.
  const leadStart = Math.max(0, prefix - contextSize);
  if (leadStart > 0) rows.push({ kind: 'collapsed', text: '···' });
  for (let i = leadStart; i < prefix; i++) rows.push({ kind: 'same', text: a[i] ?? '' });

  for (const line of removed) rows.push({ kind: 'removed', text: line });
  for (const line of added) rows.push({ kind: 'added', text: line });

  // Trailing context: the head of the common suffix.
  const trailEnd = Math.min(suffix, contextSize);
  for (let i = 0; i < trailEnd; i++) rows.push({ kind: 'same', text: b[b.length - suffix + i] ?? '' });
  if (trailEnd < suffix) rows.push({ kind: 'collapsed', text: '···' });

  return rows;
}

/* ═════════════ Pending permissions payload guard ═════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

interface PendingPermissionsPayload {
  permissions: Array<{ permissionId: string; title: string; kind: string }>;
}

/** 📖 Narrows the GET .../pending body without casting. Malformed payloads
 * are ignored (the queue simply stays as-is). */
function isPendingPermissionsPayload(value: unknown): value is PendingPermissionsPayload {
  if (!isRecord(value) || !Array.isArray(value.permissions)) return false;
  return value.permissions.every(item =>
    isRecord(item) && isString(item.permissionId) && isString(item.title) && isString(item.kind)
  );
}

/* ═════════════ Slice ═════════════ */

export interface AgentEditsSlice {
  setupAgentEdits: State['setupAgentEdits'];
  ingestAgentEditEvent: State['ingestAgentEditEvent'];
  fetchPendingPermissions: State['fetchPendingPermissions'];
  dismissPermission: State['dismissPermission'];
  resolvePermission: State['resolvePermission'];
}

/** 📖 Initial `agentEdits` state, seeded into the store by store.ts next to
 * the spread slice (the slice itself only carries the actions). */
export function createInitialAgentEditsState(): AgentEditsState {
  return {
    edits: {},
    diffs: {},
    permissions: [],
  };
}

/** 📖 Sessions whose pending permission list was already fetched after an
 * edit_started, so one streaming session cannot trigger a fetch per event.
 * Module state: UI-only dedupe, safe to grow (bounded by sessions per page). */
const fetchedPendingSessions = new Set<string>();

/** 📖 Page-level rehydrate runs once per page load, on the first board load. */
let rehydratedOnce = false;

/** 📖 Unsubscribers from the previous setupAgentEdits call. setupWatcher can
 * run again (project reopen) without fileWatcher.stop() in server mode, so
 * re-subscribing must first remove the previous handlers to stay idempotent. */
let eventUnsubscribers: Array<() => void> = [];

export const createAgentEditsSlice: StateCreator<State, [], [], AgentEditsSlice> = (set, get) => ({
  setupAgentEdits: () => {
    const ingest = (event: AgentEditsBoardEvent): void => { get().ingestAgentEditEvent(event); };
    // 📖 Re-subscribe on every setupWatcher call: fileWatcher.stop() (local
    // project reopen) clears ALL listeners, and the server branch never stops,
    // so drop any previous subscription first, then attach fresh handlers.
    eventUnsubscribers.forEach(off => off());
    eventUnsubscribers = [
      fileWatcher.on('agentEditStarted', ingest),
      fileWatcher.on('agentEditEnded', ingest),
      fileWatcher.on('taskDiff', ingest),
      fileWatcher.on('agentPermission', ingest),
    ];
    // 📖 In server mode nothing else opens the board EventSource: start it
    // here. Idempotent, and a no-op outside server mode.
    fileWatcher.startServerSse();
    // 📖 Page-level rehydrate: fetch pending permissions once for sessions the
    // sidebar already knows are live. Usually a no-op on first load (the
    // sidebar is empty); the edit_started fetch below covers the live case.
    if (!rehydratedOnce) {
      rehydratedOnce = true;
      for (const [sessionId, session] of Object.entries(get().agentChat.live)) {
        if (session.status === 'running') void get().fetchPendingPermissions(sessionId);
      }
    }
  },

  ingestAgentEditEvent: (event) => {
    set(state => ({ agentEdits: applyAgentEditsEvent(state.agentEdits, event) }));
    // 📖 First time a session starts editing, ask the daemon what it is already
    // waiting on: the SSE permission event may have been emitted before this
    // page connected, and the board stream does not replay history.
    if (event.type === 'agent_edit_started' && !fetchedPendingSessions.has(event.sessionId)) {
      fetchedPendingSessions.add(event.sessionId);
      void get().fetchPendingPermissions(event.sessionId);
    }
  },

  fetchPendingPermissions: async (sessionId) => {
    const token = daemonToken();
    try {
      const res = await fetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}/pending`, {
        headers: token ? { 'X-Kandown-Token': token } : undefined,
      });
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (!isPendingPermissionsPayload(data)) return;
      const now = new Date().toISOString();
      set(state => ({
        agentEdits: {
          ...state.agentEdits,
          permissions: mergePermissions(
            state.agentEdits.permissions,
            data.permissions.map(request => ({
              sessionId,
              permissionId: request.permissionId,
              title: request.title,
              kind: request.kind,
              at: now,
            })),
          ),
        },
      }));
    } catch {
      // Daemon unreachable: nothing to queue, the next edit_started retries.
    }
  },

  dismissPermission: (permissionId) => {
    set(state => ({
      agentEdits: {
        ...state.agentEdits,
        permissions: withoutPermission(state.agentEdits.permissions, permissionId),
      },
    }));
  },

  resolvePermission: async (sessionId, permissionId, approve) => {
    // 📖 Optimistic removal: the card disappears at once. On failure the exact
    // pre-removal requests are restored (merge-style, so events that landed in
    // between are kept) and a toast explains what happened.
    const snapshot = get().agentEdits.permissions;
    set(state => ({
      agentEdits: {
        ...state.agentEdits,
        permissions: withoutPermission(state.agentEdits.permissions, permissionId),
      },
    }));
    const res = await agentApiPost(
      `/api/agent/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}/resolve`,
      { approve },
    );
    if (!res || !res.ok) {
      set(state => ({
        agentEdits: {
          ...state.agentEdits,
          permissions: restorePermissions(state.agentEdits.permissions, snapshot),
        },
      }));
      get().toast('Could not reach the daemon: the permission request was restored.', 'error');
    }
  },
});
