/**
 * @file CLI wiring for the extension system
 * @description Bridges the runtime-agnostic `ExtensionHost` to the CLI's
 * synchronous board-reader world: builds a `HostEnvironment` from a kandown
 * project, offers a one-call `loadExtensionHost`, runs extension gates around a
 * move, and implements the `kandown extension` subcommands (list / enable /
 * disable / install / create / purge) plus contributed-command dispatch.
 *
 * 📖 The host stays Node-only and authoritative (docs/EXTENSIONS.md § "Runtimes");
 * this module is the CLI's thin adapter over it. Gates compose with the core
 * dependency gate: the dependency gate runs first inside `moveTaskToColumn`,
 * then `runExtensionMoveGates` runs every contributed `task:beforeMove` gate and
 * surfaces the first block reason.
 *
 * @functions
 *  → buildHostEnvironment — adapt a kandown project to a HostEnvironment
 *  → loadExtensionHost — instantiate + loadAll a host for a project
 *  → runExtensionMoveGates — run task:beforeMove gates, return first block
 *  → dispatchContributedCommand — run a `kandown <ext-cmd>` if one exists
 *  → cmdExtension — `kandown extension <subcommand>` handler, including agent guides
 * @exports buildHostEnvironment, loadExtensionHost, runExtensionMoveGates, dispatchContributedCommand, cmdExtension
 * @see src/lib/extensions/host.ts
 * @see src/cli/commands/tasks.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { ExtensionHost, type HostEnvironment } from '../../lib/extensions/host';
import type { TaskLike } from '../../lib/extensions/types';
import { setField } from '../../lib/extensions/namespace';
import { getProjectRoot, listTaskIds, readTask, findTaskPath } from './board-reader';
import { loadConfig } from './config';
import { getCurrentVersion } from './updater';
import { serializeTaskFile } from '../../lib/serializer';
import { parseTaskFile } from '../../lib/parser';
import { stampUpdated } from '../../lib/task-meta';
import { atomicWriteFileSync } from './atomic-write';
import { c, log, info, success, err, ensureKandownDir, taskParseArgs } from './cli-shared';

/** Builds a HostEnvironment backed by the board-reader for a kandown project. */
export function buildHostEnvironment(kandownDir: string): HostEnvironment {
  const projectDir = getProjectRoot(kandownDir);
  const toTaskLike = (id: string, fm: Record<string, unknown>): TaskLike => ({
    id,
    frontmatter: fm,
    plugins: (fm.plugins as Record<string, unknown> | undefined) && typeof fm.plugins === 'object'
      ? (fm.plugins as Record<string, unknown>)
      : undefined,
  });
  return {
    projectDir,
    kandownVersion: getCurrentVersion(),
    config: loadConfig(kandownDir) as { extensions?: { restricted?: boolean } },
    async readAll() {
      return listTaskIds(kandownDir).map((id) => {
        try {
          return toTaskLike(id, readTask(kandownDir, id).frontmatter as Record<string, unknown>);
        } catch {
          return null;
        }
      }).filter((t): t is TaskLike => t !== null);
    },
    async read(taskId) {
      try {
        const parsed = readTask(kandownDir, taskId);
        return toTaskLike(taskId, parsed.frontmatter as Record<string, unknown>);
      } catch {
        return null;
      }
    },
    async applyField(taskId, extId, key, value) {
      const taskPath = findTaskPath(kandownDir, taskId);
      if (!taskPath) throw new Error(`task not found: ${taskId}`);
      const parsed = readTask(kandownDir, taskId);
      const next = setField(parsed.frontmatter as Record<string, unknown>, extId, key, value);
      atomicWriteFileSync(taskPath, serializeTaskFile(stampUpdated(next as never), parsed.body));
    },
    log: {
      info: (m) => info(m),
      warn: (m) => info(`[warn] ${m}`),
      error: (m) => err(m),
    },
  };
}

/** Instantiates a host for a project and loads every extension. */
export async function loadExtensionHost(kandownDir: string): Promise<ExtensionHost> {
  const host = new ExtensionHost(buildHostEnvironment(kandownDir));
  await host.loadAll();
  return host;
}

/**
 * 📖 Runs contributed `task:beforeMove` gates. Returns the first block, or
 * `{ allowed: true }`. Call after the core dependency gate has already passed.
 */
