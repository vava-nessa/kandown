/**
 * @file AI agent registry for the CLI task launcher
 * @description Defines the built-in AI coding agents the CLI knows how to
 * launch, merges them with the versioned team catalog (`.kandown/agents.json`),
 * detects which binaries are installed on the current machine, and builds the
 * shell command — plus the system+task prompt — handed to each agent.
 *
 * 📖 Two layers:
 *   1. **Built-in registry** (`AGENTS`) — owns `buildCommand`, the exact arg
 *      layout each CLI expects. This is code, not data, so it lives here and
 *      not in agents.json.
 *   2. **Team catalog** (`.kandown/agents.json`) — overrides scalars (bin,
 *      aliases, extraArgs, description) for built-ins and declares fully
 *      custom agents that use a generic launch mode. Loaded by
 *      `loadCatalog(kandownDir)` and merged on top of the built-ins.
 *
 * 📖 Detection uses `which <binary>` via execFileSync and caches results in a
 * module-level Map, so detection only runs once per binary per CLI session.
 * `warmupDetection` pre-seeds that cache at startup so the first agent-picker
 * open is instant.
 *
 * Supported built-in agents:
 *  - Claude Code (`claude`) — interactive session with initial prompt arg
 *  - Codex (`codex`) — OpenAI Codex CLI
 *  - Gemini CLI (`gemini`) — Google Gemini CLI
 *  - Goose (`goose`) — Block's open-source AI agent
 *  - Aider (`aider`) — git-aware AI pair programmer
 *  - OpenCode (`opencode`) — SST's TUI AI coding tool
 *  - Cursor (`cursor`) — IDE; opens the project (paste prompt from context file)
 *  - Pi (`pi`) — Earendil Works pi coding agent
 *
 * @functions
 *  → loadCatalog          — built-ins overridden + extended by agents.json
 *  → detectInstalledAgents — only catalog agents whose binary is in PATH
 *  → warmupDetection      — pre-seed the install cache (startup scan)
 *  → getAgentById         — find a catalog entry by id
 *  → resolveAgentEntry    — resolve a frontmatter `assignee:` to a catalog entry
 *  → isAgentInstalled     — single-binary PATH check (cached)
 *  → buildAgentCommand    — [binary, ...args] for any entry (built-in or custom)
 *  → buildPrompt          — system + task prompt, optionally with handoff/queue
 *
 * @exports AgentDef, LaunchOpts, AGENTS, loadCatalog, detectInstalledAgents, warmupDetection, getAgentById, resolveAgentEntry, isAgentInstalled, buildAgentCommand, buildPrompt
 * @see src/cli/lib/agents-config.ts — the persistent catalog file
 * @see src/lib/agent-aliases.ts — shared alias table
 */

import { execFileSync } from 'node:child_process';
import { loadAgentsConfig, resolveCascade, type AgentCatalogEntry, type LaunchMode } from './agents-config.js';

// 📖 Options passed to buildCommand — everything needed to construct the launch args
export interface LaunchOpts {
  /** Full system prompt / agent instructions (AGENT_KANDOWN.md content) */
  systemPrompt: string;
  /** Task instruction: task file content + directive to start working */
  taskPrompt: string;
  /** Absolute path to the .kandown/ directory */
  kandownDir: string;
  /** Task ID, e.g. 't-019' */
  taskId: string;
}

// 📖 A single agent definition — how to detect and invoke it. The `buildCommand`
// field is what makes a *built-in* agent; custom agents leave it undefined and
// `buildAgentCommand` falls back to a generic builder driven by `launchMode`.
export interface AgentDef {
  id: string;
  name: string;
  /** Binary name to look for in PATH */
  bin: string;
  /** Extra aliases resolving to this agent from `assignee:` (beyond the id). */
  aliases?: string[];
  /**
   * Built-in only: returns the full [binary, ...args] command array. Undefined
   * for custom agents, which use `launchMode` + `buildAgentCommand` instead.
   */
  buildCommand?: (opts: LaunchOpts) => string[];
  /** Whether the agent opens an interactive terminal session */
  interactive: boolean;
  /** Short description shown in the agent picker */
  description: string;
  /** Team-wide extra CLI args appended after the base command. */
  extraArgs?: string[];
  /** Custom-agent launch mode (ignored when `buildCommand` is set). */
  launchMode?: LaunchMode;
  /** Flag name for `*-flag` launch modes. */
  promptFlag?: string;
}

