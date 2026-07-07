/**
 * @file CLI agent launcher
 * @description Orchestrates the full task launch flow: read context, build prompt,
 * auto-move task to In Progress, and spawn the chosen AI agent — either in a new
 * tmux pane (if inside tmux) or by replacing the current process (exec).
 *
 * 📖 Launch strategy (in priority order):
 *   1. tmux split-pane: if `$TMUX` is set, the kandown TUI stays visible in the
 *      left pane and the agent opens in a new right pane (50% width).
 *   2. Direct exec: exit the TUI (Ink's exit() + process exit), then exec the agent
 *      as a child process with inherited stdio. The terminal becomes the agent's.
 *
 * The caller (board.tsx) is responsible for calling Ink's `exit()` before calling
 * `launchAgent` when NOT in tmux, so the alternate screen buffer is restored first.
 *
 * @functions
 *  → isInTmux       — detects if we're running inside a tmux session
 *  → launchAgent    — full launch orchestration
 *  → buildShellCmd  — constructs a safe shell-escaped command string for tmux
 *
 * @exports isInTmux, launchAgent, LaunchAgentOpts
 */

import { execSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTask, readAgentDoc, moveTaskToColumn } from './board-reader.js';
import { getAgentById, buildPrompt } from './agents.js';

// 📖 Options for the launchAgent function
export interface LaunchAgentOpts {
  /** Task ID, e.g. 't-019' */
  taskId: string;
  /** Agent ID from the registry, e.g. 'claude' */
  agentId: string;
  /** Absolute path to the .kandown/ directory */
  kandownDir: string;
  /**
   * Called just before the process is replaced (non-tmux path).
   * Use this to call Ink's exit() and restore the terminal.
   */
  onBeforeExec?: () => void;
}

/**
 * 📖 Returns true if the current process is running inside a tmux session.
 * $TMUX is set by tmux itself to the socket path — reliable detection.
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * 📖 Main entry point. Orchestrates the full launch:
 *   1. Reads the task file and agent doc
 *   2. Builds the prompt (system + task instruction)
 *   3. Auto-moves the task to "In Progress" in its task frontmatter
 *   4. Writes a context file to /tmp for reference
 *   5. Spawns the agent in tmux split or direct exec
 *
 * Each step is guarded so a failure produces a clear error instead of crashing
 * the TUI. When the agent fails to spawn AFTER the task was moved to In
 * Progress, the task is rolled back to its original column (t112).
 *
 * @throws if the agent ID is not recognized or a critical step fails
 */
export function launchAgent(opts: LaunchAgentOpts): void {
  const { taskId, agentId, kandownDir, onBeforeExec } = opts;

  // 📖 Step 1: Resolve agent definition
  const agentDef = getAgentById(agentId);
  if (!agentDef) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // 📖 Step 2: Read task file. readTask returns a minimal placeholder when the
  // file is missing, so this only throws on a genuine fs error.
  let task;
  try {
    task = readTask(kandownDir, taskId);
  } catch (e) {
    throw new Error(`Failed to read task ${taskId}: ${(e as Error).message}`);
  }
  const originalStatus = task.frontmatter.status || 'Backlog';

  // 📖 Step 3: Read agent docs (non-critical — agent can launch without them).
  const agentDoc = readAgentDoc(kandownDir);

  // 📖 Step 4: Build the prompt strings
  const taskFileContent = [
    `---`,
    `id: ${task.frontmatter.id}`,
    `title: ${task.frontmatter.title}`,
    `status: ${task.frontmatter.status ?? 'unknown'}`,
    `---`,
    '',
    task.body.trim(),
  ].join('\n');

  const { systemPrompt, taskPrompt } = buildPrompt(agentDoc, taskFileContent, taskId, kandownDir);

  // 📖 Step 5: Auto-move to In Progress before launching. Track success so we
  // can roll back if the agent fails to spawn (t112).
  const taskMoved = moveTaskToColumn(kandownDir, taskId, 'In Progress');
  if (!taskMoved) {
    throw new Error(`Could not move task ${taskId} to In Progress — task file missing or unwritable.`);
  }

  // 📖 Step 6: Write the full context to a temp file. Non-critical: the agent
  // gets its prompt directly as a CLI arg, this file is only a safety net for
  // very large prompts that hit the argv-length limit (t112).
  const contextFile = join(tmpdir(), `kandown-${taskId}-context.md`);
  try {
    writeFileSync(contextFile, `${systemPrompt}\n\n---\n\n${taskPrompt}`, 'utf8');
  } catch (e) {
    console.warn(`[kandown] Failed to write context file (${(e as Error).message}); launching anyway.`);
  }

  // 📖 Build the command array from the agent definition
  const launchOpts = { systemPrompt, taskPrompt, kandownDir, taskId };
  const [binary, ...args] = agentDef.buildCommand(launchOpts);

  if (!binary) {
    rollbackTaskStatus(kandownDir, taskId, originalStatus);
    throw new Error(`Agent ${agentId} returned an empty command`);
  }

  if (isInTmux()) {
    // 📖 tmux path: open a new 50%-wide right pane, TUI stays in the left pane.
    // We build a shell command string from the binary + args.
    //
    // A new tmux pane inherits the tmux *server's* environment, NOT this
    // process's env overrides, so execSync's `env` option alone won't reach
    // the agent. We prefix `env VAR=val ...` to forward KANDOWN_* vars into
    // the pane, keeping parity with the direct-exec path below.
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
      // tmux not installed, session gone, or split failed. Roll back the task
      // status and surface a clear error instead of leaving the task in
      // "In Progress" with no agent running (t112).
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      throw new Error(`Failed to open agent pane in tmux: ${(e as Error).message}. Is tmux installed and the session valid?`);
    }
  } else {
    // 📖 Direct exec path: let the caller restore the terminal first (exit Ink),
    // then spawn the agent with inherited stdio.
    try {
      onBeforeExec?.();
      const child = spawn(binary, args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          // 📖 Expose the context file path so agents that support env vars can use it
          KANDOWN_CONTEXT_FILE: contextFile,
          KANDOWN_TASK_ID: taskId,
          KANDOWN_DIR: kandownDir,
        },
      });

      child.on('error', e => {
        // Spawn failed (binary missing, etc.). Roll back + tell the user.
        rollbackTaskStatus(kandownDir, taskId, originalStatus);
        console.error(`[kandown] Failed to launch ${agentDef.name}: ${e.message}`);
        process.exit(1);
      });

      child.on('exit', code => {
        // 📖 Non-zero / null exit = agent crashed or was killed. We no longer
        // call process.exit unconditionally on crash — instead let the TUI
        // recover when possible. In direct-exec mode we typically want to
        // return control to the shell, so exit with the agent's code only on
        // clean exit; on crash, exit non-zero so scripts can detect it (t112).
        if (code === 0) process.exit(0);
        if (code === null) return; // process killed by signal — don't override
        process.exit(code);
      });
    } catch (e) {
      rollbackTaskStatus(kandownDir, taskId, originalStatus);
      throw new Error(`Failed to launch ${agentDef.name}: ${(e as Error).message}`);
    }
  }
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
