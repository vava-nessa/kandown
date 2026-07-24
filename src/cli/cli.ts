/**
 * @file Main Kandown CLI Entrypoint
 * @description Entrypoint for the kandown command line tool. Dispatches verbs,
 * runs auto-update checks, manages daemon processes, and spawns the Ink TUI & browser.
 */

import { existsSync, readFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { getCurrentVersion, checkForUpdate, performGlobalPackageUpdate, semverGt, PKG_ROOT } from './lib/updater';
import { archiveTaskInBoard, getTasksDir, readBoard, readTask, readAgentDoc, moveTaskToColumn, listTaskIds } from './lib/board-reader';
import { getDaemonStatus, startProjectDaemon, stopProjectDaemon } from './lib/daemon';
import { listenOnAvailablePort } from './lib/server';
import { atomicWriteFileSync } from './lib/atomic-write';
import { doInit } from './lib/init';
import { loadConfig } from './lib/config';
import { startMcpServer } from './lib/mcp';
import { openBrowser } from './lib/browser';
import { parseTaskFile } from '../lib/parser';
import { serializeTaskFile } from '../lib/serializer';
import type { TaskFrontmatter } from '../lib/types';

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
function info(msg: string) { console.error(`${c.blue}ℹ${c.reset}  ${msg}`); }
function success(msg: string) { console.error(`${c.green}✓${c.reset}  ${msg}`); }
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

const COMMANDS = new Set([
  'init', 'update', 'upgrade', 'doctor', 'work', 'list', 'ls', 'show', 'move',
  'help', 'daemon', 'board', 'settings', 'tasks', 'create', 'new', 'assign',
  'commit', 'projects', 'export', 'import', 'mcp', 'version',
]);

function splitCommand(args: string[]): { cmd: string | undefined; rest: string[] } {
  const withoutGlobalFlags = args.filter(arg => arg !== '--no-update-check');
  const commandIndex = withoutGlobalFlags.findIndex((arg, index) => {
    if (arg.startsWith('-')) return false;
    if (COMMANDS.has(arg)) return true;
    return index === 0;
  });

  if (commandIndex === -1) {
    return { cmd: undefined, rest: withoutGlobalFlags };
  }

  return {
    cmd: withoutGlobalFlags[commandIndex],
    rest: [...withoutGlobalFlags.slice(0, commandIndex), ...withoutGlobalFlags.slice(commandIndex + 1)],
  };
}

function stripFirstPositional(args: string[], value: string): string[] {
  const result: string[] = [];
  let stripped = false;
  for (const arg of args) {
    if (!stripped && arg === value) {
      stripped = true;
      continue;
    }
    result.push(arg);
  }
  return result;
}

function resolveKandownDir(pathArg = '.kandown', cwd = process.cwd()): string {
  // 1. cwd itself is already a .kandown dir or contains its config directly
  if (basename(cwd) === '.kandown' || existsSync(join(cwd, 'kandown.json'))) {
    return cwd;
  }
  // 2. Explicit --path was given
  if (pathArg !== '.kandown') {
    return resolve(cwd, pathArg);
  }
  // 3. Recurse into sub-directories to find the first .kandown/ or ./tasks
  let entries: string[];
  try {
    entries = readdirSync(cwd);
  } catch {
    return resolve(cwd, pathArg);
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'tasks') continue;
    const subPath = join(cwd, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(subPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const found = resolveKandownDir(pathArg, subPath);
    if (existsSync(found)) return found;
  }
  return resolve(cwd, pathArg);
}

function ensureKandownDir(rawArgs: string[]): { kandownDir: string; cwd: string } {
  const args = parseArgs(rawArgs);
  const cwd = process.cwd();
  const kandownDir = resolveKandownDir(args.path, cwd);

  if (!existsSync(kandownDir)) {
    info(`No .kandown/ found — auto-initializing ${c.bold}${kandownDir}${c.reset}`);
    if (!doInit(kandownDir)) {
      err(`Could not auto-initialize Kandown at ${c.bold}${kandownDir}${c.reset}`);
      process.exit(1);
    }
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
  (none)              Start web server, open browser & launch TUI
  init                Initialize Kandown in this project
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
  --no-update-check   Skip the registry update check for this run
  --version           Print CLI version
  --help, -h          Show help screen
`);
}

/* ═════════════ Command Handlers ═════════════ */

function cmdInit(rawArgs: string[]) {
  const args = parseArgs(rawArgs);
  const kandownDir = resolve(process.cwd(), args.path);
  const created = doInit(kandownDir);
  if (!created) {
    err('Failed to initialize Kandown.');
    process.exit(1);
  }
  success(`Kandown initialized at ${kandownDir}`);
}

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
    const htmlSrc = resolve(PKG_ROOT, 'dist', 'index.html');
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

interface TaskCliArgs {
  flags: Record<string, string | boolean | string[]>;
  positional: string[];
}

function addMultiFlag(flags: Record<string, string | boolean | string[]>, key: string, value: string): void {
  const current = flags[key];
  if (Array.isArray(current)) current.push(value);
  else if (typeof current === 'string') flags[key] = [current, value];
  else flags[key] = value;
}

function taskParseArgs(argv: string[]): TaskCliArgs {
  const flags: Record<string, string | boolean | string[]> = {};
  const positional: string[] = [];
  const aliases: Record<string, string> = { s: 'status', p: 'priority', a: 'assignee', t: 'tag', m: 'message' };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
      const key = rawKey === 'to' ? 'to' : rawKey;
      const next = inlineValue ?? argv[i + 1];
      if (inlineValue === undefined && next && !next.startsWith('-')) i++;
      const value = inlineValue ?? (next && !next.startsWith('-') ? next : true);
      if (key === 'tag') addMultiFlag(flags, key, String(value));
      else flags[key] = value;
      continue;
    }
    if (/^-[spatm]$/.test(arg)) {
      const key = aliases[arg.slice(1)];
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) {
        flags[key] = true;
      } else {
        i++;
        if (key === 'tag') addMultiFlag(flags, key, value);
        else flags[key] = value;
      }
      continue;
    }
    positional.push(arg);
  }

  return { flags, positional };
}

function stringFlag(flags: Record<string, string | boolean | string[]>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = flags[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function listFlag(flags: Record<string, string | boolean | string[]>, key: string): string[] {
  const value = flags[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  return [];
}

function resolveStatusArg(kandownDir: string, status: string): string | null {
  const config = loadConfig(kandownDir);
  return config.board.columns.find(col => col.toLowerCase() === status.toLowerCase()) ?? null;
}

function taskPath(kandownDir: string, id: string, archived = false): string {
  return archived ? join(getTasksDir(kandownDir), 'archive', `${id}.md`) : join(getTasksDir(kandownDir), `${id}.md`);
}

function findTaskPath(kandownDir: string, id: string): string | null {
  const active = taskPath(kandownDir, id);
  if (existsSync(active)) return active;
  const archived = taskPath(kandownDir, id, true);
  if (existsSync(archived)) return archived;
  return null;
}

function nextTaskId(kandownDir: string): string {
  const ids = new Set(listTaskIds(kandownDir));
  const archiveDir = join(getTasksDir(kandownDir), 'archive');
  if (existsSync(archiveDir)) {
    for (const file of readdirSync(archiveDir)) {
      if (file.endsWith('.md')) ids.add(file.slice(0, -3));
    }
  }
  let max = 0;
  for (const id of ids) {
    const match = id.match(/^t(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `t${max + 1}`;
}

function readTaskFile(kandownDir: string, id: string): { path: string; frontmatter: TaskFrontmatter; body: string; archived: boolean } | null {
  const path = findTaskPath(kandownDir, id);
  if (!path) return null;
  const parsed = parseTaskFile(readFileSync(path, 'utf8'));
  return {
    path,
    frontmatter: { ...parsed.frontmatter, id: parsed.frontmatter.id || id },
    body: parsed.body,
    archived: path.includes('/archive/'),
  };
}

function cmdList(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const includeArchived = args.flags.archived === true;
  const statusFilter = stringFlag(args.flags, 'status')?.toLowerCase() ?? null;
  const priorityFilter = stringFlag(args.flags, 'priority')?.toUpperCase() ?? null;
  const assigneeFilter = stringFlag(args.flags, 'assignee');
  const tagFilters = listFlag(args.flags, 'tag').map(tag => tag.toLowerCase());

  const rows: Array<{ id: string; title: string; status: string; priority: string; assignee: string; tags: string[]; archived: boolean }> = [];
  for (const id of listTaskIds(kandownDir)) {
    const task = readTask(kandownDir, id);
    rows.push({
      id,
      title: task.frontmatter.title || id,
      status: task.frontmatter.status || 'Backlog',
      priority: task.frontmatter.priority || '',
      assignee: task.frontmatter.assignee || '',
      tags: Array.isArray(task.frontmatter.tags) ? task.frontmatter.tags : [],
      archived: false,
    });
  }

  if (includeArchived) {
    const archiveDir = join(getTasksDir(kandownDir), 'archive');
    if (existsSync(archiveDir)) {
      for (const file of readdirSync(archiveDir).filter(name => name.endsWith('.md'))) {
        const id = file.slice(0, -3);
        const parsed = parseTaskFile(readFileSync(join(archiveDir, file), 'utf8'));
        rows.push({
          id,
          title: parsed.frontmatter.title || id,
          status: `${parsed.frontmatter.status || 'Backlog'} (archived)`,
          priority: parsed.frontmatter.priority || '',
          assignee: parsed.frontmatter.assignee || '',
          tags: Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [],
          archived: true,
        });
      }
    }
  }

  const filtered = rows.filter(row => {
    if (statusFilter && row.status.toLowerCase() !== statusFilter) return false;
    if (priorityFilter && row.priority.toUpperCase() !== priorityFilter) return false;
    if (assigneeFilter && row.assignee !== assigneeFilter) return false;
    if (tagFilters.length > 0 && !tagFilters.every(tag => row.tags.map(t => t.toLowerCase()).includes(tag))) return false;
    return true;
  });

  if (args.flags.json === true) {
    process.stdout.write(JSON.stringify(filtered, null, 2) + '\n');
    return;
  }

  const byStatus = new Map<string, typeof filtered>();
  for (const row of filtered) {
    const list = byStatus.get(row.status) ?? [];
    list.push(row);
    byStatus.set(row.status, list);
  }
  for (const [status, tasks] of byStatus) {
    log(`\n${c.bold}${status}${c.reset} (${tasks.length})`);
    for (const task of tasks) {
      const pri = task.priority || 'P2';
      const assignee = task.assignee ? ` @${task.assignee}` : '';
      log(`  ${c.cyan}${task.id}${c.reset} [${pri}] ${task.title}${assignee}`);
    }
  }
  log('');
}

function cmdShow(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const id = args.positional[0];
  if (!id) {
    err('Usage: kandown show <task-id>');
    process.exit(1);
  }
  const path = findTaskPath(kandownDir, id);
  if (!path) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  process.stdout.write(readFileSync(path, 'utf8'));
}

function cmdCreate(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const title = args.positional.join(' ').trim();
  if (!title) {
    err('Usage: kandown create "title" [-p P1] [-a user] [-t tag] [--to status] [--id custom-id] [--json]');
    process.exit(1);
  }

  const id = stringFlag(args.flags, 'id') ?? nextTaskId(kandownDir);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    err(`Invalid task id: ${id}`);
    process.exit(1);
  }
  if (findTaskPath(kandownDir, id)) {
    err(`Task already exists: ${id}`);
    process.exit(1);
  }

  const config = loadConfig(kandownDir);
  const rawStatus = stringFlag(args.flags, 'to', 'status');
  const status = rawStatus ? resolveStatusArg(kandownDir, rawStatus) : config.board.columns[0] || 'Backlog';
  if (!status) {
    err(`Unknown status: ${rawStatus}`);
    process.exit(1);
  }

  const fm: TaskFrontmatter = {
    id,
    title,
    status,
    created: new Date().toISOString().slice(0, 10),
  };
  const priority = stringFlag(args.flags, 'priority')?.toUpperCase();
  const assignee = stringFlag(args.flags, 'assignee');
  const tags = listFlag(args.flags, 'tag');
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;

  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  const path = taskPath(kandownDir, id);
  atomicWriteFileSync(path, serializeTaskFile(fm, ''));
  process.stderr.write(`${c.green}✓${c.reset} Created ${c.bold}${id}${c.reset} → ${status}\n`);
  process.stdout.write(args.flags.json === true ? JSON.stringify(fm, null, 2) + '\n' : `${id}\n`);
}

function cmdMove(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const id = args.positional[0];
  const rawStatus = args.positional.slice(1).join(' ') || stringFlag(args.flags, 'to', 'status');
  if (!id || !rawStatus) {
    err('Usage: kandown move <task-id> <status>');
    process.exit(1);
  }

  if (rawStatus.toLowerCase() === 'archived') {
    if (!archiveTaskInBoard(kandownDir, id)) {
      err(`Archive failed: ${id}`);
      process.exit(1);
    }
    success(`Archived ${id}`);
    return;
  }

  const status = resolveStatusArg(kandownDir, rawStatus);
  if (!status) {
    err(`Unknown status: ${rawStatus}`);
    process.exit(1);
  }
  if (!moveTaskToColumn(kandownDir, id, status)) {
    err(`Move failed: ${id}`);
    process.exit(1);
  }
  success(`Moved ${id} → "${status}"`);
}

function cmdAssign(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const [id, assignee] = args.positional;
  if (!id) {
    err('Usage: kandown assign <task-id> [assignee]');
    process.exit(1);
  }
  const task = readTaskFile(kandownDir, id);
  if (!task) {
    err(`Task not found: ${id}`);
    process.exit(1);
  }
  const frontmatter: TaskFrontmatter = { ...task.frontmatter, id };
  if (assignee) frontmatter.assignee = assignee;
  else delete frontmatter.assignee;
  atomicWriteFileSync(task.path, serializeTaskFile(frontmatter, task.body));
  success(assignee ? `Assigned ${id} → ${assignee}` : `Unassigned ${id}`);
}

function cmdCommit(rawArgs: string[]) {
  ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const message = stringFlag(args.flags, 'message') || 'tasks: update kandown board';
  const add = spawnSync('git', ['add', 'tasks', '.kandown/kandown.json'], { stdio: 'inherit' });
  if (add.status !== 0) process.exit(add.status ?? 1);
  const commit = spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' });
  process.exit(commit.status ?? 1);
}

function printTaskCommandsHelp() {
  log(`
${c.bold}Kandown task commands${c.reset}

  kandown list [-s status] [-p P1] [-a user] [-t tag] [--archived] [--json]
  kandown show <id>
  kandown create "title" [-p P1] [-a user] [-t tag] [--to status] [--id id] [--json]
  kandown move <id> <status|archived>
  kandown assign <id> [user]
  kandown commit [-m "message"]
`);
}

async function launchTui(screen: 'board' | 'settings', kandownDir: string): Promise<void> {
  if (!process.stdin.isTTY) {
    info(`TUI skipped because stdin is not interactive. Use ${c.cyan}kandown daemon status${c.reset} to inspect the web daemon.`);
    return;
  }
  const tuiPath = join(PKG_ROOT, 'bin', 'tui.js');
  if (!existsSync(tuiPath)) {
    err(`TUI binary not found at ${tuiPath}`);
    process.exit(1);
  }
  await new Promise<void>((resolveTui) => {
    const child = spawn(process.execPath, [tuiPath, screen, kandownDir, getCurrentVersion()], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (typeof code === 'number' && code !== 0) process.exit(code);
      resolveTui();
    });
  });
}

async function cmdTui(screen: 'board' | 'settings', rawArgs: string[]): Promise<void> {
  const args = parseArgs(rawArgs);
  const kandownDir = resolveKandownDir(args.path, process.cwd());
  await launchTui(screen, kandownDir);
}

function cmdExport(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const board = readBoard(kandownDir);
  process.stdout.write(JSON.stringify(board, null, 2) + '\n');
}

function cmdProjects(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const metadataPath = join(kandownDir, 'daemon.json');
  if (!existsSync(metadataPath)) {
    info('No daemon metadata for this project.');
    return;
  }
  process.stdout.write(readFileSync(metadataPath, 'utf8').trim() + '\n');
}

function cmdImport(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const file = args.positional[0];
  if (!file) {
    err('Usage: kandown import <file.json> [--overwrite]');
    process.exit(1);
  }
  const importPath = resolve(process.cwd(), file);
  if (!existsSync(importPath)) {
    err(`Import file not found: ${file}`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(importPath, 'utf8'));
  } catch (error) {
    err(`Import file must be JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const rows: Array<Record<string, unknown>> = [];
  if (Array.isArray(raw)) {
    rows.push(...raw.filter(value => typeof value === 'object' && value !== null) as Array<Record<string, unknown>>);
  } else if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { columns?: unknown }).columns)) {
    for (const column of (raw as { columns: unknown[] }).columns) {
      if (typeof column !== 'object' || column === null) continue;
      const col = column as { name?: unknown; tasks?: unknown };
      if (!Array.isArray(col.tasks)) continue;
      for (const task of col.tasks) {
        if (typeof task === 'object' && task !== null) rows.push({ ...(task as Record<string, unknown>), status: String(col.name || 'Backlog') });
      }
    }
  }

  if (rows.length === 0) {
    err('No tasks found to import. Expected a list JSON array or kandown export object.');
    process.exit(1);
  }

  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  let imported = 0;
  for (const row of rows) {
    const id = typeof row.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(row.id) ? row.id : nextTaskId(kandownDir);
    const path = taskPath(kandownDir, id);
    if (existsSync(path) && args.flags.overwrite !== true) continue;
    const fm: TaskFrontmatter = {
      id,
      title: typeof row.title === 'string' && row.title ? row.title : id,
      status: typeof row.status === 'string' && row.status ? row.status.replace(/ \(archived\)$/i, '') : 'Backlog',
    };
    if (typeof row.priority === 'string') fm.priority = row.priority;
    if (typeof row.assignee === 'string') fm.assignee = row.assignee;
    if (Array.isArray(row.tags)) fm.tags = row.tags.map(String);
    atomicWriteFileSync(path, serializeTaskFile(fm, typeof row.body === 'string' ? row.body : ''));
    imported++;
  }
  success(`Imported ${imported} task${imported === 1 ? '' : 's'}`);
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 1 && (rawArgs[0] === '--version' || rawArgs[0] === 'version')) {
    log(getCurrentVersion());
    return;
  }

  const { cmd, rest } = splitCommand(rawArgs);

  const skipUpdate = rawArgs.includes('--no-update-check') || process.env.KANDOWN_NO_UPDATE === '1';

  if (!skipUpdate) {
    await checkForUpdate(process.argv);
  }

  switch (cmd) {
    case 'init':
      cmdInit(rest);
      break;

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

    case 'board':
      await cmdTui('board', rest);
      break;

    case 'settings':
      await cmdTui('settings', rest);
      break;

    case 'list':
    case 'ls':
      cmdList(rest);
      break;

    case 'show':
      cmdShow(rest);
      break;

    case 'create':
    case 'new':
      cmdCreate(rest);
      break;

    case 'move':
      cmdMove(rest);
      break;

    case 'assign':
      cmdAssign(rest);
      break;

    case 'commit':
      cmdCommit(rest);
      break;

    case 'tasks':
      printTaskCommandsHelp();
      break;

    case 'projects':
      cmdProjects(rest);
      break;

    case 'export':
      cmdExport(rest);
      break;

    case 'import':
      cmdImport(rest);
      break;

    case 'mcp': {
      const { kandownDir } = ensureKandownDir(rest);
      startMcpServer(kandownDir);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      help();
      break;

    case 'daemon': {
      const parsedDaemonArgs = parseArgs(rest);
      const subcommand = parsedDaemonArgs.positional[0] || 'status';
      const daemonArgs = subcommand ? stripFirstPositional(rest, subcommand) : rest;
      const { kandownDir } = ensureKandownDir(daemonArgs);
      if (subcommand === 'run') {
        const daemonOptions = parseArgs(daemonArgs);
        const preferredPort = typeof daemonOptions.flags.port === 'string' ? Number(daemonOptions.flags.port) : null;
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
          token: null,
        }, null, 2));
        info(`Kandown daemon running on port ${port} (PID ${process.pid})`);
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
      break;
    }

    case undefined: {
      const parsed = parseArgs(rest);
      const kandownDir = resolveKandownDir(parsed.path, process.cwd());

      // 📖 Only start the daemon & open the browser if the project already
      // exists. If it doesn't, the TUI shows a confirmation prompt first —
      // it starts the daemon and opens the browser itself once created.
      if (existsSync(kandownDir)) {
        let status = await getDaemonStatus(kandownDir);
        if (!status.running) {
          status = await startProjectDaemon(kandownDir);
        }
        if (!parsed.flags['no-open']) {
          const urlToOpen = status.metadata?.url || join(kandownDir, 'kandown.html');
          openBrowser(urlToOpen);
        }
      } else if (!process.stdin.isTTY) {
        err(`No kandown project found at ${c.bold}${kandownDir}${c.reset} — run ${c.cyan}kandown init${c.reset} first.`);
        process.exit(1);
      }

      await launchTui('board', kandownDir);
      break;
    }

    default:
      if (!cmd || cmd.startsWith('-')) {
        help();
        break;
      }
      err(`Unknown command: ${cmd}`);
      help();
      process.exit(1);
  }
}

void main();