// 📖 Combine system doc + task prompt into one string. Every built-in CLI that
// takes the prompt inline shares this shape, so factor it out.
function combinedPrompt(opts: LaunchOpts): string {
  return `${opts.systemPrompt}\n\n---\n\n${opts.taskPrompt}`;
}

// 📖 All supported built-in agents. Order determines default display order in
// the agent picker (agents.json can reorder/override). Each carries its own
// buildCommand because the arg layout genuinely differs per CLI.
export const AGENTS: AgentDef[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    description: 'Anthropic Claude (interactive session)',
    interactive: true,
    aliases: ['claude', 'claudecode', 'anthropic', 'claudeai'],
    buildCommand: opts => ['claude', combinedPrompt(opts)],
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    bin: 'codex',
    description: 'OpenAI Codex CLI',
    interactive: true,
    aliases: ['codex', 'openaicodex'],
    buildCommand: opts => ['codex', combinedPrompt(opts)],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    description: 'Google Gemini CLI',
    interactive: true,
    aliases: ['gemini', 'geminicli', 'googlegemini'],
    buildCommand: opts => {
      // 📖 `-i/--prompt-interactive` runs the prompt then continues
      // interactively — matches this agent's `interactive: true`. `-p` would
      // run headless and drop the user out of the TUI.
      return ['gemini', '--prompt-interactive', combinedPrompt(opts)];
    },
  },
  {
    id: 'goose',
    name: 'Goose',
    bin: 'goose',
    description: 'Block open-source AI agent',
    interactive: false,
    aliases: ['goose', 'blockgoose'],
    buildCommand: opts => ['goose', 'run', '--text', combinedPrompt(opts)],
  },
  {
    id: 'aider',
    name: 'Aider',
    bin: 'aider',
    description: 'Git-aware AI pair programmer',
    interactive: true,
    aliases: ['aider'],
    buildCommand: opts => ['aider', '--message', combinedPrompt(opts)],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    description: 'SST AI coding TUI',
    interactive: true,
    aliases: ['opencode', 'sstopencode'],
    buildCommand: opts => {
      // 📖 `--prompt` pre-fills the initial user message in the interactive TUI.
      // `run` is a non-interactive one-shot and would not launch the TUI.
      return ['opencode', '--prompt', combinedPrompt(opts)];
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    bin: 'cursor',
    description: 'Cursor IDE (opens project; paste prompt)',
    interactive: true,
    aliases: ['cursor'],
    // 📖 Cursor is an IDE, not a prompt-taking CLI: there is no documented flag
    // to inject a task prompt, so we open the project root and rely on the
    // KANDOWN_CONTEXT_FILE env var (set by the launcher) + the prompt printed
    // to the terminal for the user to paste into Cursor's agent panel.
    buildCommand: opts => ['cursor', getProjectCwd(opts.kandownDir)],
  },
  {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    description: 'Earendil Works pi coding agent',
    interactive: true,
    aliases: ['pi', 'piearendil', 'picodingagent'],
    buildCommand: opts => ['pi', combinedPrompt(opts)],
  },

  // 📖 Wide-compat push (mode-chasse / exa) — every entry here must also
  // exist in src/lib/agent-aliases.ts (alias table) and src/components/
  // agentIcons.tsx (brand glyph / kind). The `which <bin>` check happens
  // implicitly via isAgentInstalled — entries that aren't on PATH simply
  // don't show in the picker.
  {
    id: 'crush',
    name: 'Crush',
    bin: 'crush',
    description: "Charmbracelet Crush (Glamourous agentic TUI)",
    interactive: true,
    aliases: ['crush', 'charmbraceletcrush'],
    buildCommand: opts => ['crush', combinedPrompt(opts)],
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    bin: 'openclaw',
    description: 'OpenClaw Foundation personal AI assistant',
    interactive: true,
    aliases: ['openclaw', 'openclawfoundation', 'claw'],
    buildCommand: opts => ['openclaw', combinedPrompt(opts)],
  },
  {
    id: 'kimi',
    name: 'Kimi Code CLI',
    bin: 'kimi',
    description: "Moonshot Kimi Code CLI (terminal coding agent)",
    interactive: true,
    aliases: ['kimi', 'moonshot', 'moonshotai', 'kimicode'],
    buildCommand: opts => ['kimi', combinedPrompt(opts)],
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    description: 'Alibaba Qwen3-Coder CLI (QwenLM/qwen-code)',
    interactive: true,
    aliases: ['qwen', 'qwencode', 'qwenlm', 'alibabaqwen'],
    buildCommand: opts => ['qwen', combinedPrompt(opts)],
  },
  {
    id: 'vibe',
    name: 'Mistral Vibe',
    bin: 'vibe',
    description: 'Mistral Vibe CLI (Devstral-powered)',
    interactive: true,
    aliases: ['vibe', 'mistralvibe'],
    buildCommand: opts => ['vibe', combinedPrompt(opts)],
  },
  {
    id: 'grok',
    name: 'Grok Build',
    bin: 'grok',
    description: 'xAI Grok Build (terminal coding agent, pow. by Grok 4.5)',
    interactive: true,
    aliases: ['grok', 'grokbuild', 'xaigrok', 'xai'],
    buildCommand: opts => ['grok', combinedPrompt(opts)],
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    bin: 'openhands',
    description: 'OpenHands CLI (Python; multi-agent)',
    interactive: true,
    aliases: ['openhands', 'openhandscli', 'openhand'],
    buildCommand: opts => ['openhands', combinedPrompt(opts)],
  },
  {
    id: 'pplx',
    name: 'Perplexity CLI',
    bin: 'pplx',
    description: 'Perplexity pplx CLI (search + agent capabilities)',
    interactive: true,
    aliases: ['pplx', 'pplxcli', 'perplexitycli', 'perplexity'],
    buildCommand: opts => ['pplx', combinedPrompt(opts)],
  },
];

