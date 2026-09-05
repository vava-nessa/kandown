/**
 * @file Autopilot orchestrator: the daemon-side task loop over harness sessions
 * @description Owns the "who works next" half of autopilot (t311). One
 * orchestrator per daemon process watches the board through the task files
 * (never a copy of them: task state lives in tasks/*.md and nowhere else),
 * keeps up to `agent.autopilot.maxParallel` harness sessions busy, and
 * broadcasts an `agent_autopilot` snapshot on the board SSE channel at every
 * pivot (start, stop, dispatch, session finish, budget stop, orphan
 * detection).
 *
 * 📖 Division of labor: the orchestrator NEVER writes task files. Readiness
 * and completion reports are read from disk via the board reader; column
 * moves belong to the harness sessions themselves, which work through the
 * normal CLI/file gates (including the shared dependency gate). On a
 * session's `stopped` event the task file is read back: a task that reached
 * the terminal column with a report is completed-for-this-run and its report
 * becomes cascade handoff context for the next dispatched session; anything
 * else is left untouched for the human (surfaced through the orphans rule,
 * never re-queued automatically mid-run).
 *
 * 📖 Readiness reuses the shared dependency helpers (resolveDependencyStatus
 * plus terminalStatus) so the gate that rules the board rules the queue too.
 * Orphans are the crash-recovery surface: a task sitting in a non-terminal,
 * non-backlog column with no live autopilot session and no queue slot is
 * listed as an orphan, and at run start orphans are re-queued FIRST (files
 * are the truth: a task in progress without a session is resumable).
 *
 * 📖 Budgets: usage events accumulate per session and for the whole run;
 * `budgetDecision` turns the configured caps into one of three verdicts and
 * the orchestrator stops the offending session, or the whole run, when a cap
 * is exceeded. Totals reset on the next start.
 *
 * @functions
 *  → computeReadyTasks     : pure readiness filter (terminal, deps, live, queued)
 *  → orderQueue            : priority first (P1), then id, board-digest style
 *  → computeOrphanTaskIds  : non-terminal non-backlog tasks with no live session
 *  → budgetDecision        : none | stop-session | stop-run from caps and totals
 *  → extractHandoff        : completion report of a terminal task, for cascade
 *  → buildAutopilotPrompt  : handoff block + compiled work doc + directives
 *  → createOrchestrator    : the daemon-side instance (start/stop/snapshot/dispose)
 *
 * @exports AutopilotTaskInput, AutopilotHandoff, AutopilotTotals, AutopilotCaps, AutopilotSnapshotConfig, AutopilotActiveEntry, AutopilotSnapshot, BudgetDecision, AutopilotBroadcaster, AutopilotEventSubscriber, AutopilotSessionFactory, AutopilotSessionStopper, AutopilotWorkCompiler, AutopilotOrchestratorOptions, AutopilotOrchestrator, AUTOPOLL_INTERVAL_MS, MIN_PARALLEL, MAX_PARALLEL, computeReadyTasks, orderQueue, computeOrphanTaskIds, budgetDecision, extractHandoff, buildAutopilotPrompt, createOrchestrator
 * @see src/cli/lib/agent/agent-runtime.ts: the sessions this module drives
 * @see src/lib/dependencies.ts: the shared gate readiness is built on
 * @see src/cli/lib/server.ts: the /api/agent/autopilot endpoints and wiring
 */

import type { AgentEvent, AgentSessionConfig, AgentSessionInfo, AgentUsageTotals } from './types.js';
import type { AutopilotConfig, KandownConfig } from '../../../lib/types.js';
import { resolveColumnNameByRole } from '../../../lib/config.js';
import { resolveDependencyStatus, terminalStatus, unresolvedDependencyIds } from '../../../lib/dependencies.js';
import { listTaskIds, readTask } from '../board-reader.js';
import { loadConfig } from '../config.js';
import { compileProjectKandownWork } from '../kandown-work.js';
import { createAgentSession, stopAgentSession, subscribeAgentSession } from './agent-runtime.js';
import { HARNESS_DEFS, resolveHarness } from './detect.js';

