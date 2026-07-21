/**
 * @file CLI Auto-updater & Versioning Module
 * @description Manages npm registry version checks, global package updates,
 * PATH binary resolution, and update throttling.
 *
 * @functions
 *  → getCurrentVersion — returns the compiled KANDOWN_VERSION
 *  → semverGt — semver version comparison helper
 *  → resolveKandownBin — resolves installed global kandown binary path
 *  → readInstalledKandownVersion — queries version of installed binary
 *  → performGlobalPackageUpdate — installs package globally via npm/pnpm/yarn/bun
 *  → checkForUpdate — background updater with reliable registry checks
 *
 * @exports getCurrentVersion, semverGt, resolveKandownBin, readInstalledKandownVersion,
 *          performGlobalPackageUpdate, checkForUpdate
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { KANDOWN_VERSION } from '../../lib/version';

const CACHE_DIR = join(homedir(), '.kandown');
const UPDATE_CHECK_CACHE = join(CACHE_DIR, '.update-check.json');
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes throttle

export function getCurrentVersion(): string {
  if (KANDOWN_VERSION && (KANDOWN_VERSION as string) !== '0.0.0-dev') {
    return KANDOWN_VERSION;
  }

  try {
    const pkgPath = resolve(import.meta.url ? new URL('../../..', import.meta.url).pathname : process.cwd(), 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch { /* ignore */ }
  return KANDOWN_VERSION || '0.32.1';
}

/**
 * 📖 Compares two semver strings (major.minor.patch, optional -prerelease).
 * @returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function semverGt(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, ...pre] = String(v).replace(/^v/, '').split('-');
    return { nums: core.split('.').map(n => Number(n) || 0), pre: pre.length > 0 };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa.nums[i] || 0) > (pb.nums[i] || 0)) return 1;
    if ((pa.nums[i] || 0) < (pb.nums[i] || 0)) return -1;
  }
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && !pb.pre) return -1;
  return 0;
}

/**
 * 📖 Resolves the kandown binary path for respawning after an update.
 */
export function resolveKandownBin(): string | null {
  try {
    const whichBin = String(execSync('which kandown 2>/dev/null || command -v kandown 2>/dev/null', {
      timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })).trim();
    if (whichBin && existsSync(whichBin)) return whichBin;
  } catch { /* ignore */ }
  const localBin = join(homedir(), '.local', 'bin', 'kandown');
  if (existsSync(localBin)) return localBin;
  try {
    const npmBin = String(execSync('npm config get prefix 2>/dev/null', {
      timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })).trim();
    if (existsSync(join(npmBin, 'bin', 'kandown'))) return join(npmBin, 'bin', 'kandown');
    if (existsSync(join(npmBin, 'kandown'))) return join(npmBin, 'kandown');
  } catch { /* ignore */ }
  try {
    const pnpmBin = String(execSync('pnpm config get prefix 2>/dev/null', {
      timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    })).trim();
    if (existsSync(join(pnpmBin, 'bin', 'kandown'))) return join(pnpmBin, 'bin', 'kandown');
    if (existsSync(join(pnpmBin, 'kandown'))) return join(pnpmBin, 'kandown');
  } catch { /* ignore */ }
  return null;
}

export async function readInstalledKandownVersion(targetVersion: string): Promise<string> {
  const localVersion = getCurrentVersion();
  const bin = resolveKandownBin();
  if (!bin) return localVersion;

  return await new Promise((resolveVersion) => {
    const child = spawn(bin, ['--version'], {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, KANDOWN_NO_UPDATE: '1' },
      detached: false,
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => {});
    child.on('error', () => resolveVersion(localVersion));
    child.on('close', (code) => {
      if (code !== 0) return resolveVersion(localVersion);
      const match = stdout.trim().match(/v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)/);
      resolveVersion(match ? match[1] : localVersion);
    });
  });
}

