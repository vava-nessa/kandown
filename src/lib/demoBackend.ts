/**
 * @file In-memory backend for the website demo
 * @description Implements the Kandown REST API against a `Map` instead of a
 * disk, so the whole web UI can run in a browser tab with no CLI, no server and
 * no storage.
 *
 * 📖 **Why this is a REST implementation and not a fake store.** The web app
 * already talks to two backends: the File System Access API (a folder the user
 * picked) and the CLI's REST API (`window.__KANDOWN_ROOT__` is set). Every call
 * of the second kind funnels through one helper — `apiFetch` in
 * `filesystem.ts`. Answering those same requests from memory therefore buys the
 * entire application: board, drawer, editor, search, archive, drag-and-drop,
 * config, and the agent panel all work unmodified, because none of them know
 * where the bytes came from. A hand-written mock store would have to be kept in
 * sync with the real one forever; this cannot drift, because there is nothing
 * to drift from.
 *
 * 📖 **Why memory and not localStorage.** The requirement is that a reload
 * resets the demo. `localStorage` survives reload, so it would need explicit
 * clearing on every boot — the same behaviour with extra failure modes (quota
 * errors, data left behind on the visitor's origin if the clearing code ever
 * throws, bleed between tabs). A module-level `Map` gets the reset for free:
 * reloading re-evaluates this module and the previous state is garbage.
 * Nothing is ever persisted to the visitor's machine.
 *
 * 📖 **The contract.** The routes below mirror `kandownDevPlugin` in
 * `vite.config.ts` and the CLI server in `src/cli/lib/server.ts`. That is three
 * implementations of one protocol, so {@link DEMO_SUPPORTED_ROUTES} names them
 * explicitly and anything unrecognised returns 501 with a readable body rather
 * than failing as a mystery 404.
 *
 * 📖 Routes that are meaningless in a browser — the daemon, the updater, the
 * agent hook — answer honestly rather than pretending. The UI already treats a
 * failed `/api/daemon` as "no daemon", so the "Send to agent" button simply
 * never appears in the demo.
 *
 * @functions
 *  → installDemoBackend — seeds the virtual FS and routes apiFetch into it
 *  → demoApi — the request router; returns real Response objects
 *  → isDemoBuild — narrow helper for UI code that hides CLI-only affordances
 *
 * @exports installDemoBackend, demoApi, DEMO_SUPPORTED_ROUTES
 * @see src/lib/demoSeed.ts
 * @see src/lib/filesystem.ts
 * @see vite.config.ts
 */

import { registerDemoApi } from './filesystem';
import { DependencyGateError, resolveDependencyStatus, resolveTransition } from './dependencies';
import { buildColumnsFromTasks, parseTaskFile } from './parser';
import { serializeTaskFile } from './serializer';
import { stampUpdated } from './task-meta';
import type { KandownConfig, MoveTaskResult, ParsedTask } from './types';
import {
  DEMO_ARCHIVED_TASKS,
  DEMO_BOARD_MD,
  DEMO_CONFIG_JSON,
  DEMO_INSTRUCTIONS,
  DEMO_TASKS,
} from './demoSeed';

/**
 * 📖 The virtual filesystem. `tasks` and `archived` are separate maps because
 * the on-disk layout is two directories, and archive/unarchive is a move
 * between them — modelling it as a flag on one map would let the two get out of
 * step with the `archived:` frontmatter the same way it can on disk.
 */
interface DemoFileSystem {
  config: string;
  board: string;
  instructions: string;
  tasks: Map<string, string>;
  archived: Map<string, string>;
}

let fs: DemoFileSystem | null = null;

function seed(): DemoFileSystem {
  return {
    config: DEMO_CONFIG_JSON,
    board: DEMO_BOARD_MD,
    instructions: DEMO_INSTRUCTIONS,
    tasks: new Map(Object.entries(DEMO_TASKS)),
    archived: new Map(Object.entries(DEMO_ARCHIVED_TASKS)),
  };
}

function vfs(): DemoFileSystem {
  if (!fs) fs = seed();
  return fs;
}

/**
 * 📖 Documented route list. Kept next to the router so a reviewer can compare
 * it against `vite.config.ts` at a glance — the two must describe the same
 * protocol.
 */
export const DEMO_SUPPORTED_ROUTES = [
  'GET/PUT /api/config',
  'GET/PUT /api/board',
  'GET/PUT /api/instructions',
  'GET /api/tasks',
  'GET/PUT/DELETE /api/tasks/:id',
  'POST /api/tasks/:id/move',
  'POST /api/tasks/:id/archive',
  'POST /api/tasks/:id/unarchive',
  'POST /api/migrate-tasks',
] as const;

/* ═════════════ Response helpers ═════════════ */

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 📖 Used for endpoints that exist in the CLI but cannot exist in a browser.
 * 501 rather than 404 so a future reader can tell "deliberately absent" from
 * "route typo". Callers of these endpoints already tolerate failure.
 */
