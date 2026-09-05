/**
 * @file Extension runtime state
 * @description Persists per-project extension runtime state: the ids the user
 * explicitly enabled plus consecutive failure records used by the quarantine
 * policy. Enabled state is separate from trust; health state survives daemon
 * and browser restarts so a repeatedly crashing panel cannot re-enable itself.
 *
 * 📖 Security state lives outside the repository under
 * `~/.kandown/project-state/<path-hash>/extensions/`. A cloned repo can commit
 * extension source, but it cannot commit local enable, trust or health choices.
 * Global extensions are still enabled per project.
 *
 * @functions
 *  → extensionStateDir: user-local state directory keyed by canonical project path
 *  → enabledFilePath: absolute path to a project's enabled set
 *  → healthFilePath: absolute path to persistent failure health
 *  → loadEnabled / saveEnabled: read and persist enabled ids
 *  → loadFailureState / saveFailureState: read and atomically persist failures
 * @exports extensionStateDir, enabledFilePath, healthFilePath, loadEnabled, saveEnabled, loadFailureState, saveFailureState, ExtensionFailureRecord
 * @see src/lib/extensions/host.ts
 * @see src/lib/project-hash.ts: the canonicalization + hash this module keys on
 */

import { readFileSync, writeFileSync, mkdirSync, realpathSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalizeProjectPath, projectHash } from '../project-hash.js';

/** User-local extension state directory for one canonical project path. */
export function extensionStateDir(projectDir: string): string {
  const canonicalProject = canonicalizeProjectPath(projectDir, realpathSync);
  const hash = projectHash(canonicalProject);
  return join(homedir(), '.kandown', 'project-state', hash, 'extensions');
}

/** Absolute path to a project's enabled-extension set file. */
export function enabledFilePath(projectDir: string): string {
  return join(extensionStateDir(projectDir), 'enabled.json');
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

/** Persisted consecutive-failure record for one extension. */
export interface ExtensionFailureRecord {
  failures: number;
  /** Contribution surface whose consecutive failures this record counts. */
  surface?: string;
  error?: string;
  updatedAt: string;
}

/** Absolute path to persistent extension failure health. */
export function healthFilePath(projectDir: string): string {
  return join(extensionStateDir(projectDir), 'health.json');
}

/** Reads failure health. Invalid or absent data safely becomes an empty map. */
export function loadFailureState(projectDir: string): Map<string, ExtensionFailureRecord> {
  try {
    const parsed = JSON.parse(readFileSync(healthFilePath(projectDir), 'utf8')) as {
      version?: unknown;
      extensions?: unknown;
    };
    if (parsed.version !== 1 || !parsed.extensions || typeof parsed.extensions !== 'object') {
      return new Map();
    }
    const records = new Map<string, ExtensionFailureRecord>();
    for (const [id, value] of Object.entries(parsed.extensions as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Record<string, unknown>;
      if (typeof item.failures !== 'number' || !Number.isInteger(item.failures) || item.failures < 1) continue;
      records.set(id, {
        failures: item.failures,
        surface: typeof item.surface === 'string' ? item.surface : undefined,
        error: typeof item.error === 'string' ? item.error : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
      });
    }
    return records;
  } catch {
    return new Map();
  }
}

/** Atomically persists failure health so interrupted writes cannot corrupt it. */
export function saveFailureState(projectDir: string, records: Map<string, ExtensionFailureRecord>): void {
  const file = healthFilePath(projectDir);
  const tmp = `${file}.tmp`;
  mkdirSync(join(file, '..'), { recursive: true });
  const extensions = Object.fromEntries([...records.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(tmp, `${JSON.stringify({ version: 1, extensions }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}
