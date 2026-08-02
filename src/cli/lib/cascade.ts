/**
 * @file Cascade DAG orchestrator (`kandown run`)
 * @description The synchronous task-cascade engine. Given a board, it computes
 * which tasks are *ready* (not done, dependencies resolved, not already in
 * progress), orders them topologically, then drives one of two Ralph-style
 * execution loops:
 *
 *   - **Multi-agent cascade** (default): spawn the agent assigned to each task
 *     in turn, await its exit, re-read the task; when it lands in the terminal
 *     status with a completion report, hand that report to the next agent as
 *     upstream context. Different tasks can use different agents.
 *   - **Same-session cascade** (`cascade.sameSessionChain` or `--same-session`):
 *     build one ordered queue and hand it to a single agent session, which
 *     self-drives through every task — the autonomous "Ralph loop".
 *
 * 📖 "Ready" = not archived, not in the terminal column, all `depends_on`
 * resolved, and (by default) not already "In Progress". `--resume` re-includes
 * In-Progress tasks so a stalled cascade can pick up where it died.
 *
 * 📖 Unassigned tasks (no resolvable agent) are skipped by default and the chain
 * continues; setting `cascade.unassignedBehavior: 'preferred'` (in
 * `.kandown/agents.json`) falls back to the preferred agent instead. An
 * `--agent <id>` override forces one agent for the whole run.
 *
 * 📖 `kandown run <taskId>` scopes the run to that task plus its downstream
 * dependents (transitive reverse `depends_on` closure), so you can fire a
 * single chain without disturbing the rest of the board.
 *
 * @functions
 *  → buildCascadePlan — compute ordered ready tasks + skipped/no-agent lists
 *  → runCascade       — execute the plan (multi-agent or same-session)
 *
 * @exports CascadeTask, CascadePlan, CascadeRunResult, buildCascadePlan, runCascade
 * @see src/cli/commands/run.ts — the `kandown run` command handler
 * @see src/lib/dependencies.ts — dependency resolution reused here
 */

import { listTaskIds, readTask } from './board-reader.js';
import { loadCatalog, resolveAgentEntry, isAgentInstalled, getCascadeConfig, warmupDetection, getAgentById } from './agents.js';
import { runAgentSync } from './launcher.js';
import { resolveColumnNameByRole } from '../../lib/config.js';
import { resolveDependencyStatus, unresolvedDependencyIds, terminalStatus } from '../../lib/dependencies.js';
import { loadConfig, type KandownConfig } from './config.js';
import type { ParsedTask } from '../../lib/types.js';

/** 📖 A task slimmered down to just what the cascade needs. */
export interface CascadeTask {
  id: string;
  title: string;
  status: string;
  assignee?: string;
  priority?: string;
  dependsOn: string[];
}

/** 📖 The cascade's view of the board: what to run, in what order, and what it
 *  deliberately left out (with reasons, for the dry-run / summary print). */
export interface CascadePlan {
  /** Topologically ordered tasks the cascade will launch. */
  order: CascadeTask[];
  /** Ready tasks skipped because they have no resolvable agent. */
  skippedNoAgent: CascadeTask[];
  /** Tasks not ready (unresolved deps) — informational only. */
  blocked: CascadeTask[];
}

/** 📖 Per-task outcome after a multi-agent run. */
export type StepOutcome = 'done' | 'not-done' | 'skipped' | 'failed';

export interface CascadeStep {
  taskId: string;
  agentId?: string;
  outcome: StepOutcome;
  /** Exit code of the agent process, when it ran. */
  exitCode?: number;
  note?: string;
}

/** 📖 Final result of `runCascade`, surfaced to the command handler for printing. */
export interface CascadeRunResult {
  mode: 'multi-agent' | 'same-session';
  steps: CascadeStep[];
  /** Tasks completed (reached terminal status) during this run. */
  completed: string[];
  /** Tasks the agent did not move to Done. */
  incomplete: string[];
}