export async function runExtensionMoveGates(
  host: ExtensionHost,
  kandownDir: string,
  taskId: string,
  fromStatus: string | undefined,
  to: string,
): Promise<{ allowed: boolean; reason?: string }> {
  let task: TaskLike;
  try {
    const parsed = readTask(kandownDir, taskId);
    const fm = parsed.frontmatter as Record<string, unknown>;
    task = { id: taskId, frontmatter: fm, plugins: fm.plugins as Record<string, unknown> | undefined };
  } catch {
    task = { id: taskId, frontmatter: {} };
  }
  return host.runGates({ type: 'task:beforeMove', task, from: fromStatus, to });
}

/** Returns true if `name` is a contributed command, and runs it if so. */
export async function dispatchContributedCommand(
  kandownDir: string,
  name: string,
  args: string,
): Promise<boolean> {
  const host = await loadExtensionHost(kandownDir);
  if (!host.getCommand(name)) return false;
  await host.runCommand(name, args);
  return true;
}

/** 📖 `kandown extension <subcommand>` entrypoint. */
export async function cmdExtension(rawArgs: string[]): Promise<void> {
  const args = taskParseArgs(rawArgs);
  const sub = args.positional[0];
  const { kandownDir } = ensureKandownDir(rawArgs);

  const usage = `${c.cyan}kandown extension${c.reset} ${c.dim}<list|enable|disable|install|create|guide|purge>${c.reset}`;

  if (!sub) {
    log(usage);
    return;
  }

  const host = await loadExtensionHost(kandownDir);

  switch (sub) {
    case 'guide': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown extension guide <id>'); process.exitCode = 1; return; }
      const extension = host.get(id);
      if (!extension) { err(`Extension not found: ${id}`); process.exitCode = 1; return; }
      const guidance = extension.manifest.agent;
      if (!guidance) { info(`${id} does not provide agent guidance.`); return; }
      log(`# ${extension.manifest.name} agent guide\n\n${guidance.summary}`);
      if (guidance.guide) {
        const guidePath = resolve(extension.dir, guidance.guide);
        if (!guidePath.startsWith(`${resolve(extension.dir)}/`) || !existsSync(guidePath)) {
          err(`Declared guide is unavailable: ${guidance.guide}`);
          process.exitCode = 1;
          return;
        }
        log(`\n${readFileSync(guidePath, 'utf8')}`);
      }
      if (guidance.source) log(`\nSource: ${guidance.source}`);
      return;
    }
    case 'list':
    case 'ls': {
      const summary = host.installedSummary();
      if (summary.length === 0) {
        info('No extensions installed. Try: kandown extension create <name>');
        return;
      }
      for (const s of summary) {
        const tag =
          s.health === 'enabled' ? c.green :
          s.health === 'errored' || s.health === 'quarantined' ? c.red :
          c.dim;
        log(`${tag}${s.health.padEnd(11)}${c.reset} ${c.bold}${s.id}${c.reset} ${c.dim}v${s.version}${c.reset} [${s.source}] ${s.name}`);
        if (s.error) log(`             ${c.dim}↳ ${s.error}${c.reset}`);
        const bits = [
          s.fields.length && `${s.fields.length} field(s)`,
          s.panels.length && `${s.panels.length} panel(s)`,
          s.commands.length && `${s.commands.length} command(s)`,
          s.gates && `${s.gates} gate(s)`,
          s.syncs && `${s.syncs} sync(s)`,
        ].filter(Boolean).join(', ');
        if (bits) log(`             ${c.dim}${bits}${c.reset}`);
      }
      return;
    }

    case 'enable': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown extension enable <id>'); process.exit(1); }
      const ok = await host.enable(id);
      ok ? success(`Enabled ${id}`) : err(`Could not enable ${id} (not found, incompatible, or errored)`);
      return;
    }

    case 'disable': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown extension disable <id>'); process.exit(1); }
      host.disable(id) ? success(`Disabled ${id}`) : err(`Not installed: ${id}`);
      return;
    }

    case 'purge': {
      const id = args.positional[1];
      if (!id) { err('Usage: kandown extension purge <id>'); process.exit(1); }
      const count = purgePluginData(kandownDir, id);
      success(`Purged plugins.${id}.* from ${count} task(s).`);
      return;
    }

    case 'install': {
      const target = args.positional[1];
      if (!target) { err('Usage: kandown extension install <path-or-github-url>'); process.exit(1); }
      const installedId = await installExtension(kandownDir, target);
      installedId ? success(`Installed ${installedId}. Enable it with: kandown extension enable ${installedId}`) : err('Install failed.');
      return;
    }

    case 'create': {
      const name = args.positional[1];
      if (!name) { err('Usage: kandown extension create <kebab-name>'); process.exit(1); }
      scaffoldExtension(kandownDir, name);
      success(`Scaffolded extension "${name}" at .kandown/extensions/${name}/`);
      info('Edit index.ts, then: kandown extension enable ' + name);
      return;
    }

    default:
      err(`Unknown extension subcommand: ${sub}`);
      log(usage);
  }
}

