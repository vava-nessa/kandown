/**
 * @file CLI wiring for the community theme store
 * @description Implements the `kandown theme <subcommand>` verb: list installed
 * themes, install from the registry or a pasted URL, scaffold a starter
 * theme, and emit the prefilled GitHub URL the user clicks to propose their
 * theme via a one-click PR. Mirrors `extensions-cli.ts` for shape, but themes
 * are single JSON files (not a host with contributions) so the surface is
 * much smaller.
 *
 * @functions
 *  → cmdTheme — `kandown theme <subcommand>` handler
 *  → publishTheme — build the prefilled GitHub URL and print it
 *  → listInstalledThemesForCli — list themes from `.kandown/themes/`
 *
 * @exports cmdTheme, publishTheme
 * @see src/cli/lib/themes-store.ts
 * @see src/cli/cli.ts
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchRegistry, installTheme, buildProposeUrl, DEFAULT_REGISTRY_URL } from './themes-store';
import { getProjectRoot } from './board-reader';
import { c, log, info, success, err, ensureKandownDir, taskParseArgs } from './cli-shared';
import { KANDOWN_THEME_REPO_OWNER, KANDOWN_THEME_REPO_NAME } from './themes-meta';

/** 📖 `kandown theme <subcommand>` entrypoint. */
export async function cmdTheme(rawArgs: string[]): Promise<void> {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const { kandownDir } = ensureKandownDir(rawArgs);
  const projectDir = getProjectRoot(kandownDir);

  const usage = `${c.cyan}kandown theme${c.reset} ${c.dim}<list|install|create|publish>${c.reset}`;

  if (!sub) {
    log(usage);
    return;
  }

  switch (sub) {
    case 'list':
    case 'ls': {
      const themes = listInstalledThemesForCli(projectDir);
      if (themes.length === 0) {
        info('No community themes installed. Try: kandown theme install <path-or-github-url>');
        return;
      }
      for (const theme of themes) {
        log(`${c.green}installed${c.reset} ${c.bold}${theme.id}${c.reset} ${c.dim}v${theme.version ?? '1.0.0'}${c.reset} — ${theme.name}${theme.author ? ` · ${theme.author}` : ''}`);
        if (theme.description) log(`             ${c.dim}${theme.description}${c.reset}`);
      }
      return;
    }

    case 'install': {
      const target = args.positional[1];
      if (!target) { err('Usage: kandown theme install <path-or-github-url>'); process.exit(1); }
      const result = await installFromTarget(projectDir, target);
      if (result.ok) success(`Installed ${result.id}. It will appear in the theme gallery on the next reload.`);
      else { err(`Install failed: ${result.error}`); process.exit(1); }
      return;
    }

    case 'create': {
      const name = args.positional[1];
      if (!name) { err('Usage: kandown theme create <kebab-name>'); process.exit(1); }
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
        err('name must be kebab-case (lowercase letters, digits, hyphens)');
        process.exit(1);
      }
      scaffoldTheme(projectDir, name);
      success(`Scaffolded theme "${name}" at .kandown/themes/${name}.json`);
      info('Edit it, then: kandown theme publish .kandown/themes/' + name + '.json');
      return;
    }

    case 'publish':
    case 'propose': {
      const file = args.positional[1];
      if (!file) { err('Usage: kandown theme publish <path-to-theme.json> [--github-user <username>]'); process.exit(1); }
      const githubUser = String(args.flags['github-user'] ?? args.flags['githubUser'] ?? '');
      publishTheme(file, githubUser);
      return;
    }

    default:
      err(`Unknown theme subcommand: ${sub}`);
      log(usage);
  }
}

/** 📖 Installs from either a local path containing a single theme JSON, or
 * a GitHub URL passed directly to `installTheme`. */
async function installFromTarget(projectDir: string, target: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const src = resolve(target);
  if (existsSync(src) && src.endsWith('.json')) {
    const text = readFileSync(src, 'utf8');
    const parsed = JSON.parse(text) as { id?: string };
    if (!parsed.id) return { ok: false, error: 'theme JSON is missing id' };
    const destDir = join(projectDir, '.kandown', 'themes');
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, `${parsed.id}.json`), text, 'utf8');
    return { ok: true, id: parsed.id };
  }
  return installTheme(projectDir, { url: target });
}

/** 📖 Reads installed themes for `kandown theme list`. */
function listInstalledThemesForCli(projectDir: string): Array<{ id: string; name: string; author?: string; description?: string; version?: string }> {
  const dir = join(projectDir, '.kandown', 'themes');
  if (!existsSync(dir)) return [];
  const out: Array<{ id: string; name: string; author?: string; description?: string; version?: string }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(dir, file), 'utf8');
      const parsed = JSON.parse(raw) as { id?: string; name?: string; author?: string; description?: string; version?: string };
      if (parsed.id) out.push({ id: parsed.id, name: parsed.name ?? parsed.id, author: parsed.author, description: parsed.description, version: parsed.version });
    } catch {
      // skip broken files
    }
  }
  return out;
}