/** 📖 Options for both planning and running. */
export interface CascadeOptions {
  /** Restrict the run to this task and its transitive downstream dependents. */
  startTaskId?: string;
  /** Force one agent id for every task, overriding per-task assignees. */
  agentOverride?: string;
  /** Re-include tasks already "In Progress" (resume a stalled cascade). */
  includeInProgress?: boolean;
  /** Force same-session mode regardless of the config default. */
  sameSession?: boolean;
  /** Print the plan and exit without launching anything. */
  dryRun?: boolean;
}

/** 📖 Loads every non-archived task as a ParsedTask, keyed by id. */
function loadAllTasks(kandownDir: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  for (const id of listTaskIds(kandownDir)) {
    try {
      const t = readTask(kandownDir, id);
      const archived = String(t.frontmatter.archived) === 'true';
      if (archived) continue;
      tasks.push({ ...t, frontmatter: { ...t.frontmatter, id: t.frontmatter.id || id } });
    } catch (e) {
      console.error(`[kandown] Skipping unreadable task ${id}:`, (e as Error).message);
    }
  }
  return tasks;
}

const PRIORITY_RANK: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

/** 📖 Case-insensitive terminal check. The shared `isTerminalStatus` compares
 *  the status to the configured column name verbatim, but the cascade reads
 *  status back from arbitrary agent output (which may write `done`/`DONE`),
 *  so we compare case-insensitively here. Archived always counts. */
function reachedTerminal(status: string, cfg: KandownConfig): boolean {
  const s = (status || '').trim().toLowerCase();
  if (!s) return false;
  if (s === 'archived') return true;
  return s === terminalStatus(cfg).trim().toLowerCase();
}

/** 📖 Lower priority-number first (P1 < P2), then shorter id (stable, numeric). */
function priorityAndIdKey(t: CascadeTask): string {
  const rank = PRIORITY_RANK[String(t.priority ?? '').toUpperCase()] ?? 99;
  return `${rank.toString().padStart(2, '0')}\t${t.id.padStart(6, '0')}`;
}

/** 📖 Transitive downstream closure of `startId`: every task that (directly or
 *  indirectly) depends on it. Includes `startId` itself. Used to scope a run. */
function downstreamClosure(all: ParsedTask[], startId: string): Set<string> {
  const depsOf = new Map<string, string[]>();
  for (const t of all) depsOf.set(t.frontmatter.id || '', Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on.filter((d): d is string => typeof d === 'string') : []);
  const closure = new Set<string>([startId]);
  let changed = true;
  // 📖 Fixed-point reverse BFS: add any task whose deps intersect the closure.
  while (changed) {
    changed = false;
    for (const t of all) {
      const id = t.frontmatter.id || '';
      if (closure.has(id)) continue;
      const deps = depsOf.get(id) ?? [];
      if (deps.some(d => closure.has(d))) {
        closure.add(id);
        changed = true;
      }
    }
  }
  return closure;
}

/**
 * 📖 Computes the cascade plan: the orderable subgraph in topological order,
 * plus tasks skipped (no agent) or blocked by a dep the cascade itself won't
 * resolve. Does NOT launch anything — safe for dry-runs and previews.
 *
 * 📖 A task is *orderable* when every dependency is either already terminal
 * (Done/archived) or itself a candidate (so topological ordering will run it
 * first). A task whose dep is non-terminal AND not a candidate is *blocked*
 * — the cascade can never unblock it (e.g. an out-of-scope prerequisite), so
 * it's reported but never launched. This is what lets a chain like
 * t2(Todo) → t1(depends_on t2) run: both are candidates, t2 sorts first, and
 * once t2 lands Done the loop reaches t1 with its dep satisfied.
 */