/** Removes `plugins.<id>.*` from every task file. Returns the count touched. */
function purgePluginData(kandownDir: string, extId: string): number {
  const projectDir = getProjectRoot(kandownDir);
  const tasksDir = join(projectDir, 'tasks');
  let count = 0;
  if (!existsSync(tasksDir)) return 0;
  for (const file of readdirSync(tasksDir)) {
    if (!file.endsWith('.md')) continue;
    const path = join(tasksDir, file);
    const raw = readFileSync(path, 'utf8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch || !raw.includes(`plugins:`)) continue;
    const parsed = parseTaskFile(raw);
    const fm = parsed.frontmatter as Record<string, unknown>;
    const plugins = fm.plugins as Record<string, unknown> | undefined;
    if (!plugins || !(extId in plugins)) continue;
    delete plugins[extId];
    if (Object.keys(plugins).length === 0) delete fm.plugins;
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated(fm as never), parsed.body));
    count++;
  }
  return count;
}

/** Installs from a local directory path (copies into project extensions). */
async function installExtension(kandownDir: string, target: string): Promise<string | null> {
  const projectDir = getProjectRoot(kandownDir);
  const destRoot = join(projectDir, '.kandown', 'extensions');
  mkdirSync(destRoot, { recursive: true });

  // Local path: a directory with a manifest.json.
  const src = resolve(target);
  if (existsSync(src) && existsSync(join(src, 'manifest.json'))) {
    const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8')) as { id?: string };
    if (!manifest.id) return null;
    const dest = join(destRoot, manifest.id);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    return manifest.id;
  }

  err('install currently supports a local directory containing manifest.json. GitHub URL fetch is coming soon.');
  return null;
}

/** Scaffolds a new extension into the project extensions dir. */
function scaffoldExtension(kandownDir: string, name: string): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
    err('name must be kebab-case (lowercase letters, digits, hyphens)');
    process.exit(1);
  }
  const projectDir = getProjectRoot(kandownDir);
  const dir = join(projectDir, '.kandown', 'extensions', name);
  if (existsSync(dir)) { err(`Already exists: ${dir}`); process.exit(1); }
  mkdirSync(dir, { recursive: true });

  const manifest = {
    id: name,
    name: name,
    version: '0.1.0',
    apiVersion: 1,
    description: 'A kandown extension.',
    permissions: ['read:tasks', `write:field:plugins.${name}.*`],
    contributes: { fields: [], webPanels: [], commands: [], gates: [] },
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const indexTs = `// ${name} — a kandown extension. See docs/EXTENSIONS.md.
// Loaded via jiti, no build step. Register contributions on the \`kd\` API.
import type { KandownExtensionAPI } from 'kandown';

export default function (kd: KandownExtensionAPI) {
  // Example: a custom field stored under plugins.${name}.<key>.
  kd.contributeField({ key: 'note', label: 'Note', type: 'string' });

  // Example: a CLI command surfaced as: kandown ${name}
  kd.contributeCommand('${name}', {
    description: 'Example contributed command',
    handler: async (_args, ctx) => {
      const tasks = await ctx.board.readAll();
      ctx.log.info(\`${name} sees \${tasks.length} task(s)\`);
    },
  });
}
`;
  writeFileSync(join(dir, 'index.ts'), indexTs);
  writeFileSync(join(dir, 'README.md'), `# ${name}\n\nA kandown extension. Enable with \`kandown extension enable ${name}\`.\n`);
}
