/**
 * @file Zustand store — shared helpers & module-level state
 * @description Pure/async helpers plus the module-level mutable state (toast
 * counter, notification snapshots, watcher timers, in-flight bulk-mutation
 * guard) that multiple store slices need to read or write. Kept as module
 * state — not store state — because it's implementation bookkeeping, not
 * data the UI renders.
 */

import type { Column, BoardTask, KandownConfig, Subtask } from '../types';
import {
  listTaskIds,
  readTaskFileStrict,
  readTaskFile as fsReadTaskFile,
  writeTaskFile as fsWriteTaskFile,
  serverListTasks,
  serverReadTaskFile,
} from '../filesystem';
import { extractSubtasks } from '../parser';
import { applyProjectTheme } from '../theme';
import { buildBoardUrl, getTaskIdFromLocation } from '../task-url';
import type { LoadedTask, NotificationTaskSnapshot } from './types';

export function updateBrowserUrl(nextUrl: string, replace = false): void {
  if (typeof window === 'undefined') return;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === nextUrl) return;
  if (replace) {
    window.history.replaceState({}, '', nextUrl);
  } else {
    window.history.pushState({}, '', nextUrl);
  }
  window.dispatchEvent(new Event('kandown:urlchange'));
}

export function updateProjectBoardUrl(projectName: string): void {
  if (typeof window !== 'undefined' && getTaskIdFromLocation(window.location)) return;
  updateBrowserUrl(buildBoardUrl(projectName));
}

export function nextTaskId(columns: Column[], archivedTasks: BoardTask[] = []): string {
  let maxN = -1;
  for (const task of [...columns.flatMap(column => column.tasks), ...archivedTasks]) {
    const m = task.id.match(/^t(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return 't' + (maxN + 1);
}

export async function readAllTasksServer(): Promise<LoadedTask[]> {
  const ids = await serverListTasks();
  const tasks = await Promise.all(ids.map(async (id) => {
    const { frontmatter, body } = await serverReadTaskFile(id);
    const normalizedFrontmatter = {
      ...frontmatter,
      id: frontmatter.id || id,
      status: frontmatter.status || 'Backlog',
    };
    const { subtasks, bodyWithoutSubtasks } = extractSubtasks(body);
    return { id, frontmatter: normalizedFrontmatter, body: bodyWithoutSubtasks, subtasks };
  }));
  return tasks;
}

export async function readAllTasks(
  tasksDirHandle: FileSystemDirectoryHandle,
): Promise<{ tasks: LoadedTask[]; failedIds: string[] }> {
  const ids = await listTaskIds(tasksDirHandle);
  // 📖 Use readTaskFileStrict per file so we can tell "file deleted externally"
  // (benign, skip silently) from "file exists but unreadable" (actionable,
  // report to failedIds) — see t102. Promise.allSettled would also work but the
  // per-file Result is more precise about the reason.
  const results = await Promise.all(
    ids.map(async (id) => {
      const result = await readTaskFileStrict(tasksDirHandle, id);
      return { id, result };
    }),
  );

  const tasks: LoadedTask[] = [];
  const failedIds: string[] = [];
  for (const { id, result } of results) {
    if (result.ok) {
      const frontmatter = {
        ...result.task.frontmatter,
        id: result.task.frontmatter.id || id,
        status: result.task.frontmatter.status || 'Backlog',
      };
      const { subtasks, bodyWithoutSubtasks } = extractSubtasks(result.task.body);
      tasks.push({ id, frontmatter, body: bodyWithoutSubtasks, subtasks });
    } else if (result.reason === 'not-found') {
      // File deleted externally — skip silently.
      continue;
    } else {
      failedIds.push(id);
    }
  }
  return { tasks, failedIds };
}

/**
 * 📖 Persists status + order metadata back to each affected task file.
 * Returns the list of ids that failed to persist so the caller can warn the
 * user and roll back the optimistic state (t116 / t104).
 */
export async function persistColumnOrder(
  tasksDirHandle: FileSystemDirectoryHandle | null,
  columns: Column[],
  _columnNames: string[],
): Promise<{ failedIds: string[] }> {
  const writes: Array<{ id: string; promise: Promise<void> }> = [];

  for (const column of columns) {
    const status = column.name;
    column.tasks.forEach((task, index) => {
      const promise = (async () => {
        const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, task.id);
        await fsWriteTaskFile(tasksDirHandle, task.id, {
          ...frontmatter,
          id: task.id,
          status,
          order: index,
        }, body);
      })();
      writes.push({ id: task.id, promise });
    });
  }

  const settled = await Promise.allSettled(writes.map(w => w.promise));
  const failedIds: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'rejected') failedIds.push(writes[index].id);
  });
  return { failedIds };
}

