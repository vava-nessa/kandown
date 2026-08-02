/**
 * @file CLI agent launcher
 * @description Orchestrates the full task launch flow: read context, build
 * prompt, assign the task to the chosen agent, auto-move it to In Progress, and
 * spawn the agent. Two entry points share the same preparation core:
 *
 *   - `launchAgent`     — interactive TUI launch. Either splits a tmux pane
 *     (TUI stays visible) or exec-replaces the current process (terminal
 *     becomes the agent's).
 *   - `runAgentSync`    — blocking cascade launch. Spawns the agent with
 *     inherited stdio and resolves a promise on exit, so the DAG orchestrator
 *     can wait for completion, read back the task status, and chain the next
 *     task with a report handoff.
 *
 * 📖 Launch strategy for `launchAgent` (in priority order):
 *   1. tmux split-pane: if `$TMUX` is set, the kandown TUI stays visible in the
 *      left pane and the agent opens in a new right pane (50% width).
 *   2. Direct exec: exit the TUI (Ink's exit() + process exit), then exec the
 *      agent as a child process with inherited stdio.
 *
 * The caller (board.tsx) is responsible for calling Ink's `exit()` before
 * calling `launchAgent` when NOT in tmux, so the alternate screen buffer is
 * restored first.
 *
 * 📖 Failure handling: when the agent fails to spawn AFTER the task was moved
 * to "In Progress", the task is rolled back to its original column (t112) so
 * the board never lies about a running agent. The `assignee:` written on the
 * way in is deliberately *not* rolled back: the user's choice of agent for that
 * task is still valid, and it is what lets the next `a` press relaunch straight
 * into the same agent without reopening the picker.
 *
 * @functions
 *  → isInTmux       — detects if we're running inside a tmux session
 *  → launchAgent    — interactive TUI launch (tmux split or exec-replace)
 *  → runAgentSync   — blocking launch for the cascade orchestrator
 *  → buildShellCmd  — constructs a safe shell-escaped command string for tmux
 *
 * @exports isInTmux, launchAgent, runAgentSync, LaunchAgentOpts
 */

import { execSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTask, moveTaskToColumn, assignTaskToAgent } from './board-reader.js';
import { compileProjectKandownWork } from './kandown-work.js';
import { loadConfig } from './config.js';
import { resolveColumnNameByRole } from '../../lib/config.js';
import { getAgentById, buildPrompt, buildAgentCommand, type LaunchOpts } from './agents.js';

// 📖 Options shared by both entry points. The cascade adds handoff/queue.
export interface LaunchAgentOpts {
  /** Task ID, e.g. 't-019' */
  taskId: string;
  /** Agent ID from the registry, e.g. 'claude' */
  agentId: string;
  /** Absolute path to the .kandown/ directory */
  kandownDir: string;
  /**
   * Called just before the process is replaced (non-tmux interactive path).
   * Use this to call Ink's exit() and restore the terminal.
   */
  onBeforeExec?: () => void;
  /** 📖 Cascade handoff: completion reports from upstream tasks, prepended to
   *  the prompt so this agent inherits prior context. */
  handoff?: { taskId: string; title: string; report: string }[];
  /** 📖 Same-session cascade: the ordered queue of tasks this one agent must
   *  work through. When set, the prompt becomes a self-driving loop. */
  queue?: { id: string; title: string }[];
}

/** 📖 Prepared launch artefacts, produced once and consumed by whichever spawn
 *  strategy the caller picked. Centralising it keeps the two entry points from
 *  drifting apart on prompt/command construction. */
interface PreparedLaunch {
  agentName: string;
  binary: string;
  args: string[];
  contextFile: string;
  originalStatus: string;
  /** Whether the task was successfully moved to "In Progress". */
  taskMoved: boolean;
}

/**
 * 📖 Returns true if the current process is running inside a tmux session.
 * $TMUX is set by tmux itself to the socket path — reliable detection.
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * 📖 Shared preparation: resolve the agent, read the task + agent doc, build the
 * (handoff/queue-aware) prompt, move the task to "In Progress", write the
 * context temp file, and assemble the final command. Throws on unknown agent
 * or read failure; rolls back status if the move succeeded but a later step
 * throws. The caller owns the spawn strategy.
 */
