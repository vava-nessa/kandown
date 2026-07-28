/**
 * @file Daemon self-upgrade watcher
 * @description The daemon restarts itself when the package on disk moves ahead
 * of the code it is running, so a user with the web UI open never has to be
 * told to run a command. This suite pins the two things that make that safe:
 *
 *  - it only fires when the installed version is genuinely *newer* than the
 *    running one (not merely different, and never on a downgrade);
 *  - the anti-loop guard holds. A development checkout has a generated
 *    `version.ts` that lags a bumped `package.json`, which looks identical to a
 *    pending upgrade and would otherwise respawn the daemon forever.
 *
 * @see src/cli/lib/daemon.ts — scheduleDaemonSelfUpgrade
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const currentVersion = vi.hoisted(() => ({ running: '1.0.0', installed: '1.0.0' }));
const spawned = vi.hoisted(() => ({ calls: [] as { args: string[]; env: NodeJS.ProcessEnv }[] }));

vi.mock('../updater', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../updater')>();
  return {
    ...actual,
    getCurrentVersion: () => currentVersion.running,
    getInstalledVersion: () => currentVersion.installed,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (_bin: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      spawned.calls.push({ args, env: opts.env });
      return { unref: () => {} };
    },
  };
});

// 📖 `existsSync` must find the CLI entrypoint for the watcher to act at all.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: () => true };
});

const { DAEMON_UPGRADE_ENV, scheduleDaemonSelfUpgrade } = await import('../daemon');

/** 📖 The watcher's first check is on a timer; fake timers make it immediate. */
function runWatcher(kandownDir = '/tmp/project/.kandown'): () => void {
  const stop = scheduleDaemonSelfUpgrade(kandownDir);
  vi.advanceTimersByTime(20_000);
  return stop;
}

beforeEach(() => {
  vi.useFakeTimers();
  spawned.calls = [];
  currentVersion.running = '1.0.0';
  currentVersion.installed = '1.0.0';
  delete process.env[DAEMON_UPGRADE_ENV];
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env[DAEMON_UPGRADE_ENV];
});

describe('scheduleDaemonSelfUpgrade', () => {
  it('does nothing while the daemon matches the installed package', () => {
    runWatcher()();
    expect(spawned.calls).toHaveLength(0);
  });

  it('restarts the daemon when the installed package moves ahead', () => {
    currentVersion.installed = '1.1.0';
    runWatcher()();
    expect(spawned.calls).toHaveLength(1);
    expect(spawned.calls[0].args).toContain('daemon');
    expect(spawned.calls[0].args).toContain('restart');
    expect(spawned.calls[0].args).toContain('/tmp/project/.kandown');
  });

  it('tags the restart with the version it is upgrading to', () => {
    currentVersion.installed = '2.0.0';
    runWatcher()();
    expect(spawned.calls[0].env[DAEMON_UPGRADE_ENV]).toBe('2.0.0');
  });

  it('never restarts on a downgrade', () => {
    currentVersion.running = '2.0.0';
    currentVersion.installed = '1.0.0';
    runWatcher()();
    expect(spawned.calls).toHaveLength(0);
  });

  it('does not loop when it has already restarted for this exact version', () => {
    // A dev checkout: package.json bumped, version.ts not rebuilt. The restart
    // cannot fix it, so the second process must give up instead of respawning.
    currentVersion.installed = '1.1.0';
    process.env[DAEMON_UPGRADE_ENV] = '1.1.0';
    const stop = scheduleDaemonSelfUpgrade('/tmp/project/.kandown');
    vi.advanceTimersByTime(60 * 60_000);
    stop();
    expect(spawned.calls).toHaveLength(0);
  });

  it('still restarts when a newer version lands after a failed attempt', () => {
    process.env[DAEMON_UPGRADE_ENV] = '1.1.0';
    currentVersion.installed = '1.2.0';
    runWatcher()();
    expect(spawned.calls).toHaveLength(1);
    expect(spawned.calls[0].env[DAEMON_UPGRADE_ENV]).toBe('1.2.0');
  });

  it('stops checking once the returned disposer is called', () => {
    const stop = runWatcher();
    stop();
    currentVersion.installed = '9.0.0';
    vi.advanceTimersByTime(60 * 60_000);
    expect(spawned.calls).toHaveLength(0);
  });
});
