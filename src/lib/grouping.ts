/**
 * @file Card grouping utility for visual stacking
 * @description Pure functions that group board tasks by category (frontmatter
 * `category:` field, legacy leading `[bracket]` title tag) or `#hashtag` markers
 * in their titles. When 2+ cards in the same column share the same group key,
 * they are collected into a `TaskGroup` that the UI renders as a collapsible stack.
 *
 * 📖 Grouping is purely visual — it does not modify task files or store state.
 * The Column component calls `groupTasksByTag` inside a `useMemo` so the
 * grouping recomputes reactively whenever filtered tasks change.
 *
 * 📖 The frontmatter category takes priority over a legacy title bracket, which
 * takes priority over a hashtag when several are present on the same task.
 *
 * @functions
 *  → extractGroupKey — pulls the grouping key from a board task
 *  → groupTasksByTag — converts a flat task array into mixed singles/stacks
 *
 * @exports TaskGroup, SingleTask, ColumnItem, extractGroupKey, groupTasksByTag
 * @see src/components/CardStack.tsx
 * @see src/components/Column.tsx
 */

import type { BoardTask } from './types';

// 📖 A stack of 2+ tasks sharing the same group key
export interface TaskGroup {
  type: 'stack';
  groupKey: string;    // normalized key, e.g. "[ui]" or "#auth"
  displayKey: string;  // human-readable label, e.g. "ui" or "#auth"
  tasks: BoardTask[];
}

// 📖 A single ungrouped task (no matching tag or only one in column)
export interface SingleTask {
  type: 'single';
  task: BoardTask;
}

export type ColumnItem = TaskGroup | SingleTask;

// 📖 Bracket pattern: must be at the start of the title, e.g. "[perf] Fix query"
const BRACKET_RE = /^\[([^\]]+)\]\s*/;

// 📖 Hashtag pattern: #word anywhere in title (first match wins), e.g. "Fix #auth bug"
const HASHTAG_RE = /#(\w+)/;

/**
 * Extract the grouping key from a board task.
 * The frontmatter category wins, then legacy title brackets, then hashtags.
 * Returns null if no key found.
 *
 * @example
 * extractGroupKey({ title: "Fix query", category: "UI" }) → "[ui]"
 * extractGroupKey({ title: "[perf] Fix query" })         → "[perf]"
 * extractGroupKey({ title: "Fix #auth bug" })           → "#auth"
 * extractGroupKey({ title: "Plain title" })             → null
 */
export function extractGroupKey(task: { title: string; category?: string | null }): string | null {
  const category = (task.category || '').trim();
  if (category) return `[${category.toLowerCase()}]`;

  // 📖 Defensive: malformed files can carry a non-string title (YAML array);
  // treat it as having no bracket or hashtag rather than crashing the board.
  const title = typeof task.title === 'string' ? task.title : '';
  const bracketMatch = title.match(BRACKET_RE);
  if (bracketMatch) return `[${bracketMatch[1].toLowerCase()}]`;

  const hashMatch = title.match(HASHTAG_RE);
  if (hashMatch) return `#${hashMatch[1].toLowerCase()}`;

  return null;
}

/**
 * Build a display-friendly label from a group key.
 * Strips brackets, keeps hashtag prefix.
 */
function toDisplayKey(groupKey: string): string {
  if (groupKey.startsWith('[') && groupKey.endsWith(']')) {
    return groupKey.slice(1, -1);
  }
  return groupKey;
}

/**
 * Group a flat array of tasks into stacks (2+ sharing same key) and singles.
 * Preserves the original task order — a stack appears at the position of its
 * first member. Tasks without a group key (or whose key appears only once)
 * remain as SingleTask items.
 */
export function groupTasksByTag(tasks: BoardTask[]): ColumnItem[] {
  // 📖 Phase 1: extract keys and count occurrences
  const keyByTaskId = new Map<string, string | null>();
  const countByKey = new Map<string, number>();

  for (const task of tasks) {
    const key = extractGroupKey(task);
    keyByTaskId.set(task.id, key);
    if (key) {
      countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    }
  }

  // 📖 Phase 2: build result, collecting groups at the position of first member
  const result: ColumnItem[] = [];
  const groupMap = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const key = keyByTaskId.get(task.id) ?? null;

    // 📖 No key or key appears only once → single card
    if (!key || (countByKey.get(key) ?? 0) < 2) {
      result.push({ type: 'single', task });
      continue;
    }

    // 📖 Key appears 2+ times → add to existing group or create one
    const existing = groupMap.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      const group: TaskGroup = {
        type: 'stack',
        groupKey: key,
        displayKey: toDisplayKey(key),
        tasks: [task],
      };
      groupMap.set(key, group);
      result.push(group);
    }
  }

  return result;
}