function prepareLaunch(opts: LaunchAgentOpts): PreparedLaunch {
  const { taskId, agentId, kandownDir, handoff, queue } = opts;

  const agentDef = getAgentById(agentId, kandownDir);
  if (!agentDef) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  let task;
  try {
    task = readTask(kandownDir, taskId);
  } catch (e) {
    throw new Error(`Failed to read task ${taskId}: ${(e as Error).message}`);
  }
  const config = loadConfig(kandownDir);
  const originalStatus = task.frontmatter.status || config.board.columns[0];
  const activeStatus = resolveColumnNameByRole(config, 'active') ?? config.board.columns[0];
  const terminalStatus = resolveColumnNameByRole(config, 'terminal') ?? config.board.columns.at(-1)!;
  const agentDoc = compileProjectKandownWork(kandownDir, taskId).markdown;

  const taskFileContent = [
    `---`,
    `id: ${task.frontmatter.id}`,
    `title: ${task.frontmatter.title}`,
    `status: ${task.frontmatter.status ?? 'unknown'}`,
    `---`,
    '',
    task.body.trim(),
  ].join('\n');

  const { systemPrompt, taskPrompt } = buildPrompt(agentDoc, taskFileContent, taskId, kandownDir, activeStatus, terminalStatus, handoff, queue);

  // 📖 Launching *is* assigning: write the agent into `assignee:` before the
  // move, so a single `a` press produces one coherent write (assignee + status
  // + updated) and the web view attributes the task to the agent that is
  // actually running it. Non-fatal on failure: a task the launcher could not
  // stamp is still worth starting, and the move below surfaces a real
  // unwritable-file problem with a proper error.
  assignTaskToAgent(kandownDir, taskId, agentDef.id);

  const taskMoved = moveTaskToColumn(kandownDir, taskId, activeStatus);
  if (!taskMoved) {
    throw new Error(`Could not move task ${taskId} to ${activeStatus}: task file missing or unwritable.`);
  }

  // 📖 Safety net for very large prompts that hit the argv-length limit.
  const contextFile = join(tmpdir(), `kandown-${taskId}-context.md`);
  try {
    writeFileSync(contextFile, `${systemPrompt}\n\n---\n\n${taskPrompt}`, 'utf8');
  } catch (e) {
    console.warn(`[kandown] Failed to write context file (${(e as Error).message}); launching anyway.`);
  }

  const launchOpts: LaunchOpts = { systemPrompt, taskPrompt, kandownDir, taskId };
  const [binary, ...args] = buildAgentCommand(agentDef, launchOpts);
  if (!binary) {
    rollbackTaskStatus(kandownDir, taskId, originalStatus);
    throw new Error(`Agent ${agentId} returned an empty command`);
  }

  return { agentName: agentDef.name, binary, args, contextFile, originalStatus, taskMoved };
}

/** 📖 Shared env extras forwarded to the agent process in every spawn path. */
function launchEnv(contextFile: string, taskId: string, kandownDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    KANDOWN_CONTEXT_FILE: contextFile,
    KANDOWN_TASK_ID: taskId,
    KANDOWN_DIR: kandownDir,
  };
}

/**
 * 📖 Interactive TUI launch. Orchestrates the full launch and then either opens
 * a tmux split pane (TUI stays visible) or exec-replaces the current process.
 *
 * @throws if the agent ID is not recognized or a critical step fails
 */