/** 📖 How often the running orchestrator polls the board for newly ready work
 *  and freshly orphaned tasks. Pure readFile work, cheap at this cadence. */
export const AUTOPOLL_INTERVAL_MS = 5000;

/** 📖 Parallelism bounds mirrored from the config normalizer; both sides
 *  clamp so a runtime value can never escape 1..8. */
export const MIN_PARALLEL = 1;
export const MAX_PARALLEL = 8;

/** 📖 Minimal task view the orchestrator reasons about. Matches the shared
 *  TransitionTaskInput shape (top-level status and depends_on) so readiness
 *  can flow straight through the shared dependency helpers. */
export interface AutopilotTaskInput {
  id: string;
  status: string;
  priority?: string;
  depends_on?: unknown;
  archived?: boolean | string;
}

/** 📖 One finished task of the current run, kept as cascade handoff context:
 *  id, title and the completion report read back from the task file. */
export interface AutopilotHandoff {
  id: string;
  title: string;
  report: string;
}

export type AutopilotTotals = AgentUsageTotals;

/** 📖 The optional budget caps; any cap left undefined means unlimited. */
export interface AutopilotCaps {
  sessionTokenCap?: number;
  sessionCostCapUsd?: number;
  runTokenCap?: number;
  runCostCapUsd?: number;
}

/** 📖 Config block exactly as it appears in endpoint snapshots and SSE
 *  events: always a number for maxParallel, caps present only when set. */
export interface AutopilotSnapshotConfig extends AutopilotCaps {
  maxParallel: number;
}

/** 📖 One running (taskId, sessionId) pair. */
export interface AutopilotActiveEntry {
  taskId: string;
  sessionId: string;
}

/** 📖 The frozen GET/POST response shape the web UI codes against. */
export interface AutopilotSnapshot {
  state: 'idle' | 'running';
  harnessId?: string;
  active: AutopilotActiveEntry[];
  queue: string[];
  orphans: string[];
  totals: AutopilotTotals;
  config: AutopilotSnapshotConfig;
}

export type BudgetDecision = 'none' | 'stop-session' | 'stop-run';

/** 📖 Broadcast contract (frozen, the UI codes against these keys):
 *  agent_autopilot { state, active, queue, orphans, totals: { tokens, costUsd }, at }. */
export type AutopilotBroadcaster = (event: Record<string, unknown>) => void;

/** 📖 Injectable runtime subscription, so tests drive session events without
 *  spawning a harness. Defaults to subscribeAgentSession. */
export type AutopilotEventSubscriber = (
  sessionId: string,
  listener: (event: AgentEvent) => void,
) => (() => void) | null;

/** 📖 Injectable session factory. Defaults to createAgentSession. */
export type AutopilotSessionFactory = (config: AgentSessionConfig) => AgentSessionInfo;

/** 📖 Injectable session stopper. Defaults to stopAgentSession. */
export type AutopilotSessionStopper = (sessionId: string) => boolean;

/** 📖 Injectable work compiler. Defaults to compileProjectKandownWork. */
export type AutopilotWorkCompiler = (kandownDir: string, taskId?: string) => { markdown: string };

/** 📖 Injectable harness installation check. Defaults to the catalog's
 *  resolveHarness (id known AND binary on PATH). Tests inject a constant. */
export type AutopilotHarnessProbe = (harnessId: string) => boolean;

export interface AutopilotOrchestratorOptions {
  /** Board SSE sink. Default: a no-op (tests, embedders). */
  broadcast?: AutopilotBroadcaster;
  /** Runtime event subscription. Default: subscribeAgentSession. */
  subscribe?: AutopilotEventSubscriber;
  /** Harness session factory. Default: createAgentSession. */
  createSession?: AutopilotSessionFactory;
  /** Harness session stopper. Default: stopAgentSession. */
  stopSession?: AutopilotSessionStopper;
  /** Work document compiler. Default: compileProjectKandownWork. */
  compileWork?: AutopilotWorkCompiler;
  /** Harness installation probe. Default: catalog resolveHarness. */
  isHarnessInstalled?: AutopilotHarnessProbe;
  /** Poll interval override (tests use small values). Default 5000 ms. */
  pollIntervalMs?: number;
}

