/**
 * @file CLI shared utilities
 * @description Argument parsing, deterministic nearest-ancestor project
 * resolution, colored console output, and task-file path helpers shared across
 * every `cmdX` command handler and the TUI launcher in src/cli/cli.ts.
 *
 * @functions
 *  → parseArgs — generic `--flag value` / `-f` CLI arg parser
 *  → splitCommand, stripFirstPositional — pulls the verb out of argv
 *  → resolveKandownDir, ensureKandownDir — locates the nearest ancestor project/auto-inits it
 *  → taskParseArgs, stringFlag, listFlag, addMultiFlag — task-command arg parsing
 *  → resolveStatusArg — case-insensitive column name lookup
 *  → taskPath, findTaskPath, nextTaskId, readTaskFile — task file path/read helpers
 *  → newTaskPath — the path a task about to be created should be written to
 *  → launchTui — spawns bin/tui.js and waits for it to exit
 *
 * @exports c, log, info, success, err, parseArgs, COMMANDS, splitCommand,
 *   stripFirstPositional, resolveKandownDir, ensureKandownDir, help,
 *   TaskCliArgs, addMultiFlag, taskParseArgs, stringFlag, listFlag,
 *   resolveStatusArg, taskPath, findTaskPath, newTaskPath, nextTaskId, readTaskFile,
 *   printTaskCommandsHelp, launchTui
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { getCurrentVersion, PKG_ROOT } from './updater';
import {
  getTasksDir,
  listTaskIds,
  listTaskFilenames,
  newTaskFilePath,
  findTaskPath as resolveTaskPath,
} from './board-reader';
import { doInit } from './init';
import { loadConfig } from './config';
import { parseTaskFile } from '../../lib/parser';
import { taskIdFromFilename } from '../../lib/task-filename';
import type { TaskFrontmatter } from '../../lib/types';

export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

export function log(msg: string) { console.log(msg); }
export function info(msg: string) { console.error(`${c.blue}ℹ${c.reset}  ${msg}`); }
export function success(msg: string) { console.error(`${c.green}✓${c.reset}  ${msg}`); }
export function err(msg: string) { console.error(`${c.red}✗${c.reset}  ${msg}`); }

export function parseArgs(args: string[]) {
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

export const COMMANDS = new Set([
  'init', 'update', 'upgrade', 'doctor', 'work', 'list', 'ls', 'show', 'move',
  'help', 'daemon', 'board', 'settings', 'tasks', 'create', 'new', 'assign',
  'commit', 'projects', 'export', 'import', 'mcp', 'version', 'run', 'agents', 'reslug',
  'extension', 'extensions', 'theme', 'themes', 'workflow', 'workflows',
]);

export function splitCommand(args: string[]): { cmd: string | undefined; rest: string[] } {
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

export function stripFirstPositional(args: string[], value: string): string[] {
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

export function resolveKandownDir(pathArg = '.kandown', cwd = process.cwd()): string {
  if (pathArg !== '.kandown') {
    return resolve(cwd, pathArg);
  }

  // 📖 Resolve upward from the caller instead of scanning child directories.
  // A downward scan can select packaged starter assets such as
  // `templates/kandown.json` while completely skipping the hidden root
  // `.kandown/` directory. The nearest ancestor project is deterministic and
  // also lets commands run naturally from nested paths such as `src/`.
  //
  // 📖 The walk is bounded on purpose. It stops after checking the git
  // repository root (a kandown project belongs to its repo; crossing the
  // boundary would attach to a foreign project), and it never accepts
  // `$HOME` itself unless the walk STARTED there: `~/.kandown/` doubles as
  // the updater cache directory and may hold a personal home board, so
  // resolving it from a random subdirectory would silently hijack the bare
  // `kandown` init prompt. Without those bounds, the TUI "create project?"
  // confirmation would never appear anywhere under `$HOME`.
  const startDir = resolve(cwd);
  const homeDir = homedir();
  let currentDir = startDir;
  while (true) {
    // 📖 $HOME is only a valid project root when the user is standing in it.
    const isHomeBoundary = currentDir === homeDir && currentDir !== startDir;
    if (!isHomeBoundary) {
      if (basename(currentDir) === '.kandown' && existsSync(join(currentDir, 'kandown.json'))) {
        return currentDir;
      }

      const candidate = join(currentDir, '.kandown');
      if (existsSync(join(candidate, 'kandown.json'))) {
        return candidate;
      }
    }

    // 📖 Stop conditions, checked AFTER the directory's own candidate so a
    // project sitting exactly at the git root (or at $HOME when started
    // there) is still found. `.git` may be a directory or a worktree file,
    // existsSync covers both.
    if (currentDir === homeDir) break;
    if (existsSync(join(currentDir, '.git'))) break;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return resolve(cwd, pathArg);
}

export function ensureKandownDir(rawArgs: string[]): { kandownDir: string; cwd: string } {
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

export function help() {
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
  assign <id> <agent> Assign task to an agent (e.g. claude)
  reslug <id>|--all   Rename task files descriptively (t232_remove_dead_code.md)
  run [id]            Cascade: run ready tasks via assigned agents (DAG chain)
  agents              List detected AI agents + catalog (.kandown/agents.json)
  extension           Manage extensions (list/enable/disable/install/create)
  workflow            Manage workflows, templates, store installs and updates
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

export interface TaskCliArgs {
  flags: Record<string, string | boolean | string[]>;
  positional: string[];
}

export function addMultiFlag(flags: Record<string, string | boolean | string[]>, key: string, value: string): void {
  const current = flags[key];
  if (Array.isArray(current)) current.push(value);
  else if (typeof current === 'string') flags[key] = [current, value];
  else flags[key] = value;
}

export function taskParseArgs(argv: string[]): TaskCliArgs {
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

export function stringFlag(flags: Record<string, string | boolean | string[]>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = flags[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function listFlag(flags: Record<string, string | boolean | string[]>, key: string): string[] {
  const value = flags[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  return [];
}

export function resolveStatusArg(kandownDir: string, status: string): string | null {
  const config = loadConfig(kandownDir);
  return config.board.columns.find(col => col.toLowerCase() === status.toLowerCase()) ?? null;
}

/**
 * 📖 The bare `<id>.md` path, without consulting the disk. Only correct for a
 * task known to have no slug: prefer `findTaskPath` to read an existing task and
 * `newTaskPath` to create one.
 */
