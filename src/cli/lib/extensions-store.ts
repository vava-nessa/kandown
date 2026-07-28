/**
 * @file Community extension store wiring
 * @description Fetches the community extensions index from its canonical home
 * (a JSON file in the kandown repo, served via `raw.githubusercontent.com`) and
 * installs extensions by copying their files into the project's
 * `.kandown/extensions/` directory. One-click (registry entry) and paste-URL
 * (`https://github.com/<owner>/<repo>`) flows are both supported.
 *
 * 📖 The index URL is the single source of truth for what's installable. In the
 * long term the ADR 0002 design puts it in a dedicated
 * `kandown/community-extensions` repo; for now it ships from the main repo so
 * the store has content on day one and PRs go through the normal review flow.
 *
 * @see docs/EXTENSIONS.md § "Distribution and the community store"
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/extensions.json';

export interface RegistryEntry {
  id: string;
  name: string;
  author?: string;
  description?: string;
  repo: string;
  path?: string;
  ref?: string;
  minKandownVersion?: string;
}

export interface RegistryFetchResult {
  entries: RegistryEntry[];
  /** The canonical URL that was fetched (for display). */
  url: string;
  /** True when the fetch failed or JSON was invalid; the partial/error data is still returned. */
  error?: string;
}

const REGISTRY_FILES = ['manifest.json', 'index.js', 'index.ts', 'web.js', 'styles.css'];

/** 📖 Fetches the community extensions index. */
export async function fetchRegistry(url: string = DEFAULT_REGISTRY_URL): Promise<RegistryFetchResult> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { entries: [], url, error: `HTTP ${res.status}` };
    const data = (await res.json()) as RegistryEntry[] | { entries?: RegistryEntry[] };
    const entries = Array.isArray(data) ? data : (data.entries ?? []);
    return { entries: Array.isArray(entries) ? entries : [], url };
  } catch (e) {
    return { entries: [], url, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Converts a GitHub repo URL to its raw.githubusercontent.com base. */
function githubRawBase(repo: string, ref: string): string {
  // Accept "https://github.com/<owner>/<repo>" (with optional .git) and bare "<owner>/<repo>".
  const cleaned = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  return `https://raw.githubusercontent.com/${cleaned}/${ref}`;
}

/** Converts a GitHub repo URL to the raw base pointing at HEAD. */
function githubRawBaseHead(repo: string): string {
  return githubRawBase(repo, 'HEAD');
}

interface InstallInput {
  /** A registry entry to install (one-click). Either `entry` or `url` required. */
  entry?: RegistryEntry;
  /** A pasted GitHub repo URL (no path). Either `entry` or `url` required. */
  url?: string;
}

export interface InstallResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * 📖 Installs an extension: fetches `manifest.json` to learn the id, then copies
 * the known files into `<project>/.kandown/extensions/<id>/`. The host reloads
 * on the next refresh, so the user can then `enable` it.
 */
export async function installExtension(
  projectDir: string,
  input: InstallInput,
): Promise<InstallResult> {
  let baseUrl: string;
  let manifestPath: string;

  if (input.entry) {
    const ref = input.entry.ref || 'HEAD';
    baseUrl = `${githubRawBase(input.entry.repo, ref)}/${input.entry.path || ''}`.replace(/\/$/, '');
    manifestPath = 'manifest.json';
  } else if (input.url) {
    baseUrl = githubRawBaseHead(input.url).replace(/\/$/, '');
    manifestPath = 'manifest.json';
  } else {
    return { ok: false, error: 'Provide a registry entry or a GitHub URL.' };
  }

  // Fetch manifest first to learn the id and validate.
  const manifestUrl = `${baseUrl}/${manifestPath}`;
  let manifestJson: string;
  try {
    const res = await fetch(manifestUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `manifest fetch failed: HTTP ${res.status}` };
    manifestJson = await res.text();
  } catch (e) {
    return { ok: false, error: `manifest fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  let manifest: { id?: string };
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    return { ok: false, error: 'manifest.json is not valid JSON' };
  }
  if (!manifest.id || !/^[a-z][a-z0-9-]{0,63}$/.test(manifest.id)) {
    return { ok: false, error: 'manifest.json is missing a valid id' };
  }

  const destDir = join(projectDir, '.kandown', 'extensions', manifest.id);
  mkdirSync(destDir, { recursive: true });

  // Copy known files (best-effort: manifest required, others optional).
  const copied: string[] = [];
  const write = (relPath: string, content: string) => {
    writeFileSync(join(destDir, relPath), content, 'utf8');
    copied.push(relPath);
  };

  // Write manifest from the fetched text.
  write('manifest.json', manifestJson);

  // Fetch the rest of the known files in parallel.
  const otherFiles = REGISTRY_FILES.filter((f) => f !== 'manifest.json');
  const results = await Promise.allSettled(
    otherFiles.map(async (f) => {
      const r = await fetch(`${baseUrl}/${f}`);
      if (!r.ok) return null;
      const text = await r.text();
      write(f, text);
      return f;
    }),
  );

  return {
    ok: true,
    id: manifest.id,
    error: results.some((r) => r.status === 'rejected') ? 'some optional files could not be fetched' : undefined,
  };
}
