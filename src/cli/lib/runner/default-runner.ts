/**
 * @file DefaultRunner: the daemon-owned harness session, behind the runner seam
 * @description The runner kandown always has (t261). It adds no capability of
 * its own: it wraps the harness runtime the chat panel already uses (t307/t308)
 * so the board can talk about "where this task runs" without special-casing the
 * built-in case. Start spawns a harness child process on the compiled
 * `kandown work` document, list reports the live sessions of this project,
 * read replays the session's event buffer as terminal-shaped text, and stop
 * kills the child.
 *
 * 📖 Why it wraps instead of replaces. Every existing caller of
 * `createAgentSession` keeps working untouched; this file only offers a second
 * door onto the same runtime. That is deliberate: Herdr is an option, never a
 * prerequisite, so the default path must stay the exact code that shipped with
 * t307 even when the runner registry is in play.
 *
 * 📖 Where the task association lives. The runtime knows nothing about tasks,
 * and kandown must not grow a second store for that (AGENTS.md rule 6), so the
 * (session, task) pair is written to the same per-project session index the
 * chat sidebar already owns, and `list()` joins live sessions against it.
 *
 * @functions
 *  → createDefaultRunner : build the runner bound to one .kandown directory
 *  → mapSessionStatus    : pure: harness session status to a run state
 *  → renderEventsAsText  : pure: buffered agent events to a terminal transcript
 *
 * @exports createDefaultRunner, mapSessionStatus, renderEventsAsText
 * @see src/cli/lib/agent/agent-runtime.ts: the runtime being wrapped
 * @see src/cli/lib/runner/types.ts: the contract
 */

import {
  createAgentSession,
  getAgentSession,
  listAgentSessions,
  stopAgentSession,
  subscribeAgentSession,
} from '../agent/agent-runtime';
import type { AgentEvent, AgentSessionStatus } from '../agent/types';
import {
  indexEntryForPrompt,
  listSessionIndexEntries,
  upsertSessionIndexEntry,
} from '../agent/session-index';
import { getProjectRoot } from '../board-reader';
import { compileProjectKandownWork } from '../kandown-work';
import { loadConfig } from '../config';
import type {
  RunnerAvailability,
  RunnerOutput,
  RunnerRun,
  RunnerRunState,
  RunnerStartRequest,
  TaskRunner,
} from './types';

/** 📖 The built-in runner is part of the daemon, so availability is a
 *  constant: there is nothing to install and nothing to probe. */
const ALWAYS_AVAILABLE: RunnerAvailability = { available: true, endpoint: null, version: null };

/**
 * 📖 Session status to run state. `completed` is the harness exiting on its
 * own after a turn, which is the same "finished while you were elsewhere"
 * signal Herdr calls `done`; `stopped` means a human ended it, so the run is
 * simply gone rather than failed.
 */
export function mapSessionStatus(status: AgentSessionStatus): RunnerRunState {
  switch (status) {
    case 'starting': return 'starting';
    case 'running': return 'working';
    case 'completed': return 'done';
    case 'stopped': return 'gone';
    case 'failed': return 'failed';
    default: return 'unknown';
  }
}

/**
 * 📖 Turns a session's buffered events into the plain transcript the run
 * preview renders. The headless runtime has no PTY, so there is no terminal to
 * snapshot: assistant text is concatenated as it streamed, tool calls become
 * one `· tool` line each, and errors are marked. Newest content last, matching
 * `RunnerOutput`.
 */
export function renderEventsAsText(events: readonly AgentEvent[]): string {
  const lines: string[] = [];
  let pending = '';
  const flush = (): void => {
    if (!pending.trim()) { pending = ''; return; }
    lines.push(...pending.replace(/\n+$/, '').split('\n'));
    pending = '';
  };
  for (const event of events) {
    switch (event.type) {
      case 'message_delta':
        if (event.channel === 'text') pending += event.text;
        break;
      case 'tool_started':
        flush();
        lines.push(`· ${event.toolName}${event.summary ? ` ${event.summary}` : ''}`);
        break;
      case 'error':
        flush();
        lines.push(`! ${event.message}`);
        break;
      case 'turn_completed':
        flush();
        break;
      case 'stopped':
        flush();
        lines.push(`- session ${event.reason}${typeof event.exitCode === 'number' ? ` (exit ${event.exitCode})` : ''}`);
        break;
      default:
        break;
    }
  }
  flush();
  return lines.join('\n');
}

/** 📖 Reads a session's replayed buffer without staying subscribed: the
 *  runtime replays everything it holds to a new listener, so subscribing and
 *  immediately unsubscribing is a snapshot read. */
function snapshotEvents(sessionId: string): AgentEvent[] {
  const collected: AgentEvent[] = [];
  const unsubscribe = subscribeAgentSession(sessionId, event => { collected.push(event); });
  if (!unsubscribe) return collected;
  unsubscribe();
  return collected;
}

/**
 * 📖 Builds the default runner for one project. Bound to a `.kandown`
 * directory so `list()` can resolve the project's session index without the
 * caller passing paths around.
 */
export function createDefaultRunner(kandownDir: string): TaskRunner {
  const projectRoot = (): string => getProjectRoot(kandownDir);

  return {
    id: 'default',
    name: 'Kandown',

    detect(): RunnerAvailability {
      return ALWAYS_AVAILABLE;
    },

    async start(request: RunnerStartRequest): Promise<RunnerRun> {
      const compiled = compileProjectKandownWork(kandownDir, request.taskId);
      const config = loadConfig(kandownDir);
      const root = projectRoot();
      const session = createAgentSession({
        harnessId: request.agentId,
        projectRoot: root,
        prompt: compiled.markdown,
        permissionMode: config.agent.permissionMode,
      });
      const now = new Date().toISOString();
      upsertSessionIndexEntry(root, {
        id: session.id,
        harnessId: session.harnessId,
        title: indexEntryForPrompt(`${request.taskId} ${compiled.markdown}`),
        taskId: request.taskId,
        createdAt: now,
        updatedAt: now,
      });
      return {
        runnerId: 'default',
        runId: session.id,
        taskId: request.taskId,
        agentId: session.harnessId,
        state: mapSessionStatus(session.status),
        startedAt: session.startedAt,
      };
    },

    async list(): Promise<RunnerRun[]> {
      // 📖 The index is the only place the (session, task) pair is recorded,
      // and it outlives the runtime, so entries without a live session are
      // dropped here rather than reported as ghost runs.
      const byId = new Map(listSessionIndexEntries(projectRoot()).map(entry => [entry.id, entry]));
      return listAgentSessions().map(session => ({
        runnerId: 'default' as const,
        runId: session.id,
        taskId: byId.get(session.id)?.taskId ?? null,
        agentId: session.harnessId,
        state: mapSessionStatus(session.status),
        startedAt: session.startedAt,
        ...(byId.get(session.id)?.title ? { label: byId.get(session.id)!.title } : {}),
      }));
    },

    async read(runId: string, lines: number): Promise<RunnerOutput> {
      if (!getAgentSession(runId)) return { text: '', truncated: false };
      const text = renderEventsAsText(snapshotEvents(runId));
      const all = text ? text.split('\n') : [];
      const wanted = Math.max(1, lines);
      const kept = all.slice(-wanted);
      return { text: kept.join('\n'), truncated: kept.length < all.length };
    },

    async stop(runId: string): Promise<void> {
      stopAgentSession(runId);
    },
  };
}
