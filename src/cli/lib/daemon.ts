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
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

export interface DaemonMetadata {
  pid: number;
  port: number;
  url: string;
  kandownDir: string;
  startedAt: string;
  version: string | null;
}

export interface DaemonStatus {
  running: boolean;
  metadata: DaemonMetadata | null;
}

interface RemoteDaemonInfo {
  ok: boolean;
  pid: number;
  kandownDir: string;
}

function metadataPath(kandownDir: string): string {
  return join(kandownDir, 'daemon.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseMetadata(value: unknown): DaemonMetadata | null {
  if (!isRecord(value)) return null;
  const { pid, port, url, kandownDir, startedAt, version } = value;
  if (typeof pid !== 'number' || !Number.isInteger(pid)) return null;
  if (typeof port !== 'number' || !Number.isInteger(port)) return null;
  if (typeof url !== 'string' || typeof kandownDir !== 'string') return null;
  if (typeof startedAt !== 'string') return null;
  if (version !== null && typeof version !== 'string' && version !== undefined) return null;
  return { pid, port, url, kandownDir, startedAt, version: version ?? null };
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
  const { ok, pid, kandownDir } = value;
  if (ok !== true || typeof pid !== 'number' || !Number.isInteger(pid) || typeof kandownDir !== 'string') return null;
  return { ok, pid, kandownDir };
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

  return { running: true, metadata };
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
  if (current.running) return current;

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

export async function stopProjectDaemon(kandownDir: string): Promise<boolean> {
  const status = await getDaemonStatus(kandownDir);
  if (!status.running || !status.metadata) {
    removeDaemonMetadata(kandownDir);
    return false;
  }

  try {
    process.kill(status.metadata.pid, 'SIGTERM');
  } catch {
    // 📖 Already gone; metadata cleanup below makes the UI reflect OFF.
  }

  const started = Date.now();
  while (Date.now() - started < 2500 && isProcessAlive(status.metadata.pid)) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  removeDaemonMetadata(kandownDir);
  return true;
}