export interface AutopilotOrchestrator {
  /** 📖 Starts a run: resolves the harness (override, else the preferred or
   *  first installed one), re-queues orphans first, queues every ready task,
   *  and dispatches up to maxParallel. Throws when no harness is installed
   *  (the endpoint maps that to a 400). Idempotent while already running. */
  start(harnessId?: string): AutopilotSnapshot;
  /** 📖 Stops the run: every active session is stopped through the runtime,
   *  the queue is emptied, state goes idle. Totals stay on the snapshot and
   *  reset on the next start. */
  stop(): AutopilotSnapshot;
  /** 📖 Current snapshot; recomputes orphans from the task files on every
   *  call. Never throws for board-level problems (unreadable tasks are
   *  skipped with a console warning). */
  snapshot(): AutopilotSnapshot;
  /** 📖 Clears the poll timer, unsubscribes and stops every active session. */
  dispose(): void;
}

/** 📖 A board-like config stub whose terminal role resolves to exactly the
 *  given column name, letting readiness flow through the shared dependency
 *  helpers (resolveDependencyStatus reads the terminal column from config)
 *  without the orchestrator needing the whole KandownConfig. */
function boardWithTerminal(terminal: string): Pick<KandownConfig, 'board'> {
  return {
    board: {
      columns: [terminal],
      defaultPriority: 'P3',
      defaultOwnerType: 'human',
      columnMeta: { [terminal]: { role: 'terminal' } },
      stackDefaultState: 'collapsed',
    },
  };
}

function isTerminalTaskStatus(task: AutopilotTaskInput, terminal: string): boolean {
  const status = String(task.status ?? '').toLowerCase();
  return status === terminal.toLowerCase()
    || status === 'archived'
    || task.archived === true
    || task.archived === 'true';
}

/** 📖 Pure readiness (t311 contract): a task is ready when its status is not
 *  the terminal column (or archived), its depends_on are all resolved by the
 *  shared rule (terminal, archived, or unknown), it has no live autopilot
 *  session, and it is not queued. Callers pass every id that must be excluded
 *  as `liveTaskIds` (the orchestrator passes live sessions plus the queue). */
export function computeReadyTasks(
  tasks: readonly AutopilotTaskInput[],
  terminal: string,
  liveTaskIds: Iterable<string> = [],
): AutopilotTaskInput[] {
  const excluded = new Set(liveTaskIds);
  const resolution = resolveDependencyStatus(tasks, boardWithTerminal(terminal));
  return tasks.filter(task => {
    if (excluded.has(task.id)) return false;
    if (isTerminalTaskStatus(task, terminal)) return false;
    return unresolvedDependencyIds(
      { id: task.id, status: task.status, depends_on: task.depends_on },
      resolution,
    ).length === 0;
  });
}

/** 📖 Queue order: priority first (P1 before P4, unset ranks last as P9),
 *  then id with numeric-aware comparison. Mirrors the board digest's
 *  "next actionable" ranking. */
