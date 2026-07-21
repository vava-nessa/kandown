/**
 * @file Main Kandown CLI Entrypoint
 * @description Entrypoint for the kandown command line tool. Dispatches verbs,
 * runs auto-update checks, manages daemon processes, and spawns the Ink TUI.
 */

import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { getCurrentVersion, checkForUpdate, performGlobalPackageUpdate, semverGt } from './lib/updater';
import { readBoard, readTask, readAgentDoc, moveTaskToColumn, listTaskIds } from './lib/board-reader';
import { getDaemonStatus, startProjectDaemon } from './lib/daemon';
import { listenOnAvailablePort } from './lib/server';
import { atomicWriteFileSync } from './lib/atomic-write';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg: string) { console.log(msg); }
function info(msg: string) { console.log(`${c.blue}ℹ${c.reset}  ${msg}`); }
function success(msg: string) { console.log(`${c.green}✓${c.reset}  ${msg}`); }
function err(msg: string) { console.error(`${c.red}✗${c.reset}  ${msg}`); }

function parseArgs(args: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith('-')) {
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional, path: typeof flags.path === 'string' ? flags.path : '.kandown' };
}

function resolveKandownDir(pathArg = '.kandown', cwd = process.cwd()): string {
  if (basename(cwd) === '.kandown' || existsSync(join(cwd, 'kandown.json'))) {
    return cwd;
  }
  return resolve(cwd, pathArg);
}

function ensureKandownDir(rawArgs: string[]): { kandownDir: string; cwd: string } {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolveKandownDir(args.path, cwd);

  if (!existsSync(kandownDir)) {
    err(`No Kandown installation found at ${c.bold}${kandownDir}${c.reset}`);
    log(`  Run ${c.cyan}npx kandown init${c.reset} to create one.`);
    process.exit(1);
  }
  return { kandownDir, cwd };
}

function help() {
  const current = getCurrentVersion();
  log(`
${c.bold}Kandown CLI${c.reset} v${current} — file-based Kanban backed by Markdown

${c.bold}USAGE:${c.reset}
  kandown [command] [options]

${c.bold}COMMANDS:${c.reset}
  (none)              Start web server & launch TUI
  work                Output agent rules + live board digest
  list                List tasks (alias: ls)
  show <id>           Display task details
  create "<title>"    Create new task (alias: new)
  move <id> <status>  Move task column
  assign <id> <user>  Assign task
  commit              Commit task changes to git
  update              Update kandown CLI to latest version (alias: upgrade)
  doctor              Run environment & board diagnostics
  daemon              Manage background daemon (status, start, stop, restart)
  projects            List open kandown projects
  export              Export board tasks to JSON
  import <file>       Import tasks from JSON/Markdown
  mcp                 Start Model Context Protocol (MCP) server
  help                Show help screen

${c.bold}OPTIONS:${c.reset}
  --path <dir>        Path to .kandown folder (default: .kandown)
  --port <number>     Server port (default: 2050)
  --no-open           Don't open browser automatically
  --help, -h          Show help screen
`);
}

/* ═════════════ Command Handlers ═════════════ */

async function cmdUpdate(rawArgs: string[]) {
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
    const htmlSrc = resolve(import.meta.url ? new URL('../..', import.meta.url).pathname : process.cwd(), 'dist', 'index.html');
    if (existsSync(htmlSrc)) {
      copyFileSync(htmlSrc, htmlDest);
      success(`Refreshed ${args.path}/kandown.html`);
    }
  }
}

