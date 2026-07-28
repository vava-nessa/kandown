/**
 * @file Extension manifest parsing and compatibility
 * @description Validates a raw JSON object into a typed `ExtensionManifest`,
 * and checks version compatibility against the running kandown. Pure, no I/O:
 * the loader reads the file, this module decides whether it is a valid manifest
 * the host may load.
 *
 * 📖 The manifest is metadata plus display hints (docs/EXTENSIONS.md § "The
 * manifest"). The runtime registrations in the factory are authoritative;
 * `contributes` is best-effort. `id` must be kebab-case because it becomes the
 * `plugins.<id>` namespace and the install directory name.
 *
 * @functions
 *  → parseManifest — validate raw JSON into a manifest, or return an error
 *  → isCompatible — semver gate against the running kandown version
 * @exports parseManifest, isCompatible
 * @see src/lib/extensions/types.ts
 */

import type { ExtensionManifest } from './types';

const REQUIRED = ['id', 'name', 'version', 'apiVersion'] as const;

export type ManifestResult =
  | { ok: true; manifest: ExtensionManifest }
  | { ok: false; error: string };

/** Validates a raw object as a manifest. */
export function parseManifest(raw: unknown): ManifestResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'manifest is not a JSON object' };
  }
  const m = raw as Record<string, unknown>;
  for (const key of REQUIRED) {
    if (m[key] === undefined || m[key] === null || m[key] === '') {
      return { ok: false, error: `missing required field "${key}"` };
    }
  }
  if (typeof m.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(m.id)) {
    return { ok: false, error: '"id" must be kebab-case (lowercase letters, digits, hyphens)' };
  }
  if (typeof m.name !== 'string') return { ok: false, error: '"name" must be a string' };
  if (typeof m.version !== 'string') return { ok: false, error: '"version" must be a string' };
  if (typeof m.apiVersion !== 'number' || !Number.isInteger(m.apiVersion)) {
    return { ok: false, error: '"apiVersion" must be an integer' };
  }
  if (m.minKandownVersion !== undefined && typeof m.minKandownVersion !== 'string') {
    return { ok: false, error: '"minKandownVersion" must be a string' };
  }
  if (m.permissions !== undefined && !Array.isArray(m.permissions)) {
    return { ok: false, error: '"permissions" must be an array' };
  }
  if (m.main !== undefined && typeof m.main !== 'string') {
    return { ok: false, error: '"main" must be a string' };
  }
  return { ok: true, manifest: m as unknown as ExtensionManifest };
}

/** Parses a numeric tuple from a semver-ish string ("1.2.3" → [1,2,3]). */
function semverTuple(v: string): number[] {
  return v
    .split('.')
    .map((p) => Number.parseInt(p.replace(/[^\d].*$/, ''), 10) || 0)
    .slice(0, 3);
}

/** True when `kandownVersion` is >= the manifest's `minKandownVersion`. */
export function isCompatible(manifest: ExtensionManifest, kandownVersion: string): boolean {
  if (!manifest.minKandownVersion) return true;
  const a = semverTuple(kandownVersion);
  const b = semverTuple(manifest.minKandownVersion);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}
