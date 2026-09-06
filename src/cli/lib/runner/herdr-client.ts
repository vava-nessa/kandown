/**
 * @file Herdr client: silent detection plus a thin typed wrapper over its CLI
 * @description Everything kandown knows about Herdr (t261) lives here: whether
 * it is present, and how to ask it for workspaces, tabs, panes and terminal
 * output. Nothing above this file spawns `herdr` or parses its JSON.
 *
 * 📖 Why the CLI and not the socket. Herdr exposes a Unix socket
 * (`~/.config/herdr/herdr.sock`) speaking a numbered protocol (`protocol: 20`
 * at time of writing) that is explicitly not a public wire format, while the
 * `herdr` binary that ships next to it is a stable, versioned, JSON-emitting
 * front end for the same socket. Talking to the binary costs one short-lived
 * process per call and buys forward compatibility, so detection still checks
 * the socket (that is what proves a *server* is running, not just an install)
 * but every request goes through the CLI.
 *
 * 📖 Silence is the contract. `detectHerdr()` never throws, never logs and
 * never blocks for long: a missing binary, a missing socket, a stale server or
 * a broken PATH all resolve to `{ available: false }` with a `reason` string
 * that only Settings ever reads. Every call helper resolves to a discriminated
 * result instead of rejecting, so a caller cannot accidentally turn "Herdr is
 * not installed" into a red toast.
 *
 * @functions
 *  → herdrSocketPath      : the socket the local Herdr server would listen on
 *  → detectHerdr          : cached availability probe, sync, never throws
 *  → resetHerdrDetection  : drop the cache (tests, and after an install)
 *  → herdrCall            : run one `herdr ...` command, parse its JSON result
 *  → herdrCallText        : run one `herdr ...` command, keep stdout as text
 *  → parseHerdrPanes      : pure: `pane list` payload to typed panes
 *  → parseHerdrTabs       : pure: `tab list` payload to typed tabs
 *  → mapHerdrStatus       : pure: Herdr agent status to a normalized run state
 *  → taskIdFromTabLabel   : pure: read the `kd:<taskId>` tab-label convention
 *  → tabLabelForTask      : pure: build that label
 *  → pickWorkspaceForProject : pure: which workspace a project's tab belongs in
 *
 * @exports HERDR_TAB_LABEL_PREFIX, HerdrPane, HerdrTab, HerdrCallResult, HerdrTextResult, herdrSocketPath, detectHerdr, resetHerdrDetection, herdrCall, herdrCallText, parseHerdrPanes, parseHerdrTabs, mapHerdrStatus, taskIdFromTabLabel, tabLabelForTask, pickWorkspaceForProject
 * @see src/cli/lib/runner/herdr-runner.ts: the TaskRunner built on this client
 * @see src/cli/lib/runner/types.ts: the normalized run model
 */

import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RunnerAvailability, RunnerRunState } from './types';
import { resolveBinPath } from '../agents';

const execFileAsync = promisify(execFile);

/** 📖 Tab-label convention that makes a Herdr tab recognizable as a kandown
 *  run. It is the *only* link between a pane and a task: no index file, no
 *  sidecar state (AGENTS.md rule 6). Renaming the tab in Herdr detaches the
 *  run from the board, which is the honest outcome. */
export const HERDR_TAB_LABEL_PREFIX = 'kd:';

/** 📖 Cache TTL for detection. Long enough that a board poll does not spawn
 *  `herdr` every second, short enough that installing Herdr shows up without
 *  restarting the daemon. */
const DETECT_TTL_MS = 30_000;

/** 📖 Hard ceiling on every CLI call. Herdr answers a local socket in
 *  milliseconds; anything slower is a wedged server we must not wait for. */
const CALL_TIMEOUT_MS = 8_000;

/** 📖 Ceiling on captured stdout. `pane read --lines 2000` is the largest
 *  realistic payload; 8 MB leaves room without letting a runaway pane fill
 *  the daemon's heap. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** 📖 One pane as Herdr reports it, narrowed to the fields kandown uses. */
export interface HerdrPane {
  paneId: string;
  tabId: string;
  workspaceId: string;
  cwd: string | null;
  /** Herdr agent kind occupying the pane (`claude`, `codex`, ...), if any. */
  agent: string | null;
  status: string | null;
}

/** 📖 One tab as Herdr reports it. `label` carries the kandown convention. */
export interface HerdrTab {
  tabId: string;
  workspaceId: string;
  label: string;
  status: string | null;
}

