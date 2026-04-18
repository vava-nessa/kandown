/**
 * @file AI agent registry for the CLI task launcher
 * @description Defines all supported AI coding agents, detects which are installed
 * on the current system, and builds the shell command to launch each one with
 * a task context + system prompt.
 *
 * 📖 Detection uses `which <binary>` via execFileSync — results are cached in a
 * module-level Map so detection only runs once per CLI session.
 *
 * Each agent has a `buildCommand` function that returns `[binary, ...args]`.
 * The caller (launcher.ts) is responsible for actually spawning the process.
 *
 * Supported agents:
 *  - Claude Code (`claude`) — interactive session with initial prompt arg
 *  - Codex (`codex`) — OpenAI Codex CLI
 *  - Gemini CLI (`gemini`) — Google Gemini CLI
 *  - Goose (`goose`) — Block's open-source AI agent
 *  - Aider (`aider`) — git-aware AI pair programmer
 *  - OpenCode (`opencode`) — Sst's TUI AI coding tool
 *
 * @functions
 *  → getAgentById        — returns agent definition by ID
 *  → detectInstalledAgents — returns only agents whose binary is in PATH
 *  → isAgentInstalled    — checks a single agent
 *  → buildPrompt         — constructs the full prompt string to inject
 *
 * @exports AgentDef, LaunchOpts, AGENTS, getAgentById, detectInstalledAgents, isAgentInstalled, buildPrompt
 */

import { execFileSync } from 'node:child_process';

// 📖 Options passed to buildCommand — everything needed to construct the launch args
export interface LaunchOpts {
  /** Full system prompt / agent instructions (AGENT_KANDOWN_COMPACT.md content) */
  systemPrompt: string;
  /** Task instruction: task file content + directive to start working */
  taskPrompt: string;
  /** Absolute path to the .kandown/ directory */
  kandownDir: string;
  /** Task ID, e.g. 't-019' */
  taskId: string;
}

// 📖 A single agent definition — how to detect and invoke it
export interface AgentDef {
  id: string;
  name: string;
  /** Binary name to look for in PATH */
  bin: string;
  /**
   * Builds the full [binary, ...args] command array.
   * The combined prompt (system + task) is passed as a single string.
   */
  buildCommand: (opts: LaunchOpts) => string[];
  /** Whether the agent opens an interactive terminal session */
  interactive: boolean;
  /** Short description shown in the agent picker */
  description: string;
}

// 📖 All supported agents. Order determines display order in the agent picker.
export const AGENTS: AgentDef[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    description: 'Anthropic Claude (interactive session)',
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      // 📖 Claude Code accepts an initial prompt as a positional arg.
      // We combine system doc + task prompt into one string since Claude Code
      // doesn't expose a separate --system-prompt flag in its public CLI.
      const combined = `${systemPrompt}\n\n---\n\n${taskPrompt}`;
      return ['claude', combined];
    },
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    bin: 'codex',
    description: 'OpenAI Codex CLI',
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}\n\n---\n\n${taskPrompt}`;
      return ['codex', combined];
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    description: 'Google Gemini CLI',
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}\n\n---\n\n${taskPrompt}`;
      // 📖 Gemini CLI: `gemini -p "prompt"` for non-interactive,
      // or just `gemini "prompt"` to start with context.
      return ['gemini', '-p', combined];
    },
  },
  {
    id: 'goose',
    name: 'Goose',
    bin: 'goose',
    description: 'Block open-source AI agent',
    interactive: false,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      const combined = `${systemPrompt}\n\n---\n\n${taskPrompt}`;
      return ['goose', 'run', '--text', combined];
    },
  },
  {
    id: 'aider',
    name: 'Aider',
    bin: 'aider',
    description: 'Git-aware AI pair programmer',
    interactive: true,
    buildCommand: ({ systemPrompt, taskPrompt }) => {
      // 📖 Aider accepts `--message` for an initial message that kicks off the session.
      // We put the task prompt as the message and the system doc inline.
      const combined = `${systemPrompt}\n\n---\n\n${taskPrompt}`;
      return ['aider', '--message', combined];
    },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    description: 'SST AI coding TUI',
    interactive: true,
    buildCommand: ({ taskPrompt }) => {
      // 📖 OpenCode is a full TUI — it doesn't accept a startup prompt via args.
      // We launch it and print a hint about the context file.
      // The launcher writes the context to a temp file before spawning.
      return ['opencode'];
    },
  },
];

// 📖 Cache: binary name → whether it's installed. Populated lazily on first detection call.
const installCache = new Map<string, boolean>();

/**
 * 📖 Checks if a binary is available in PATH using `which`.
 * Caches the result so repeated calls are O(1).
 */
export function isAgentInstalled(bin: string): boolean {
  if (installCache.has(bin)) return installCache.get(bin)!;
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    installCache.set(bin, true);
    return true;
  } catch {
    installCache.set(bin, false);
    return false;
  }
}

/**
 * 📖 Returns the subset of AGENTS whose binary is currently installed in PATH.
 * At minimum always returns an empty array (never throws).
 */
export function detectInstalledAgents(): AgentDef[] {
  return AGENTS.filter(agent => isAgentInstalled(agent.bin));
}

/**
 * 📖 Returns an agent definition by its ID, or undefined if not found.
 */
export function getAgentById(id: string): AgentDef | undefined {
  return AGENTS.find(a => a.id === id);
}

/**
 * 📖 Builds the complete prompt to inject into the agent.
 * Structure:
 *   1. Agent rules (system doc) from AGENT_KANDOWN_COMPACT.md
 *   2. The full task file content
 *   3. A direct instruction to start working on the task
 *
 * @param agentDoc   - content of AGENT_KANDOWN_COMPACT.md (or fallback)
 * @param taskContent - full raw content of the task markdown file
 * @param taskId     - task ID for the instruction
 * @param kandownDir - path to .kandown/ for the agent to know where files are
 */
export function buildPrompt(
  agentDoc: string,
  taskContent: string,
  taskId: string,
  kandownDir: string,
): { systemPrompt: string; taskPrompt: string } {
  const systemPrompt = agentDoc.trim();

  const taskPrompt = [
    `## Your Task: ${taskId}`,
    '',
    taskContent.trim(),
    '',
    '---',
    '',
    `**Start working on task ${taskId} now.**`,
    '',
    `The kandown directory is at: \`${kandownDir}\``,
    '',
    'Before anything else:',
    `1. Set task ${taskId} frontmatter status to "In Progress" (it may already be there — that\'s fine)`,
    '2. Work through each subtask, checking them off and adding reports as you go',
    '3. When done, write the completion report and set the task status to "Done"',
  ].join('\n');

  return { systemPrompt, taskPrompt };
}