/** 📖 `.kandown/` lives one level below the project root, so the cwd to open an
 *  IDE in is its parent. Falls back to process.cwd() if .kandown is at root. */
function getProjectCwd(kandownDir: string): string {
  // Cheap, dependency-free: strip a trailing `/.kandown` or `/kandown`.
  const m = kandownDir.replace(/\/(\.kandown|kandown)$/, '');
  return m && m !== kandownDir ? m : process.cwd();
}

// 📖 Cache: binary name → whether it's installed. Populated lazily on first
// detection call, or eagerly by warmupDetection at startup.
const installCache = new Map<string, boolean>();

/** 📖 Browser-safe, JSON-serializable shape for one detected agent. This is
 *  what `/api/agents` returns to the web UI — no functions, no Node types, so
 *  it survives a `JSON.stringify` round-trip and a `fetch().json()` parse. */
export interface AgentDetectionJSON {
  id: string;
  name: string;
  bin: string;
  installed: boolean;
  interactive: boolean;
  description: string;
  aliases: string[];
  preferred?: boolean;
}

/**
 * 📖 Returns the whole catalog with a live `which`-installed flag per agent,
 * plus the project's preferred agent id. This is the single server-side entry
 * point the web UI's `/api/agents` route calls — the browser itself can never
 * run `which`, so detection always happens here (in the daemon, or in the
 * Vite dev middleware) and is handed to the client as JSON, exactly like
 * `/api/config`. When `kandownDir` is omitted, only the built-in catalog is
 * scanned (used by contexts with no project context, e.g. a bare dev server).
 */
export function detectCatalogJSON(kandownDir?: string): { preferred?: string; agents: AgentDetectionJSON[] } {
  const catalog = loadCatalog(kandownDir);
  const preferred = kandownDir ? loadAgentsConfig(kandownDir).preferred : undefined;
  return {
    ...(preferred ? { preferred } : {}),
    agents: catalog.map(a => ({
      id: a.id,
      name: a.name,
      bin: a.bin,
      installed: isAgentInstalled(a.bin),
      interactive: a.interactive,
      description: a.description,
      aliases: a.aliases ?? [],
      ...(preferred === a.id ? { preferred: true } : {}),
    })),
  };
}

/**
 * 📖 Checks if a binary is available in PATH using `which`. Caches the result
 * so repeated calls are O(1). Windows uses `where`, but kandown's CLI is
 * Unix-first; `which` is shelled out and missing-binary simply returns false.
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
 * 📖 Pre-seeds the install cache for every catalog entry. Called once at CLI/TUI
 * startup so the first agent-picker open and the first cascade dry-run don't
 * pay the `which` latency inline. Safe to call repeatedly — already-cached
 * binaries are skipped. Non-throwing.
 */
export function warmupDetection(catalog: AgentDef[]): void {
  for (const agent of catalog) {
    if (!installCache.has(agent.bin)) isAgentInstalled(agent.bin);
  }
}