/** 📖 Result of one CLI call. Deliberately not a rejected promise: callers
 *  degrade, they do not catch. */
export type HerdrCallResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/** 📖 Same discriminated shape for the commands that answer plain text rather
 *  than JSON (`pane read` prints the terminal snapshot as-is). */
export type HerdrTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

let cached: { at: number; value: RunnerAvailability } | null = null;

/**
 * 📖 Where the local Herdr server listens. `$HERDR_SOCKET` wins (that is what
 * a named or remote session exports), then the XDG config home, then the
 * documented default. Pure path arithmetic: it does not check existence.
 */
export function herdrSocketPath(): string {
  const explicit = process.env.HERDR_SOCKET;
  if (explicit && explicit.trim()) return explicit.trim();
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg.trim() : join(homedir(), '.config');
  return join(base, 'herdr', 'herdr.sock');
}

/**
 * 📖 Is Herdr usable right now? Two conditions, both cheap: the `herdr`
 * binary resolves on PATH, and the control socket exists (an install with no
 * running server cannot be driven, so it counts as unavailable). Version is
 * best effort and never gates the answer.
 *
 * Cached for {@link DETECT_TTL_MS}. Synchronous by design: the API route, the
 * runner registry and the sync loop all want a boolean without awaiting.
 */
export function detectHerdr(): RunnerAvailability {
  const now = Date.now();
  if (cached && now - cached.at < DETECT_TTL_MS) return cached.value;
  const value = probe();
  cached = { at: now, value };
  return value;
}

/** 📖 Test seam, and the hook an "I just installed Herdr" retry would use. */
export function resetHerdrDetection(): void {
  cached = null;
}

function probe(): RunnerAvailability {
  const socket = herdrSocketPath();
  let binPath: string | null = null;
  try {
    binPath = resolveBinPath('herdr');
  } catch {
    binPath = null;
  }
  if (!binPath) {
    return { available: false, endpoint: socket, version: null, reason: 'herdr is not on PATH' };
  }
  let socketExists = false;
  try {
    socketExists = existsSync(socket);
  } catch {
    socketExists = false;
  }
  if (!socketExists) {
    return { available: false, endpoint: socket, version: null, reason: 'no running herdr server' };
  }
  return { available: true, endpoint: socket, version: probeVersion(binPath) };
}

/** 📖 `herdr --version` with a tight timeout; a failure only costs the label. */
function probeVersion(binPath: string): string | null {
  try {
    const out = execFileSync(binPath, ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const first = out.split('\n').map(line => line.trim()).find(Boolean);
    return first ? first.slice(0, 80) : null;
  } catch {
    return null;
  }
}

/**
 * 📖 Runs one `herdr <args...>` command and returns its `.result` payload.
 * Herdr answers `{"id":"cli:...","result":{...}}` on stdout and a JSON error
 * on stderr with exit status 1, so both shapes are normalized here into one
 * discriminated result. Never rejects.
 */
export async function herdrCall(args: string[], timeoutMs = CALL_TIMEOUT_MS): Promise<HerdrCallResult> {
  const availability = detectHerdr();
  if (!availability.available) return { ok: false, error: availability.reason ?? 'herdr unavailable' };
  try {
    const { stdout } = await execFileAsync('herdr', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return { ok: true, result: {} };
    const parsed = JSON.parse(trimmed) as { result?: unknown; error?: unknown };
    if (parsed && typeof parsed === 'object' && 'result' in parsed) return { ok: true, result: parsed.result };
    return { ok: true, result: parsed };
  } catch (error) {
    return { ok: false, error: describeCallFailure(error) };
  }
}

/**
 * 📖 Runs one `herdr <args...>` command that answers plain text instead of
 * JSON. Only `pane read` behaves this way: it prints the terminal snapshot
 * verbatim, which is exactly what the run preview wants. Never rejects.
 */
export async function herdrCallText(args: string[], timeoutMs = CALL_TIMEOUT_MS): Promise<HerdrTextResult> {
  const availability = detectHerdr();
  if (!availability.available) return { ok: false, error: availability.reason ?? 'herdr unavailable' };
  try {
    const { stdout } = await execFileAsync('herdr', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    return { ok: true, text: stdout };
  } catch (error) {
    return { ok: false, error: describeCallFailure(error) };
  }
}

/** 📖 Herdr puts a JSON error object on stderr; surface its message when it
 *  parses, and fall back to the raw text so a diagnostic is never empty. */
function describeCallFailure(error: unknown): string {
  const stderr = typeof error === 'object' && error && 'stderr' in error ? String((error as { stderr: unknown }).stderr ?? '') : '';
  const trimmed = stderr.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: string; code?: string } | string };
      const detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.error?.code;
      if (detail) return String(detail).slice(0, 400);
    } catch {
      return trimmed.slice(0, 400);
    }
  }
  return error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * 📖 Narrows a `herdr pane list` payload. Unknown or malformed entries are
 * dropped rather than throwing: a future Herdr release adding fields must not
 * break the board, and an entry without a pane id is unusable anyway.
 */
