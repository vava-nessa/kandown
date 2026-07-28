/**
 * @file Extension discovery
 * @description Scans the global (`~/.kandown/extensions`) and project
 * (`.kandown/extensions`) locations for extension directories, reading and
 * parsing each one's `manifest.json`. Pure discovery: it does not decide whether
 * an extension may load (trust, restricted mode, compatibility) — that is the
 * host's job. Project extensions override global ones on id collision.
 *
 * 📖 Each extension is a directory containing a `manifest.json`; its Node entry
 * defaults to `./index.js` (or `./index.ts` during dev, loaded via jiti). See
 * docs/EXTENSIONS.md § "Anatomy of an extension".
 *
 * @functions
 *  → globalExtensionsDir — `~/.kandown/extensions`
 *  → projectExtensionsDir — `<project>/.kandown/extensions`
 *  → discoverExtensions — scan both, parse manifests, dedupe (project wins)
 * @exports globalExtensionsDir, projectExtensionsDir, discoverExtensions
 * @see src/lib/extensions/host.ts
 * @see src/lib/extensions/manifest.ts
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseManifest, type ManifestResult } from './manifest';

export interface DiscoveredExtension {
  dir: string;
  source: 'global' | 'project';
  manifestResult: ManifestResult;
}

/** Global extension location, `~/.kandown/extensions`. */
export function globalExtensionsDir(): string {
  return join(homedir(), '.kandown', 'extensions');
}

/** Project extension location, `<projectDir>/.kandown/extensions`. */
export function projectExtensionsDir(projectDir: string): string {
  return join(projectDir, '.kandown', 'extensions');
}

function scanLocation(location: string, source: 'global' | 'project'): DiscoveredExtension[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(location, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const found: DiscoveredExtension[] = [];
  for (const name of entries) {
    const dir = join(location, name);
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      found.push({ dir, source, manifestResult: { ok: false, error: 'manifest.json is not valid JSON' } });
      continue;
    }
    found.push({ dir, source, manifestResult: parseManifest(raw) });
  }
  return found;
}

/**
 * 📖 Scans both locations and returns deduped discovered extensions. On an id
 * collision, the project copy wins and the global one is dropped, so a project
 * can pin a different version of a shared extension.
 */
export function discoverExtensions(projectDir: string): DiscoveredExtension[] {
  const globalList = scanLocation(globalExtensionsDir(), 'global');
  const projectList = scanLocation(projectExtensionsDir(projectDir), 'project');
  const projectIds = new Set(
    projectList
      .map((d) => (d.manifestResult.ok ? d.manifestResult.manifest.id : null))
      .filter((x): x is string => x !== null),
  );
  const dedupedGlobal = globalList.filter(
    (d) => !(d.manifestResult.ok && projectIds.has(d.manifestResult.manifest.id)),
  );
  return [...projectList, ...dedupedGlobal];
}
