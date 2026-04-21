/**
 * @file Card grouping utility for visual stacking
 * @description Pure functions that group board tasks by shared `[bracket]` tags
 * or `#hashtag` markers in their titles. When 2+ cards in the same column share
 * the same group key, they are collected into a `TaskGroup` that the UI renders
 * as a collapsible stack.
 *
 * 📖 Grouping is purely visual — it does not modify task files or store state.
 * The Column component calls `groupTasksByTag` inside a `useMemo` so the
 * grouping recomputes reactively whenever filtered tasks change.
 *
 * 📖 Bracket tags (`[subject]`) take priority over hashtags (`#word`) when both
 * are present in the same title. Only the first hashtag is used as a group key.
 *
 * @functions
 *  → extractGroupKey — pulls the grouping key from a task title
 *  → groupTasksByTag — converts a flat task array into mixed singles/stacks
 *
 * @exports TaskGroup, SingleTask, ColumnItem, extractGroupKey, groupTasksByTag
 * @see src/components/CardStack.tsx
 * @see src/components/Column.tsx
 */

import type { BoardTask } from './types';

// 📖 A stack of 2+ tasks sharing the same title tag
export interface TaskGroup {
  type: 'stack';
  groupKey: string;    // normalized key, e.g. "[refactor]" or "#auth"
  displayKey: string;  // human-readable label, e.g. "refactor" or "#auth"
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
 * Extract the grouping key from a task title.
 * Bracket tags take priority over hashtags. Returns null if no key found.
 *
 * @example
 * extractGroupKey("[perf] Fix query")   → "[perf]"
 * extractGroupKey("Fix #auth bug")      → "#auth"
 * extractGroupKey("Plain title")        → null
 */
export function extractGroupKey(title: string): string | null {
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
    const key = extractGroupKey(task.title);
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