/**
 * 📖 Returns the merged catalog: built-in AGENTS with scalars overridden by
 * `.kandown/agents.json`, then any fully custom entries appended. Built-ins
 * keep their `buildCommand`; custom entries get a generic builder via
 * `buildAgentCommand`. When `kandownDir` is omitted, returns the bare built-ins
 * (used by callers that only need the static list).
 */
export function loadCatalog(kandownDir?: string): AgentDef[] {
  const builtins = AGENTS;
  if (!kandownDir) return builtins.map(cloneDef);

  const cfg = loadAgentsConfig(kandownDir);
  const byId = new Map<string, AgentDef>();
  // Start from built-ins (with their buildCommand) keyed by id.
  for (const b of builtins) byId.set(b.id, cloneDef(b));

  // Apply JSON overrides + record custom-only ids to append last (preserving
  // file order for them). A JSON entry whose id matches a built-in overrides
  // scalars but keeps the built-in buildCommand.
  const custom: AgentDef[] = [];
  for (const entry of cfg.agents) {
    const existing = byId.get(entry.id);
    if (existing) {
      // Override scalars only.
      existing.name = entry.name ?? existing.name;
      existing.bin = entry.bin ?? existing.bin;
      existing.description = entry.description ?? existing.description;
      if (typeof entry.interactive === 'boolean') existing.interactive = entry.interactive;
      if (entry.aliases) existing.aliases = entry.aliases;
      if (entry.extraArgs) existing.extraArgs = entry.extraArgs;
    } else {
      custom.push(catalogEntryToDef(entry));
    }
  }

  // Stable order: built-ins first (in their declared order), then customs in
  // file order. preferred (if set) is floated to the top by callers/picker.
  return [...builtins.map(b => byId.get(b.id)!), ...custom];
}

/** 📖 Deep-ish clone so callers can't mutate the shared built-in objects. */
function cloneDef(d: AgentDef): AgentDef {
  const { buildCommand, ...rest } = d;
  const copy: AgentDef = { ...rest, interactive: d.interactive };
  if (buildCommand) copy.buildCommand = buildCommand;
  if (d.aliases) copy.aliases = [...d.aliases];
  if (d.extraArgs) copy.extraArgs = [...d.extraArgs];
  return copy;
}

/** 📖 Converts a data-only catalog entry into a full AgentDef (no buildCommand;
 *  `buildAgentCommand` handles it generically via launchMode). */
function catalogEntryToDef(entry: AgentCatalogEntry): AgentDef {
  return {
    id: entry.id,
    name: entry.name,
    bin: entry.bin,
    interactive: entry.interactive ?? true,
    description: entry.description ?? `${entry.name} (custom)`,
    ...(entry.aliases ? { aliases: [...entry.aliases] } : {}),
    ...(entry.extraArgs ? { extraArgs: [...entry.extraArgs] } : {}),
    ...(entry.launchMode ? { launchMode: entry.launchMode } : {}),
    ...(entry.promptFlag ? { promptFlag: entry.promptFlag } : {}),
  };
}

/**
 * 📖 Returns the subset of the catalog whose binary is currently installed in
 * PATH. When `kandownDir` is omitted, scans the bare built-ins (legacy callers).
 */
export function detectInstalledAgents(kandownDir?: string): AgentDef[] {
  const catalog = loadCatalog(kandownDir);
  return catalog.filter(agent => isAgentInstalled(agent.bin));
}

/**
 * 📖 Returns a catalog entry by id. When `kandownDir` is provided, looks up the
 * merged catalog (so custom + overridden agents resolve); otherwise the bare
 * built-ins.
 */
export function getAgentById(id: string, kandownDir?: string): AgentDef | undefined {
  return loadCatalog(kandownDir).find(a => a.id === id);
}

