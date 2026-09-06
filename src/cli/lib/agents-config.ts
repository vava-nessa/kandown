/**
 * @file Persistent, versioned agent catalog (`.kandown/agents.json`)
 * @description The committed team contract for which AI coding agents a project
 * supports: their binary, aliases, launch mode, and per-agent extra CLI args,
 * plus project-wide cascade preferences (preferred agent, unassigned-task
 * behaviour, same-session chaining). Detection of which binaries are actually
 * installed stays runtime per-machine — this file is the *catalog*, not a
 * cache of the local $PATH.
 *
 * 📖 Why a separate file (not `kandown.json`)? The agent list is meant to be
 * edited by humans and shared over Git: a team standardises on "we launch
 * Claude Code with `--allowedTools Edit,Write,Bash`" once, here, and every
 * clone inherits it. `kandown.json` holds UI/board prefs that are more
 * personal; mixing the two would bloat the settings UI and make diff review
 * noisy. `kandown.json`'s legacy `agents: { preferred, extraArgs }` is still
 * read as a fallback so existing projects keep working.
 *
 * 📖 Merge model: the CLI ships a built-in registry (see `src/cli/lib/agents.ts`)
 * that owns the per-agent `buildCommand` logic — the exact arg layout each CLI
 * expects cannot be expressed in JSON. At runtime `loadCatalog` takes the
 * built-ins, overlays matching ids from this file (so a team can override
 * `bin`, `aliases`, `extraArgs`, `description`), and appends any fully custom
 * agent entries that use a generic launch mode. The JSON never needs to
 * duplicate the command-building logic.
 *
 * @functions
 *  → loadAgentsConfig  — read + default-merge `.kandown/agents.json`
 *  → saveAgentsConfig  — write it back (atomic)
 *  → defaultAgentsConfig — the shipped snapshot (used by `kandown init`)
 *  → resolveCascade    — fill cascade defaults
 *
 * @exports AgentCatalogEntry, CascadeConfig, AgentsConfig, AGENTS_CONFIG_VERSION, DEFAULT_CASCADE, loadAgentsConfig, saveAgentsConfig, defaultAgentsConfig, resolveCascade
 * @see src/cli/lib/agents.ts — built-in registry + buildCommand
 * @see src/cli/lib/init.ts (writeAgentsCatalog): seeds this file on `kandown init`
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write.js';

/** 📖 How a custom (non-built-in) agent receives its task prompt. Built-in
 *  agents ignore this field — they have hand-written `buildCommand` functions.
 *  Adding `stdin` here would require launcher-side stdin piping; left out on
 *  purpose until a real custom agent needs it (YAGNI). */
export type LaunchMode = 'positional' | 'prompt-flag' | 'message-flag' | 'text-flag';

/** 📖 One agent in the catalog. Mirrors a subset of `AgentDef` from agents.ts
 *  (without the `buildCommand` function, which is code, not data). */
export interface AgentCatalogEntry {
  /** Canonical id, e.g. `claude`. Matches built-in ids to override them. */
  id: string;
  /** Human-readable name shown in the picker. */
  name: string;
  /** Binary name looked up in $PATH. */
  bin: string;
  /** Extra aliases that resolve to this agent from a frontmatter `assignee:`. */
  aliases?: string[];
  /** Opens an interactive terminal session (vs. one-shot). */
  interactive?: boolean;
  /** Short description for the picker. */
  description?: string;
  /** Extra CLI args appended after the agent's base command (team-wide). */
  extraArgs?: string[];
  /** Launch mode for custom agents. Ignored for built-in ids. */
  launchMode?: LaunchMode;
  /** Flag name when launchMode is `*-flag`. Defaults: prompt-flag→`--prompt`,
   *  message-flag→`--message`, text-flag→`--text`. */
  promptFlag?: string;
}

/** 📖 Cascade orchestrator preferences. */
export interface CascadeConfig {
  /** What to do when a ready task has no resolvable agent assignee.
   *  `'skip'` (default) ignores it and continues the chain; `'preferred'`
   *  falls back to `AgentsConfig.preferred`. */
  unassignedBehavior?: 'skip' | 'preferred';
  /** Run the whole ready-queue inside ONE agent session (Ralph-style
   *  autonomous loop) instead of spawning one process per task with report
   *  handoff between them. */
  sameSessionChain?: boolean;
}