export function parseHerdrPanes(payload: unknown): HerdrPane[] {
  const root = asRecord(payload);
  const panes = root?.panes;
  if (!Array.isArray(panes)) return [];
  const out: HerdrPane[] = [];
  for (const entry of panes) {
    const pane = asRecord(entry);
    if (!pane) continue;
    const paneId = asString(pane.pane_id);
    const tabId = asString(pane.tab_id);
    const workspaceId = asString(pane.workspace_id);
    if (!paneId || !tabId || !workspaceId) continue;
    out.push({
      paneId,
      tabId,
      workspaceId,
      cwd: asString(pane.cwd),
      agent: asString(pane.agent),
      status: asString(pane.agent_status),
    });
  }
  return out;
}

/** 📖 Same narrowing for `herdr tab list`. A tab without a label is kept with
 *  an empty one so pane joins still find it. */
export function parseHerdrTabs(payload: unknown): HerdrTab[] {
  const root = asRecord(payload);
  const tabs = root?.tabs;
  if (!Array.isArray(tabs)) return [];
  const out: HerdrTab[] = [];
  for (const entry of tabs) {
    const tab = asRecord(entry);
    if (!tab) continue;
    const tabId = asString(tab.tab_id);
    const workspaceId = asString(tab.workspace_id);
    if (!tabId || !workspaceId) continue;
    out.push({ tabId, workspaceId, label: asString(tab.label) ?? '', status: asString(tab.agent_status) });
  }
  return out;
}

/**
 * 📖 Herdr's five lifecycle states mapped onto the runner vocabulary. Herdr's
 * `done` is "idle after unseen background work", which is exactly the signal
 * the board wants for "the agent finished while you were elsewhere", so it is
 * kept distinct from plain `idle`. An absent status means the pane holds no
 * recognized agent: the run is over as far as kandown is concerned.
 */
export function mapHerdrStatus(status: string | null | undefined): RunnerRunState {
  switch (status) {
    case 'working': return 'working';
    case 'blocked': return 'blocked';
    case 'done': return 'done';
    case 'idle': return 'idle';
    case 'unknown': return 'unknown';
    default: return 'gone';
  }
}

/** 📖 Builds the tab label that marks a Herdr tab as this task's run. */
export function tabLabelForTask(taskId: string): string {
  return `${HERDR_TAB_LABEL_PREFIX}${taskId}`;
}

/** 📖 Inverse of {@link tabLabelForTask}: returns the task id a tab label
 *  claims, or null when the tab is not a kandown run. Deliberately strict, so
 *  a user tab called `kd: notes` never gets adopted by the board. */
export function taskIdFromTabLabel(label: string | null | undefined): string | null {
  if (!label || !label.startsWith(HERDR_TAB_LABEL_PREFIX)) return null;
  const rest = label.slice(HERDR_TAB_LABEL_PREFIX.length).trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(rest) ? rest : null;
}

/**
 * 📖 Picks the workspace a new run tab should be created in: the one that
 * already holds a pane sitting in this project (Herdr users keep one workspace
 * per repository). Returns null when no pane matches, which means "let Herdr
 * decide" (the tab lands in the focused workspace).
 *
 * Ties are broken by pane count, so a workspace with three panes on the
 * project wins over one that merely visited it once.
 */
export function pickWorkspaceForProject(panes: HerdrPane[], projectRoot: string): string | null {
  const normalized = projectRoot.replace(/\/+$/, '');
  if (!normalized) return null;
  const counts = new Map<string, number>();
  for (const pane of panes) {
    if (!pane.cwd) continue;
    const cwd = pane.cwd.replace(/\/+$/, '');
    if (cwd !== normalized && !cwd.startsWith(`${normalized}/`)) continue;
    counts.set(pane.workspaceId, (counts.get(pane.workspaceId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [workspaceId, count] of counts) {
    if (count > bestCount) {
      best = workspaceId;
      bestCount = count;
    }
  }
  return best;
}