export function buildCascadePlan(kandownDir: string, opts: CascadeOptions = {}): CascadePlan {
  const cfg = loadConfig(kandownDir);

  const all = loadAllTasks(kandownDir);

  // Scope to the downstream subgraph when a start task is given.
  const scope = opts.startTaskId ? downstreamClosure(all, opts.startTaskId) : null;

  const resolution = resolveDependencyStatus(all, cfg);
  const activeStatus = resolveColumnNameByRole(cfg, 'active');

  // Candidates: non-terminal, in scope, not already In Progress (unless resume).
  const candidates: CascadeTask[] = [];
  for (const t of all) {
    const id = t.frontmatter.id || '';
    if (scope && !scope.has(id)) continue;
    const status = (t.frontmatter.status || cfg.board.columns[0]);
    if (reachedTerminal(status, cfg)) continue;
    if (activeStatus && status.toLowerCase() === activeStatus.toLowerCase() && !opts.includeInProgress) continue;
    candidates.push(toCascadeTask(t, cfg.board.columns[0]));
  }

  const candidateIds = new Set(candidates.map(c => c.id));

  // Split orderable vs blocked-by-external-dep. A dep counts as satisfiable if
  // it is resolved (terminal/archived/unknown) OR another candidate.
  const orderable: CascadeTask[] = [];
  const blocked: CascadeTask[] = [];
  for (const t of candidates) {
    const stuckOn = t.dependsOn.find(d => {
      const r = resolution.get(d);
      const resolved = !r || r.resolved; // unknown ids treated as resolved
      return !resolved && !candidateIds.has(d);
    });
    if (stuckOn) blocked.push(t);
    else orderable.push(t);
  }

  // Topological order within the orderable set: a task precedes another if the
  // other depends on it. Priority/id break ties so P1 chains run first.
  const orderableIds = new Set(orderable.map(r => r.id));
  const depsWithin = new Map<string, string[]>();
  for (const r of orderable) {
    depsWithin.set(r.id, r.dependsOn.filter(d => orderableIds.has(d)));
  }
  const orderedIds = topoSort([...orderableIds], depsWithin, orderable);
  const ordered = orderedIds.map(id => orderable.find(r => r.id === id)!).filter(Boolean);

  // Split out tasks with no resolvable+installed agent (unless a preferred
  // fallback or override covers them).
  const cascadeCfg = getCascadeConfig(kandownDir);
  const skippedNoAgent: CascadeTask[] = [];
  const withAgent: CascadeTask[] = [];
  for (const t of ordered) {
    if (resolveAgentFor(t, opts.agentOverride, cascadeCfg.preferred, kandownDir)) {
      withAgent.push(t);
    } else {
      skippedNoAgent.push(t);
    }
  }

  return { order: withAgent, skippedNoAgent, blocked };
}

/** 📖 Picks the agent for a task given override → assignee → preferred rules.
 *  Returns undefined when nothing resolvable+installed matches (→ skip).
 *
 *  📖 The `preferred` fallback only fires for tasks with NO assignee field at
 *  all. A task explicitly handed to a human (e.g. `assignee: vava`) is
 *  respected — the cascade never overrides a deliberate human assignment. */
function resolveAgentFor(
  task: CascadeTask,
  override: string | undefined,
  preferred: string | undefined,
  kandownDir: string,
): string | undefined {
  if (override) {
    return isAgentInstalled(getBinFor(override, kandownDir)) ? override : undefined;
  }
  const byAssignee = task.assignee ? resolveAgentEntry(task.assignee, kandownDir) : undefined;
  if (byAssignee && isAgentInstalled(byAssignee.bin)) return byAssignee.id;
  // preferred fallback only for genuinely unassigned tasks.
  if (!task.assignee) {
    const cascadeCfg = getCascadeConfig(kandownDir);
    if (cascadeCfg.unassignedBehavior === 'preferred' && preferred) {
      return isAgentInstalled(getBinFor(preferred, kandownDir)) ? preferred : undefined;
    }
  }
  return undefined;
}

/** 📖 Looks up a catalog entry's bin by id (so the install check uses the
 *  overridden binary, not a hard-coded one). Falls back to the id itself. */
function getBinFor(agentId: string, kandownDir: string): string {
  return getAgentById(agentId, kandownDir)?.bin ?? agentId;
}

/** 📖 Maps a ParsedTask to the slim CascadeTask shape. */
function toCascadeTask(t: ParsedTask, fallbackStatus: string): CascadeTask {
  return {
    id: t.frontmatter.id || '',
    title: typeof t.frontmatter.title === 'string' ? t.frontmatter.title : '',
    status: (t.frontmatter.status || fallbackStatus),
    ...(typeof t.frontmatter.assignee === 'string' ? { assignee: t.frontmatter.assignee } : {}),
    ...(typeof t.frontmatter.priority === 'string' ? { priority: t.frontmatter.priority } : {}),
    dependsOn: Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on.filter((d): d is string => typeof d === 'string') : [],
  };
}

