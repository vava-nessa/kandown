/**
 * @file CLI commands — task CRUD & board data
 * @description Handlers for `kandown list/show/create/move/assign/commit`
 * plus `export`/`import`/`projects`. All operate on individual task files
 * under tasks/ (and tasks/archive/) via the shared path helpers in
 * cli-shared.ts.
 *
 * @exports cmdList, cmdShow, cmdCreate, cmdMove, cmdAssign, cmdCommit,
 *   cmdExport, cmdProjects, cmdImport
 */

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { archiveTaskInBoard, getTasksDir, readBoard, readTask, moveTaskToColumn, listTaskIds } from '../lib/board-reader';
import { loadExtensionHost, runExtensionMoveGates } from '../lib/extensions-cli';
import { loadConfig } from '../lib/config';
import { resolveAgentEntry } from '../lib/agents';
import { atomicWriteFileSync } from '../lib/atomic-write';
import { isArchived } from '../../lib/parser';
import { serializeTaskFile } from '../../lib/serializer';
import { stampUpdated } from '../../lib/task-meta';
import type { TaskFrontmatter } from '../../lib/types';
import {
  c, log, info, success, err,
  ensureKandownDir, taskParseArgs, stringFlag, listFlag,
  resolveStatusArg, taskPath, findTaskPath, nextTaskId, readTaskFile,
} from '../lib/cli-shared';

