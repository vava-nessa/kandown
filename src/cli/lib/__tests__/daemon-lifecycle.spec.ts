/**
 * @file Port allocation and daemon start/stop lifecycle
 * @description Two layers of the same story, both against real sockets and a
 * real detached process, nothing mocked, because everything that goes wrong
 * here (a port already taken, a daemon that outlives its metadata, a stale
 * `daemon.json` pointing at a dead PID) only goes wrong against the OS.
 *
 *  1. `listenOnAvailablePort` walks the 2050-2099 range, skipping ports that
 *     are already bound, so two projects open side by side never fight.
 *  2. `kandown daemon start|status|stop` spawns the real detached daemon in a
 *     tmpdir project, checks it answers on its port and that stopping it kills
 *     the process *and* removes the metadata.
 *
 * 📖 These bind real ports on the machine running them, briefly. They only ever
 * stop a daemon that reports our own tmpdir as its project (see
 * `isOwnedKandownDaemon`), so a developer's own `kandown` session is never at
 * risk. `afterAll` stops the daemon even when an expectation failed, so a red
 * run cannot leave an orphan holding a port.
 *
 * 📖 Run `pnpm build:cli` first: the daemon child process is `bin/kandown.js`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { listenOnAvailablePort } from '../server';
import { readDaemonMetadata } from '../daemon';

const CLI = join(process.cwd(), 'bin', 'kandown.js');
const START_PORT = 2050;
const END_PORT = 2099;

let projectDir: string;
let kandownDir: string;

/** 📖 Holds a TCP port the way another kandown project would. */
function occupy(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const close = (server: { close: (cb?: () => void) => void }) =>
  new Promise<void>(resolve => server.close(() => resolve()));

function run(args: string[]) {
  return spawnSync('node', [CLI, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
    env: { ...process.env, KANDOWN_NO_UPDATE: '1', KANDOWN_NO_GRAPHIFY: '1' },
    timeout: 30_000,
  });
}

const isAlive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

beforeAll(() => {
  // 📖 realpath, because on macOS `os.tmpdir()` is the /var → /private/var
  // symlink and the daemon records the resolved path in daemon.json.
  projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'kandown-daemon-')));
  kandownDir = join(projectDir, '.kandown');
  mkdirSync(kandownDir, { recursive: true });
  mkdirSync(join(projectDir, 'tasks'), { recursive: true });
  writeFileSync(
    join(kandownDir, 'kandown.json'),
    JSON.stringify({ board: { columns: ['Backlog', 'Todo', 'Done'] } }, null, 2),
  );
  writeFileSync(
    join(projectDir, 'tasks', 't1.md'),
    '---\nid: t1\ntitle: Hello\nstatus: Todo\n---\n\n# Hello\n',
  );
});

