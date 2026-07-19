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
 *  → listTaskIds         — scans ./tasks/*.md and returns task ids
 *  → readBoard           — scans ./tasks/*.md and returns a ParsedBoard shape
 *  → readTask            — reads a task file by ID and returns a ParsedTask
 *  → readAgentDoc        — returns AGENT_KANDOWN.md or fallback instructions
 *  → moveTaskToColumn    — updates a task frontmatter status
 *
 * @exports getProjectRoot, getTasksDir, listTaskIds, readBoard, readTask, readAgentDoc, moveTaskToColumn
 * @see src/lib/parser.ts — pure string parsers reused here
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWriteFileSync } from './atomic-write.js';
import { buildColumnsFromTasks, parseTaskFile } from '../../lib/parser.js';
import { serializeTaskFile } from '../../lib/serializer.js';
import type { ParsedBoard, ParsedTask } from '../../lib/types.js';
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
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir)
    .filter(name => name.endsWith('.md'))
    .map(name => name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
  const taskPath = join(getTasksDir(kandownDir), `${taskId}.md`);
  if (!existsSync(taskPath)) {
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
 * 📖 Returns the full text of the agent instructions doc.
 * Priority order:
 *   1. AGENT_KANDOWN.md at project root
 *   2. .kandown/AGENT.md (minimal template fallback)
 * Returns empty string if none found or unreadable (t112 — non-critical).
 */
export function readAgentDoc(kandownDir: string): string {
  const root = getProjectRoot(kandownDir);
  const candidates = [
    join(root, 'AGENT_KANDOWN.md'),
    join(kandownDir, 'AGENT.md'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return readFileSync(candidate, 'utf8');
    } catch (e) {
      // File existed at the check but vanished or became unreadable — warn and
      // try the next candidate rather than crashing the launcher (t112).
      console.warn(`[kandown] Could not read ${candidate}:`, (e as Error).message);
    }
  }
  return '';
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
  const taskPath = join(getTasksDir(kandownDir), `${taskId}.md`);
  if (!existsSync(taskPath)) return false;

  try {
    const parsed = readTask(kandownDir, taskId);
    atomicWriteFileSync(taskPath, serializeTaskFile({
      ...parsed.frontmatter,
      id: taskId,
      status: targetColumn,
    }, parsed.body));
    return true;
  } catch (e) {
    console.error(`[kandown] Failed to move task ${taskId} to ${targetColumn}:`, (e as Error).message);
    return false;
  }
}