/**
 * 📖 Kahn's algorithm with a priority/id tiebreaker. `depsWithin[id]` lists the
 * ready ids that must come before `id`. Deterministic output.
 */
function topoSort(ids: string[], depsWithin: Map<string, string[]>, ready: CascadeTask[]): string[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const id of ids) {
    for (const dep of depsWithin.get(id) ?? []) {
      if (!ids.includes(dep)) continue;
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      dependents.get(dep)!.push(id);
    }
  }
  // 📖 Comparator: fewer remaining deps first, then priority/id. Re-sorted each
  // pick so newly-freed tasks slot in by priority rather than insertion order.
  const byTask = new Map(ready.map(r => [r.id, r]));
  const remaining = new Set(ids);
  const out: string[] = [];
  while (remaining.size > 0) {
    const freed = [...remaining].filter(id => (inDegree.get(id) ?? 0) === 0);
    if (freed.length === 0) break; // cycle guard — shouldn't happen (deps resolved)
    freed.sort((a, b) => priorityAndIdKey(byTask.get(a)!).localeCompare(priorityAndIdKey(byTask.get(b)!)));
    const pick = freed[0];
    out.push(pick);
    remaining.delete(pick);
    for (const d of dependents.get(pick) ?? []) inDegree.set(d, (inDegree.get(d) ?? 0) - 1);
  }
  // Any leftover (cycle) appended in priority order so nothing is silently dropped.
  if (remaining.size > 0) {
    out.push(...[...remaining].sort((a, b) => priorityAndIdKey(byTask.get(a)!).localeCompare(priorityAndIdKey(byTask.get(b)!))));
  }
  return out;
}

/**
 * 📖 Executes the cascade. Multi-agent by default (spawn → await → handoff);
 * same-session when `opts.sameSession` or `cascade.sameSessionChain` is set
 * (one agent, full queue). `dryRun` returns the plan without launching.
 *
 * Each completed task's `report:` frontmatter is read back and fed forward as
 * handoff context to the next agent, so a downstream agent inherits what its
 * upstream produced — the core of the DAG pipeline.
 */
export async function runCascade(kandownDir: string, opts: CascadeOptions = {}): Promise<CascadeRunResult> {
  warmupDetection(loadCatalog(kandownDir));
  const plan = buildCascadePlan(kandownDir, opts);

  if (opts.dryRun) {
    return { mode: 'multi-agent', steps: plan.order.map(t => ({ taskId: t.id, outcome: 'skipped', note: 'dry-run' })), completed: [], incomplete: [] };
  }

  const cascadeCfg = getCascadeConfig(kandownDir);
  const sameSession = opts.sameSession ?? cascadeCfg.sameSessionChain;

  if (plan.order.length === 0) {
    return { mode: sameSession ? 'same-session' : 'multi-agent', steps: [], completed: [], incomplete: [] };
  }

  if (sameSession) {
    return runSameSession(kandownDir, plan, opts);
  }
  return runMultiAgent(kandownDir, plan, opts);
}

