/**
 * @file Kandown daemon helpers for the TUI
 * @description Reads and controls the per-project web daemon from the terminal
 * UI. The CLI writes `.kandown/daemon.json`; this module validates that file,
 * checks process liveness, and can spawn/stop the daemon on user request.
 *
 * 📖 The daemon is intentionally per project. Each `.kandown/` folder owns one
 * metadata file containing the daemon PID, port, URL, project path, version, and
 * start time. The TUI never guesses global state — it only trusts the current
 * project's metadata after validating the PID and `/api/daemon` endpoint.
 *
 * @functions
 *  → readDaemonMetadata — parse `.kandown/daemon.json` safely
 *  → getDaemonStatus — validate daemon process + API ownership
 *  → startProjectDaemon — spawn the CLI daemon for this `.kandown/` directory
 *  → stopProjectDaemon — terminate the current project's daemon
 *
 * @exports DaemonMetadata, DaemonStatus, readDaemonMetadata, getDaemonStatus, startProjectDaemon, stopProjectDaemon
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { getCurrentVersion } from './updater';

export interface DaemonMetadata {
  pid: number;
  port: number;
  url: string;
  kandownDir: string;
  startedAt: string;
  version: string | null;
  /** 📖 Per-daemon API auth token (M5). Required as `X-Kandown-Token` on every
   * API route except `GET /api/daemon`. Absent on pre-token daemons. */
  token: string | null;
}

export interface DaemonStatus {
  running: boolean;
  metadata: DaemonMetadata | null;
}

interface RemoteDaemonInfo {
  ok: boolean;
  pid: number;
  kandownDir: string;
  version: string | null;
}

