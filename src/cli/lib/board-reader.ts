/**
 * @file Node.js task reader and mutator
 * @description Provides filesystem-based reading and writing of Kandown task
 * files for the CLI. The board is derived from tasks/*.md plus the configured
 * columns in kandown.json; there is no separate board index.
 *
 * 📖 Tasks live at the project root in `./tasks/`, not inside `.kandown/tasks/`.
 * The CLI's `kandown init` creates them at the project root, and a one-time
 * silent migration moves any legacy `.kandown/tasks/*.md` to the new location
 * on first access. See `bin/kandown.js → migrateTasksToTopLevel`.
 *
 * 📖 The parser in src/lib/parser.ts works on plain strings with zero browser
 * dependencies, so the CLI only adds a thin Node fs layer here. Moving a task
 * updates the task frontmatter status directly, which keeps task files as the
 * single source of truth.
 *
 * @functions
 *  → getProjectRoot      — returns the project root (parent of .kandown/)
 *  → getTasksDir         — returns the project-root ./tasks/ absolute path
 *  → listTaskIds         — scans ./tasks/*.md and ./tasks/archive/*.md
 *  → listTaskFilenames    — the raw task filenames in one directory
 *  → findTaskPath        — resolves an active or archived task file
 *  → newTaskFilePath     — the path a task about to be created should be written to
 *  → readBoard           — scans ./tasks/*.md and returns a ParsedBoard shape
 *  → readTask            — reads a task file by ID and returns a ParsedTask
 *  → moveTaskToColumn    — updates a task frontmatter status
 *  → assignTaskToAgent   — writes a canonical agent id into `assignee:`
 *
 * @exports getProjectRoot, getTasksDir, listTaskIds, listTaskFilenames, findTaskPath, newTaskFilePath, readBoard, readTask, moveTaskToColumn, assignTaskToAgent
 * @see src/lib/parser.ts — pure string parsers reused here
 * @see src/lib/task-filename.ts — the shared id ↔ filename policy, including slugs
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { resolveDependencyStatus, resolveTransition } from '../../lib/dependencies.js';
import { atomicWriteFileSync } from './atomic-write.js';
import { buildColumnsFromTasks, isArchived, parseTaskFile } from '../../lib/parser.js';
import { serializeTaskFile } from '../../lib/serializer.js';
import { stampUpdated } from '../../lib/task-meta.js';
import {
  buildTaskFilename,
  isTaskFilename,
  resolveTaskFilename,
  taskIdFromFilename,
} from '../../lib/task-filename.js';
import type { ParsedBoard, ParsedTask, TaskFrontmatter } from '../../lib/types.js';
import { loadConfig } from './config.js';

/**
 * 📖 Returns the project root directory (one level above .kandown/).
 * e.g. /home/user/myproject/.kandown → /home/user/myproject
 */
export function getProjectRoot(kandownDir: string): string {
  return dirname(kandownDir);
}

/**
 * 📖 Returns the absolute path of the tasks directory at the project root.
 * Mirrors the web layout: `./tasks/` is a sibling of `.kandown/`.
 * e.g. /home/user/myproject/.kandown → /home/user/myproject/tasks
 */
export function getTasksDir(kandownDir: string): string {
  return join(getProjectRoot(kandownDir), 'tasks');
}

/**
 * 📖 The task Markdown files inside one directory, ignoring `README.md`-style
 * siblings, hidden files and anything unreadable. Returned unsorted: the shared
 * resolver does its own deterministic ordering.
 */
export function listTaskFilenames(directory: string): string[] {
  if (!existsSync(directory)) return [];
  try {
    return readdirSync(directory).filter(isTaskFilename);
  } catch {
    return [];
  }
}

/**
 * 📖 Every task id in the project, active and archived, whether the file is named
 * `t232.md` or `t232_remove_dead_code.md`.
 *
 * When two files claim the same id the first one wins (active before archived,
 * then code-unit order) and the duplicate is reported on stderr instead of
 * silently shadowing a task, because the file the user is editing might be the
 * one being dropped.
 */