/** 📖 Normalises an alias/id string the same way the shared resolver does. */
function normAlias(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 📖 Resolves a frontmatter `assignee:` value to a catalog entry, using the
 * entry's id + aliases. Returns undefined for humans/unknowns so callers can
 * fall back to the picker or the preferred agent. The lookup is scoped to the
 * merged catalog so team aliases in agents.json are honoured.
 */
export function resolveAgentEntry(assignee: string | null | undefined, kandownDir?: string): AgentDef | undefined {
  if (!assignee) return undefined;
  const norm = normAlias(assignee);
  if (!norm) return undefined;
  const catalog = loadCatalog(kandownDir);
  for (const agent of catalog) {
    if (normAlias(agent.id) === norm) return agent;
    if (agent.aliases?.some(a => normAlias(a) === norm)) return agent;
  }
  return undefined;
}

/**
 * 📖 Builds the [binary, ...args] command for any catalog entry:
 *   - built-ins use their hand-written `buildCommand`
 *   - custom agents use a generic builder driven by `launchMode`
 * In both cases the team-wide `extraArgs` are appended last (so they can
 * override earlier flags the way most CLIs resolve duplicates).
 */
export function buildAgentCommand(agent: AgentDef, opts: LaunchOpts): string[] {
  let base: string[];
  if (agent.buildCommand) {
    base = agent.buildCommand(opts);
  } else {
    base = genericCommand(agent, opts);
  }
  if (agent.extraArgs && agent.extraArgs.length > 0) {
    base = [...base, ...agent.extraArgs];
  }
  return base;
}

/** 📖 Generic launch builder for custom agents without a built-in buildCommand. */
function genericCommand(agent: AgentDef, opts: LaunchOpts): string[] {
  const prompt = combinedPrompt(opts);
  switch (agent.launchMode ?? 'positional') {
    case 'prompt-flag':
      return [agent.bin, agent.promptFlag ?? '--prompt', prompt];
    case 'message-flag':
      return [agent.bin, agent.promptFlag ?? '--message', prompt];
    case 'text-flag':
      return [agent.bin, agent.promptFlag ?? '--text', prompt];
    case 'positional':
    default:
      return [agent.bin, prompt];
  }
}

/** 📖 Cascade preferences read straight off the catalog config. Convenience
 *  accessor so cascade.ts and the run command don't each reload agents.json. */
export function getCascadeConfig(kandownDir: string): { unassignedBehavior: 'skip' | 'preferred'; sameSessionChain: boolean; preferred?: string } {
  const cfg = loadAgentsConfig(kandownDir);
  const cascade = resolveCascade(cfg.cascade);
  return {
    unassignedBehavior: cascade.unassignedBehavior,
    sameSessionChain: cascade.sameSessionChain,
    ...(typeof cfg.preferred === 'string' ? { preferred: cfg.preferred } : {}),
  };
}

/**
 * 📖 Builds the system + task prompt pair to inject into the agent.
 * Structure:
 *   1. Agent rules (system doc) from AGENT_KANDOWN.md
 *   2. The full task file content
 *   3. A direct instruction to start working on the task
 *
 * @param agentDoc    - content of AGENT_KANDOWN.md (or fallback)
 * @param taskContent - full raw content of the task markdown file
 * @param taskId      - task ID for the instruction
 * @param kandownDir  - path to .kandown/ for the agent to know where files are
 * @param handoff     - optional completion reports from previously-finished
 *                      tasks in the same cascade, prepended so the next agent
 *                      inherits upstream context (DAG report handoff).
 * @param queue       - optional list of (id,title) tasks the same agent session
 *                      must work through in order (same-session Ralph loop).
 */
export function buildPrompt(
  agentDoc: string,
  taskContent: string,
  taskId: string,
  kandownDir: string,
  handoff?: { taskId: string; title: string; report: string }[],
  queue?: { id: string; title: string }[],
): { systemPrompt: string; taskPrompt: string } {
  const handoffBlock = handoff && handoff.length > 0
    ? [
        '## Context from upstream tasks (cascade handoff)',
        '',
        ...handoff.flatMap(h => [
          `### ${h.taskId} — ${h.title}`,
          h.report?.trim() ? h.report.trim() : '_(no completion report written)_',
          '',
        ]),
        'Use the above as prior context. Do not redo work that is already done; build on it.',
        '',
        '---',
        '',
      ].join('\n')
    : '';

  const queueBlock = queue && queue.length > 0
    ? [
        '## Your queue (same-session cascade)',
        '',
        'Work through these tasks strictly in order. For each one: set its status to "In Progress", do the work, update the task file as you go, then set it to "Done" with a completion report before starting the next.',
        '',
        ...queue.map((q, i) => `${i + 1}. ${q.id} — ${q.title}`),
        '',
        'When the whole queue is Done, stop.',
        '',
        '---',
        '',
      ].join('\n')
    : '';

  const systemPrompt = agentDoc.trim();

  const taskPrompt = [
    queueBlock,
    handoffBlock,
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
    `1. Set task ${taskId} frontmatter status to "In Progress" (it may already be there — that's fine)`,
    '2. Work through each subtask, checking them off and adding reports as you go',
    '3. When done, write the completion report and set the task status to "Done"',
  ].join('\n');

  return { systemPrompt, taskPrompt };
}