export function orderQueue<T extends { id: string; priority?: string }>(tasks: readonly T[]): T[] {
  const rank = (task: T): number => {
    const parsed = Number.parseInt(String(task.priority ?? 'P9').slice(1), 10);
    return parsed || 9;
  };
  return [...tasks].sort((a, b) =>
    rank(a) - rank(b) || a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

/** 📖 Crash recovery surface: tasks in a non-terminal, non-backlog column
 *  with no live autopilot session and no queue slot. Returned in queue order
 *  so a start can re-queue them verbatim. */
export function computeOrphanTaskIds(
  tasks: readonly AutopilotTaskInput[],
  terminal: string,
  backlog: string | undefined,
  liveTaskIds: Iterable<string> = [],
  queuedIds: Iterable<string> = [],
): string[] {
  const live = new Set(liveTaskIds);
  const queued = new Set(queuedIds);
  const backlogLower = backlog === undefined ? undefined : backlog.toLowerCase();
  const candidates = tasks.filter(task => {
    if (live.has(task.id) || queued.has(task.id)) return false;
    if (isTerminalTaskStatus(task, terminal)) return false;
    const status = String(task.status ?? '');
    if (backlogLower !== undefined && status.toLowerCase() === backlogLower) return false;
    return true;
  });
  return orderQueue(candidates).map(task => task.id);
}

/** 📖 Budget verdict for one usage event. Run caps are checked first because
 *  stopping the run subsumes stopping the session. "Exceeded" is strict: a
 *  total that lands exactly on the cap is still allowed. */
export function budgetDecision(
  session: AutopilotTotals,
  run: AutopilotTotals,
  caps: AutopilotCaps,
): BudgetDecision {
  const runOver = (caps.runTokenCap !== undefined && run.tokens > caps.runTokenCap)
    || (caps.runCostCapUsd !== undefined && run.costUsd > caps.runCostCapUsd);
  if (runOver) return 'stop-run';
  const sessionOver = (caps.sessionTokenCap !== undefined && session.tokens > caps.sessionTokenCap)
    || (caps.sessionCostCapUsd !== undefined && session.costUsd > caps.sessionCostCapUsd);
  return sessionOver ? 'stop-session' : 'none';
}

/** 📖 Reads a task file back and returns its cascade handoff when the task
 *  reached the terminal column WITH a completion report. Null for everything
 *  else (unfinished, terminal without report, unreadable file): the human
 *  decides what happens to those. Never throws. */
export function extractHandoff(kandownDir: string, taskId: string, terminal: string): AutopilotHandoff | null {
  try {
    const task = readTask(kandownDir, taskId);
    const status = String(task.frontmatter.status ?? '');
    if (status.toLowerCase() !== terminal.toLowerCase()) return null;
    const report = typeof task.frontmatter.report === 'string' ? task.frontmatter.report.trim() : '';
    if (!report) return null;
    const title = typeof task.frontmatter.title === 'string' && task.frontmatter.title.trim()
      ? task.frontmatter.title.trim()
      : taskId;
    return { id: taskId, title, report };
  } catch {
    return null;
  }
}

/** 📖 Assembles the initial prompt of an autopilot session: the cascade
 *  handoff block first (only when earlier tasks of this run completed), then
 *  the compiled kandown-work document for the dispatched task, then the
 *  directive block. The directives make the session work the task, keep the
 *  task file current, respect the column gates, write a completion report,
 *  and propose (not execute unilaterally) the terminal move: a human
 *  confirms it. */
export function buildAutopilotPrompt(
  compiled: string,
  handoffs: readonly AutopilotHandoff[],
  terminalStatusName: string,
): string {
  const sections: string[] = [];
  if (handoffs.length > 0) {
    const entries = handoffs.map(handoff => `### ${handoff.id} ${handoff.title}\n\n${handoff.report.trim()}`);
    sections.push(
      '## Cascade handoff: completed earlier in this autopilot run\n\n'
      + 'These tasks were completed earlier in the same run. Treat their reports as context: build on this work, do not redo or contradict it.\n\n'
      + entries.join('\n\n'),
    );
  }
  sections.push(compiled.trim());
  sections.push(
    '## Autopilot directives\n\n'
    + 'You are running autonomously inside a kandown project. For the task above:\n\n'
    + '1. Work the task to done.\n'
    + '2. Keep the task checklist and reports updated as you go: the task file is the work log.\n'
    + '3. Respect the board column gates; never bypass a dependency.\n'
    + '4. Write a completion report into the task file when the work is finished.\n'
    + `5. Propose the move to "${terminalStatusName}" in your completion report, but let the human confirm the terminal move.`,
  );
  return sections.join('\n\n');
}

/** 📖 Creates the orchestrator. One per daemon process (the server wires it
 *  with broadcastSseEvent). All injected defaults keep the module testable
 *  without a real harness. The poll timer is unref'd so tests and short-lived
 *  processes never hang on it. */
export function createOrchestrator(
  projectRoot: string,
  kandownDir: string,
  options: AutopilotOrchestratorOptions = {},
): AutopilotOrchestrator {
  const broadcast: AutopilotBroadcaster = options.broadcast ?? (() => {});
  const subscribe: AutopilotEventSubscriber = options.subscribe ?? subscribeAgentSession;
  const createSession: AutopilotSessionFactory = options.createSession ?? createAgentSession;
  const stopSession: AutopilotSessionStopper = options.stopSession ?? stopAgentSession;
  const compileWork: AutopilotWorkCompiler = options.compileWork ?? compileProjectKandownWork;
  const isHarnessInstalled: AutopilotHarnessProbe = options.isHarnessInstalled
    ?? ((id: string) => resolveHarness(id) !== null);
  const pollIntervalMs = options.pollIntervalMs ?? AUTOPOLL_INTERVAL_MS;

  let running = false;
  let harnessId: string | undefined;
  let queue: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastBroadcastKey = '';
  /** sessionId -> taskId, insertion order = dispatch order. */
  const active = new Map<string, string>();
  /** taskId -> handoff, the completed-for-this-run memory. */
  const completed = new Map<string, AutopilotHandoff>();
  /** 📖 Tasks whose autopilot session ended without reaching the terminal
   *  column with a report. They are never re-queued automatically this run
   *  (the human may want to inspect) and surface through the orphans rule. */
  const abandoned = new Set<string>();
  /** sessionId -> usage accumulated from this session's events. */
  const sessionTotals = new Map<string, AutopilotTotals>();
  let runTotals: AutopilotTotals = { tokens: 0, costUsd: 0 };
  const unsubscribes = new Map<string, () => void>();

  function finiteOrZero(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  function roundCost(value: number): number {
    return Math.round(value * 1e6) / 1e6;
  }

  function autopilotSettings(config: KandownConfig): AutopilotConfig {
    return config.agent.autopilot ?? { maxParallel: 2 };
  }

  function snapshotConfig(config: KandownConfig): AutopilotSnapshotConfig {
    const autopilot = autopilotSettings(config);
    return {
      maxParallel: Math.min(MAX_PARALLEL, Math.max(MIN_PARALLEL, Math.floor(autopilot.maxParallel))),
      ...(autopilot.sessionTokenCap !== undefined ? { sessionTokenCap: autopilot.sessionTokenCap } : {}),
      ...(autopilot.sessionCostCapUsd !== undefined ? { sessionCostCapUsd: autopilot.sessionCostCapUsd } : {}),
      ...(autopilot.runTokenCap !== undefined ? { runTokenCap: autopilot.runTokenCap } : {}),
      ...(autopilot.runCostCapUsd !== undefined ? { runCostCapUsd: autopilot.runCostCapUsd } : {}),
    };
  }

  /** 📖 Reads the whole board as plain orchestrator inputs. Unreadable files
   *  are skipped with a warning: one broken task must not stop the loop. */
  function readAllTasks(): AutopilotTaskInput[] {
    const tasks: AutopilotTaskInput[] = [];
    for (const id of listTaskIds(kandownDir)) {
      try {
        const task = readTask(kandownDir, id);
        const fm = task.frontmatter;
        tasks.push({
          id,
          status: typeof fm.status === 'string' ? fm.status : '',
          priority: typeof fm.priority === 'string' ? fm.priority : undefined,
          depends_on: fm.depends_on,
          archived: fm.archived,
        });
      } catch (error) {
        console.error(`[kandown] autopilot: cannot read task ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return tasks;
  }

  /** 📖 Harness resolution for start: explicit override, else the catalog
   *  preferred agent (config.agents.preferred when it resolves to an
   *  installed harness), else the first installed harness in catalog order.
   *  Throws a readable Error so the endpoint can answer 400. */
  function resolveHarnessId(override?: string): string {
    if (override && override.trim()) {
      const id = override.trim();
      if (!isHarnessInstalled(id)) {
        throw new Error(`Harness "${id}" is not installed or unknown.`);
      }
      return id;
    }
    const config = loadConfig(kandownDir);
    const preferred = config.agents?.preferred;
    if (preferred && isHarnessInstalled(preferred)) return preferred;
    for (const def of HARNESS_DEFS) {
      if (isHarnessInstalled(def.id)) return def.id;
    }
    throw new Error(`No agent harness is installed. Install one of: ${HARNESS_DEFS.map(def => def.id).join(', ')}.`);
  }

  function buildSnapshot(): AutopilotSnapshot {
    const config = loadConfig(kandownDir);
    const tasks = readAllTasks();
    const terminal = terminalStatus(config);
    const backlog = resolveColumnNameByRole(config, 'backlog');
    const liveTaskIds = [...active.values()];
    const orphans = computeOrphanTaskIds(tasks, terminal, backlog, liveTaskIds, queue);
    return {
      state: running ? 'running' : 'idle',
      ...(harnessId ? { harnessId } : {}),
      active: [...active.entries()].map(([sessionId, taskId]) => ({ taskId, sessionId })),
      queue: [...queue],
      orphans,
      totals: { tokens: runTotals.tokens, costUsd: roundCost(runTotals.costUsd) },
      config: snapshotConfig(config),
    };
  }

  /** 📖 Computes the snapshot, broadcasts the frozen SSE event when anything
   *  visible changed (totals alone do not re-broadcast: usage can tick per
   *  token), and returns the snapshot for the endpoint response. */
  function publish(): AutopilotSnapshot {
    const snapshot = buildSnapshot();
    const key = JSON.stringify([snapshot.state, snapshot.harnessId ?? null, snapshot.active, snapshot.queue, snapshot.orphans]);
    if (key !== lastBroadcastKey) {
      lastBroadcastKey = key;
      broadcast({
        type: 'agent_autopilot',
        state: snapshot.state,
        active: snapshot.active,
        queue: snapshot.queue,
        orphans: snapshot.orphans,
        totals: snapshot.totals,
        at: new Date().toISOString(),
      });
    }
    return snapshot;
  }

  /** 📖 Spawns one harness session for a task: compiled work doc + cascade
   *  handoff + directives as the initial prompt, permission mode from the
   *  project config. Throws when the harness or the compiler fails; the
   *  caller drops the task from the queue and the next snapshot surfaces it
   *  through the orphans rule. */
  function spawnSession(taskId: string, config: KandownConfig): void {
    const compiled = compileWork(kandownDir, taskId);
    const prompt = buildAutopilotPrompt(compiled.markdown, [...completed.values()], terminalStatus(config));
    const session = createSession({
      harnessId: harnessId ?? '',
      projectRoot,
      prompt,
      permissionMode: config.agent.permissionMode,
    });
    active.set(session.id, taskId);
    const unsubscribe = subscribe(session.id, event => handleSessionEvent(session.id, taskId, event));
    if (unsubscribe) unsubscribes.set(session.id, unsubscribe);
  }

  /** 📖 Pops the queue while slots are free. Does NOT re-derive readiness:
   *  the queue is the readiness decision, rebuilt by refreshQueue. */
  function dispatchFromQueue(): boolean {
    if (!running) return false;
    const config = loadConfig(kandownDir);
    const maxParallel = snapshotConfig(config).maxParallel;
    let dispatched = false;
    while (running && active.size < maxParallel && queue.length > 0) {
      const taskId = queue.shift() as string;
      if (completed.has(taskId)) continue;
      if ([...active.values()].includes(taskId)) continue;
      try {
        spawnSession(taskId, config);
        dispatched = true;
      } catch (error) {
        console.error(`[kandown] autopilot: failed to dispatch ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return dispatched;
  }

  /** 📖 Rebuilds the queue from current readiness: newly unblocked tasks
   *  enter (cascade), finished ones leave. Live sessions, tasks abandoned by
   *  a finished session, and completed-for-run tasks are excluded, so an
   *  unfinished task is never re-queued automatically mid-run (the human may
   *  want to inspect); it only surfaces through the orphans rule. */
  function refreshQueue(): void {
    const config = loadConfig(kandownDir);
    const tasks = readAllTasks();
    const terminal = terminalStatus(config);
    const excluded = new Set([...active.values(), ...abandoned, ...completed.keys()]);
    queue = orderQueue(computeReadyTasks(tasks, terminal, excluded)).map(task => task.id);
  }

  function handleSessionEvent(sessionId: string, taskId: string, event: AgentEvent): void {
    if (event.type === 'usage') {
      const tokens = finiteOrZero(event.inputTokens) + finiteOrZero(event.outputTokens) + finiteOrZero(event.cachedInputTokens);
      const costUsd = finiteOrZero(event.costUsd);
      const totals = sessionTotals.get(sessionId) ?? { tokens: 0, costUsd: 0 };
      totals.tokens += tokens;
      totals.costUsd += costUsd;
      sessionTotals.set(sessionId, totals);
      runTotals.tokens += tokens;
      runTotals.costUsd += costUsd;
      const caps = snapshotConfig(loadConfig(kandownDir));
      const decision = budgetDecision(totals, runTotals, caps);
      if (decision === 'stop-run') {
        stopRunInternal();
        publish();
        return;
      }
      if (decision === 'stop-session') stopSession(sessionId);
      return;
    }
    if (event.type === 'stopped') handleFinish(sessionId, taskId);
  }

  /** 📖 A session ended. Read the task file back: terminal column plus a
   *  report means completed-for-this-run (its report joins the cascade
   *  handoff); anything else stays for the human via the orphans rule. Then
   *  keep the pipeline full and broadcast. */
  function handleFinish(sessionId: string, taskId: string): void {
    active.delete(sessionId);
    const unsubscribe = unsubscribes.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      unsubscribes.delete(sessionId);
    }
    sessionTotals.delete(sessionId);
    if (running) {
      const terminal = terminalStatus(loadConfig(kandownDir));
      const handoff = extractHandoff(kandownDir, taskId, terminal);
      if (handoff) completed.set(taskId, handoff);
      else abandoned.add(taskId);
      refreshQueue();
      dispatchFromQueue();
    }
    publish();
  }

  function stopRunInternal(): void {
    running = false;
    queue = [];
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    for (const sessionId of [...active.keys()]) {
      try {
        stopSession(sessionId);
      } catch (error) {
        console.error(`[kandown] autopilot: failed to stop session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const unsubscribe of [...unsubscribes.values()]) unsubscribe();
    unsubscribes.clear();
    active.clear();
    sessionTotals.clear();
  }

  function ensureTimer(): void {
    if (timer) return;
    timer = setInterval(() => {
      if (!running) return;
      refreshQueue();
      dispatchFromQueue();
      publish();
    }, pollIntervalMs);
    timer.unref?.();
  }

  const orchestrator: AutopilotOrchestrator = {
    start(override) {
      // 📖 Idempotent while running: a second start request never resets a
      // live run's state or totals.
      if (running) return publish();
      const resolved = resolveHarnessId(override);
      const config = loadConfig(kandownDir);
      // 📖 Totals reset on start (contract): the previous run's numbers stay
      // visible on the idle snapshot until this moment.
      completed.clear();
      abandoned.clear();
      sessionTotals.clear();
      runTotals = { tokens: 0, costUsd: 0 };
      active.clear();
      harnessId = resolved;
      running = true;
      // 📖 Crash recovery: orphans are re-queued FIRST (files are the truth:
      // a task in progress without a session is resumable), then every ready
      // task in priority order. An orphan whose dependency was regressed or
      // reverted since it went mid-column is NOT re-queued: the gate that
      // rules the board rules the queue too, and the autopilot directives tell
      // sessions to never bypass a dependency. It still shows up in the
      // snapshot's orphans list for the human to resolve.
      const tasks = readAllTasks();
      const terminal = terminalStatus(config);
      const backlog = resolveColumnNameByRole(config, 'backlog');
      const readyIds = new Set(computeReadyTasks(tasks, terminal, [...active.values()]).map(task => task.id));
      const orphans = computeOrphanTaskIds(tasks, terminal, backlog, [...active.values()], [])
        .filter(id => readyIds.has(id));
      queue = [...orphans];
      const readyExcluded = new Set(orphans);
      for (const task of orderQueue(computeReadyTasks(tasks, terminal, readyExcluded))) {
        queue.push(task.id);
      }
      ensureTimer();
      dispatchFromQueue();
      return publish();
    },

    stop() {
      stopRunInternal();
      return publish();
    },

    snapshot() {
      return buildSnapshot();
    },

    dispose() {
      stopRunInternal();
      completed.clear();
      abandoned.clear();
      runTotals = { tokens: 0, costUsd: 0 };
      lastBroadcastKey = '';
    },
  };

  return orchestrator;
}