export function updateCheckedRecently(): boolean {
  try {
    if (!existsSync(UPDATE_CHECK_CACHE)) return false;
    const raw = JSON.parse(readFileSync(UPDATE_CHECK_CACHE, 'utf8'));
    return Number.isFinite(raw?.lastCheck) && Date.now() - raw.lastCheck < UPDATE_CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

export function rememberUpdateCheck(): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(UPDATE_CHECK_CACHE, JSON.stringify({ lastCheck: Date.now(), version: getCurrentVersion() }), 'utf8');
  } catch { /* ignore write errors */ }
}

export async function performGlobalPackageUpdate(packageSpec: string): Promise<boolean> {
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith('npm_config_') || k.startsWith('npm_') || k === 'INIT_CWD') {
      delete cleanEnv[k];
    }
  }

  const tryPkgCmd = (cmd: string, args: string[]): Promise<boolean> => {
    return new Promise((res) => {
      const child = spawn(cmd, args, {
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: cleanEnv,
        detached: false,
      });
      child.stderr.on('data', () => {});
      child.stdout.on('data', () => {});
      child.on('error', () => res(false));
      child.on('close', (code) => res(code === 0));
    });
  };

  const currentBin = resolveKandownBin() || '';
  const isPnpmInstall = currentBin.includes('pnpm');

  if (isPnpmInstall) {
    if (await tryPkgCmd('pnpm', ['add', '-g', packageSpec])) return true;
    if (await tryPkgCmd('npm', ['install', '-g', packageSpec, '--force'])) return true;
  } else {
    if (await tryPkgCmd('npm', ['install', '-g', packageSpec, '--force'])) return true;
    if (await tryPkgCmd('pnpm', ['add', '-g', packageSpec])) return true;
  }

  if (await tryPkgCmd('yarn', ['global', 'add', packageSpec])) return true;
  return await tryPkgCmd('bun', ['add', '-g', packageSpec]);
}

export async function checkForUpdate(argv = process.argv): Promise<void> {
  if (process.env.KANDOWN_NO_UPDATE === '1') return;
  if (updateCheckedRecently() && !process.env.KANDOWN_FORCE_UPDATE) return;

  const current = getCurrentVersion();
  if (!current) return;

  const lockFile = join(CACHE_DIR, '.update.lock');
  const now = Date.now();
  try {
    if (existsSync(lockFile)) {
      const lockAge = now - statSync(lockFile).mtimeMs;
      if (lockAge < 60_000) return;
      unlinkSync(lockFile);
    }
  } catch { /* ignore lock errors */ }

  const latest = await new Promise<string | null>((resolve) => {
    const child = spawn('npm', ['view', 'kandown', 'version'], {
      timeout: 6000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: false,
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => {});
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const v = stdout.trim().replace(/^"|"$/g, '');
      resolve(v || null);
    });
  });

  if (!latest) return;

  if (semverGt(latest, current) <= 0) {
    rememberUpdateCheck();
    return;
  }

  console.log(`\x1b[36m⚡ Update available:\x1b[0m kandown \x1b[2mv${current}\x1b[0m → \x1b[32mv${latest}\x1b[0m`);
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(lockFile, `${process.pid}\n${now}`, 'utf8');
  } catch { /* ignore */ }

  console.log(`\x1b[32mInstalling kandown@${latest} globally…\x1b[0m`);
  const updateOk = await performGlobalPackageUpdate(`kandown@${latest}`);
  try { if (existsSync(lockFile)) unlinkSync(lockFile); } catch { /* ignore */ }

  if (!updateOk) {
    console.log(`\x1b[33m✗ Auto-update failed\x1b[0m — continuing with current version`);
    return;
  }

  rememberUpdateCheck();
  console.log(`\x1b[32m✓ Successfully updated kandown to v${latest}!\x1b[0m — restarting…`);

  const bin = resolveKandownBin();
  const childArgs = ['--no-update-check', ...argv.slice(2)];

  const child = spawn(bin || process.argv[0], bin ? childArgs : [process.argv[1], ...childArgs], {
    detached: true,
    stdio: 'inherit',
    env: { ...process.env },
  });
  child.unref();
  process.exit(0);
}