export function taskPath(kandownDir: string, id: string, archived = false): string {
  return archived ? join(getTasksDir(kandownDir), 'archive', `${id}.md`) : join(getTasksDir(kandownDir), `${id}.md`);
}

/**
 * 📖 Resolves an existing task file, active or archived, in either filename form.
 * Delegates to the single resolver in board-reader so the CLI, the daemon and
 * the TUI cannot drift apart on which file holds a task.
 */
export function findTaskPath(kandownDir: string, id: string): string | null {
  return resolveTaskPath(kandownDir, id);
}

/** 📖 Where to write a task being created: `<id>_<three_words>.md` when the title allows it. */
export function newTaskPath(kandownDir: string, id: string, title?: string | null): string {
  return newTaskFilePath(kandownDir, id, title);
}

export function nextTaskId(kandownDir: string): string {
  const ids = new Set(listTaskIds(kandownDir));
  // 📖 Archived ids count too, so a number is never reused after an archive.
  for (const name of listTaskFilenames(join(getTasksDir(kandownDir), 'archive'))) {
    const id = taskIdFromFilename(name);
    if (id) ids.add(id);
  }
  let max = 0;
  for (const id of ids) {
    const match = id.match(/^t(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `t${max + 1}`;
}

export function readTaskFile(kandownDir: string, id: string): { path: string; frontmatter: TaskFrontmatter; body: string; archived: boolean } | null {
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

export function printTaskCommandsHelp() {
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

export async function launchTui(screen: 'board' | 'settings', kandownDir: string): Promise<void> {
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
