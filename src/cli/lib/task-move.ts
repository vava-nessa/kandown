/**
 * @file Authoritative Node task move coordinator
 * @description Runs the shared dependency policy and enabled extension gates
 * before persisting a web move. The daemon and Vite development backend call
 * this module so browser moves have one Node-side mutation authority while the
 * CLI can keep its existing synchronous command path.
 *
 * @functions
 *  → moveTaskWithGates - validate, gate, persist, and dispatch one task move
 * @exports MoveTaskResult, moveTaskWithGates
 * @see src/cli/lib/server.ts
 * @see src/cli/lib/extensions-cli.ts
 */

import { atomicWriteFileSync } from './atomic-write';
import { findTaskPath, listTaskIds, readBoard, readTask } from './board-reader';
import { loadConfig } from './config';
import { runExtensionMoveGates } from './extensions-cli';
import { DependencyGateError, resolveDependencyStatus, resolveTransition } from '../../lib/dependencies';
import type { ExtensionHost } from '../../lib/extensions/host';
import { serializeTaskFile } from '../../lib/serializer';
import { stampUpdated } from '../../lib/task-meta';
import type { MoveTaskResult } from '../../lib/types';

export type { MoveTaskResult } from '../../lib/types';

function userReadyExtensionReason(taskId: string, target: string, reason?: string): string {
  return `Cannot move ${taskId} to ${target}: ${reason ?? 'blocked by an extension'}`;
}

/** Tail promise for each project's authoritative mutation queue. */
const moveLocks = new Map<string, Promise<void>>();

async function withProjectMoveLock<T>(projectKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = moveLocks.get(projectKey) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolveLock) => { release = resolveLock; });
  const tail = previous.then(() => current);
  moveLocks.set(projectKey, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (moveLocks.get(projectKey) === tail) moveLocks.delete(projectKey);
  }
}

/**
 * 📖 Runs both authoritative gate layers before writing. The target index is
 * interpreted against the target column after the moving task is removed, then
 * both affected columns are reindexed to preserve the web board's existing
 * ordering contract.
 */
async function performTaskMove(
  host: ExtensionHost,
  kandownDir: string,
  taskId: string,
  targetStatus: string,
  toIndex?: number,
): Promise<MoveTaskResult> {
  const taskPath = findTaskPath(kandownDir, taskId);
  if (!taskPath) {
    return { ok: false, kind: 'not-found', reason: `Task not found: ${taskId}` };
  }

  const config = loadConfig(kandownDir);
  const board = readBoard(kandownDir);
  const sourceColumn = board.columns.find((column) => column.tasks.some((task) => task.id === taskId));
  const targetColumn = board.columns.find((column) => column.name.toLowerCase() === targetStatus.toLowerCase());
  if (!sourceColumn) {
    return { ok: false, kind: 'not-found', reason: `Task is not active: ${taskId}` };
  }
  if (!targetColumn) {
    return { ok: false, kind: 'invalid-target', reason: `Unknown status: ${targetStatus}` };
  }

  const target = targetColumn.name;
  const parsed = readTask(kandownDir, taskId);
  const from = typeof parsed.frontmatter.status === 'string'
    ? parsed.frontmatter.status
    : sourceColumn.name;

  const allTasks = listTaskIds(kandownDir).map((id) => {
    try {
      return readTask(kandownDir, id);
    } catch {
      return null;
    }
  }).filter((task): task is NonNullable<typeof task> => task !== null);
  const snapshot = resolveDependencyStatus(allTasks, config);
  const dependencyVerdict = resolveTransition(parsed, target, snapshot, config);
  if (!dependencyVerdict.allowed) {
    const error = new DependencyGateError(taskId, target, dependencyVerdict.blockedBy);
    return {
      ok: false,
      kind: 'dependency',
      reason: error.message,
      blockedBy: dependencyVerdict.blockedBy,
    };
  }

  const extensionVerdict = await runExtensionMoveGates(host, kandownDir, taskId, from, target);
  if (!extensionVerdict.allowed) {
    return {
      ok: false,
      kind: 'extension',
      reason: userReadyExtensionReason(taskId, target, extensionVerdict.reason),
    };
  }

  const sourceIds = sourceColumn.tasks.map((task) => task.id).filter((id) => id !== taskId);
  const targetIds = sourceColumn === targetColumn
    ? sourceIds
    : targetColumn.tasks.map((task) => task.id).filter((id) => id !== taskId);
  const insertionIndex = toIndex === undefined
    ? targetIds.length
    : Math.max(0, Math.min(Math.trunc(toIndex), targetIds.length));
  targetIds.splice(insertionIndex, 0, taskId);

  const layouts = sourceColumn === targetColumn
    ? [{ status: target, ids: targetIds }]
    : [
        // 📖 Persist the target first, and the moved task first within it. If
        // that authoritative write fails, no neighbor order has changed.
        { status: target, ids: targetIds },
        { status: sourceColumn.name, ids: sourceIds },
      ];

  const failedIds: string[] = [];
  for (const layout of layouts) {
    const entries = layout.ids.map((id, order) => ({ id, order }));
    entries.sort((left, right) => left.id === taskId ? -1 : right.id === taskId ? 1 : left.order - right.order);
    for (const { id, order } of entries) {
      const path = findTaskPath(kandownDir, id);
      if (!path) {
        failedIds.push(id);
        continue;
      }
      try {
        const current = readTask(kandownDir, id);
        const nextContent = serializeTaskFile(stampUpdated({
          ...current.frontmatter,
          id,
          status: layout.status,
          order,
        }), current.body);
        atomicWriteFileSync(path, nextContent);
      } catch {
        failedIds.push(id);
      }
    }
  }

  const uniqueFailedIds = [...new Set(failedIds)];
  if (uniqueFailedIds.includes(taskId)) {
    return {
      ok: false,
      kind: 'write',
      reason: `Failed to persist move for ${taskId}`,
    };
  }

  try {
    const moved = readTask(kandownDir, taskId);
    const frontmatter = moved.frontmatter as Record<string, unknown>;
    const event = {
      type: 'task:afterMove' as const,
      task: {
        id: taskId,
        frontmatter,
        plugins: frontmatter.plugins as Record<string, unknown> | undefined,
      },
      from,
      to: target,
    };
    host.dispatchSync(event);
    host.dispatchLifecycle(event);
  } catch {
    // Extension post-move handlers are isolated and never undo a persisted move.
  }

  return { ok: true, from, to: target, failedIds: uniqueFailedIds };
}

/** Serializes the complete read, gate and write transaction per project. */
export async function moveTaskWithGates(
  host: ExtensionHost,
  kandownDir: string,
  taskId: string,
  targetStatus: string,
  toIndex?: number,
): Promise<MoveTaskResult> {
  return withProjectMoveLock(kandownDir, () => (
    performTaskMove(host, kandownDir, taskId, targetStatus, toIndex)
  ));
}