function metadataPath(kandownDir: string): string {
  return join(kandownDir, 'daemon.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseMetadata(value: unknown): DaemonMetadata | null {
  if (!isRecord(value)) return null;
  const { pid, port, url, kandownDir, startedAt, version, token } = value;
  if (typeof pid !== 'number' || !Number.isInteger(pid)) return null;
  if (typeof port !== 'number' || !Number.isInteger(port)) return null;
  if (typeof url !== 'string' || typeof kandownDir !== 'string') return null;
  if (typeof startedAt !== 'string') return null;
  if (version !== null && typeof version !== 'string' && version !== undefined) return null;
  if (token !== null && typeof token !== 'string' && token !== undefined) return null;
  return { pid, port, url, kandownDir, startedAt, version: version ?? null, token: typeof token === 'string' ? token : null };
}

export function readDaemonMetadata(kandownDir: string): DaemonMetadata | null {
  const path = metadataPath(kandownDir);
  if (!existsSync(path)) return null;
  try {
    return parseMetadata(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

function removeDaemonMetadata(kandownDir: string): void {
  try {
    const path = metadataPath(kandownDir);
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // 📖 Best-effort cleanup; stale metadata is revalidated on the next read.
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseRemoteDaemonInfo(value: unknown): RemoteDaemonInfo | null {
  if (!isRecord(value)) return null;
  const { ok, pid, kandownDir, version } = value;
  if (ok !== true || typeof pid !== 'number' || !Number.isInteger(pid) || typeof kandownDir !== 'string') return null;
  if (version !== null && typeof version !== 'string' && version !== undefined) return null;
  return { ok, pid, kandownDir, version: typeof version === 'string' ? version : null };
}

async function fetchDaemonInfo(port: number): Promise<RemoteDaemonInfo | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/daemon`, {
      signal: AbortSignal.timeout(700),
    });
    if (!response.ok) return null;
    return parseRemoteDaemonInfo(await response.json());
  } catch {
    return null;
  }
}

function isPortListening(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function getDaemonStatus(kandownDir: string): Promise<DaemonStatus> {
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return { running: false, metadata: null };
  if (!isProcessAlive(metadata.pid)) {
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }

  const remote = await fetchDaemonInfo(metadata.port);
  if (!remote) {
    // 📖 Fetch can fail transiently during daemon startup (same undici race as
    // the CLI parent process). Keep metadata while the PID is alive so the next
    // poll can recover instead of orphaning a healthy daemon.
    return { running: false, metadata: null };
  }
  if (remote.pid !== metadata.pid || remote.kandownDir !== kandownDir) {
    removeDaemonMetadata(kandownDir);
    return { running: false, metadata: null };
  }

  return { running: true, metadata: { ...metadata, version: remote.version ?? metadata.version } };
}

async function waitForDaemon(kandownDir: string, timeoutMs = 8000): Promise<DaemonStatus> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const metadata = readDaemonMetadata(kandownDir);
    if (metadata && isProcessAlive(metadata.pid) && await isPortListening(metadata.port)) {
      return { running: true, metadata };
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return { running: false, metadata: null };
}

export async function startProjectDaemon(kandownDir: string, preferredPort?: number | null): Promise<DaemonStatus> {
  const current = await getDaemonStatus(kandownDir);
  if (current.running) {
    // 📖 A package auto-update replaces the CLI on disk, but existing daemons
    // keep serving the old bundled web app until they are restarted. Treat a
    // missing or different daemon version as stale so `kandown` always opens
    // the current web UI after an update instead of silently reusing old code.
    if (current.metadata?.version === getCurrentVersion()) return current;
    await stopProjectDaemon(kandownDir);
  }

  const cliPath = process.argv[1];
  if (!cliPath) throw new Error('Cannot locate kandown CLI entrypoint');

  const args = [
    cliPath,
    '--no-update-check',
    'daemon',
    'run',
    '--path',
    kandownDir,
  ];
  if (typeof preferredPort === 'number' && Number.isInteger(preferredPort)) {
    args.push('--port', String(preferredPort));
  }

  const child = spawn(process.execPath, args, {
    cwd: dirname(kandownDir),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, KANDOWN_DAEMON: '1' },
  });
  child.unref();

  return waitForDaemon(kandownDir);
}

/**
 * 📖 Guard against PID reuse before killing: only treat the PID as ours if the
 * daemon API confirms ownership, or — when the API is unreachable (wedged /
 * still starting) — the OS process table shows a kandown process launched for
 * THIS project. Without this, stale metadata after a crash could point at a
 * recycled PID and we would SIGKILL an unrelated process.
 */
async function isOwnedKandownDaemon(pid: number, port: number, kandownDir: string): Promise<boolean> {
  const remote = await fetchDaemonInfo(port);
  if (remote) return remote.pid === pid && remote.kandownDir === kandownDir;
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8', timeout: 2000,
    }).trim();
    return /kandown/.test(cmd) && cmd.includes(kandownDir);
  } catch {
    return false;
  }
}

export async function stopProjectDaemon(kandownDir: string): Promise<boolean> {
  // 📖 Read the metadata directly instead of going through getDaemonStatus:
  // a daemon whose HTTP health-check transiently fails is still a live process
  // we must terminate — otherwise we'd delete the metadata and orphan it with
  // the port held forever.
  const metadata = readDaemonMetadata(kandownDir);
  if (!metadata) return false;

  const pid = metadata.pid;
  if (!isProcessAlive(pid)) {
    removeDaemonMetadata(kandownDir);
    return false;
  }

  if (!(await isOwnedKandownDaemon(pid, metadata.port, kandownDir))) {
    // Alive PID that isn't our daemon (recycled PID / stale metadata) — never kill.
    removeDaemonMetadata(kandownDir);
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // 📖 Already gone; metadata cleanup below makes the UI reflect OFF.
  }

  const started = Date.now();
  while (Date.now() - started < 2500 && isProcessAlive(pid)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (isProcessAlive(pid)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* raced to death */ }
  }
  removeDaemonMetadata(kandownDir);
  return true;
}
