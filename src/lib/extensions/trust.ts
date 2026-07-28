/**
 * @file Restricted mode and project-local trust
 * @description The security gate that decides which extensions may load.
 * Restricted mode is ON by default (the Obsidian model): community/global
 * extensions load disabled until the user opts in. Project-local extensions
 * (committed under `.kandown/extensions/`) additionally require a one-time,
 * per-project trust confirmation so a cloned repo cannot exfiltrate tasks the
 * moment the board opens.
 *
 * 📖 Restricted mode lives in `.kandown/kandown.json` under `extensions.restricted`
 * (absent = true). Per-project trust lives outside the repository in Kandown's
 * user-local project-state directory, so committed files cannot grant their own
 * execution permission. See docs/EXTENSIONS.md.
 *
 * @functions
 *  → isRestricted — read the restricted flag from a config object
 *  → loadProjectTrust — read trusted project-local ids (empty when absent)
 *  → saveProjectTrust — persist the trusted ids set
 *  → trustFilePath — absolute path to a project's trust file
 * @exports isRestricted, loadProjectTrust, saveProjectTrust, trustFilePath
 * @see src/lib/extensions/host.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extensionStateDir } from './state';

/** True when community extensions must be explicitly enabled (default behaviour). */
export function isRestricted(config: { extensions?: { restricted?: boolean } } | undefined | null): boolean {
  const flag = config?.extensions?.restricted;
  // Absent or non-boolean defaults to restricted (safe default).
  return typeof flag === 'boolean' ? flag : true;
}

/** Absolute path to a project's per-project extension trust file. */
export function trustFilePath(projectDir: string): string {
  return join(extensionStateDir(projectDir), 'trust.json');
}

/** Reads the set of trusted project-local extension ids for a project. */
export function loadProjectTrust(projectDir: string): Set<string> {
  try {
    const raw = readFileSync(trustFilePath(projectDir), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

/** Persists the trusted project-local extension ids for a project. */
export function saveProjectTrust(projectDir: string, trusted: Set<string>): void {
  const file = trustFilePath(projectDir);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify([...trusted].sort(), null, 2)}\n`, 'utf8');
}