export function applyConfigTheme(config: KandownConfig): void {
  applyProjectTheme(config.ui.theme, config.ui.skin, config.ui.font, config.ui.background);
}

export function buildNotificationSnapshot(task: LoadedTask): NotificationTaskSnapshot {
  return {
    title: task.frontmatter.title || task.id,
    status: task.frontmatter.status || 'Backlog',
    body: task.body,
    subtasks: task.subtasks,
  };
}

/** 📖 Module-level cache of the last-known task snapshot, used to diff
 * against on the next file-watcher tick to decide which notifications fire.
 * Not store state: components never render it directly. */
export const notificationSnapshots = new Map<string, NotificationTaskSnapshot>();

export function syncNotificationSnapshots(tasks: LoadedTask[]): void {
  notificationSnapshots.clear();
  tasks.forEach(task => {
    notificationSnapshots.set(task.id, buildNotificationSnapshot(task));
  });
}

export function getProjectNameFromServerRoot(serverRoot: string): string {
  const parts = serverRoot.split(/[\\/]+/).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart === '.kandown') return parts[parts.length - 2] ?? 'Project';
  return lastPart ?? 'Project';
}

export function getCompletedSubtaskCount(previous: Subtask[], current: Subtask[]): number {
  return current.reduce((count, subtask, index) => {
    const wasDone = previous[index]?.done ?? false;
    return count + (subtask.done && !wasDone ? 1 : 0);
  }, 0);
}

export function didTaskBodyChange(previous: NotificationTaskSnapshot, current: NotificationTaskSnapshot): boolean {
  const previousSubtaskText = previous.subtasks.map(subtask => ({
    text: subtask.text,
    description: subtask.description ?? '',
    report: subtask.report ?? '',
  }));
  const currentSubtaskText = current.subtasks.map(subtask => ({
    text: subtask.text,
    description: subtask.description ?? '',
    report: subtask.report ?? '',
  }));

  return (
    previous.title !== current.title ||
    previous.body !== current.body ||
    JSON.stringify(previousSubtaskText) !== JSON.stringify(currentSubtaskText)
  );
}

export let toastIdCounter = 0;
export function nextToastId(): number {
  return ++toastIdCounter;
}

/** 📖 Debounce timers for "task edited on disk" notifications, keyed by task id. */
export const taskEditTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** 📖 Server-mode polling interval for detecting external file changes via REST API. */
export let serverPollInterval: ReturnType<typeof setInterval> | null = null;
export function setServerPollInterval(interval: ReturnType<typeof setInterval> | null): void {
  serverPollInterval = interval;
}
/** 📖 Prevents two destructive batch operations from racing each other when a
 * user double-clicks a terminal-column action or a bulk-action-bar control. */
export let bulkMutationInFlight = false;
export function setBulkMutationInFlight(value: boolean): void {
  bulkMutationInFlight = value;
}

export function uniqueTaskIds(taskIds: string[]): string[] {
  return [...new Set(taskIds.filter(id => typeof id === 'string' && id.trim().length > 0))];
}