async function cmdDoctor(rawArgs: string[]) {
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

async function cmdWork(rawArgs: string[]) {
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

function cmdList(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const board = readBoard(kandownDir);
  const { flags } = parseArgs(rawArgs);

  const statusFilter = typeof flags.status === 'string' ? flags.status.toLowerCase() : null;
  const priorityFilter = typeof flags.priority === 'string' ? flags.priority.toUpperCase() : null;

  for (const col of board.columns) {
    if (statusFilter && col.name.toLowerCase() !== statusFilter) continue;
    log(`\n${c.bold}${col.name}${c.reset} (${col.tasks.length})`);
    for (const t of col.tasks) {
      if (priorityFilter && t.priority !== priorityFilter) continue;
      log(`  ${c.cyan}${t.id}${c.reset} [${t.priority || 'P2'}] ${t.title}`);
    }
  }
  log('');
}

function cmdShow(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const id = rawArgs.find(a => !a.startsWith('-'));
  if (!id) {
    err('Usage: kandown show <task-id>');
    process.exit(1);
  }
  try {
    const task = readTask(kandownDir, id);
    log(`${c.bold}${task.frontmatter.id}: ${task.frontmatter.title}${c.reset}`);
    log(`Status: ${task.frontmatter.status} | Priority: ${task.frontmatter.priority || 'P2'} | Assignee: ${task.frontmatter.assignee || 'none'}\n`);
    log(task.body);
  } catch (e: any) {
    err(`Could not read task ${id}: ${e.message}`);
  }
}

function cmdMove(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const [id, newStatus] = rawArgs.filter(a => !a.startsWith('-'));
  if (!id || !newStatus) {
    err('Usage: kandown move <task-id> <status>');
    process.exit(1);
  }
  try {
    moveTaskToColumn(kandownDir, id, newStatus);
    success(`Moved ${id} → "${newStatus}"`);
  } catch (e: any) {
    err(`Move failed: ${e.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);

  const skipUpdate = args.includes('--no-update-check') || process.env.KANDOWN_NO_UPDATE === '1';

  if (!skipUpdate) {
    await checkForUpdate(process.argv);
  }


  switch (cmd) {
    case 'update':
    case 'upgrade':
      await cmdUpdate(rest);
      break;

    case 'doctor':
      await cmdDoctor(rest);
      break;

    case 'work':
      await cmdWork(rest);
      break;

    case 'list':
    case 'ls':
      cmdList(rest);
      break;

    case 'show':
      cmdShow(rest);
      break;

    case 'move':
      cmdMove(rest);
      break;

    case 'help':
    case '--help':
    case '-h':
      help();
      break;

    case 'daemon': {
      const subcommand = rest[0] || 'status';
      const { kandownDir } = ensureKandownDir(rest.slice(1));
      if (subcommand === 'run') {
        const { port } = await listenOnAvailablePort(kandownDir);
        const url = `http://localhost:${port}`;
        const metadataPath = join(kandownDir, 'daemon.json');
        atomicWriteFileSync(metadataPath, JSON.stringify({
          pid: process.pid,
          port,
          url,
          kandownDir,
          startedAt: new Date().toISOString(),
          version: getCurrentVersion(),
          token: null,
        }, null, 2));
        info(`Kandown daemon running on port ${port} (PID ${process.pid})`);
        // Keep process running
        await new Promise(() => {});
      } else if (subcommand === 'stop') {
        const status = await getDaemonStatus(kandownDir);
        if (status.running && status.metadata) {
          try { process.kill(status.metadata.pid, 'SIGTERM'); } catch { /* ignore */ }
          success(`Stopped daemon PID ${status.metadata.pid}`);
        } else {
          info('Daemon not running');
        }
      } else {
        const status = await getDaemonStatus(kandownDir);
        if (status.running && status.metadata) {
          success(`Daemon running on port ${status.metadata.port} (PID ${status.metadata.pid})`);
        } else {
          info('Daemon not running');
        }
      }
      break;
    }

    case undefined: {
      const { kandownDir } = ensureKandownDir(rest);
      const status = await getDaemonStatus(kandownDir);
      if (!status.running) {
        await startProjectDaemon(kandownDir);
      }
      // Spawns TUI
      const tuiPath = resolve(import.meta.url ? new URL('../..', import.meta.url).pathname : process.cwd(), 'bin', 'tui.js');
      if (existsSync(tuiPath)) {
        const child = spawn('node', [tuiPath, ...rest], { stdio: 'inherit' });
        child.on('close', (code) => process.exit(code || 0));
      } else {
        info('Kandown daemon running. Open kandown.html in browser.');
      }
      break;
    }


    default:
      if (cmd.startsWith('-')) {
        help();
        break;
      }
      err(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
  }
}

void main();
