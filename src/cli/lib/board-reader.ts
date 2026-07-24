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
 *  → findTaskPath        — resolves an active or archived task file
 *  → readBoard           — scans ./tasks/*.md and returns a ParsedBoard shape
 *  → readTask            — reads a task file by ID and returns a ParsedTask
 *  → readAgentDoc        — base rules (from the package) + global/project instructions.md layers
 *  → moveTaskToColumn    — updates a task frontmatter status
 *
 * @exports getProjectRoot, getTasksDir, listTaskIds, findTaskPath, readBoard, readTask, readAgentDoc, moveTaskToColumn
 * @see src/lib/parser.ts — pure string parsers reused here
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { atomicWriteFileSync } from './atomic-write.js';
import { buildColumnsFromTasks, parseTaskFile } from '../../lib/parser.js';
import { serializeTaskFile } from '../../lib/serializer.js';
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

export function listTaskIds(kandownDir: string): string[] {
  const tasksDir = getTasksDir(kandownDir);
  const ids = new Set<string>();
  for (const directory of [tasksDir, join(tasksDir, 'archive')]) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory).filter(entry => entry.endsWith('.md'))) {
      ids.add(name.slice(0, -3));
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * 📖 Resolves a task id in the active directory first, then the archive. IDs
 * are restricted to file-safe task identifiers so API routes cannot escape the
 * project task directory through path traversal.
 */
export function findTaskPath(kandownDir: string, taskId: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) return null;
  const tasksDir = getTasksDir(kandownDir);
  const activePath = join(tasksDir, `${taskId}.md`);
  if (existsSync(activePath)) return activePath;
  const archivedPath = join(tasksDir, 'archive', `${taskId}.md`);
  return existsSync(archivedPath) ? archivedPath : null;
}

/**
 * 📖 Scans task files and derives board columns from task frontmatter.
 * Missing task status values are treated as Backlog by the shared parser.
 * Tolerates individual unreadable task files — they are skipped with a stderr
 * warning instead of crashing the whole board render (t112).
 */
export function readBoard(kandownDir: string): ParsedBoard {
  const config = loadConfig(kandownDir);
  const ids = listTaskIds(kandownDir);
  const tasks: ParsedTask[] = [];
  for (const id of ids) {
    try {
      const task = readTask(kandownDir, id);
      tasks.push({
        ...task,
        frontmatter: {
          ...task.frontmatter,
          id: task.frontmatter.id || id,
          status: task.frontmatter.status || 'Backlog',
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
export function readTask(kandownDir: string, taskId: string): ParsedTask {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}`, status: 'Backlog' },
      body: '',
    };
  }
  const content = readFileSync(taskPath, 'utf8');
  const parsed = parseTaskFile(content);
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      id: parsed.frontmatter.id || taskId,
      status: parsed.frontmatter.status || 'Backlog',
    },
  };
}

/**
 * 📖 Absolute path to the installed kandown package root. Computed from this
 * module's own location inside the built `bin/tui.js` bundle (same trick as
 * PKG_ROOT in bin/kandown.js), NOT from the project being browsed — so the
 * rules served below are always the ones shipped with the running CLI
 * version, never a per-project snapshot that can drift out of sync.
 */
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * 📖 Returns the full text of the agent instructions doc used when launching
 * an agent from the TUI (`a` key) — the exact same layered rules `kandown
 * work` prints, so the two entry points can never disagree:
 *   1. Base rules — templates/AGENT_KANDOWN.md, shipped with the package
 *      (never a project-local copy, which would go stale the moment the
 *      package updates — see t… migration from per-project AGENT_KANDOWN.md).
 *   2. Global additions — ~/.kandown/instructions.md, if present.
 *   3. Project additions — .kandown/instructions.md, if present.
 * Returns empty string only if the base rules can't be read at all (t112 —
 * non-critical, the agent still launches, just without a system prompt).
 */
export function readAgentDoc(kandownDir: string): string {
  const sections: string[] = [];

  try {
    sections.push(readFileSync(join(PKG_ROOT, 'templates', 'AGENT_KANDOWN.md'), 'utf8').trim());
  } catch (e) {
    console.warn('[kandown] Could not read base agent rules:', (e as Error).message);
  }

  const globalPath = join(homedir(), '.kandown', 'instructions.md');
  if (existsSync(globalPath)) {
    try {
      sections.push(`## Global instructions\n\n${readFileSync(globalPath, 'utf8').trim()}`);
    } catch (e) {
      console.warn(`[kandown] Could not read ${globalPath}:`, (e as Error).message);
    }
  }

  const projectPath = join(kandownDir, 'instructions.md');
  if (existsSync(projectPath)) {
    try {
      sections.push(`## Project-specific instructions\n\n${readFileSync(projectPath, 'utf8').trim()}`);
    } catch (e) {
      console.warn(`[kandown] Could not read ${projectPath}:`, (e as Error).message);
    }
  }

  try {
    const root = getProjectRoot(kandownDir);
    const gitLog = execFileSync('git', ['log', '-n', '5', '--oneline', '--', 'tasks/'], { cwd: root, encoding: 'utf8' }).trim();
    if (gitLog) {
      sections.push(`## Recent Task Activity (Git History)\n\n\`\`\`\n${gitLog}\n\`\`\``);
    }
  } catch {
    // Non-fatal if not in git repo
  }

  return sections.filter(Boolean).join('\n\n---\n\n');
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
    const prevContent = readFileSync(taskPath, 'utf8');
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn,
    }, parsed.body);
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

  const fm: TaskFrontmatter = {
    id: newId,
    title,
    status: targetStatus,
    created: new Date().toISOString().slice(0, 10),
  };
  if (priority) fm.priority = priority;
  if (assignee) fm.assignee = assignee;
  if (tags.length > 0) fm.tags = tags;
  if (due) fm.due = due;
  if (depends_on.length > 0) fm.depends_on = depends_on;

  const content = serializeTaskFile(fm, '');
  const taskPath = join(tasksDir, `${newId}.md`);
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
  const taskPath = join(tasksDir, `${taskId}.md`);
  if (!existsSync(taskPath)) return false;
  try {
    const prevContent = readFileSync(taskPath, 'utf8');
    const archiveDir = join(tasksDir, 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    const parsed = readTask(kandownDir, taskId);
    const newContent = serializeTaskFile({
      ...parsed.frontmatter,
      id: taskId,
      archived: true,
    }, parsed.body);
    const destPath = join(archiveDir, `${taskId}.md`);
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
