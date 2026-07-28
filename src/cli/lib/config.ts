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

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write.js';

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
    defaultPriority: string;
    defaultOwnerType: 'human' | 'ai';
    /** 📖 Default visual state for groups of tasks sharing the same `[bracket]`
     * or `#hashtag` title tag. `'collapsed'` shows them as a stacked summary
     * card, `'expanded'` always renders the individual cards inline. */
    stackDefaultState: 'collapsed' | 'expanded';
  };
  /** 📖 Terminal-UI preferences. These are written back by the TUI itself when
   * the user toggles a view (`Tab`) or the detail pane (`z`), so the layout you
   * left the board in is the one you get next launch — per project, since it
   * lives in that project's `.kandown/kandown.json`. */
  tui: {
    /** Which view the TUI opens on. `'list'` is the default: one task per line
     * with Age/Status/Tags columns, which stays readable on narrow terminals
     * where 5 kanban columns leave ~15 usable characters per card. */
    defaultView: 'list' | 'board';
    /** Whether the Name/Value detail pane is pinned under the list view. */
    showDetailPane: boolean;
    /** Sort order of the flat list view, cycled with `s` or by clicking a
     *  column header. */
    listSort: 'status' | 'age' | 'priority' | 'id';
    /** 📖 Direction of `listSort`. `asc` is each sort's natural reading order
     *  (board order, newest first, P1 first, t1→t99); `desc` mirrors it.
     *  Clicking the header of the column you are already sorting by flips it. */
    listSortDir: 'asc' | 'desc';
    /** 📖 Which optional columns the list view draws. Every column here can be
     * turned off; `ID` and `Description` are not listed because they are the
     * two that make a row identifiable at all, so they are always drawn.
     *
     * Turning a column off is not the same as the layout dropping it: this is
     * a hard "never show me this", checked before `computeListLayout` starts
     * fitting things, whereas the automatic drop only kicks in when the
     * terminal is too narrow for everything you asked for. */
    columns: {
      age: boolean;
      status: boolean;
      priority: boolean;
      owner: boolean;
      deps: boolean;
      tags: boolean;
      /** The agent (or person) the task is assigned to, pinned to the far
       *  right so the description keeps the eye's natural left edge. */
      assignee: boolean;
    };
  };
  extensions: {
    /** Community extensions require explicit local enable/trust by default. */
    restricted: boolean;
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
    defaultPriority: 'P3',
    defaultOwnerType: 'human',
    stackDefaultState: 'collapsed',
  },
  tui: {
    defaultView: 'list',
    showDetailPane: true,
    listSort: 'status',
    listSortDir: 'asc',
    // 📖 Tags default to off: they are the widest optional column and the one
    // most projects leave empty, so on by default it mostly reserved 14 cells
    // of description width to render blanks. Turn it on in `kandown settings`.
    columns: { age: true, status: true, priority: true, owner: true, deps: true, tags: false, assignee: true },
  },
  extensions: { restricted: true },
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
 * 📖 Searches for a `.kandown/` directory:
 *  1. First in the given cwd itself.
 *  2. Then recursively in sub-directories (so starting kandown from a
 *     parent folder automatically opens the first child project).
 * Returns the absolute path or null if not found.
 */
export function findKandownDir(cwd: string = process.cwd()): string | null {
  // 1. Check cwd directly
  const dir = join(cwd, '.kandown');
  if (existsSync(dir)) return dir;

  // 1b. Also check `kandown/` (legacy/custom convention)
  const altDir = join(cwd, 'kandown');
  if (existsSync(altDir)) return altDir;

  // 2. Recurse into sub-directories
  let entries: string[];
  try {
    entries = readdirSync(cwd);
  } catch {
    return null;
  }

  for (const name of entries) {
    // Skip hidden dirs, node_modules, and the tasks dir itself
    if (name.startsWith('.') || name === 'node_modules' || name === 'tasks') continue;
    const subPath = join(cwd, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(subPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const found = findKandownDir(subPath);
    if (found) return found;
  }

  return null;
}

/**
 * 📖 Loads kandown.json from the given directory, deep-merged with defaults.
 * Missing keys get filled in from DEFAULT_CONFIG. Null-safe: a sub-section set
 * to `null` in the file (e.g. `"board": null` from a botched manual edit) no
 * longer crashes the spread (t111).
 */
export function loadConfig(kandownDir: string): KandownConfig {
  const configPath = join(kandownDir, 'kandown.json');
  if (!existsSync(configPath)) return structuredClone(DEFAULT_CONFIG);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    // 📖 Distinguish corruption from "file not found" so the CLI can warn the
    // user instead of silently resetting their config (t111).
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return structuredClone(DEFAULT_CONFIG);
    console.warn(`[kandown] kandown.json is corrupted, using defaults: ${(e as Error).message}`);
    return structuredClone(DEFAULT_CONFIG);
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.warn('[kandown] kandown.json must be a JSON object, using defaults.');
    return structuredClone(DEFAULT_CONFIG);
  }

  // 📖 Safe object spread — `{ ...null }` throws TypeError, so guard every
  // section. Arrays and primitives are treated as missing (t111).
  const obj = raw as Record<string, unknown>;
  const safeObj = <T extends Record<string, unknown>>(v: unknown): Partial<T> =>
    (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Partial<T>;

  const boardRaw = safeObj<KandownConfig['board']>(obj.board);
  const merged: KandownConfig = {
    ui: { ...DEFAULT_CONFIG.ui, ...safeObj(obj.ui) },
    agent: { ...DEFAULT_CONFIG.agent, ...safeObj(obj.agent) },
    board: {
      ...DEFAULT_CONFIG.board,
      ...boardRaw,
      columns: Array.isArray(boardRaw.columns) && boardRaw.columns.length > 0
        ? boardRaw.columns.filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
        : DEFAULT_CONFIG.board.columns,
    },
    // 📖 `columns` is merged one level deeper than the rest: a config that only
    // pins `{"tui":{"columns":{"tags":true}}}` must keep the defaults for every
    // other column instead of having them come back `undefined` (falsy — which
    // would silently blank the whole row).
    tui: {
      ...DEFAULT_CONFIG.tui,
      ...safeObj(obj.tui),
      columns: {
        ...DEFAULT_CONFIG.tui.columns,
        ...safeObj(safeObj<Record<string, unknown>>(obj.tui).columns),
      },
    },
    fields: { ...DEFAULT_CONFIG.fields, ...safeObj(obj.fields) },
    extensions: { ...DEFAULT_CONFIG.extensions, ...safeObj(obj.extensions) },
    notifications: { ...DEFAULT_CONFIG.notifications, ...safeObj(obj.notifications) },
  };
  // 📖 agents is optional — only include it if present AND object-shaped.
  if (obj.agents && typeof obj.agents === 'object') {
    merged.agents = obj.agents as NonNullable<KandownConfig['agents']>;
  }
  return merged;
}

/**
 * 📖 Writes the config to kandown.json with 2-space indent.
 */
export function saveConfig(kandownDir: string, config: KandownConfig): void {
  const configPath = join(kandownDir, 'kandown.json');
  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
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