/** 📖 The full `.kandown/agents.json` shape. */
export interface AgentsConfig {
  version: number;
  /** Preferred agent id — pre-selected in the picker and used as the fallback
   *  when `cascade.unassignedBehavior === 'preferred'`. */
  preferred?: string;
  cascade?: CascadeConfig;
  agents: AgentCatalogEntry[];
}

export const AGENTS_CONFIG_VERSION = 1;

/** 📖 Cascade defaults applied when a key is absent from the file. */
export const DEFAULT_CASCADE: Required<CascadeConfig> = {
  unassignedBehavior: 'skip',
  sameSessionChain: false,
};

/**
 * 📖 The shipped snapshot, matching the built-in registry in agents.ts. Used by
 * `kandown init` to seed `.kandown/agents.json`. Keep this in sync with the
 * `AGENTS` array — drift is harmless at runtime (built-ins always win on
 * `buildCommand`) but the committed file should reflect reality for humans.
 */
export function defaultAgentsConfig(): AgentsConfig {
  return {
    version: AGENTS_CONFIG_VERSION,
    preferred: 'claude',
    cascade: { ...DEFAULT_CASCADE },
    agents: [
      { id: 'claude', name: 'Claude Code', bin: 'claude', interactive: true, description: 'Anthropic Claude (interactive session)', aliases: ['claude', 'claudecode', 'anthropic', 'claudeai'] },
      { id: 'codex', name: 'OpenAI Codex', bin: 'codex', interactive: true, description: 'OpenAI Codex CLI', aliases: ['codex', 'openaicodex'] },
      { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', interactive: true, description: 'Google Gemini CLI', aliases: ['gemini', 'geminicli', 'googlegemini'] },
      { id: 'goose', name: 'Goose', bin: 'goose', interactive: false, description: 'Block open-source AI agent', aliases: ['goose', 'blockgoose'] },
      { id: 'aider', name: 'Aider', bin: 'aider', interactive: true, description: 'Git-aware AI pair programmer', aliases: ['aider'] },
      { id: 'opencode', name: 'OpenCode', bin: 'opencode', interactive: true, description: 'SST AI coding TUI', aliases: ['opencode', 'sstopencode'] },
      { id: 'cursor', name: 'Cursor', bin: 'cursor', interactive: true, description: 'Cursor IDE (opens project; paste prompt)', aliases: ['cursor'] },
      { id: 'pi', name: 'Pi', bin: 'pi', interactive: true, description: 'Earendil Works pi coding agent', aliases: ['pi', 'piearendil', 'picodingagent'] },
      { id: 'crush', name: 'Crush', bin: 'crush', interactive: true, description: 'Charmbracelet Crush (Glamourous agentic TUI)', aliases: ['crush', 'charmbraceletcrush'] },
      { id: 'openclaw', name: 'OpenClaw', bin: 'openclaw', interactive: true, description: 'OpenClaw Foundation personal AI assistant', aliases: ['openclaw', 'openclawfoundation', 'claw'] },
      { id: 'kimi', name: 'Kimi Code CLI', bin: 'kimi', interactive: true, description: 'Moonshot Kimi Code CLI (terminal coding agent)', aliases: ['kimi', 'moonshot', 'moonshotai', 'kimicode'] },
      { id: 'qwen', name: 'Qwen Code', bin: 'qwen', interactive: true, description: 'Alibaba Qwen3-Coder CLI (QwenLM/qwen-code)', aliases: ['qwen', 'qwencode', 'qwenlm', 'alibabaqwen'] },
      { id: 'vibe', name: 'Mistral Vibe', bin: 'vibe', interactive: true, description: 'Mistral Vibe CLI (Devstral-powered)', aliases: ['vibe', 'mistralvibe'] },
      { id: 'grok', name: 'Grok Build', bin: 'grok', interactive: true, description: 'xAI Grok Build (terminal coding agent)', aliases: ['grok', 'grokbuild', 'xaigrok', 'xai'] },
      { id: 'openhands', name: 'OpenHands', bin: 'openhands', interactive: true, description: 'OpenHands CLI (Python; multi-agent)', aliases: ['openhands', 'openhandscli', 'openhand'] },
      { id: 'pplx', name: 'Perplexity CLI', bin: 'pplx', interactive: true, description: 'Perplexity pplx CLI (search + agent capabilities)', aliases: ['pplx', 'pplxcli', 'perplexitycli', 'perplexity'] },
      { id: 'copilot', name: 'GitHub Copilot CLI', bin: 'copilot', interactive: true, description: 'GitHub Copilot CLI (interactive session)', aliases: ['copilot', 'githubcopilot', 'ghcopilot'] },
      { id: 'amp', name: 'Amp', bin: 'amp', interactive: false, description: 'Sourcegraph Amp (execute mode)', aliases: ['amp', 'sourcegraphamp', 'ampcode'] },
      { id: 'droid', name: 'Factory Droid', bin: 'droid', interactive: false, description: 'Factory AI droid (headless exec)', aliases: ['droid', 'factory', 'factoryai', 'factorydroid'] },
      { id: 'auggie', name: 'Auggie', bin: 'auggie', interactive: true, description: 'Augment Code CLI', aliases: ['auggie', 'augment', 'augmentcode'] },
      { id: 'amazonq', name: 'Amazon Q Developer', bin: 'q', interactive: true, description: 'Amazon Q Developer CLI (q chat)', aliases: ['q', 'amazonq', 'awsq', 'qdeveloper'] },
      { id: 'cline', name: 'Cline', bin: 'cline', interactive: false, description: 'Cline CLI (task mode)', aliases: ['cline', 'clinedev', 'claudedev'] },
      { id: 'agy', name: 'Agy', bin: 'agy', interactive: true, description: 'Agy coding agent', aliases: ['agy'] },
    ],
  };
}

/**
 * 📖 Reads `.kandown/agents.json`, deep-merged with the shipped defaults so a
 * partial/legacy file never produces missing fields. A corrupt file warns and
 * falls back to defaults rather than crashing the launcher (mirrors
 * `loadConfig`'s resilience in config.ts).
 *
 * Missing file → defaults (built-in snapshot). The caller (agents.ts) layers
 * the built-in `buildCommand` logic on top.
 */
export function loadAgentsConfig(kandownDir: string): AgentsConfig {
  const path = join(kandownDir, 'agents.json');
  if (!existsSync(path)) return defaultAgentsConfig();

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return defaultAgentsConfig();
    console.warn(`[kandown] agents.json is corrupted, using defaults: ${(e as Error).message}`);
    return defaultAgentsConfig();
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.warn('[kandown] agents.json must be a JSON object, using defaults.');
    return defaultAgentsConfig();
  }

  const obj = raw as Record<string, unknown>;
  const base = defaultAgentsConfig();

  const agentsRaw = Array.isArray(obj.agents) ? obj.agents : [];
  const agents: AgentCatalogEntry[] = agentsRaw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && !Array.isArray(a))
    .filter(a => typeof a.id === 'string' && typeof a.bin === 'string')
    .map(a => ({
      id: String(a.id),
      name: typeof a.name === 'string' ? a.name : String(a.id),
      bin: String(a.bin),
      ...(Array.isArray(a.aliases) ? { aliases: a.aliases.map(String) } : {}),
      ...(typeof a.interactive === 'boolean' ? { interactive: a.interactive } : {}),
      ...(typeof a.description === 'string' ? { description: a.description } : {}),
      ...(Array.isArray(a.extraArgs) ? { extraArgs: a.extraArgs.map(String) } : {}),
      ...(typeof a.launchMode === 'string' ? { launchMode: a.launchMode as LaunchMode } : {}),
      ...(typeof a.promptFlag === 'string' ? { promptFlag: a.promptFlag } : {}),
    }));

  return {
    version: typeof obj.version === 'number' ? obj.version : base.version,
    ...(typeof obj.preferred === 'string' ? { preferred: obj.preferred } : { preferred: base.preferred }),
    cascade: resolveCascade(obj.cascade),
    agents: agents.length > 0 ? agents : base.agents,
  };
}

/**
 * 📖 Fills missing cascade keys with defaults. Tolerates `undefined` and
 * non-object input (returns full defaults).
 */
export function resolveCascade(raw: unknown): Required<CascadeConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_CASCADE };
  const c = raw as Record<string, unknown>;
  const ub = c.unassignedBehavior;
  const ssc = c.sameSessionChain;
  return {
    unassignedBehavior: ub === 'preferred' ? 'preferred' : ub === 'skip' ? 'skip' : DEFAULT_CASCADE.unassignedBehavior,
    sameSessionChain: typeof ssc === 'boolean' ? ssc : DEFAULT_CASCADE.sameSessionChain,
  };
}

/**
 * 📖 Writes the config to `.kandown/agents.json` with a trailing newline.
 * Atomic via the shared temp-file-then-rename helper.
 */
export function saveAgentsConfig(kandownDir: string, config: AgentsConfig): void {
  const path = join(kandownDir, 'agents.json');
  atomicWriteFileSync(path, JSON.stringify(config, null, 2) + '\n');
}
