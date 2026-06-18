/**
 * @file Task dependency resolution and enforcement
 * @description Resolves `depends_on` references between tasks and enforces the
 * terminal-status gate: a task cannot be moved to the last board column
 * (default: "Done") while any of its dependencies is not yet in the
 * terminal status. This mirrors how GitHub / Linear / Jira treat blocking
 * relations — free transitions everywhere, gate only on the final hop.
 *
 * 📖 The gate is on `board.columns[columns.length - 1]`, NOT on a hardcoded
 * "Done" string. The default config ends in "Done" but the user can rename
 * it via `kandown.json` → `board.columns`.
 *
 * 📖 Archived tasks (`status: archived` or `archived: true`) count as
 * resolved. Rationale: archiving a task is the user's "I'm done with this,
 * stop holding up the chain" gesture, so it should release dependents.
 *
 * 📖 Self-references and unknown ids in `depends_on` are silently ignored
 * (treated as resolved). Reason: a typo or stale id should not block
 * progress forever; the UI surfaces unknown deps as a warning so the user
 * can fix the frontmatter, but the gate does not deadlock.
 *
 * @functions
 *  → resolveDependencyStatus — full map of dep id → is it resolved?
 *  → unresolvedDependencyIds — list of unresolved dep ids for one task
 *  → countUnresolvedDependencies — number N for the `↪N` chip
 *  → checkTerminalStatusGate — throws if a task can't move to terminal status
 *  → terminalStatus — getter for the configured terminal status
 *  → isTerminalStatus — predicate: is this status the configured terminal one?
 *
 * @exports resolveDependencyStatus, unresolvedDependencyIds, countUnresolvedDependencies, checkTerminalStatusGate, terminalStatus, isTerminalStatus, DependencyGateError
 * @see src/lib/types.ts
 * @see src/lib/store.ts
 */

import type { KandownConfig, ParsedTask } from './types';
import { DEFAULT_CONFIG } from './types';

/** Custom error thrown when a status transition is blocked by an unresolved
 * dependency. Callers can `catch (e) { if (e instanceof DependencyGateError) ... }`
 * to surface a helpful message instead of a generic "invalid transition". */
export class DependencyGateError extends Error {
  constructor(public readonly taskId: string, public readonly blockedBy: string[]) {
    const list = blockedBy.length === 1
      ? blockedBy[0]
      : `${blockedBy.slice(0, -1).join(', ')} and ${blockedBy[blockedBy.length - 1]}`;
    super(`Cannot move ${taskId} to terminal status: blocked by ${list}`);
    this.name = 'DependencyGateError';
  }
}

export function terminalStatus(config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG): string {
  const cols = config.board.columns;
  return cols[cols.length - 1] ?? 'Done';
}

export function isTerminalStatus(status: string, config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG): boolean {
  return status === terminalStatus(config) || status.toLowerCase() === 'archived';
}

/**
 * 📖 Builds a `taskId → { exists, resolved, title }` map for every id in
 * the union of `tasks` and their `depends_on` lists. Use this once per
 * batch (e.g. board reload) and look up by id for O(1) gate checks.
 *
 * "Resolved" means: the dep is archived, in a terminal status, or unknown
 * (typos / stale ids never block — see file header).
 */
export function resolveDependencyStatus(
  tasks: ParsedTask[],
  config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG,
): Map<string, { exists: boolean; resolved: boolean; title: string | null }> {
  const byId = new Map<string, ParsedTask>();
  for (const t of tasks) {
    const id = (t.frontmatter && t.frontmatter.id) || '';
    if (id) byId.set(id, t);
  }
  const terminal = terminalStatus(config).toLowerCase();
  const out = new Map<string, { exists: boolean; resolved: boolean; title: string | null }>();
  for (const [id, task] of byId) {
    const status = (task.frontmatter.status || 'Backlog').toLowerCase();
    const isArchived = String(task.frontmatter.archived) === 'true';
    out.set(id, {
      exists: true,
      resolved: isArchived || (typeof status === 'string' && status === terminal),
      title: (typeof task.frontmatter.title === 'string' ? task.frontmatter.title : null),
    });
  }
  // 📖 Surface unknown ids from `depends_on` so the UI can warn — but mark
  // them as resolved so they don't block the gate.
  for (const t of tasks) {
    const deps = Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on : [];
    for (const dep of deps) {
      if (typeof dep !== 'string' || !dep.trim()) continue;
      if (!out.has(dep)) out.set(dep, { exists: false, resolved: true, title: null });
    }
  }
  return out;
}

/** Returns the list of `depends_on` ids that are not yet resolved for the
 * given task. Self-references are filtered out. */
export function unresolvedDependencyIds(
  task: ParsedTask,
  resolution: Map<string, { exists: boolean; resolved: boolean }>,
): string[] {
  const deps = Array.isArray(task.frontmatter.depends_on) ? task.frontmatter.depends_on : [];
  const out: string[] = [];
  for (const dep of deps) {
    if (typeof dep !== 'string' || !dep.trim()) continue;
    if (dep === task.frontmatter.id) continue;
    const r = resolution.get(dep);
    if (!r || !r.resolved) out.push(dep);
  }
  return out;
}

export function countUnresolvedDependencies(
  task: ParsedTask,
  resolution: Map<string, { exists: boolean; resolved: boolean }>,
): number {
  return unresolvedDependencyIds(task, resolution).length;
}

/**
 * 📖 Throws `DependencyGateError` if `task` is being moved to the terminal
 * status while at least one of its dependencies is unresolved. Returns
 * silently (no-op) for any other transition. Use this from the store
 * BEFORE writing the file.
 */
export function checkTerminalStatusGate(
  task: ParsedTask,
  targetStatus: string,
  resolution: Map<string, { exists: boolean; resolved: boolean }>,
  config: Pick<KandownConfig, 'board'> = DEFAULT_CONFIG,
): void {
  if (!isTerminalStatus(targetStatus, config)) return;
  const blocked = unresolvedDependencyIds(task, resolution);
  if (blocked.length > 0) {
    throw new DependencyGateError(task.frontmatter.id || '', blocked);
  }
}
