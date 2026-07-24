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
import { spawn } from 'node:child_process';
import { getCurrentVersion, performGlobalPackageUpdate, semverGt, PKG_ROOT } from '../lib/updater';
import { readAgentDoc, readBoard, listTaskIds } from '../lib/board-reader';
import { getDaemonStatus } from '../lib/daemon';
import { doInit } from '../lib/init';
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
  log(`\n${c.green}✓ Everything looks good!${c.reset}\n`);
}

export async function cmdWork(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const doc = readAgentDoc(kandownDir);
  const board = readBoard(kandownDir);

  log(doc);
  log('\n---\n');
  log(`## Current Board Digest\n`);
  const allTasksCount = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
  log(`Tasks total: ${allTasksCount}`);
  for (const col of board.columns) {
    log(`- **${col.name}** (${col.tasks.length}): ${col.tasks.map(t => `${t.id} ${t.title}`).join(', ') || 'empty'}`);
  }
}
