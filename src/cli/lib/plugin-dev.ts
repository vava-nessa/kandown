/**
 * @file Plugin dev loop
 * @description Watches one plugin directory and, on every save, rebuilds the
 * browser bundles, re-runs the validator and asks the running daemon to hot
 * reload the board. This is the loop that makes agent-authored plugins
 * practical: without it, an author edits TypeScript, sees nothing change in the
 * web UI, and has no signal telling them the bundle is stale.
 *
 * 📖 The reload is pushed, not polled. The CLI finishes writing the bundle,
 * then POSTs `/api/extensions/reload`, so the daemon can never pick up a
 * half-written file. If no daemon is running the loop still builds and checks;
 * it simply reports that there is nothing to reload.
 *
 * 📖 The plugin is trusted and enabled once at startup rather than on every
 * cycle. Trust is granted to the id, not to a source fingerprint, so ordinary
 * editing does not re-prompt, and the grant is the same one `kandown plugin
 * enable` writes: dev mode adds no privilege the author did not already have.
 *
 * @functions
 *  → runPluginDev — build, check, enable, then watch until interrupted
 *  → requestDaemonReload — ask a running daemon to drop and re-hydrate its host
 * @exports runPluginDev, requestDaemonReload
 * @see src/cli/lib/plugin-check.ts
 * @see src/cli/lib/server.ts
 */

import { watch } from 'chokidar';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, sep } from 'node:path';
import { buildPlugin } from './plugin-build';
import { checkPlugin, formatCheckReport } from './plugin-check';
import { loadExtensionHost } from './extensions-cli';
import { getDaemonStatus } from './daemon';
import { TOKEN_HEADER } from './daemon-auth';
import { c, log, info, success, err } from './cli-shared';

/**
 * 📖 True for a file this loop wrote itself: a `.js` next to a source of the
 * same name, plus the usual noise directories. Anything else is authored input
 * and must retrigger a build.
 */
function isGeneratedBundle(dir: string, path: string): boolean {
  if (path.includes(`${sep}node_modules${sep}`) || basename(path).startsWith('.')) return true;
  if (extname(path) !== '.js') return false;
  const stem = basename(path, '.js');
  return ['.ts', '.tsx', '.jsx', '.mts'].some((extension) => existsSync(join(dirname(path) || dir, `${stem}${extension}`)));
}

/**
 * 📖 Tells a running daemon to forget its extension host and notify every open
 * board. Returns false (never throws) when no daemon is up, which is a normal
 * state during CLI-only development.
 */
export async function requestDaemonReload(kandownDir: string): Promise<boolean> {
  try {
    const status = await getDaemonStatus(kandownDir);
    if (!status.running || !status.metadata) return false;
    const response = await fetch(`http://localhost:${status.metadata.port}/api/extensions/reload`, {
      method: 'POST',
      headers: status.metadata.token ? { [TOKEN_HEADER]: status.metadata.token } : {},
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** One build + check + reload cycle. Returns whether the plugin is healthy. */
async function cycle(kandownDir: string, projectDir: string, id: string, dir: string, quiet: boolean): Promise<boolean> {
  const build = await buildPlugin(dir);
  for (const warning of build.warnings) info(warning);
  if (!build.ok) {
    for (const error of build.errors) err(error);
    return false;
  }
  if (!quiet) {
    const summary = build.outputs.map((output) => `${output.out.split('/').pop()} ${(output.bytes / 1024).toFixed(1)}kb`).join(', ');
    info(`built ${summary}`);
  }

  const report = await checkPlugin(kandownDir, projectDir, id);
  log(formatCheckReport(report));

  const reloaded = await requestDaemonReload(kandownDir);
  if (reloaded) success('reloaded the board');
  else if (!quiet) info('no daemon running; start one with "kandown" to see the plugin live');
  return report.ok;
}

/**
 * Runs the watch loop until the process is interrupted. Resolves when the
 * watcher is closed, so the caller can exit cleanly.
 */
export async function runPluginDev(
  kandownDir: string,
  projectDir: string,
  id: string,
  dir: string,
): Promise<void> {
  // 📖 Enable first: a plugin that is not trusted loads as disabled, and every
  // check downstream would then report a plugin that "does nothing".
  const host = await loadExtensionHost(kandownDir);
  const enabled = await host.enable(id);
  if (enabled) success(`${id} is trusted and enabled`);
  else info(`${id} is not enabled yet; the checks below explain why`);

  await cycle(kandownDir, projectDir, id, dir, false);

  // 📖 The whole directory is watched so a newly created web.tsx is picked up,
  // but the bundles this loop writes are excluded: watching our own output is
  // how a watcher turns into an infinite rebuild.
  const watcher = watch(dir, {
    ignoreInitial: true,
    ignored: (path: string) => isGeneratedBundle(dir, path),
    // 📖 Editors write in several steps. Waiting for the size to settle stops a
    // rebuild from reading a truncated file.
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
  });

  log('');
  log(`${c.dim}watching ${dir}, press Ctrl+C to stop${c.reset}`);

  let running = false;
  let queued = false;
  const trigger = async (): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      log('');
      log(`${c.dim}${new Date().toLocaleTimeString()} rebuilding${c.reset}`);
      await cycle(kandownDir, projectDir, id, dir, true);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void trigger();
      }
    }
  };

  watcher.on('all', () => { void trigger(); });

  await new Promise<void>((resolve) => {
    const stop = () => {
      void watcher.close().then(() => resolve());
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}
