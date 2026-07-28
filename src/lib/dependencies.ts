/**
 * @file Task dependency resolution and transition gate
 * @description Pure module that owns the single rule for moving tasks between
 * board columns: a task may only enter the configured terminal status (and
 * be archived) when every blocking dependency is resolved. Every interface
 * the task data touches — the web store, the TUI, the CLI, and the MCP
 * server — funnels its transitions through this module, so a gate in one
 * place rules them all (architecture invariant #2: "one rule, one
 * implementation").
 *
 * 📖 **The rule.** A dependency is *resolved* when the referencing task
 * has it marked as `archived: true`, is in the configured terminal status,
 * or does not exist (typos / stale ids never block). A task may be moved
 * freely between non-terminal columns. Moving into the terminal column,
 * or archiving, requires every blocking dependency to be resolved at the
 * moment of the transition. Self-references are ignored. Restoring an
 * archived task (`unarchive`) is a no-op for the gate — the gate fires on
 * the next forward hop.
 *
 * 📖 **Why this is deep.** The interface takes parsed tasks and a
 * destination column; it returns a structured verdict or throws a typed
 * error. Callers no longer rebuild the same `Map<string,boolean>` lookups,
 * filter self-references, or check `archived: true` themselves. Every
 * flavor of transition (web optimistic, TUI keyboard, TUI drag, CLI
 * `kandown move`, MCP `move_task`, cascade loop) goes through the same
 * function. Replacing the storage layer does not touch the policy.
 *
 * 📖 **Architecture.** The module imports nothing from React, the file
 * system, or any node-side runtime — it is pure to its teeth — so it can
 * be unit tested without any harness and reused by every interface
 * without duplication. The thin layer of side effects (write to disk,
 * toast / status message) stays in the caller; this module only decides.
 *
 * @functions
 *  → resolveTransition      — pure verdict for one move / archive
 *  → assertTransitionAllowed — same verdict, throws DependencyGateError
 *  → checkTerminalStatusGate — legacy alias kept for one release
 *  → resolveDependencyStatus — full dep map (sort chip + cascade planning)
 *  → unresolvedDependencyIds — list of unresolved ids for one task
 *  → countUnresolvedDependencies — N for the `↪N` chip
 *  → terminalStatus — getter for the configured terminal column name
 *  → isTerminalStatus / isArchivedStatus — predicates
 *  → movesIntoArchived      — small helper used by callers that archive
 *
 * @exports DependencyGateError, TransitionVerdict, TransitionTaskInput, resolveTransition, assertTransitionAllowed,
 * checkTerminalStatusGate, resolveDependencyStatus, unresolvedDependencyIds,
 * countUnresolvedDependencies, terminalStatus, isTerminalStatus,
 * isArchivedStatus, movesIntoArchived
 * @see src/lib/types.ts
 * @see src/lib/store.ts
 * @see src/cli/lib/board-reader.ts
 */

import type { KandownConfig, ParsedTask } from './types';
import { DEFAULT_CONFIG } from './types';

/** Custom error thrown when a status transition is blocked by an unresolved
 * dependency. Callers catch this in one place and surface a localized
 * message ("Cannot move t1 to Done: blocked by t4, t5"). The exact shape —
 * `taskId`, `blockedBy`, `targetStatus`, `reason` — is part of the
 * interface: tests assert on these to prove every caller agrees. */
export class DependencyGateError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly targetStatus: string,
    public readonly blockedBy: string[],
    public readonly reason: 'unresolved-dependency' | 'not-implemented' = 'unresolved-dependency',
  ) {
    const list = blockedBy.length === 1
      ? blockedBy[0]
      : `${blockedBy.slice(0, -1).join(', ')} and ${blockedBy[blockedBy.length - 1]}`;
    super(`Cannot move ${taskId} to ${targetStatus}: blocked by ${list}`);
    this.name = 'DependencyGateError';
  }
}

/** 📖 Reasons a transition verdict can come back. `'allowed'` is the
 *  boring success case. `'not-implemented'` covers moves that the gate
 *  was never asked to police (free moves between non-terminal columns are
 *  always allowed). Callers handle `'blocked'` by surfacing the error. */
export type TransitionVerdict =
  | { allowed: true; reason: 'allowed' | 'not-implemented' }
  | { allowed: false; reason: 'unresolved-dependency'; blockedBy: string[] };

/** 📖 The minimal shape the gate needs from each task — id, optional
 *  current status, and a `depends_on` list. Derived from `ParsedTask` so
 *  callers don't need to fabricate a full `ParsedTask` for tests. */
export interface TransitionTaskInput {
  id: string;
  status?: string;
  archived?: boolean | string;
  depends_on?: unknown;
}

/** 📖 Looks up the configured terminal column name; falls back to `'Done'`
 *  if the user has no columns configured (matches the DEFAULT_CONFIG). */
export function terminalStatus(config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG): string {
  const cols = config.board.columns;
  return cols[cols.length - 1] ?? 'Done';
}

