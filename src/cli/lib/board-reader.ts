/**
 * @file Node.js task reader and mutator
 * @description Provides filesystem-based reading and writing of Kandown task
 * files for the CLI. The board is derived from tasks/*.md plus the configured
 * columns in kandown.json; there is no separate board index.
 *
 * 📖 The parser in src/lib/parser.ts works on plain strings with zero browser
 * dependencies, so the CLI only adds a thin Node fs layer here. Moving a task
 * updates the task frontmatter status directly, which keeps task files as the
 * single source of truth.
 *
 * @functions
 *  → readBoard           — scans tasks/*.md and returns a ParsedBoard-compatible shape
 *  → readTask            — reads a task file by ID and returns a ParsedTask
 *  → readAgentDoc        — returns AGENT_KANDOWN_COMPACT.md or fallback instructions
 *  → moveTaskToColumn    — updates a task frontmatter status
 *  → getProjectRoot      — returns the project root (parent of .kandown/)
 *
 * @exports readBoard, readTask, readAgentDoc, moveTaskToColumn, getProjectRoot
 * @see src/lib/parser.ts — pure string parsers reused here
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

function listTaskIds(kandownDir: string): string[] {
  const tasksDir = join(kandownDir, 'tasks');
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir)
    .filter(name => name.endsWith('.md'))
    .map(name => name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * 📖 Scans task files and derives board columns from task frontmatter.
 * Missing task status values are treated as Backlog by the shared parser.
 */
export function readBoard(kandownDir: string): ParsedBoard {
  const config = loadConfig(kandownDir);
  const tasks = listTaskIds(kandownDir).map(id => {
    const task = readTask(kandownDir, id);
    return {
      ...task,
      frontmatter: {
        ...task.frontmatter,
        id: task.frontmatter.id || id,
        status: task.frontmatter.status || 'Backlog',
      },
    };
  });

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
  const taskPath = join(kandownDir, 'tasks', `${taskId}.md`);
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
 * 📖 Returns the full text of the compact agent instructions doc.
 * Priority order:
 *   1. AGENT_KANDOWN_COMPACT.md at project root
 *   2. AGENT_KANDOWN.md at project root (full version fallback)
 *   3. .kandown/AGENT.md (minimal template fallback)
 * Returns empty string if none found.
 */
export function readAgentDoc(kandownDir: string): string {
  const root = getProjectRoot(kandownDir);
  const candidates = [
    join(root, 'AGENT_KANDOWN_COMPACT.md'),
    join(root, 'AGENT_KANDOWN.md'),
    join(kandownDir, 'AGENT.md'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8');
    }
  }
  return '';
}

/**
 * 📖 Updates the task frontmatter status to move it between board columns.
 * @returns true when the task file exists and was written, false otherwise.
 */
export function moveTaskToColumn(
  kandownDir: string,
  taskId: string,
  targetColumn: string,
): boolean {
  const taskPath = join(kandownDir, 'tasks', `${taskId}.md`);
  if (!existsSync(taskPath)) return false;

  const parsed = readTask(kandownDir, taskId);
  writeFileSync(taskPath, serializeTaskFile({
    ...parsed.frontmatter,
    id: taskId,
    status: targetColumn,
  }, parsed.body), 'utf8');
  return true;
}
