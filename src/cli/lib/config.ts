/**
 * @file Config reader/writer for kandown.json
 * @description Handles loading, saving, and accessing the kandown project configuration.
 *
 * 📖 The config file lives at `.kandown/kandown.json` and controls UI preferences,
 * agent behavior, board defaults, notifications, and which optional fields are enabled.
 *
 * @functions
 *  → findKandownDir — locates the `.kandown/` directory from cwd
 *  → loadConfig — reads kandown.json and merges with defaults
 *  → saveConfig — writes config to kandown.json
 *  → getConfigValue — reads a nested value by dot-path (e.g. 'ui.language')
 *  → setConfigValue — immutably sets a nested value by dot-path
 *
 * @exports KandownConfig, findKandownDir, loadConfig, saveConfig, getConfigValue, setConfigValue
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 📖 Full config shape — mirrors templates/kandown.json
export interface KandownConfig {
  ui: {
    language: string;
    theme: 'auto' | 'light' | 'dark';
    skin: 'kandown' | 'graphite' | 'sage' | 'cobalt' | 'rose';
    font: 'inter' | 'system' | 'serif' | 'mono' | 'rounded';
  };
  agent: {
    suggestFollowUp: boolean;
    maxSuggestions: number;
  };
  board: {
    columns: string[];
    taskPrefix: string;
    defaultPriority: string;
    defaultOwnerType: 'human' | 'ai';
  };
  fields: {
    priority: boolean;
    assignee: boolean;
    tags: boolean;
    dueDate: boolean;
    ownerType: boolean;
    tools: boolean;
  };
  notifications: {
    browser: boolean;
    sound: boolean;
    soundId: 'soft' | 'chime' | 'ping' | 'pop';
    statusChanges: boolean;
    taskEdits: boolean;
    subtaskCompletions: boolean;
    editDebounceMs: number;
  };
  // 📖 Optional agents config — controls which agent is preferred and any per-agent extra args
  agents?: {
    /** ID of the preferred agent to pre-select in the agent picker (e.g. 'claude') */
    preferred?: string;
    /** Extra CLI args to append per agent ID — e.g. { claude: ['--allowedTools', 'Edit,Write,Bash'] } */
    extraArgs?: Record<string, string[]>;
  };
}

// 📖 Fallback values when keys are missing from kandown.json
const DEFAULT_CONFIG: KandownConfig = {
  ui: { language: 'en', theme: 'auto', skin: 'kandown', font: 'inter' },
  agent: { suggestFollowUp: false, maxSuggestions: 3 },
  board: {
    columns: ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'],
    taskPrefix: 't',
    defaultPriority: 'P3',
    defaultOwnerType: 'human',
  },
  fields: {
    priority: false,
    assignee: false,
    tags: false,
    dueDate: false,
    ownerType: false,
    tools: false,
  },
  notifications: {
    browser: false,
    sound: false,
    soundId: 'soft',
    statusChanges: true,
    taskEdits: true,
    subtaskCompletions: true,
    editDebounceMs: 2000,
  },
};

/**
 * 📖 Walks up from cwd looking for a `.kandown/` directory.
 * Returns the absolute path or null if not found.
 */
export function findKandownDir(cwd: string = process.cwd()): string | null {
  const dir = join(cwd, '.kandown');
  if (existsSync(dir)) return dir;

  // 📖 Also check for custom paths — common alternative locations
  const altDir = join(cwd, 'kandown');
  if (existsSync(altDir)) return altDir;

  return null;
}

/**
 * 📖 Loads kandown.json from the given directory, deep-merged with defaults.
 * Missing keys get filled in from DEFAULT_CONFIG.
 */
export function loadConfig(kandownDir: string): KandownConfig {
  const configPath = join(kandownDir, 'kandown.json');
  if (!existsSync(configPath)) return structuredClone(DEFAULT_CONFIG);

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    const merged: KandownConfig = {
      ui: { ...DEFAULT_CONFIG.ui, ...raw.ui },
      agent: { ...DEFAULT_CONFIG.agent, ...raw.agent },
      board: {
        ...DEFAULT_CONFIG.board,
        ...raw.board,
        columns: Array.isArray(raw.board?.columns) && raw.board.columns.length > 0
          ? raw.board.columns.filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
          : DEFAULT_CONFIG.board.columns,
      },
      fields: { ...DEFAULT_CONFIG.fields, ...raw.fields },
      notifications: { ...DEFAULT_CONFIG.notifications, ...raw.notifications },
    };
    // 📖 agents is optional — only include it if present in the file
    if (raw.agents) merged.agents = raw.agents;
    return merged;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

/**
 * 📖 Writes the config to kandown.json with 2-space indent.
 */
export function saveConfig(kandownDir: string, config: KandownConfig): void {
  const configPath = join(kandownDir, 'kandown.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * 📖 Access a nested config value by dot-path.
 * e.g. getConfigValue(config, 'ui.language') → 'en'
 */
export function getConfigValue(config: KandownConfig, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * 📖 Immutably sets a nested config value by dot-path.
 * Returns a new config object — does not mutate the original.
 */
export function setConfigValue(
  config: KandownConfig,
  path: string,
  value: unknown,
): KandownConfig {
  const result = structuredClone(config);
  const parts = path.split('.');
  let current: Record<string, unknown> = result as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result as KandownConfig;
}