export function listTaskIds(kandownDir: string): string[] {
  const tasksDir = getTasksDir(kandownDir);
  const owners = new Map<string, string>();
  for (const directory of [tasksDir, join(tasksDir, 'archive')]) {
    for (const name of listTaskFilenames(directory).sort()) {
      const id = taskIdFromFilename(name);
      if (!id) continue;
      const owner = owners.get(id);
      if (owner) {
        if (owner !== name) {
          console.error(`[kandown] Two files claim task ${id}: using ${owner}, ignoring ${name}`);
        }
        continue;
      }
      owners.set(id, name);
    }
  }
  return [...owners.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * 📖 Resolves a task id in the active directory first, then the archive, over
 * both the bare `t232.md` and the descriptive `t232_remove_dead_code.md` form.
 * IDs are restricted to file-safe task identifiers so API routes cannot escape
 * the project task directory through path traversal.
 */
export function findTaskPath(kandownDir: string, taskId: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return null;
  const tasksDir = getTasksDir(kandownDir);
  for (const directory of [tasksDir, join(tasksDir, 'archive')]) {
    const match = resolveTaskFilename(taskId, listTaskFilenames(directory));
    if (!match) continue;
    if (match.ambiguousWith.length) {
      console.error(`[kandown] Task ${taskId} is claimed by several files, using ${match.filename} (also: ${match.ambiguousWith.join(', ')})`);
    }
    return join(directory, match.filename);
  }
  return null;
}

/**
 * 📖 Where a brand-new task file goes: `tasks/<id>_<three_words>.md`, or the bare
 * `tasks/<id>.md` when the title yields no ASCII slug. Existing filenames are
 * passed through so a collision can never overwrite another task.
 */
export function newTaskFilePath(kandownDir: string, id: string, title?: string | null): string {
  const tasksDir = getTasksDir(kandownDir);
  return join(tasksDir, buildTaskFilename(id, title, listTaskFilenames(tasksDir)));
}

/**
 * 📖 Scans task files and derives board columns from task frontmatter.
 * Missing task status values use the project's first configured column.
 * Tolerates individual unreadable task files — they are skipped with a stderr
 * warning instead of crashing the whole board render (t112).
 */
export function readBoard(kandownDir: string): ParsedBoard {
  const config = loadConfig(kandownDir);
  const ids = listTaskIds(kandownDir);
  const tasks: ParsedTask[] = [];
  for (const id of ids) {
    try {
      const task = readTask(kandownDir, id, config.board.columns[0]);
      tasks.push({
        ...task,
        frontmatter: {
          ...task.frontmatter,
          id: task.frontmatter.id || id,
          status: task.frontmatter.status || config.board.columns[0] || 'Backlog',
        },
      });
    } catch (e) {
      // 📖 Skip the broken file but keep the rest of the board readable (t112).
      console.error(`[kandown] Failed to read task ${id}:`, (e as Error).message);
    }
  }

  return {
    frontmatter: null,
    title: 'Project Kanban',
    columns: buildColumnsFromTasks(tasks, config.board.columns),
  };
}

/**
 * 📖 Reads and parses a task file by its ID (e.g. 't-019').
 * Returns a minimal ParsedTask with just the id if the file doesn't exist.
 */
export function readTask(kandownDir: string, taskId: string, defaultStatus?: string): ParsedTask {
  const fallback = defaultStatus || loadConfig(kandownDir).board.columns[0] || 'Backlog';
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}`, status: fallback },
      body: '',
    };
  }
  const content = readFileSync(taskPath, 'utf8');
  const parsed = parseTaskFile(content);
  // 📖 Path is the single source of truth for "archived". A file under
  // tasks/archive/ is archived even when its frontmatter flag is missing —
  // the typical case after a plain `git mv` from cleanup scripts, which was
  // the bug behind the `kandown list` duplicate rows. The frontmatter flag
  // is preserved as a cache for callers that read the file directly without
  // going through this helper (mostly the web filesystem layer, which has
  // its own path check below).
  const tasksDir = getTasksDir(kandownDir);
  const inArchive = taskPath.startsWith(join(tasksDir, 'archive') + sep);
  const archived = inArchive || isArchived(parsed);
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      id: parsed.frontmatter.id || taskId,
      status: parsed.frontmatter.status || fallback,
      // Normalize to a real boolean so JSON serializers and `=== true`
      // checks both behave consistently downstream.
      archived: archived ? true : parsed.frontmatter.archived,
    },
  };
}

/**
 * 📖 Updates the task frontmatter status to move it between board columns.
 * @returns true when the task file exists and was written, false otherwise.
 * Wraps the read+write in try/catch so a locked / unwritable file surfaces a
 * clean false instead of crashing the launcher pipeline (t112).
 */
export function moveTaskToColumn(
  kandownDir: string,
  taskId: string,
  targetColumn: string,
): boolean {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) return false;

  try {
    const parsed = readTask(kandownDir, taskId);
    // 📖 Funnel through the canonical dependency gate. The board snapshot is
    // the full task list (active + archived) so an archived dep counts as
    // resolved — matching the rule every other interface now honors.
    const cfg = loadConfig(kandownDir);
    const ids = listTaskIds(kandownDir);
    const allTasks = ids.map((id) => {
      try { return readTask(kandownDir, id); } catch { return null; }
    }).filter((t): t is NonNullable<typeof t> => t !== null);
    const snap = resolveDependencyStatus(allTasks, cfg);
    const verdict = resolveTransition(parsed, targetColumn, snap, cfg);
    if (!verdict.allowed) {
      console.error(
        `[kandown] Cannot move ${taskId} to ${targetColumn}: blocked by ${verdict.blockedBy.join(', ')}`,
      );
      return false;
    }

    const prevContent = readFileSync(taskPath, 'utf8');
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn,
    }), parsed.body);
    atomicWriteFileSync(taskPath, newContent);
    pushUndo(kandownDir, {
      type: 'move',
      taskId,
      path: taskPath,
      previousContent: prevContent,
      newContent,
      timestamp: Date.now(),
    });
    return true;
  } catch (e) {
    console.error(`[kandown] Failed to move task ${taskId} to ${targetColumn}:`, (e as Error).message);
    return false;
  }
}

/**
 * 📖 Writes `assignee: <agentId>` into a task's frontmatter. Called by the
 * launcher just before an agent is spawned, so "start this task on Codex" and
 * "this task belongs to Codex" are one action instead of two: the board, the
 * web view and the task file all agree the moment the agent opens.
 *
 * 📖 The value stored is the *canonical catalog id* (`claude`, not
 * `claude-code`), which is exactly what `resolveAgentEntry` reads back on the
 * next `a` press to skip the picker, and what the web avatar resolver matches
 * against. Writing an alias here would work for one side and not the other.
 *
 * 📖 No-ops (returns true) when the task is already assigned to that agent, so
 * relaunching a task does not churn `updated:` or the git diff. Returns false
 * when the task file is missing or unwritable; the caller decides whether that
 * is fatal (it is not: an unassigned launch still beats no launch).
 */
export function assignTaskToAgent(kandownDir: string, taskId: string, agentId: string): boolean {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) return false;
  try {
    const parsed = readTask(kandownDir, taskId);
    if (parsed.frontmatter.assignee === agentId) return true;
    const prevContent = readFileSync(taskPath, 'utf8');
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      assignee: agentId,
    }), parsed.body);
    atomicWriteFileSync(taskPath, newContent);
    pushUndo(kandownDir, {
      type: 'move',
      taskId,
      path: taskPath,
      previousContent: prevContent,
      newContent,
      timestamp: Date.now(),
    });
    return true;
  } catch (e) {
    console.error(`[kandown] Failed to assign task ${taskId} to ${agentId}:`, (e as Error).message);
    return false;
  }
}

interface UndoRecord {
  type: 'move' | 'create' | 'delete' | 'archive';
  taskId: string;
  path: string;
  previousContent: string | null;
  newContent: string | null;
  timestamp: number;
}

function pushUndo(kandownDir: string, record: UndoRecord): void {
  try {
    const undoDir = join(kandownDir, '.undo');
    if (!existsSync(undoDir)) mkdirSync(undoDir, { recursive: true });
    const logPath = join(undoDir, 'log.json');
    let list: UndoRecord[] = [];
    if (existsSync(logPath)) {
      try { list = JSON.parse(readFileSync(logPath, 'utf8')); } catch { list = []; }
    }
    list.unshift(record);
    if (list.length > 50) list = list.slice(0, 50);
    atomicWriteFileSync(logPath, JSON.stringify(list, null, 2));
  } catch {
    // Non-fatal
  }
}

export function undoLastAction(kandownDir: string): boolean {
  try {
    const logPath = join(kandownDir, '.undo', 'log.json');
    if (!existsSync(logPath)) return false;
    const list: UndoRecord[] = JSON.parse(readFileSync(logPath, 'utf8'));
    if (!list || list.length === 0) return false;
    const record = list.shift()!;
    atomicWriteFileSync(logPath, JSON.stringify(list, null, 2));

    if (record.previousContent === null) {
      if (existsSync(record.path)) unlinkSync(record.path);
    } else {
      const dir = dirname(record.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      atomicWriteFileSync(record.path, record.previousContent);
      if (record.newContent !== null && record.path.includes('/archive/')) {
        const activePath = record.path.replace('/archive/', '/');
        if (existsSync(activePath)) unlinkSync(activePath);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function createTaskInBoard(kandownDir: string, rawInput: string, status?: string): string {
  const tasksDir = getTasksDir(kandownDir);
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  const ids = listTaskIds(kandownDir);
  let maxN = 0;
  for (const id of ids) {
    const m = id.match(/^t(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  const newId = `t${maxN + 1}`;
  const config = loadConfig(kandownDir);
  const targetStatus = status || (config.board.columns[0] ?? 'Backlog');

  let text = rawInput.trim();
  let priority: string | undefined;
  const tags: string[] = [];
  let assignee: string | undefined;
  let due: string | undefined;
  const depends_on: string[] = [];

  text = text.replace(/(?:^|\s)p([1-4])(?:\s|$)/i, (_, level) => { priority = `P${level}`; return ' '; });
  text = text.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, (_, tag) => { tags.push(tag.toLowerCase()); return ' '; });
  text = text.replace(/(?:^|\s)@([a-zA-Z0-9_-]+)/g, (_, user) => { assignee = user; return ' '; });
  text = text.replace(/(?:^|\s)due:([^\s]+)/i, (_, d) => { due = d; return ' '; });
  text = text.replace(/(?:^|\s)\+([a-zA-Z0-9_-]+)/g, (_, depId) => { depends_on.push(depId); return ' '; });
  const title = text.replace(/\s+/g, ' ').trim() || rawInput;

  // 📖 A brand-new task is "updated" at creation time too, so the Age column
  // reads its real age from second one instead of falling back to the
  // day-precision `created` date.
  const fm: TaskFrontmatter = stampUpdated({
    id: newId,
    title,
    status: targetStatus,
    created: new Date().toISOString().slice(0, 10),
  });
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  if (due) fm.due = due;
  if (depends_on.length > 0) fm.depends_on = depends_on;

  const content = serializeTaskFile(fm, '');
  const taskPath = newTaskFilePath(kandownDir, newId, title);
  atomicWriteFileSync(taskPath, content);
  pushUndo(kandownDir, {
    type: 'create',
    taskId: newId,
    path: taskPath,
    previousContent: null,
    newContent: content,
    timestamp: Date.now(),
  });
  return newId;
}

export function deleteTaskInBoard(kandownDir: string, taskId: string): boolean {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) return false;
  try {
    const prevContent = readFileSync(taskPath, 'utf8');
    unlinkSync(taskPath);
    pushUndo(kandownDir, {
      type: 'delete',
      taskId,
      path: taskPath,
      previousContent: prevContent,
      newContent: null,
      timestamp: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

export function archiveTaskInBoard(kandownDir: string, taskId: string): boolean {
  const tasksDir = getTasksDir(kandownDir);
  const match = resolveTaskFilename(taskId, listTaskFilenames(tasksDir));
  if (!match) return false;
  const taskPath = join(tasksDir, match.filename);
  if (!existsSync(taskPath)) return false;
  try {
    const prevContent = readFileSync(taskPath, 'utf8');
    const archiveDir = join(tasksDir, 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile(stampUpdated({
      ...parsed.frontmatter,
      id: taskId,
      archived: true,
    }), parsed.body);
    // 📖 Archiving keeps the filename it had, slug included, so the archive stays
    // as readable as the board and a later restore is a plain move back.
    const destPath = join(archiveDir, match.filename);
    atomicWriteFileSync(destPath, newContent);
    unlinkSync(taskPath);
    pushUndo(kandownDir, {
      type: 'archive',
      taskId,
      path: destPath,
      previousContent: prevContent,
      newContent,
      timestamp: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

export function listTemplates(kandownDir: string): string[] {
  const tplDir = join(kandownDir, 'templates');
  if (!existsSync(tplDir)) return [];
  return readdirSync(tplDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
}

export function getTemplateContent(kandownDir: string, name: string): string | null {
  const tplPath = join(kandownDir, 'templates', `${name}.md`);
  if (!existsSync(tplPath)) return null;
  try {
    return readFileSync(tplPath, 'utf8');
  } catch {
    return null;
  }
}