export function launchAgent(opts: LaunchAgentOpts): void {
  const { taskId, kandownDir, onBeforeExec } = opts;
  const prepared = prepareLaunch(opts);
  const { agentName, binary, args, contextFile, originalStatus } = prepared;

  if (isInTmux()) {
    // 📖 tmux path: open a new 50%-wide right pane, TUI stays in the left pane.
    // A new tmux pane inherits the tmux *server's* environment, NOT this
    // process's env overrides, so execSync's `env` option alone won't reach
    // the agent. We prefix `env VAR=val ...` to forward KANDOWN_* vars.
    const shellCmd = buildShellCmd(binary, args);
    const envPrefix = [
      `KANDOWN_CONTEXT_FILE=${shellescape(contextFile)}`,
      `KANDOWN_TASK_ID=${shellescape(taskId)}`,
      `KANDOWN_DIR=${shellescape(kandownDir)}`,
    ].join(' ');
    try {
      execSync(`tmux split-window -h -p 50 ${shellescape(`env ${envPrefix} ${shellCmd}`)}`, {
        stdio: 'inherit',
      });
    } catch (e) {
      // tmux not installed, session gone, or split failed. Roll back + surface.
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      throw new Error(`Failed to open agent pane in tmux: ${(e as Error).message}. Is tmux installed and the session valid?`);
    }
  } else {
    // 📖 Direct exec path: let the caller restore the terminal first (exit Ink),
    // then spawn the agent with inherited stdio.
    try {
      onBeforeExec?.();
      const child = spawn(binary, args, { stdio: 'inherit', env: launchEnv(contextFile, taskId, kandownDir) });

      child.on('error', e => {
        rollbackTaskStatus(kandownDir, taskId, originalStatus);
        console.error(`[kandown] Failed to launch ${agentName}: ${e.message}`);
        process.exit(1);
      });

      child.on('exit', code => {
        // 📖 Clean exit (0) → return control to the shell. Null = killed by
        // signal → don't override. Non-zero → exit non-zero so scripts detect
        // it (t112). We never auto-rollback here: a non-zero exit may still
        // mean the agent did real work and the user will review the task.
        if (code === 0) process.exit(0);
        if (code === null) return;
        process.exit(code);
      });
    } catch (e) {
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      throw new Error(`Failed to launch ${agentName}: ${(e as Error).message}`);
    }
  }
}

/**
 * 📖 Blocking launch for the cascade orchestrator. Spawns the agent with
 * inherited stdio (the terminal becomes the agent's for the duration), awaits
 * its exit, and resolves with the exit code. No tmux split, no exec-replace —
 * the caller (`kandown run`) stays alive to read the task status afterwards
 * and decide whether to chain the next task.
 *
 * On spawn `error` (binary missing etc.) the promise rejects and the task is
 * rolled back to its original status. A non-zero / null *exit* does NOT reject
 * — the agent may have crashed after doing useful work, so the orchestrator
 * re-reads the task and decides.
 */
export function runAgentSync(opts: LaunchAgentOpts): Promise<{ exitCode: number }> {
  const { taskId, kandownDir } = opts;
  const prepared = prepareLaunch(opts);
  const { binary, args, contextFile, originalStatus, agentName } = prepared;

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit', env: launchEnv(contextFile, taskId, kandownDir) });

    child.on('error', e => {
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      reject(new Error(`Failed to launch ${agentName}: ${e.message}`));
    });

    child.on('exit', code => {
      resolve({ exitCode: code ?? 0 });
    });
  });
}

/**
 * 📖 Best-effort rollback of a task's status after a failed agent launch. Logs
 * a warning if the rollback itself fails so the user is not left with a
 * silently-inconsistent task file (t112).
 */
function rollbackTaskStatus(kandownDir: string, taskId: string, originalStatus: string): void {
  const ok = moveTaskToColumn(kandownDir, taskId, originalStatus);
  if (!ok) {
    console.warn(`[kandown] Could not roll back task ${taskId} to ${originalStatus} — update it manually.`);
  }
}

/**
 * 📖 Builds a shell command string from binary + args array.
 * Args are shell-escaped so spaces and special chars are safe.
 */
function buildShellCmd(binary: string, args: string[]): string {
  const parts = [binary, ...args].map(shellescape);
  return parts.join(' ');
}

/**
 * 📖 Minimal shell escaping: wraps a string in single quotes and escapes embedded
 * single quotes. Handles the common case of prompt strings containing backticks,
 * double quotes, and newlines safely.
 */
function shellescape(str: string): string {
  // 📖 Single-quote wrap: safe for all chars except single quotes themselves.
  // Embedded single quotes become: '\'' (end quote, escaped quote, reopen quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}