export function cmdList(rawArgs: string[]) {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const defaultStatus = loadConfig(kandownDir).board.columns[0] || 'Backlog';
  const args = taskParseArgs(rawArgs);
  const includeArchived = args.flags.archived === true;
  const statusFilter = stringFlag(args.flags, 'status')?.toLowerCase() ?? null;
  const priorityFilter = stringFlag(args.flags, 'priority')?.toUpperCase() ?? null;
  const assigneeFilter = stringFlag(args.flags, 'assignee');
  const tagFilters = listFlag(args.flags, 'tag').map(tag => tag.toLowerCase());

  const rows: Array<{ id: string; title: string; status: string; priority: string; assignee: string; tags: string[]; archived: boolean }> = [];
  // 📖 `listTaskIds` scans both `tasks/` and `tasks/archive/` on purpose
  // (dependency resolution and other 12 callers rely on it). We derive the
  // archived flag from the parsed task's frontmatter, then skip archived rows
  // by default. `--archived` opts in to seeing them. The previous version
  // hardcoded `archived: false` for the first pass and re-walked the archive
  // folder in a second pass when `--archived` was set, which produced
  // duplicated rows whose two entries contradicted each other.
  for (const id of listTaskIds(kandownDir)) {
    const task = readTask(kandownDir, id);
    const archived = isArchived(task);
    if (archived && !includeArchived) continue;
    const baseStatus = task.frontmatter.status || defaultStatus;
    rows.push({
      id,
      title: task.frontmatter.title || id,
      status: archived ? `${baseStatus} (archived)` : baseStatus,
      priority: task.frontmatter.priority || '',
      assignee: task.frontmatter.assignee || '',
      tags: Array.isArray(task.frontmatter.tags) ? task.frontmatter.tags : [],
      archived,
    });
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

export function cmdShow(rawArgs: string[]) {
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

export function cmdCreate(rawArgs: string[]) {
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

  const fm: TaskFrontmatter = stampUpdated({
    id,
    title,
    status,
    created: new Date().toISOString().slice(0, 10),
  });
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

export async function cmdMove(rawArgs: string[]) {
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

  // 📖 Extension gates compose with the core dependency gate. Building the host
  // is cheap when no extensions are enabled (no jiti load, no network).
  const host = await loadExtensionHost(kandownDir);
  let fromStatus: string | undefined;
  try { fromStatus = readTask(kandownDir, id).frontmatter.status as string | undefined; } catch { /* ignore */ }
  const gate = await runExtensionMoveGates(host, kandownDir, id, fromStatus, status);
  if (!gate.allowed) {
    err(`Cannot move ${id} to ${status}: ${gate.reason ?? 'blocked by an extension'}`);
    process.exit(1);
  }

  if (!moveTaskToColumn(kandownDir, id, status)) {
    err(`Move failed: ${id}`);
    process.exit(1);
  }

  // Notify contributed sync handlers (fire-and-forget, isolated by the host).
  try {
    const moved = readTask(kandownDir, id);
    const fm = moved.frontmatter as Record<string, unknown>;
    host.dispatchSync({ type: 'task:afterMove', task: { id, frontmatter: fm, plugins: fm.plugins as Record<string, unknown> | undefined }, from: fromStatus, to: status });
  } catch { /* ignore */ }

  success(`Moved ${id} → "${status}"`);
}

export function cmdAssign(rawArgs: string[]) {
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
  if (assignee) {
    // 📖 Canonicalise agent aliases so `assign t1 claude-code` stores `claude`.
    // Humans and unknown values pass through unchanged.
    const resolved = resolveAgentEntry(assignee, kandownDir);
    frontmatter.assignee = resolved ? resolved.id : assignee;
  } else {
    delete frontmatter.assignee;
  }
  atomicWriteFileSync(task.path, serializeTaskFile(stampUpdated(frontmatter), task.body));
  success(assignee ? `Assigned ${id} → ${frontmatter.assignee ?? assignee}` : `Unassigned ${id}`);
}

export function cmdCommit(rawArgs: string[]) {
  ensureKandownDir(rawArgs);
  const args = taskParseArgs(rawArgs);
  const message = stringFlag(args.flags, 'message') || 'tasks: update kandown board';
  const add = spawnSync('git', ['add', 'tasks', '.kandown/kandown.json'], { stdio: 'inherit' });
  if (add.status !== 0) process.exit(add.status ?? 1);
  const commit = spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' });
  process.exit(commit.status ?? 1);
}

export function cmdExport(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const board = readBoard(kandownDir);
  process.stdout.write(JSON.stringify(board, null, 2) + '\n');
}

export function cmdProjects(rawArgs: string[]): void {
  const { kandownDir } = ensureKandownDir(rawArgs);
  const metadataPath = join(kandownDir, 'daemon.json');
  if (!existsSync(metadataPath)) {
    info('No daemon metadata for this project.');
    return;
  }
  process.stdout.write(readFileSync(metadataPath, 'utf8').trim() + '\n');
}

export function cmdImport(rawArgs: string[]): void {
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

  const defaultStatus = loadConfig(kandownDir).board.columns[0] || 'Backlog';
  const rows: Array<Record<string, unknown>> = [];
  if (Array.isArray(raw)) {
    rows.push(...raw.filter(value => typeof value === 'object' && value !== null) as Array<Record<string, unknown>>);
  } else if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { columns?: unknown }).columns)) {
    for (const column of (raw as { columns: unknown[] }).columns) {
      if (typeof column !== 'object' || column === null) continue;
      const col = column as { name?: unknown; tasks?: unknown };
      if (!Array.isArray(col.tasks)) continue;
      for (const task of col.tasks) {
        if (typeof task === 'object' && task !== null) rows.push({ ...(task as Record<string, unknown>), status: String(col.name || defaultStatus) });
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
      status: typeof row.status === 'string' && row.status ? row.status.replace(/ \(archived\)$/i, '') : defaultStatus,
    };
    if (typeof row.priority === 'string') fm.priority = row.priority;
    if (typeof row.assignee === 'string') fm.assignee = row.assignee;
    if (Array.isArray(row.tags)) fm.tags = row.tags.map(String);
    atomicWriteFileSync(path, serializeTaskFile(stampUpdated(fm), typeof row.body === 'string' ? row.body : ''));
    imported++;
  }
  success(`Imported ${imported} task${imported === 1 ? '' : 's'}`);
}
