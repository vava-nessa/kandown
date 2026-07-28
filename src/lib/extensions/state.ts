/**
 * @file Enabled-extension preference state
 * @description The per-project set of extension ids the user has explicitly
 * enabled. Separate from trust (a security gate, docs/EXTENSIONS.md §
 * "Security"): trust is "may this project's extensions run at all", enabled is
 * "does the user want this one on". Under restricted mode (the default) an
 * extension only loads when its id is in this set.
 *
 * 📖 Stored in `.kandown/extensions/enabled.json` as a sorted id array. Even
 * global extensions are enabled per-project, deliberately, so a shared machine
 * does not silently run every installed extension in every project.
 *
 * @functions
 *  → enabledFilePath — absolute path to a project's enabled set
 *  → loadEnabled — read the enabled ids (empty when absent)
 *  → saveEnabled — persist the enabled ids set
 * @exports enabledFilePath, loadEnabled, saveEnabled
 * @see src/lib/extensions/host.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Absolute path to a project's enabled-extension set file. */
export function enabledFilePath(projectDir: string): string {
  return join(projectDir, '.kandown', 'extensions', 'enabled.json');
}

/** Reads the set of enabled extension ids for a project. */
export function loadEnabled(projectDir: string): Set<string> {
  try {
    const raw = readFileSync(enabledFilePath(projectDir), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

/** Persists the enabled extension ids for a project. */
export function saveEnabled(projectDir: string, ids: Set<string>): void {
  const file = enabledFilePath(projectDir);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify([...ids].sort(), null, 2)}\n`, 'utf8');
}