/** 📖 True when the status is the configured terminal column *or* an
 *  archived status. Archived is treated as terminal-equivalent because
 *  the archive folder/flag invariant means an archived task is "done for
 *  the user's purposes" and should release its dependents. */
export function isTerminalStatus(status: string, config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG): boolean {
  return status === terminalStatus(config)
    || status.toLowerCase() === terminalStatus(config).toLowerCase()
    || isArchivedStatus(status);
}

/** 📖 True when the status string is the literal `"archived"` (case
 *  insensitive), or the task carries `archived: true`. The standalone
 *  helper so callers can distinguish the two reasons (e.g. column
 *  rendering, notifications). */
export function isArchivedStatus(taskOrStatus: { archived?: unknown; status?: unknown } | string | null | undefined, config?: Pick<KandownConfig, 'board'>): boolean {
  if (typeof taskOrStatus === 'string') return taskOrStatus.toLowerCase() === 'archived';
  if (taskOrStatus && typeof taskOrStatus === 'object') {
    const arch = taskOrStatus.archived;
    if (arch === true || arch === 'true') return true;
    const st = typeof taskOrStatus.status === 'string' ? taskOrStatus.status : '';
    if (st && st.toLowerCase() === 'archived') return true;
  }
  return false;
}

/** 📖 Shortcut predicate kept for tests and external clients: does a move
 *  from the current status to `target` count as "archiving the task"?
 *  Returns true when the target is the literal archived flag — this is the
 *  trigger that resolves dependent tasks. Used by the archive action. */
export function movesIntoArchived(targetStatus: string): boolean {
  return targetStatus.toLowerCase() === 'archived';
}

/** 📖 Coerces a `depends_on` frontmatter value — which may be a string,
 *  an array, or junk — into a clean `string[]`. Returns an empty array
 *  on any non-conforming input. Self-references (deps that equal the
 *  task's own id) are filtered out at the same time. */
function normalizeDeps(task: ParsedTask | TransitionTaskInput, taskId: string): string[] {
  const raw = readDeps(task);
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : [];
  const out: string[] = [];
  for (const dep of arr) {
    if (typeof dep !== 'string' || !dep.trim()) continue;
    if (dep === taskId) continue; // self-ref: rule header
    out.push(dep);
  }
  return out;
}

/** 📖 Internal helper: pulls a status string out of either a ParsedTask or
 *  a TransitionTaskInput. Used by callers that walk both shapes (resolveDependencyStatus). */
function readStatus(task: ParsedTask | TransitionTaskInput): string {
  if (typeof (task as TransitionTaskInput).status === 'string') {
    return (task as TransitionTaskInput).status as string;
  }
  const fm = (task as ParsedTask).frontmatter;
  return typeof fm?.status === 'string' ? fm.status : 'Backlog';
}

/** 📖 Internal helper: extracts a `depends_on` array from either shape. */
function readDeps(task: ParsedTask | TransitionTaskInput): unknown {
  if ((task as TransitionTaskInput).depends_on !== undefined) {
    return (task as TransitionTaskInput).depends_on;
  }
  return (task as ParsedTask).frontmatter?.depends_on;
}

/** 📖 Determines whether a single dependency is resolved, given the
 *  snapshot of every task that could supply it. The same logic that
 *  powers `resolveDependencyStatus`, exposed as a helper so archive and
 *  restore flows can reuse it without rebuilding the full map. */
export function isDependencyResolved(
  depId: string,
  snapshot: Map<string, { exists: boolean; resolved: boolean }>,
): boolean {
  const r = snapshot.get(depId);
  if (!r) return true; // unknown id: rule header — never blocks
  return r.resolved;
}

/** 📖 Builds a `taskId → { exists, resolved, title }` map for every id in
 *  the union of `tasks` and their `depends_on` lists. Use this once per
 *  batch (e.g. board reload) and look up by id for O(1) gate checks.
 *
 *  "Resolved" means: the dep is archived, in a terminal status, or
 *  unknown. Archived tasks *must* be passed in — the parser normally
 *  drops them, so the gate lives in one place where the caller can
 *  include both lists.
 *
 *  Parameter shape is permissive: we accept any iterable of `TransitionTaskInput`
 *  so callers don't need a full `ParsedTask` (the CLI's `readTask` already
 *  gives us one, the web store has its richer `BoardTask`, the cascade has
 *  yet another shape). The widening of the parameter is part of the seam:
 *  the policy is the same regardless of which caller supplies the data. */
