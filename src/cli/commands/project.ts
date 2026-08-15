/**
 * @file CLI commands — project lifecycle
 * @description Handlers for `kandown init`, `update`/`upgrade`, `doctor`,
 * and `work`. These act on the project as a whole rather than individual
 * task files.
 *
 * @exports cmdInit, cmdUpdate, cmdDoctor, cmdWork
 */

import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { getCurrentVersion, performGlobalPackageUpdate, semverGt, PKG_ROOT } from '../lib/updater';
import { listTaskIds } from '../lib/board-reader';
import { compileProjectKandownWork } from '../lib/kandown-work';
import { getDaemonStatus } from '../lib/daemon';
import { doInit } from '../lib/init';
import { detectHomeWorkspace } from '../lib/home-workspace';
import { c, log, info, success, err, parseArgs, ensureKandownDir } from '../lib/cli-shared';

export function cmdInit(rawArgs: string[]) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolve(process.cwd(), args.path);
  const created = doInit(kandownDir);
  if (!created) {
    err('Failed to initialize Kandown.');
    process.exit(1);
  }
  success(`Kandown initialized at ${kandownDir}`);
}

export async function cmdUpdate(rawArgs: string[]) {
  const current = getCurrentVersion();
  log(`${c.bold}kandown update${c.reset} ${c.dim}— v${current}${c.reset}`);

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

  if (latest && semverGt(latest, current) > 0) {
    info(`Updating kandown package v${current} → v${latest}…`);
    const updateOk = await performGlobalPackageUpdate(`kandown@${latest}`);
    if (updateOk) {
      success(`Successfully upgraded kandown to v${latest}`);
    } else {
      err(`Global CLI update failed — try: pnpm add -g kandown@latest or npm install -g kandown@latest`);
    }
  } else {
    info(`kandown CLI is already up to date (v${current}).`);
  }

  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolve(cwd, args.path);
  const htmlDest = join(kandownDir, 'kandown.html');

  if (existsSync(htmlDest)) {
    const htmlSrc = resolve(PKG_ROOT, 'dist', 'index.html');
    if (existsSync(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
      success(`Refreshed ${args.path}/kandown.html`);
    }
  }
}

export async function cmdDoctor(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const currentVersion = getCurrentVersion();
  log(`${c.bold}kandown doctor${c.reset} ${c.dim}— environment & board diagnostic${c.reset}\n`);
  log(`  CLI Version: ${currentVersion}`);

  const configPath = join(kandownDir, 'kandown.json');
  if (existsSync(configPath)) {
    try {
      JSON.parse(readFileSync(configPath, 'utf8'));
      success('kandown.json valid');
    } catch (e: any) {
      err(`kandown.json invalid: ${e.message}`);
    }
  } else {
    err('Missing kandown.json');
  }

  const daemonStatus = await getDaemonStatus(kandownDir);
  if (daemonStatus.running && daemonStatus.metadata) {
    success(`Daemon running on port ${daemonStatus.metadata.port} (PID ${daemonStatus.metadata.pid})`);
  } else {
    info('Daemon not running');
  }

  const taskIds = listTaskIds(kandownDir);
  success(`Tasks: ${taskIds.length} active task files`);

  reportHomeWorkspace();

  log(`\n${c.green}✓ Everything looks good!${c.reset}\n`);
}

/**
 * 📖 Prints an advisory warning when a pnpm workspace is accidentally
 * rooted at the user's home directory (see `detectHomeWorkspace`).
 *
 * This is a warning, not a failure: `cmdDoctor` still exits 0. The symptom
 * (frozen `pnpm dev`, wrong install store) is severe enough to deserve
 * `err`-level visibility, but the board itself is fine.
 */
export function reportHomeWorkspace(home: string = homedir()): void {
  const markers = detectHomeWorkspace(home);
  if (markers.length === 0) return;

  log(`\n${c.yellow}⚠ pnpm workspace detected in your home directory${c.reset}`);
  info(`Found ${markers.map((m) => join('~', m.slice(home.length + 1))).join(', ')} at ${home}`);
  err('This makes pnpm treat ~/ as the workspace root for every project below it — `pnpm dev` can hang and installs may target the wrong store.');
  info('Fix: remove these files/folders from your home (back them up first), or declare a pnpm-workspace.yaml inside each project.');
}

export async function cmdWork(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const taskId = parseArgs(rawArgs).positional[0];
  const compiled = compileProjectKandownWork(kandownDir, taskId);
  for (const diagnostic of compiled.diagnostics) console.error(`[kandown] ${diagnostic.severity}: ${diagnostic.message}`);
  console.error(`[kandown] ~${compiled.stats.estimatedTokens.toLocaleString('en-US')} tokens (${compiled.stats.words.toLocaleString('en-US')} words, estimate varies by model).`);
  process.stdout.write(compiled.markdown);
}