function notImplemented(what: string): Response {
  return json({ error: `${what} is not available in the demo — it needs the Kandown CLI.` }, 501);
}

/**
 * 📖 Request bodies arrive as whatever `apiFetch` was handed. In practice that
 * is always a string, but normalise defensively so a future caller passing a
 * Blob or a stream does not produce a silently empty file.
 */
async function readBody(options?: RequestInit): Promise<string> {
  const body = options?.body;
  if (body == null) return '';
  if (typeof body === 'string') return body;
  return new Response(body as BodyInit).text();
}

/* ═════════════ Router ═════════════ */

/**
 * @description Answers one Kandown API request from the in-memory project.
 * Mirrors the shape of `fetch`, including returning non-OK `Response` objects
 * rather than throwing, so `apiFetch`'s error handling runs unchanged.
 */
export async function demoApi(path: string, options?: RequestInit): Promise<Response> {
  const method = (options?.method ?? 'GET').toUpperCase();
  // 📖 Strip any query string before matching; `/api/events?token=…` is the
  // only caller that adds one today, and it must not match `/api/events`
  // by accident if that route is ever added.
  const [pathname = ''] = path.split('?');
  const parts = pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const [resource, rawId, sub] = parts;
  const id = rawId ? decodeURIComponent(rawId) : undefined;
  const store = vfs();

  /* ── config ── */
  if (resource === 'config' && !id) {
    if (method === 'GET') return text(store.config);
    if (method === 'PUT') {
      const body = await readBody(options);
      try {
        JSON.parse(body);
      } catch (e) {
        return json({ error: `Invalid JSON: ${(e as Error).message}` }, 400);
      }
      store.config = body;
      return json({ ok: true });
    }
  }

  /* ── board ── */
  if (resource === 'board' && !id) {
    if (method === 'GET') return text(store.board);
    if (method === 'PUT') {
      store.board = await readBody(options);
      return json({ ok: true });
    }
  }

  /* ── instructions ── */
  if (resource === 'instructions' && !id) {
    if (method === 'GET') return text(store.instructions);
    if (method === 'PUT') {
      store.instructions = await readBody(options);
      return json({ ok: true });
    }
  }

  /* ── tasks ── */
  if (resource === 'tasks') {
    // 📖 The list includes archived ids, matching the CLI: the board filters
    // them out by reading the `archived:` frontmatter, not by their absence.
    if (method === 'GET' && !id) {
      const ids = [...new Set([...store.tasks.keys(), ...store.archived.keys()])];
      ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return json(ids);
    }

    if (method === 'POST' && id && sub === 'move') {
      let input: { to?: unknown; toIndex?: unknown };
      try {
        input = JSON.parse(await readBody(options)) as { to?: unknown; toIndex?: unknown };
      } catch (error) {
        const result: MoveTaskResult = {
          ok: false,
          kind: 'invalid-target',
          reason: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
        return json(result, 400);
      }
      if (typeof input.to !== 'string' || !input.to.trim()) {
        const result: MoveTaskResult = {
          ok: false,
          kind: 'invalid-target',
          reason: 'Move target is required',
        };
        return json(result, 400);
      }
      if (input.toIndex !== undefined && (typeof input.toIndex !== 'number' || !Number.isFinite(input.toIndex))) {
        const result: MoveTaskResult = {
          ok: false,
          kind: 'invalid-target',
          reason: 'Move target index must be a finite number',
        };
        return json(result, 400);
      }

      const targetStatus = input.to.trim();
      const targetIndex = typeof input.toIndex === 'number' ? input.toIndex : undefined;
      const raw = store.tasks.get(id);
      if (raw === undefined) {
        const result: MoveTaskResult = { ok: false, kind: 'not-found', reason: `Task not found: ${id}` };
        return json(result, 404);
      }
      const config = JSON.parse(store.config) as KandownConfig;
      const toParsedTask = (taskId: string, content: string, archived: boolean): ParsedTask => {
        const parsed = parseTaskFile(content);
        return {
          ...parsed,
          frontmatter: {
            ...parsed.frontmatter,
            id: parsed.frontmatter.id || taskId,
            status: parsed.frontmatter.status || 'Backlog',
            ...(archived ? { archived: true } : {}),
          },
        };
      };
      const activeTasks = [...store.tasks.entries()].map(([taskId, content]) => toParsedTask(taskId, content, false));
      const archivedTasks = [...store.archived.entries()].map(([taskId, content]) => toParsedTask(taskId, content, true));
      const columns = buildColumnsFromTasks([...activeTasks, ...archivedTasks], config.board.columns);
      const sourceColumn = columns.find((column) => column.tasks.some((task) => task.id === id));
      const targetColumn = columns.find((column) => column.name.toLowerCase() === targetStatus.toLowerCase());
      if (!sourceColumn || !targetColumn) {
        const result: MoveTaskResult = {
          ok: false,
          kind: 'invalid-target',
          reason: sourceColumn ? `Unknown status: ${targetStatus}` : `Task is not active: ${id}`,
        };
        return json(result, 400);
      }

      const parsed = parseTaskFile(raw);
      const from = typeof parsed.frontmatter.status === 'string' ? parsed.frontmatter.status : sourceColumn.name;
      const dependencyVerdict = resolveTransition(
        parsed,
        targetColumn.name,
        resolveDependencyStatus([...activeTasks, ...archivedTasks], config),
        config,
      );
      if (!dependencyVerdict.allowed) {
        const error = new DependencyGateError(id, targetColumn.name, dependencyVerdict.blockedBy);
        const result: MoveTaskResult = {
          ok: false,
          kind: 'dependency',
          reason: error.message,
          blockedBy: dependencyVerdict.blockedBy,
        };
        return json(result, 409);
      }

      // 📖 The demo has no Node extension host. Core dependency policy remains
      // active while extension gates intentionally degrade open.
      const sourceIds = sourceColumn.tasks.map((task) => task.id).filter((taskId) => taskId !== id);
      const targetIds = sourceColumn === targetColumn
        ? sourceIds
        : targetColumn.tasks.map((task) => task.id).filter((taskId) => taskId !== id);
      const insertionIndex = targetIndex === undefined
        ? targetIds.length
        : Math.max(0, Math.min(Math.trunc(targetIndex), targetIds.length));
      targetIds.splice(insertionIndex, 0, id);
      const layouts = sourceColumn === targetColumn
        ? [{ status: targetColumn.name, ids: targetIds }]
        : [
            { status: sourceColumn.name, ids: sourceIds },
            { status: targetColumn.name, ids: targetIds },
          ];
      for (const layout of layouts) {
        layout.ids.forEach((taskId, order) => {
          const currentRaw = store.tasks.get(taskId);
          if (currentRaw === undefined) return;
          const current = parseTaskFile(currentRaw);
          store.tasks.set(taskId, serializeTaskFile(stampUpdated({
            ...current.frontmatter,
            id: taskId,
            status: layout.status,
            order,
          }), current.body));
        });
      }
      const result: MoveTaskResult = {
        ok: true,
        from,
        to: targetColumn.name,
        failedIds: [],
      };
      return json(result);
    }

    if (id && !sub) {
      if (method === 'GET') {
        const content = store.tasks.get(id) ?? store.archived.get(id);
        if (content === undefined) return text('Task not found', 404);
        return text(content);
      }
      if (method === 'PUT') {
        const body = await readBody(options);
        // 📖 Write in place: editing an archived task must not resurrect it
        // onto the board. Same rule as the CLI's PUT handler.
        if (store.archived.has(id)) store.archived.set(id, body);
        else store.tasks.set(id, body);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        store.tasks.delete(id);
        store.archived.delete(id);
        return json({ ok: true });
      }
    }

    // 📖 Archive / unarchive. The caller has already toggled the `archived:`
    // frontmatter in the body it sends; our job is only the move.
    if (method === 'POST' && id && (sub === 'archive' || sub === 'unarchive')) {
      const archiving = sub === 'archive';
      const from = archiving ? store.tasks : store.archived;
      const to = archiving ? store.archived : store.tasks;
      const body = await readBody(options);
      to.set(id, body || from.get(id) || '');
      from.delete(id);
      return json({ ok: true });
    }
  }

  /* ── migration: nothing to migrate, and saying so keeps startup silent ── */
  if (resource === 'migrate-tasks' && method === 'POST') {
    return json({ moved: 0, cleanedUp: false, skipped: true });
  }

  /* ── CLI-only surfaces ── */
  if (resource === 'daemon') return notImplemented('The daemon');
  if (resource === 'update') return notImplemented('Updating');
  if (resource === 'events') return notImplemented('File watching');
  if (resource === 'tasks' && sub === 'agent') return notImplemented('The agent hook');

  return json({ error: `No demo route for ${method} ${pathname}` }, 501);
}

/**
 * @description Seeds the virtual project and points `apiFetch` at it. Call once,
 * before React mounts, so no component can fire a request into a null backend.
 *
 * 📖 Idempotent: calling it twice keeps the existing state rather than wiping
 * the visitor's edits, which matters under React StrictMode double-invocation.
 */
export function installDemoBackend(): void {
  vfs();
  registerDemoApi(demoApi);
}

/**
 * 📖 Resets the demo to its seeded state without a page reload. Not wired to
 * any UI yet — exposed because the obvious next feature is a "reset" button in
 * the demo chrome, and because it makes the reset path testable.
 */
export function resetDemoBackend(): void {
  fs = seed();
}
