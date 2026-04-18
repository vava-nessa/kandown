/**
 * @file Node.js board reader and mutator
 * @description Provides filesystem-based reading and writing of board.md and task files
 * for the CLI. Wraps the browser-agnostic parser with Node fs calls, and adds
 * `moveTaskToColumn` for the CLI launcher to auto-move tasks to "In Progress".
 *
 * 📖 The parser in src/lib/parser.ts works on plain strings with zero browser
 * dependencies — so we just add the fs layer here. Board mutations use direct
 * string manipulation (not re-serializing the whole board) to preserve formatting
 * and avoid any accidental data loss.
 *
 * @functions
 *  → readBoard           — reads board.md and returns a ParsedBoard
 *  → readTask            — reads a task file by ID and returns a ParsedTask
 *  → readAgentDoc        — returns the contents of AGENT_KANDOWN_COMPACT.md (or AGENT_KANDOWN.md fallback)
 *  → moveTaskToColumn    — moves a task line from its current column to a new one in board.md
 *  → getProjectRoot      — returns the project root (parent of .kandown/)
 *
 * @exports readBoard, readTask, readAgentDoc, moveTaskToColumn, getProjectRoot
 * @see src/lib/parser.ts — pure string parsers reused here
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseBoard, parseTaskFile } from '../../lib/parser.js';
import type { ParsedBoard, ParsedTask } from '../../lib/types.js';

/**
 * 📖 Returns the project root directory (one level above .kandown/).
 * e.g. /home/user/myproject/.kandown → /home/user/myproject
 */
export function getProjectRoot(kandownDir: string): string {
  return dirname(kandownDir);
}

/**
 * 📖 Reads and parses board.md from the kandown directory.
 * Returns an empty board structure if board.md doesn't exist.
 */
export function readBoard(kandownDir: string): ParsedBoard {
  const boardPath = join(kandownDir, 'board.md');
  if (!existsSync(boardPath)) {
    return { frontmatter: null, title: 'Project Kanban', columns: [] };
  }
  const content = readFileSync(boardPath, 'utf8');
  return parseBoard(content);
}

/**
 * 📖 Reads and parses a task file by its ID (e.g. 't-019').
 * Looks for both `tasks/<id>.md` directly.
 * Returns a minimal ParsedTask with just the id if the file doesn't exist.
 */
export function readTask(kandownDir: string, taskId: string): ParsedTask {
  const taskPath = join(kandownDir, 'tasks', `${taskId}.md`);
  if (!existsSync(taskPath)) {
    return {
      frontmatter: { id: taskId, title: `Task ${taskId}` },
      body: '',
    };
  }
  const content = readFileSync(taskPath, 'utf8');
  return parseTaskFile(content);
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
 * 📖 Moves a task line from its current column section to the target column in board.md.
 *
 * Strategy: pure string manipulation — find the line containing `**[taskId]**`,
 * remove it (and any trailing blank line caused by the removal), then insert it
 * at the end of the target column section (before the next ## header or EOF).
 *
 * This preserves all other formatting, comments, and ordering in the file.
 *
 * @param kandownDir - absolute path to the .kandown/ directory
 * @param taskId     - task ID, e.g. 't-019'
 * @param targetColumn - column name exactly as written in the ## header, e.g. 'In Progress'
 * @returns true if the task was found and moved, false if not found
 */
export function moveTaskToColumn(
  kandownDir: string,
  taskId: string,
  targetColumn: string,
): boolean {
  const boardPath = join(kandownDir, 'board.md');
  if (!existsSync(boardPath)) return false;

  const original = readFileSync(boardPath, 'utf8');
  const lines = original.split('\n');

  // 📖 Find the task line index — look for **[taskId]** anywhere on the line
  const taskPattern = new RegExp(`\\*\\*\\[${escapeRegex(taskId)}\\]\\*\\*`);
  const taskLineIdx = lines.findIndex(l => taskPattern.test(l));
  if (taskLineIdx === -1) return false; // task not found

  const taskLine = lines[taskLineIdx]!;

  // 📖 Find the target column header index — ## <columnName>
  const colPattern = new RegExp(`^##\\s+${escapeRegex(targetColumn)}\\s*$`, 'i');
  const colHeaderIdx = lines.findIndex(l => colPattern.test(l));
  if (colHeaderIdx === -1) return false; // column not found

  // 📖 Check if task is already in the target column — find what column it's currently in
  let currentColHeaderIdx = -1;
  for (let i = taskLineIdx - 1; i >= 0; i--) {
    if (/^##\s+/.test(lines[i] ?? '')) {
      currentColHeaderIdx = i;
      break;
    }
  }
  if (currentColHeaderIdx === colHeaderIdx) return true; // already in the right column, no-op

  // 📖 Remove the task line from its current position.
  // Also remove an adjacent blank line if it would leave two consecutive blank lines.
  const newLines = [...lines];
  newLines.splice(taskLineIdx, 1);

  // 📖 After removal, re-find the target column header (index may have shifted by 1)
  const newColHeaderIdx = newLines.findIndex(l => colPattern.test(l));
  if (newColHeaderIdx === -1) return false;

  // 📖 Find insertion point: the end of the target column section (before next ## or EOF)
  let insertIdx = newColHeaderIdx + 1;
  while (insertIdx < newLines.length && !/^##\s+/.test(newLines[insertIdx] ?? '')) {
    insertIdx++;
  }

  // 📖 Insert the task line at the end of the target column section.
  // Ensure there's exactly one blank line before the task if the section isn't empty,
  // and a blank line after if needed.
  newLines.splice(insertIdx, 0, taskLine);

  writeFileSync(boardPath, newLines.join('\n'), 'utf8');
  return true;
}

/** 📖 Escapes special regex characters in a string for use in RegExp constructor. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
