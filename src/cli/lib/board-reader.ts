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
 *  → readAgentDoc        — base rules (from the package) + global/project instructions.md layers
 *  → moveTaskToColumn    — updates a task frontmatter status
 *
 * @exports getProjectRoot, getTasksDir, listTaskIds, readBoard, readTask, readAgentDoc, moveTaskToColumn
 * @see src/lib/parser.ts — pure string parsers reused here
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
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
