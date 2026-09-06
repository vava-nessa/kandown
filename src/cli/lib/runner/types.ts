/**
 * @file TaskRunner contract: where a task's agent actually runs
 * @description Kandown can start an agent on a task in more than one place.
 * The default place is a harness child process the daemon owns (t307/t308):
 * headless, streamed over SSE, invisible outside the app. The second place is
 * a Herdr pane (t261): a real terminal the user can attach to, that survives
 * the daemon and that Herdr itself watches for lifecycle changes. This module
 * is the seam between the two, so no caller has to know which one it got.
 *
 * 📖 Why an adapter and not a flag. The two backends disagree on almost
 * everything: one owns a process, the other owns a pane id; one streams
 * normalized events, the other exposes a terminal snapshot to poll; one can
 * always start, the other only exists when Herdr is installed. What they do
 * share is exactly this interface: start a run for a task, list runs, read the
 * output, stop it. Everything above (routes, store, UI) speaks only that.
 *
 * 📖 Availability is a value, never an error. `detect()` is synchronous,
 * cached, and must never throw: a machine without Herdr answers
 * `{ available: false }` and the UI renders nothing extra. That is the whole
 * zero-config promise, and it is why no runner method is allowed to warn on
 * a missing dependency.
 *
 * @functions
 *  → (types only)
 *
 * @exports RunnerId, RunnerRunState, RunnerAvailability, RunnerRun, RunnerStartRequest, RunnerOutput, TaskRunner, TERMINAL_RUN_STATES
 * @see src/cli/lib/runner/herdr-runner.ts: the Herdr pane implementation
 * @see src/cli/lib/runner/default-runner.ts: the daemon-owned harness implementation
 * @see src/cli/lib/runner/index.ts: the registry the routes talk to
 */

/** 📖 Stable id of a runner backend. Wire value: it appears in API payloads
 *  and in `plugins`-free task metadata, so never rename one in place. */
export type RunnerId = 'default' | 'herdr';

/** 📖 Normalized lifecycle of one run, the union of what both backends can
 *  report. `working` and `blocked` come straight from Herdr's own detection
 *  (it recognizes approval prompts); `idle` means started but waiting for
 *  input; `done` means finished after unseen background work; `gone` means the
 *  run no longer exists (pane closed, process reaped). */
export type RunnerRunState = 'starting' | 'idle' | 'working' | 'blocked' | 'done' | 'failed' | 'unknown' | 'gone';

/** 📖 States after which no further output is expected. Used by the sync loop
 *  to decide when to harvest a run's terminal tail into the task file. */
export const TERMINAL_RUN_STATES: ReadonlySet<RunnerRunState> = new Set<RunnerRunState>(['done', 'failed', 'gone']);

/** 📖 What `detect()` answers. `reason` is diagnostic only: it is shown in
 *  Settings when the user goes looking, never surfaced as a warning. */
export interface RunnerAvailability {
  available: boolean;
  /** Human-readable backend version when known (`herdr status` client line). */
  version?: string | null;
  /** Resolved control endpoint, for display: the Herdr socket path. */
  endpoint?: string | null;
  /** Why the runner is unavailable, for Settings and logs. Never a UI error. */
  reason?: string;
}

/** 📖 One run, as reported to the API and the UI. `runId` is the backend's own
 *  handle (a Herdr pane id such as `w3:p1`, or a kandown session id), so it is
 *  opaque to callers and safe to round-trip through a URL segment. */
export interface RunnerRun {
  runnerId: RunnerId;
  runId: string;
  taskId: string | null;
  /** Kandown agent id (`claude`, `codex`, `pi`, ...) driving the run. */
  agentId: string;
  state: RunnerRunState;
  /** 📖 ISO start time when the backend knows it. Herdr does not report when
   *  a tab was created, so an adopted pane (one this daemon did not launch)
   *  legitimately has none; the UI shows the state badge without an age. */
  startedAt?: string;
  /** Terminal/tab label, useful when the user goes hunting in Herdr itself. */
  label?: string;
  /** Herdr-only: where the pane lives, so the UI can deep-link a focus call. */
  workspaceId?: string;
  tabId?: string;
}

/** 📖 Everything a runner needs to start a run: which task, and which agent
 *  drives it. The project is not part of the request because a runner is
 *  built for one `.kandown/` directory (see `createRunnerRegistry`), and the
 *  prompt is not part of it either: both runners compile the same
 *  `kandown work` document from the task id, so prompt policy stays in
 *  kandown and cannot drift between backends. */
export interface RunnerStartRequest {
  taskId: string;
  agentId: string;
}

/** 📖 A terminal snapshot: plain text, newest content last, already unwrapped.
 *  `truncated` tells the UI the backend had more than it asked for. */
export interface RunnerOutput {
  text: string;
  truncated: boolean;
}

/** 📖 One place a task's agent can run. Implementations must be silent about
 *  their own absence (see `detect`) and must never throw from `detect()`. */
export interface TaskRunner {
  id: RunnerId;
  name: string;
  /** Synchronous, cached, never throws. */
  detect(): RunnerAvailability;
  start(request: RunnerStartRequest): Promise<RunnerRun>;
  list(): Promise<RunnerRun[]>;
  read(runId: string, lines: number): Promise<RunnerOutput>;
  stop(runId: string): Promise<void>;
}
