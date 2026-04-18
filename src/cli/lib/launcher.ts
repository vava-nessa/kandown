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
 * @throws if the agent ID is not recognized
 */
export function launchAgent(opts: LaunchAgentOpts): void {
  const { taskId, agentId, kandownDir, onBeforeExec } = opts;

  // 📖 Step 1: Resolve agent definition
  const agentDef = getAgentById(agentId);
  if (!agentDef) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // 📖 Step 2: Read task file and agent docs
  const task = readTask(kandownDir, taskId);
  const agentDoc = readAgentDoc(kandownDir);

  // 📖 Step 3: Build the prompt strings
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

  // 📖 Step 4: Auto-move to In Progress before launching.
  moveTaskToColumn(kandownDir, taskId, 'In Progress');

  // 📖 Step 5: Write the full context to a temp file so the user/agent can reference it.
  // Useful for agents like opencode that can't receive a startup prompt via args.
  const contextFile = join(tmpdir(), `kandown-${taskId}-context.md`);
  writeFileSync(contextFile, `${systemPrompt}\n\n---\n\n${taskPrompt}`, 'utf8');

  // 📖 Build the command array from the agent definition
  const launchOpts = { systemPrompt, taskPrompt, kandownDir, taskId };
  const [binary, ...args] = agentDef.buildCommand(launchOpts);

  if (!binary) {
    throw new Error(`Agent ${agentId} returned an empty command`);
  }

  if (isInTmux()) {
    // 📖 tmux path: open a new 50%-wide right pane, TUI stays in the left pane.
    // We build a shell command string from the binary + args.
    const shellCmd = buildShellCmd(binary, args);
    execSync(`tmux split-window -h -p 50 ${shellescape(shellCmd)}`, {
      stdio: 'inherit',
    });
  } else {
    // 📖 Direct exec path: let the caller restore the terminal first (exit Ink),
    // then spawn the agent with inherited stdio.
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

    child.on('exit', code => {
      process.exit(code ?? 0);
    });
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
