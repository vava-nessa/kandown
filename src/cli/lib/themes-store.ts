/**
 * @file Community theme store wiring
 * @description Fetches the community themes index from its canonical home
 * (a JSON file in the kandown repo, served via `raw.githubusercontent.com`)
 * and installs themes by writing a single JSON file into the project's
 * `.kandown/themes/<id>.json`. One-click (registry entry) and paste-URL
 * (`https://github.com/<owner>/<repo>`) flows are both supported, mirroring
 * `extensions-store.ts`.
 *
 * 📖 A theme is a single JSON document — not a directory like an extension.
 * The install path is just the JSON file pointed at by `entry.path`. The
 * app reloads custom themes via `registerCustomThemes`; see `src/lib/theme.ts`.
 *
 * 📖 Index URL is the single source of truth for what's installable. In the
 * long term the ADR 0002 design puts it in a dedicated
 * `kandown/community-themes` repo; for now it ships from the main repo so the
 * store has content on day one and PRs go through the normal review flow.
 *
 * @see docs/EXTENSIONS.md § "Distribution and the community store"
 * @see src/lib/theme.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KandownTheme } from '../../lib/types';
import { normalizeSkinId } from '../../lib/theme';

export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/vava-nessa/kandown/main/registry/themes.json';

export interface RegistryEntry {
  id: string;
  name: string;
  author?: string;
  description?: string;
  repo: string;
  /** 📖 Repo-relative path to the theme JSON file. The installer fetches
   * `<repo>/<path>` directly. */
  path: string;
  ref?: string;
  minKandownVersion?: string;
  tags?: string[];
}

export interface RegistryFetchResult {
  entries: RegistryEntry[];
  /** The canonical URL that was fetched (for display). */
  url: string;
  /** True when the fetch failed or JSON was invalid; the partial/error data is still returned. */
  error?: string;
}

/** 📖 Fetches the community themes index. */
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
  const cleaned = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  return `https://raw.githubusercontent.com/${cleaned}/${ref}`;
}

interface InstallInput {
  /** A registry entry to install (one-click). Either `entry` or `url` required. */
  entry?: RegistryEntry;
  /** A pasted GitHub repo URL. Either `entry` or `url` required. */
  url?: string;
}

export interface InstallResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * 📖 Installs a theme: fetches its JSON from the registry (or HEAD of the
 * pasted repo) and writes it to `<project>/.kandown/themes/<id>.json`. The
 * app picks it up on next reload via `registerCustomThemes`.
 */
export async function installTheme(
  projectDir: string,
  input: InstallInput,
): Promise<InstallResult> {
  let themeUrl: string;
  if (input.entry) {
    const ref = input.entry.ref || 'HEAD';
    const base = githubRawBase(input.entry.repo, ref);
    const path = input.entry.path || `registry/themes/${input.entry.id}.json`;
    themeUrl = `${base}/${path}`.replace(/\/+$/, '');
  } else if (input.url) {
    // Accept raw GitHub URLs or github.com/<owner>/<repo> (defaults to
    // `registry/themes/<id>.json` in the repo's HEAD).
    const trimmed = input.url.replace(/\/+$/, '');
    if (trimmed.includes('raw.githubusercontent.com')) {
      themeUrl = trimmed;
    } else {
      const base = githubRawBase(trimmed, 'HEAD');
      // Best effort: caller can supply a path with `?path=...` later if needed.
      themeUrl = `${base}/registry/themes/${guessIdFromUrl(trimmed)}.json`;
    }
  } else {
    return { ok: false, error: 'Provide a registry entry or a GitHub URL.' };
  }

  let themeJson: string;
  try {
    const res = await fetch(themeUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `theme fetch failed: HTTP ${res.status}` };
    themeJson = await res.text();
  } catch (e) {
    return { ok: false, error: `theme fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  let theme: KandownTheme;
  try {
    theme = JSON.parse(themeJson) as KandownTheme;
  } catch {
    return { ok: false, error: 'theme file is not valid JSON' };
  }
  if (!theme.id || !/^[a-z][a-z0-9-]{0,63}$/.test(theme.id)) {
    return { ok: false, error: 'theme is missing a valid id' };
  }
  // 📖 normalizeSkinId also returns `kandown` for unknown ids, so we
  // re-validate the id against the format to avoid accepting garbage.
  normalizeSkinId(theme.id);
  const { description: _desc, author: _author, name: _name, ..._rest } = theme;

  const destDir = join(projectDir, '.kandown', 'themes');
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, `${theme.id}.json`), `${themeJson}\n`, 'utf8');

  return { ok: true, id: theme.id };
}

/** 📖 Best-effort id extraction from a GitHub URL like `.../kandown-claude`. */
function guessIdFromUrl(url: string): string {
  const m = url.match(/\/([a-z0-9_-]+?)(?:\.git)?$/i);
  return m ? m[1].toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'unknown';
}

/** 📖 URL-safe base64 of a UTF-8 string (the browser's `btoa` only handles
 * latin-1, so we round-trip through `encodeURIComponent` to keep emoji and
 * accents intact). Used by the editor's "Propose on GitHub" button. */
export function base64EncodeUtf8(input: string): string {
  // 📖 Node 18+ exposes `Buffer`; the web app uses `btoa` with a percent-encoded
  // detour. Both paths collapse to the same `value=` query parameter that
  // GitHub's "create new file" UI reads back as the initial file content.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(input)));
}

/** 📖 Builds a GitHub "create new file" URL that pre-fills the JSON content
 * for the contributor's PR. Contributors without write access land on the
 * fork prompt; everyone else lands directly on the create-file page. */
export function buildProposeUrl(opts: {
  githubOwner: string;
  githubRepo: string;
  branch?: string;
  themeId: string;
  json: string;
  /** Directory under which the new file lives. */
  dir?: string;
}): string {
  const branch = opts.branch ?? 'main';
  const dir = (opts.dir ?? 'registry/themes').replace(/\/+$/, '');
  const params = new URLSearchParams({
    filename: `${dir}/${opts.themeId}.json`,
    value: base64EncodeUtf8(opts.json),
  });
  return `https://github.com/${opts.githubOwner}/${opts.githubRepo}/new/${branch}/${dir}?${params.toString()}`;
}

/** 📖 Reads installed theme JSON files into a KandownTheme[]. Returns an
 * empty list when `.kandown/themes/` does not exist. Used by the daemon to
 * hydrate custom themes on each request and by `kandown theme list`. */
export function listInstalledThemes(projectDir: string): KandownTheme[] {
  const dir = join(projectDir, '.kandown', 'themes');
  if (!existsSync(dir)) return [];
  const themes: KandownTheme[] = [];
  // 📖 Dynamic require so this module is also safe to import from the web
  // bundle (the daemon and the CLI both use it; the web app goes through
  // the daemon's REST API instead, so this function is dead code there).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync, readdirSync } = require('node:fs') as typeof import('node:fs');
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(dir, file), 'utf8');
      const parsed = JSON.parse(raw) as KandownTheme;
      if (parsed && parsed.id && parsed.light && parsed.dark) {
        themes.push({ ...parsed, isCustom: true });
      }
    } catch {
      // 📖 Skip broken JSON — the user can fix it via the editor without
      // taking the whole list down.
    }
  }
  return themes;
}