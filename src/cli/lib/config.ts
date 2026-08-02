/**
 * @file Config reader/writer for kandown.json
 * @description Keeps Node file I/O around the canonical shared Kandown config
 * normalizer, plus nested value access used by the terminal settings screen.
 *
 * 📖 The config file lives at `.kandown/kandown.json`. Domain defaults and shape
 * normalization belong to `src/lib/config.ts`, not this Node adapter.
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
import { normalizeKandownConfig } from '../../lib/config.js';
import type { KandownConfig } from '../../lib/types.js';

export type { KandownConfig } from '../../lib/types.js';

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
  if (!existsSync(configPath)) return normalizeKandownConfig(undefined);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    // 📖 Distinguish corruption from "file not found" so the CLI can warn the
    // user instead of silently resetting their config (t111).
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return normalizeKandownConfig(undefined);
    console.warn(`[kandown] kandown.json is corrupted, using defaults: ${(e as Error).message}`);
    return normalizeKandownConfig(undefined);
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.warn('[kandown] kandown.json must be a JSON object, using defaults.');
  }

  return normalizeKandownConfig(raw);
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