/** 📖 Multi-agent loop: one process per task, report handoff between them. */
async function runMultiAgent(kandownDir: string, plan: CascadePlan, opts: CascadeOptions): Promise<CascadeRunResult> {
  const cascadeCfg = getCascadeConfig(kandownDir);
  const cfg = loadConfig(kandownDir);
  const steps: CascadeStep[] = [];
  const completed: string[] = [];
  const incomplete: string[] = [];
  const handoff: { taskId: string; title: string; report: string }[] = [];

  for (const task of plan.order) {
    // 📖 Runtime guard: re-resolve deps from a fresh board read before each
    // launch. Topological ordering means a predecessor ran already (or we
    // stopped), but a predecessor could have been skipped (no agent) or
    // failed — in which case this task is still blocked and must be skipped,
    // not launched. Also short-circuits tasks that are already terminal
    // (idempotent re-runs, or an upstream agent that did extra work).
    const fresh = loadAllTasks(kandownDir);
    const freshRes = resolveDependencyStatus(fresh, cfg);
    const tp = fresh.find(x => (x.frontmatter.id || '') === task.id);
    if (tp) {
      const status = (tp.frontmatter.status || '');
      if (reachedTerminal(status, cfg)) {
        steps.push({ taskId: task.id, outcome: 'done', note: 'already terminal' });
        completed.push(task.id);
        const report = typeof tp.frontmatter.report === 'string' ? tp.frontmatter.report : '';
        handoff.push({ taskId: task.id, title: task.title, report });
        continue;
      }
      if (unresolvedDependencyIds(tp, freshRes).length > 0) {
        steps.push({ taskId: task.id, outcome: 'skipped', note: 'dependency not done' });
        incomplete.push(task.id);
        continue;
      }
    }

    const agentId = resolveAgentFor(task, opts.agentOverride, cascadeCfg.preferred, kandownDir);
    if (!agentId) {
      steps.push({ taskId: task.id, outcome: 'skipped', note: 'no resolvable agent' });
      continue;
    }
    try {
      const { exitCode } = await runAgentSync({
        taskId: task.id,
        agentId,
        kandownDir,
        handoff: handoff.length > 0 ? handoff : undefined,
      });
      // Re-read the task to see where the agent left it.
      const after = readTask(kandownDir, task.id);
      const afterStatus = after.frontmatter.status || '';
      const done = reachedTerminal(afterStatus, cfg);
      const report = typeof after.frontmatter.report === 'string' ? after.frontmatter.report : '';
      if (done) {
        steps.push({ taskId: task.id, agentId, outcome: 'done', exitCode });
        completed.push(task.id);
        handoff.push({ taskId: task.id, title: task.title, report });
      } else {
        steps.push({ taskId: task.id, agentId, outcome: 'not-done', exitCode, note: `status is "${afterStatus || 'unknown'}", expected terminal` });
        incomplete.push(task.id);
        // 📖 Stop the chain: a not-done task likely blocks its dependents, and
        // continuing would launch agents on tasks whose prerequisite isn't met.
        break;
      }
    } catch (e) {
      steps.push({ taskId: task.id, agentId, outcome: 'failed', note: (e as Error).message });
      incomplete.push(task.id);
      break;
    }
  }

  return { mode: 'multi-agent', steps, completed, incomplete };
}

/** 📖 Same-session loop: one agent, the whole ordered queue, self-driven. */
async function runSameSession(kandownDir: string, plan: CascadePlan, opts: CascadeOptions): Promise<CascadeRunResult> {
  const cascadeCfg = getCascadeConfig(kandownDir);
  const first = plan.order[0];
  const agentId = opts.agentOverride
    ?? resolveAgentFor(first, undefined, cascadeCfg.preferred, kandownDir)
    ?? cascadeCfg.preferred;
  if (!agentId) {
    return { mode: 'same-session', steps: plan.order.map(t => ({ taskId: t.id, outcome: 'skipped', note: 'no agent for queue' })), completed: [], incomplete: plan.order.map(t => t.id) };
  }

  const queue = plan.order.map(t => ({ id: t.id, title: t.title }));
  try {
    const { exitCode } = await runAgentSync({
      taskId: first.id,
      agentId,
      kandownDir,
      queue,
    });
    // Verify each task landed in the terminal status.
    const cfg = loadConfig(kandownDir);
    const steps: CascadeStep[] = [];
    const completed: string[] = [];
    const incomplete: string[] = [];
    for (const t of plan.order) {
      const after = readTask(kandownDir, t.id);
      const status = after.frontmatter.status || '';
      if (reachedTerminal(status, cfg)) {
        steps.push({ taskId: t.id, agentId, outcome: 'done', exitCode });
        completed.push(t.id);
      } else {
        steps.push({ taskId: t.id, agentId, outcome: 'not-done', exitCode, note: `status is "${status || 'unknown'}"` });
        incomplete.push(t.id);
      }
    }
    return { mode: 'same-session', steps, completed, incomplete };
  } catch (e) {
    return { mode: 'same-session', steps: [{ taskId: first.id, agentId, outcome: 'failed', note: (e as Error).message }], completed: [], incomplete: plan.order.map(t => t.id) };
  }
}