export function resolveDependencyStatus(
  tasks: Iterable<TransitionTaskInput | ParsedTask>,
  config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG,
): Map<string, { exists: boolean; resolved: boolean; title: string | null }> {
  const byId = new Map<string, TransitionTaskInput | ParsedTask>();
  for (const t of tasks) {
    const id = (t && ((t as { id?: string }).id ?? (t as ParsedTask).frontmatter?.id)) as string | undefined;
    if (id) byId.set(id, t);
  }
  const terminal = terminalStatus(config).toLowerCase();
  const out = new Map<string, { exists: boolean; resolved: boolean; title: string | null }>();
  for (const [id, task] of byId) {
    const status = readStatus(task).toLowerCase();
    const isArch = isArchivedStatus(task as unknown as { archived?: unknown; status?: unknown; frontmatter?: { archived?: unknown; status?: unknown } });
    const fm = (task as ParsedTask).frontmatter;
    const fmArchived = fm ? isArchivedStatus({ archived: fm.archived, status: fm.status }) : false;
    out.set(id, {
      exists: true,
      resolved: isArch || fmArchived || status === terminal,
      title: null,
    });
  }
  for (const task of byId.values()) {
    const taskId = (task as { id?: string }).id ?? (task as ParsedTask).frontmatter?.id ?? '';
    const deps = normalizeDeps(task, taskId);
    for (const dep of deps) {
      if (!out.has(dep)) {
        // 📖 Unknown ids are surfaced for warnings but marked resolved.
        out.set(dep, { exists: false, resolved: true, title: null });
      }
    }
  }
  return out;
}

/** Returns the list of `depends_on` ids that are not yet resolved for the
 * given task. Self-references and unknown ids are filtered. */
export function unresolvedDependencyIds(
  task: ParsedTask | TransitionTaskInput,
  resolution: Map<string, { exists: boolean; resolved: boolean }>,
): string[] {
  const id = (task && (task as { id?: string }).id)
    || (task as ParsedTask).frontmatter?.id
    || '';
  const deps = normalizeDeps(task as TransitionTaskInput, id);
  const out: string[] = [];
  for (const dep of deps) {
    const r = resolution.get(dep);
    if (!r || !r.resolved) out.push(dep);
  }
  return out;
}

export function countUnresolvedDependencies(
  task: ParsedTask | TransitionTaskInput,
  resolution: Map<string, { exists: boolean; resolved: boolean }>,
): number {
  return unresolvedDependencyIds(task, resolution).length;
}

/**
 * 📖 The single deep-API entry point. Decides whether `task` may move to
 * `targetStatus` (or be archived) given a board snapshot.
 *
 * The snapshot must include every task that could possibly be referenced
 * as a dependency — *including archived ones*. Callers that derive the
 * snapshot from `readBoard` need to merge the archive list in (the
 * cascade already does, see `src/cli/lib/cascade.ts`).
 *
 * Returns a structured verdict rather than throwing so async callers can
 * short-circuit synchronously before any UI side-effect. Callers that
 * want the throw-style error use {@link assertTransitionAllowed}.
 */
export function resolveTransition(
  task: ParsedTask | TransitionTaskInput,
  targetStatus: string,
  snapshot: Map<string, { exists: boolean; resolved: boolean }>,
  config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG,
): TransitionVerdict {
  const id = (task && (task as { id?: string }).id)
    || (task as ParsedTask).frontmatter?.id
    || '';
  if (typeof targetStatus !== 'string' || !targetStatus) {
    return { allowed: true, reason: 'not-implemented' };
  }
  const gated = isTerminalStatus(targetStatus, config) || movesIntoArchived(targetStatus);
  if (!gated) {
    return { allowed: true, reason: 'not-implemented' };
  }
  const blocked = unresolvedDependencyIds(task, snapshot);
  if (blocked.length > 0) {
    return { allowed: false, reason: 'unresolved-dependency', blockedBy: blocked };
  }
  return { allowed: true, reason: 'allowed' };
}

/** 📖 Throw-style wrapper for callers that prefer an exception path. Same
 *  decision as {@link resolveTransition} — chosen so existing callers that
 *  catch `DependencyGateError` keep working. */
export function assertTransitionAllowed(
  task: ParsedTask | TransitionTaskInput,
  targetStatus: string,
  snapshot: Map<string, { exists: boolean; resolved: boolean }>,
  config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG,
): void {
  const verdict = resolveTransition(task, targetStatus, snapshot, config);
  if (!verdict.allowed) {
    const taskId = ((task && (task as { id?: string }).id)
      || (task as ParsedTask).frontmatter?.id
      || '');
    throw new DependencyGateError(
      taskId,
      targetStatus,
      verdict.blockedBy,
      verdict.reason,
    );
  }
}

/**
 * 📖 Throws `DependencyGateError` if `task` is being moved to the terminal
 * status while at least one of its dependencies is unresolved. Returns
 * silently (no-op) for any other transition. Kept as a thin alias of
 * {@link assertTransitionAllowed} so callers that built up against the
 * pre-deepening signature stay compiling for one release. The next major
 * bumps: remove, migrate the throw path to `assertTransitionAllowed`, and
 * migrate the return-style callers to `resolveTransition`.
 */
export function checkTerminalStatusGate(
  task: ParsedTask,
  targetStatus: string,
  resolution: Map<string, { exists: boolean; resolved: boolean }>,
  config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG,
): void {
  return assertTransitionAllowed(task, targetStatus, resolution, config);
}
