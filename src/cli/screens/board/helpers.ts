/**
 * @file Board screen — pure helpers
 * @description Text layout (truncate/pad/hyperlink), terminal geometry, and
 * the scroll-window computation shared between the render path
 * (KanbanColumn) and mouse hit-testing (taskHitAt / handleMouseClick) in
 * board.tsx so the two can never diverge.
 *
 * @functions
 *  → truncate, pad — fixed-width text helpers for column cells
 *  → terminalHyperlink, webLinkLabel — OSC 8 clickable links in supporting terminals
 *  → termWidth, calcColWidth — terminal geometry
 *  → columnAccentColor — per-column accent color from its name
 *  → getTitleCategory — bracket-tag / hashtag extraction for category rows
 *  → computeScrollIdx — shared scroll-window computation
 *
 * @exports TASKS_START_Y, truncate, terminalHyperlink, webLinkLabel, pad,
 *   termWidth, calcColWidth, RE_HEADER, RE_SUBTASK, RE_DONE, RE_BRACKET_TAG,
 *   columnAccentColor, getTitleCategory, computeScrollIdx
 */

import type { BoardTask } from '../../../lib/types.js';
import { MENU_HEIGHT } from '../../components/task-context-menu.js';

/**
 * 📖 Number of terminal lines before task rows start.
 *
 * Line 1: BoardHeader text (KANDOWN v0.7.0 Project Kanban … hints)
 * Line 2: empty (marginBottom={1} on BoardHeader)
 * Line 3: Column headers (Backlog (5), Todo (3), …)
 * Line 4: Column dividers (─────)
 * Line 5: First task row → index 0
 *
 * So terminal line N corresponds to task index N − TASKS_START_Y.
 */
export const TASKS_START_Y = 5;

export function truncate(str: string, maxLen: number): string {
  if (maxLen <= 0) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + '…';
}

/**
 * 📖 OSC 8 terminal hyperlink. Terminals that support it make the label
 * clickable; terminals without hyperlink support simply render the visible
 * label. Callers truncate/pad the plain label first so layout remains stable.
 */
export function terminalHyperlink(label: string, url: string): string {
  return `]8;;${url}${label}]8;;`;
}

export function webLinkLabel(url: string): string {
  return `↗ ${url.replace(/^https?:\/\//, '')}`;
}

export function pad(str: string, len: number): string {
  const t = truncate(str, len);
  return t + ' '.repeat(Math.max(0, len - t.length));
}

export function termWidth(): number {
  return process.stdout.columns || 80;
}

export function calcColWidth(numCols: number): number {
  const available = termWidth() - (numCols - 1);
  return Math.max(12, Math.floor(available / numCols));
}

// 📖 Hoisted regexes
export const RE_HEADER      = /^#{1,3}\s/;
export const RE_SUBTASK     = /^\s*-\s+\[([ xX])\]/;
export const RE_DONE        = /^\s*-\s+\[x\]/i;
export const RE_BRACKET_TAG = /^\[([^\]]+)\]\s*/;

export function columnAccentColor(name: string): string {
  const normalized = name.toLowerCase();
  if (/backlog/.test(normalized)) return 'magenta';
  if (/todo/.test(normalized)) return 'cyan';
  if (/progress|doing/.test(normalized)) return 'yellow';
  if (/review/.test(normalized)) return 'blue';
  if (/done|archive|closed|complete/.test(normalized)) return 'green';
  return 'cyan';
}

/**
 * 📖 Returns the category of a board task (frontmatter `category:` field,
 * legacy leading bracket or hashtag in the title). Used to decide whether a
 * task should render as CategoryTaskRow. The label (without brackets / hash)
 * feeds the category line; the key mirrors `extractGroupKey` from
 * src/lib/grouping.ts.
 */
export function getTitleCategory(task: {
  title: string;
  category?: string | null;
}): { key: string; label: string } | null {
  const category = (task.category || '').trim();
  if (category) return { key: `[${category.toLowerCase()}]`, label: category };
  // 📖 Defensive: malformed files can carry a non-string title (YAML array);
  // treat it as having no bracket or hashtag rather than crashing the board.
  const title = typeof task.title === 'string' ? task.title : '';
  const bracket = title.match(/^\[([^\]]+)\]\s*/);
  if (bracket) return { key: `[${bracket[1].toLowerCase()}]`, label: bracket[1] };
  const hash = title.match(/#(\w+)/);
  if (hash) return { key: `#${hash[1].toLowerCase()}`, label: `#${hash[1]}` };
  return null;
}

/**
 * 📖 Shared scroll computation for a column. Returns the first visible task
 * index so that `focusedRow` fits in `maxTasksHeight`, accounting for variable
 * task heights (3-line category rows), the inline context menu, separators,
 * and BOTH scroll-indicator lines. Used by the render (KanbanColumn) and the
 * mouse hit-testing (taskHitAt / handleMouseClick) so they can never diverge.
 */
export function computeScrollIdx(
  tasks: BoardTask[],
  focusedRow: number,
  contextMenuRow: number,
  maxTasksHeight: number,
): number {
  if (focusedRow < 0) return 0;
  // 📖 Reserve the "▼ n more" line whenever tasks below the focus could be
  // cut off — otherwise the focused row can land exactly behind the bottom
  // indicator and become invisible while still being the cursor target.
  const reserveBottom = focusedRow < tasks.length - 1 ? 1 : 0;
  let currentScroll = 0;
  while (currentScroll < focusedRow) {
    const hasTopIndicator = currentScroll > 0;
    const adjustedMaxHeight = maxTasksHeight - (hasTopIndicator ? 1 : 0) - reserveBottom;
    let h = 0;
    for (let k = currentScroll; k <= focusedRow; k++) {
      h += getTitleCategory(tasks[k]) !== null ? 3 : 1;
      if (contextMenuRow === k) h += MENU_HEIGHT;
      if (k < focusedRow) h += 1; // separator
    }
    if (h <= adjustedMaxHeight) break;
    currentScroll++;
  }
  return currentScroll;
}