/** 📖 Scaffolds a starter theme JSON based on the bundled `kandown` theme. */
function scaffoldTheme(projectDir: string, name: string): void {
  const destDir = join(projectDir, '.kandown', 'themes');
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, `${name}.json`);
  if (existsSync(dest)) { err(`Already exists: ${dest}`); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);
  const starter = {
    $schema: 'https://kandown.dev/schemas/theme.v1.json',
    id: name,
    name: name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    author: 'Your GitHub Username',
    description: 'A community theme for kandown.',
    appearance: {
      radius: '6px',
      borderWidth: '1px',
      shadows: 'soft',
      density: 'comfortable',
      glass: false,
      motion: 'subtle',
    },
    fonts: {
      sans: "'Inter var', Inter, sans-serif",
      display: "'Inter var', Inter, sans-serif",
      mono: "'SF Mono', Menlo, monospace",
    },
    light: {
      background: '0 0% 100%',
      foreground: '220 13% 14%',
      card: '0 0% 100%',
      'card-foreground': '220 13% 14%',
      popover: '0 0% 100%',
      'popover-foreground': '220 13% 14%',
      primary: '220 90% 56%',
      'primary-foreground': '0 0% 100%',
      secondary: '220 14% 96%',
      'secondary-foreground': '220 13% 14%',
      muted: '220 14% 96%',
      'muted-foreground': '220 9% 46%',
      accent: '220 14% 96%',
      'accent-foreground': '220 13% 14%',
      border: '220 13% 91%',
      'border-strong': '220 13% 84%',
      'border-focus': '220 90% 56%',
      input: '220 13% 91%',
      ring: '220 90% 56%',
      destructive: '0 84% 60%',
      'destructive-foreground': '0 0% 100%',
      success: '142 71% 45%',
      warning: '38 92% 50%',
    },
    dark: {
      background: '220 13% 8%',
      foreground: '220 13% 95%',
      card: '220 13% 11%',
      'card-foreground': '220 13% 95%',
      popover: '220 13% 11%',
      'popover-foreground': '220 13% 95%',
      primary: '220 90% 60%',
      'primary-foreground': '220 13% 8%',
      secondary: '220 13% 16%',
      'secondary-foreground': '220 13% 95%',
      muted: '220 13% 14%',
      'muted-foreground': '220 9% 60%',
      accent: '220 13% 18%',
      'accent-foreground': '220 13% 95%',
      border: '220 13% 18%',
      'border-strong': '220 13% 26%',
      'border-focus': '220 90% 60%',
      input: '220 13% 18%',
      ring: '220 90% 60%',
      destructive: '0 72% 55%',
      'destructive-foreground': '0 0% 100%',
      success: '142 71% 50%',
      warning: '38 92% 55%',
    },
    version: '0.1.0',
    created: today,
  };
  writeFileSync(dest, `${JSON.stringify(starter, null, 2)}\n`, 'utf8');
}

/** 📖 Builds the prefilled GitHub URL the user clicks to propose their theme
 * via a one-click PR, then prints it. If `githubUser` is provided, we embed
 * it as the author field too (saves a step on the GitHub page). */
function publishTheme(file: string, githubUser: string): void {
  const resolved = resolve(file);
  if (!existsSync(resolved)) { err(`Theme file not found: ${file}`); process.exit(1); }
  const raw = readFileSync(resolved, 'utf8');
  let theme: { id?: string; name?: string; author?: string; description?: string };
  try { theme = JSON.parse(raw); }
  catch { err('Theme file is not valid JSON.'); process.exit(1); }
  if (!theme.id) { err('Theme JSON is missing the `id` field.'); process.exit(1); }
  if (githubUser && (!theme.author || theme.author === 'Your GitHub Username')) {
    try {
      const updated = JSON.parse(raw) as Record<string, unknown>;
      updated.author = githubUser;
      const updatedRaw = `${JSON.stringify(updated, null, 2)}\n`;
      writeFileSync(resolved, updatedRaw, 'utf8');
      info(`Set author to @${githubUser} in ${file}.`);
    } catch { /* keep going */ }
  }
  const json = existsSync(resolved) ? readFileSync(resolved, 'utf8') : raw;
  const url = buildProposeUrl({
    githubOwner: KANDOWN_THEME_REPO_OWNER,
    githubRepo: KANDOWN_THEME_REPO_NAME,
    themeId: theme.id,
    json,
  });
  success(`Open this URL in your browser to propose "${theme.id}" via PR:`);
  log(url);
  log('');
  info(`If you are not a ${KANDOWN_THEME_REPO_OWNER} collaborator, GitHub will fork the repo automatically and open a PR from your fork.`);
  // 📖 Reference the canonical index so contributors can also patch it in
  // the same PR when adding a new entry.
  log('');
  log(`${c.dim}Don't forget to add an entry to ${DEFAULT_REGISTRY_URL} in the same PR:${c.reset}`);
  const entryJson = JSON.stringify({
    id: theme.id,
    name: theme.id,
    author: githubUser || theme.author || 'unknown',
    description: theme.description ?? '',
    repo: `https://github.com/${KANDOWN_THEME_REPO_OWNER}/${KANDOWN_THEME_REPO_NAME}`,
    path: `registry/themes/${theme.id}.json`,
    ref: 'main',
    tags: ['community'],
  }, null, 2);
  log(c.dim + entryJson + c.reset);
}