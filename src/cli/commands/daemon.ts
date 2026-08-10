/**
 * @file CLI command — daemon subcommands
 * @description Handles `kandown daemon <run|start|stop|restart|status|refresh-all>`.
 * `run` is the foregrounded process the daemon manager spawns and detaches;
 * the rest are thin wrappers around lib/daemon.ts that talk to that process
 * over its PID/port metadata file.
 *
 * @exports cmdDaemon
 */

import { join } from 'node:path';
import { getDaemonStatus, scheduleDaemonSelfUpgrade, startProjectDaemon, stopProjectDaemon } from '../lib/daemon';
import { listenOnAvailablePort, setActiveToken } from '../lib/server';
import { atomicWriteFileSync } from '../lib/atomic-write';
import { getCurrentVersion } from '../lib/updater';
import { generateToken } from '../lib/daemon-auth';
import { c, log, info, success, err, parseArgs, ensureKandownDir, stripFirstPositional } from '../lib/cli-shared';

export async function cmdDaemon(rest: string[]): Promise<void> {
  const parsedDaemonArgs = parseArgs(rest);
  const subcommand = parsedDaemonArgs.positional[0] || 'status';
  const daemonArgs = subcommand ? stripFirstPositional(rest, subcommand) : rest;
  const { kandownDir } = ensureKandownDir(daemonArgs);

  if (subcommand === 'run') {
    const daemonOptions = parseArgs(daemonArgs);
    const preferredPort = typeof daemonOptions.flags.port === 'string' ? Number(daemonOptions.flags.port) : null;
    // 📖 M5 per-daemon API auth: mint the token, register it with the server
    // module BEFORE the listener binds, then start listening. Doing it in this
    // order closes a microsecond race where a request could arrive before the
    // token is in place and therefore be accepted without auth.
    const token = generateToken();
    setActiveToken(token);
    const { port } = await listenOnAvailablePort(kandownDir, Number.isInteger(preferredPort) ? preferredPort : null);
    const url = `http://localhost:${port}`;
    const metadataPath = join(kandownDir, 'daemon.json');
    atomicWriteFileSync(metadataPath, JSON.stringify({
      pid: process.pid,
      port,
      url,
      kandownDir,
      startedAt: new Date().toISOString(),
      version: getCurrentVersion(),
      token,
    }, null, 2));
    info(`Kandown daemon running on port ${port} (PID ${process.pid})`);
    // 📖 From here the daemon keeps itself current: when a global update lands
    // under a long-lived process, it restarts onto the new build on its own
    // rather than serving a stale web bundle and asking the user to intervene.
    scheduleDaemonSelfUpgrade(kandownDir);
    await new Promise(() => {});
  } else if (subcommand === 'start') {
    const daemonOptions = parseArgs(daemonArgs);
    const preferredPort = typeof daemonOptions.flags.port === 'string' ? Number(daemonOptions.flags.port) : null;
    const status = await startProjectDaemon(kandownDir, Number.isInteger(preferredPort) ? preferredPort : null);
    if (status.running && status.metadata) success(`Daemon running on port ${status.metadata.port} (PID ${status.metadata.pid})`);
    else {
      err('Daemon failed to start');
      process.exit(1);
    }
  } else if (subcommand === 'restart') {
    await stopProjectDaemon(kandownDir);
    const status = await startProjectDaemon(kandownDir);
    if (status.running && status.metadata) success(`Daemon restarted on port ${status.metadata.port} (PID ${status.metadata.pid})`);
    else {
      err('Daemon failed to restart');
      process.exit(1);
    }
  } else if (subcommand === 'stop') {
    const stopped = await stopProjectDaemon(kandownDir);
    if (stopped) success('Daemon stopped');
    else info('Daemon not running');
  } else if (subcommand === 'status') {
    const status = await getDaemonStatus(kandownDir);
    if (status.running && status.metadata) {
      success(`Daemon running on port ${status.metadata.port} (PID ${status.metadata.pid})`);
    } else {
      info('Daemon not running');
    }
  } else if (subcommand === 'refresh-all') {
    const status = await getDaemonStatus(kandownDir);
    if (status.running) await stopProjectDaemon(kandownDir);
    const restarted = await startProjectDaemon(kandownDir);
    if (restarted.running && restarted.metadata) success(`Refreshed current project daemon on port ${restarted.metadata.port}`);
    else info('No running daemon refreshed');
  } else {
    err(`Unknown daemon command: ${subcommand}`);
    log(`  Use ${c.cyan}kandown daemon start|stop|restart|status|refresh-all${c.reset}`);
    process.exit(1);
  }
}