afterAll(() => {
  // 📖 Unconditional: an expectation failing above must not leave a detached
  // daemon holding a port until the machine reboots.
  try { run(['daemon', 'stop']); } catch { /* best effort */ }
  const leftover = readDaemonMetadata(kandownDir);
  if (leftover && isAlive(leftover.pid)) {
    try { process.kill(leftover.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  if (projectDir && existsSync(projectDir)) rmSync(projectDir, { recursive: true, force: true });
});

describe('listenOnAvailablePort', () => {
  it('binds inside the reserved range and reports the port it took', async () => {
    const { server, port } = await listenOnAvailablePort(kandownDir);
    try {
      expect(port).toBeGreaterThanOrEqual(START_PORT);
      expect(port).toBeLessThanOrEqual(END_PORT);
      expect(server.listening).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('skips a port that is already taken instead of throwing EADDRINUSE', async () => {
    const blocker = await occupy(0);
    await close(blocker);
    // 📖 Take a port inside the range, then ask for exactly that one: the
    // allocator must walk forward rather than surface the bind error.
    const first = await listenOnAvailablePort(kandownDir);
    try {
      const second = await listenOnAvailablePort(kandownDir, first.port);
      try {
        expect(second.port).toBeGreaterThan(first.port);
        expect(second.port).toBeLessThanOrEqual(END_PORT);
      } finally {
        await close(second.server);
      }
    } finally {
      await close(first.server);
    }
  });

  it('honours a preferred port when it is free', async () => {
    const probe = await listenOnAvailablePort(kandownDir);
    const wanted = probe.port;
    await close(probe.server);
    const { server, port } = await listenOnAvailablePort(kandownDir, wanted);
    try {
      expect(port).toBe(wanted);
    } finally {
      await close(server);
    }
  });

  it('throws a named error rather than hanging when the range is exhausted', async () => {
    const last = await occupy(END_PORT);
    try {
      await expect(listenOnAvailablePort(kandownDir, END_PORT)).rejects.toThrow(/No free port/);
    } finally {
      await close(last);
    }
  });
});

describe('kandown daemon start / status / stop', () => {
  it('reports "not running" before anything is started', () => {
    const res = run(['daemon', 'status']);
    expect(res.status).toBe(0);
    expect(res.stderr + res.stdout).toMatch(/not running/i);
    expect(readDaemonMetadata(kandownDir)).toBeNull();
  });

  it('starts a live daemon, records it, serves it, and stops it cleanly', async () => {
    const started = run(['daemon', 'start']);
    expect(started.status, `stdout=${started.stdout}\nstderr=${started.stderr}`).toBe(0);

    const metadata = readDaemonMetadata(kandownDir);
    expect(metadata).not.toBeNull();
    expect(metadata!.port).toBeGreaterThanOrEqual(START_PORT);
    expect(metadata!.port).toBeLessThanOrEqual(END_PORT);
    expect(metadata!.kandownDir).toBe(kandownDir);
    expect(isAlive(metadata!.pid)).toBe(true);

    // 📖 The daemon claims *this* project on its own port, the check
    // `stopProjectDaemon` relies on before it is allowed to send a signal.
    const info = await fetch(`http://127.0.0.1:${metadata!.port}/api/daemon`, {
      signal: AbortSignal.timeout(5000),
    }).then(r => r.json() as Promise<{ ok: boolean; pid: number; kandownDir: string }>);
    expect(info).toMatchObject({ ok: true, pid: metadata!.pid, kandownDir });

    expect(run(['daemon', 'status']).stdout + run(['daemon', 'status']).stderr)
      .toMatch(new RegExp(`port ${metadata!.port}`));

    const stopped = run(['daemon', 'stop']);
    expect(stopped.status).toBe(0);
    expect(stopped.stdout + stopped.stderr).toMatch(/Daemon stopped/);
    expect(isAlive(metadata!.pid)).toBe(false);
    expect(readDaemonMetadata(kandownDir)).toBeNull();
    expect(existsSync(join(kandownDir, 'daemon.json'))).toBe(false);
  }, 60_000);

  it('is idempotent: stopping again is a no-op, not an error', () => {
    const res = run(['daemon', 'stop']);
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toMatch(/not running|Daemon stopped/i);
    expect(readDaemonMetadata(kandownDir)).toBeNull();
  }, 30_000);

  it('treats metadata pointing at a dead PID as "not running" and cleans it up', () => {
    // 📖 The crash case: the process died without removing daemon.json. A stale
    // file must never make the CLI believe a board is being served, and must
    // never be aimed at whatever process later recycles that PID.
    writeFileSync(join(kandownDir, 'daemon.json'), JSON.stringify({
      pid: 2 ** 22, // 📖 Above every OS pid_max in use; guaranteed not to exist.
      port: 2099,
      url: 'http://127.0.0.1:2099',
      kandownDir,
      startedAt: new Date().toISOString(),
      version: '0.0.0',
      token: null,
    }));
    const res = run(['daemon', 'status']);
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toMatch(/not running/i);
    expect(existsSync(join(kandownDir, 'daemon.json'))).toBe(false);
  }, 30_000);

  it('leaves the project files alone through the whole lifecycle', () => {
    expect(readFileSync(join(projectDir, 'tasks', 't1.md'), 'utf8')).toMatch(/^status: Todo$/m);
  });
});
