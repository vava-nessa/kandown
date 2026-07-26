/**
 * @file Zustand store slice — board mutations
 * @description Column CRUD, task move/reorder/create/delete/archive, task
 * selection, and bulk operations. Every mutation here is optimistic: it
 * updates `columns`/caches immediately, then persists to disk/API and rolls
 * back on failure — see the per-action comments for what state is restored.
 */

import type { StateCreator } from 'zustand';
import type { BoardTask, TaskFrontmatter } from '../types';
import {
  readTaskFile as fsReadTaskFile,
  writeTaskFile as fsWriteTaskFile,
  deleteTaskFile as fsDeleteTaskFile,
  archiveTaskFile as fsArchiveTaskFile,
  unarchiveTaskFile as fsUnarchiveTaskFile,
  readTaskFileStrict,
  isServerMode,
} from '../filesystem';
import { isTerminalStatus, terminalStatus } from '../dependencies';
import { DiskFullError } from '../errors';
import { withRetry } from '../retry';
import { parseQuickAddInput } from '../quick-add-parser';
import type { State } from './types';
import {
  bulkMutationInFlight,
  nextTaskId,
  persistColumnOrder,
  setBulkMutationInFlight,
  uniqueTaskIds,
} from './helpers';

export interface BoardSlice {
  moveTask: State['moveTask'];
  reorderInColumn: State['reorderInColumn'];
  addColumn: State['addColumn'];
  renameColumn: State['renameColumn'];
  reorderColumns: State['reorderColumns'];
  deleteColumn: State['deleteColumn'];
  createTask: State['createTask'];
  deleteTask: State['deleteTask'];
  archiveTask: State['archiveTask'];
  unarchiveTask: State['unarchiveTask'];
  setShowArchives: State['setShowArchives'];
  setShowMetadata: State['setShowMetadata'];
  selectedTaskIds: State['selectedTaskIds'];
  toggleTaskSelection: State['toggleTaskSelection'];
  clearTaskSelection: State['clearTaskSelection'];
  bulkMoveTasks: State['bulkMoveTasks'];
  bulkDeleteTasks: State['bulkDeleteTasks'];
  bulkArchiveTasks: State['bulkArchiveTasks'];
}

export const createBoardSlice: StateCreator<State, [], [], BoardSlice> = (set, get) => ({
  selectedTaskIds: [],
  toggleTaskSelection: (id: string) => {
    set(state => {
      const exists = state.selectedTaskIds.includes(id);
      const next = exists ? state.selectedTaskIds.filter(i => i !== id) : [...state.selectedTaskIds, id];
      return { selectedTaskIds: next };
    });
  },

  clearTaskSelection: () => set({ selectedTaskIds: [] }),

  bulkMoveTasks: async (targetColumn: string) => {
    const { selectedTaskIds, columns, moveTask } = get();
    for (const id of selectedTaskIds) {
      // Find source column for task
      let sourceCol = 'Backlog';
      for (const col of columns) {
        if (col.tasks.some(t => t.id === id)) {
          sourceCol = col.name;
          break;
        }
      }
      await moveTask(id, sourceCol, targetColumn);
    }
    set({ selectedTaskIds: [] });
  },

  bulkDeleteTasks: async (taskIds?: string[]) => {
    const { selectedTaskIds, tasksDirHandle, drawerTaskId } = get();
    const ids = uniqueTaskIds(taskIds ?? selectedTaskIds);
    if (ids.length === 0 || (!tasksDirHandle && !isServerMode())) return;
    if (bulkMutationInFlight) {
      get().toast('Another bulk action is already running', 'warning');
      return;
    }

    setBulkMutationInFlight(true);
    try {
      const settled = await Promise.allSettled(
        ids.map(id => withRetry(
          () => fsDeleteTaskFile(tasksDirHandle || null, id),
          { maxAttempts: 3 },
        )),
      );
      const succeededIds = ids.filter((_, index) => settled[index]?.status === 'fulfilled');
      const failedIds = ids.filter((_, index) => settled[index]?.status === 'rejected');

      if (drawerTaskId && succeededIds.includes(drawerTaskId)) get().closeDrawer();
      set(state => ({
        selectedTaskIds: state.selectedTaskIds.filter(id => !succeededIds.includes(id)),
      }));
      await get().reloadBoard();

      if (failedIds.length > 0) {
        get().toast(`${succeededIds.length} deleted, ${failedIds.length} could not be deleted`, 'warning', 8000);
      } else {
        get().toast(`Deleted ${succeededIds.length} task${succeededIds.length === 1 ? '' : 's'}`);
      }
    } finally {
      setBulkMutationInFlight(false);
    }
  },

  bulkArchiveTasks: async (taskIds: string[]) => {
    const { tasksDirHandle, drawerTaskId } = get();
    const ids = uniqueTaskIds(taskIds);
    if (ids.length === 0 || (!tasksDirHandle && !isServerMode())) return;
    if (bulkMutationInFlight) {
      get().toast('Another bulk action is already running', 'warning');
      return;
    }

    setBulkMutationInFlight(true);
    try {
      const settled = await Promise.allSettled(ids.map(async id => {
        // 📖 Strict reads prevent a failed read from turning into an empty
        // placeholder task that could overwrite real data during archiving.
        const result = await readTaskFileStrict(tasksDirHandle || null, id);
        if (!result.ok) {
          throw new Error(`Task ${id} could not be read (${result.reason})`);
        }
        await withRetry(
          () => fsArchiveTaskFile(
            tasksDirHandle || null,
            id,
            { ...result.task.frontmatter, id, archived: true },
            result.task.body,
          ),
          { maxAttempts: 3 },
        );
      }));
      const succeededIds = ids.filter((_, index) => settled[index]?.status === 'fulfilled');
      const failedIds = ids.filter((_, index) => settled[index]?.status === 'rejected');

      if (drawerTaskId && succeededIds.includes(drawerTaskId)) get().closeDrawer();
      set(state => ({
        selectedTaskIds: state.selectedTaskIds.filter(id => !succeededIds.includes(id)),
      }));
      await get().reloadBoard();

      if (failedIds.length > 0) {
        get().toast(`${succeededIds.length} archived, ${failedIds.length} could not be archived`, 'warning', 8000);
      } else {
        get().toast(`Archived ${succeededIds.length} task${succeededIds.length === 1 ? '' : 's'}`);
      }
    } finally {
      setBulkMutationInFlight(false);
    }
  },

  moveTask: async (taskId, fromCol, toCol, toIndex) => {
    const { columns, config, taskContents, searchMatches } = get();
    const isServer = isServerMode();
    if (!isServer && !get().tasksDirHandle) return;
    const fromColObj = columns.find(c => c.name === fromCol);
    const toColObj = columns.find(c => c.name === toCol);
    if (!fromColObj || !toColObj) return;
    const taskIdx = fromColObj.tasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) return;
    const movingTask = fromColObj.tasks[taskIdx];
    if (!movingTask) return;

    // 📖 Terminal-status gate: if the target column is the last configured
    // column (default "Done") and the task has unresolved dependencies, refuse
    // the move before any optimistic state change. Other transitions stay
    // free — the gate is only on the final hop, matching how GitHub / Linear
    // / Jira treat blocking relations.
    if (isTerminalStatus(toCol, config)) {
      const depStatus = new Map<string, { exists: boolean; resolved: boolean }>();
      const terminalLower = terminalStatus(config).toLowerCase();
      for (const col of columns) {
        for (const t of col.tasks) {
          const isArch = t.frontmatter && (t.frontmatter.archived === true || t.frontmatter.archived === 'true');
          depStatus.set(t.id, {
            exists: true,
            resolved: isArch || (t.id === taskId) || col.name.toLowerCase() === terminalLower,
          });
        }
      }
      // 📖 Self-references and unknown ids are ignored (file header note).
      const blocked: string[] = [];
      for (const dep of movingTask.dependsOn) {
        if (typeof dep !== 'string' || !dep.trim() || dep === taskId) continue;
        const r = depStatus.get(dep);
        if (!r || !r.resolved) blocked.push(dep);
      }
      if (blocked.length > 0) {
        const list = blocked.length === 1
          ? blocked[0]
          : `${blocked.slice(0, -1).join(', ')} and ${blocked[blocked.length - 1]}`;
        get().toast(`Cannot move ${taskId} to ${toCol}: blocked by ${list}`, 'error');
        return;
      }
    }

    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const newFrom = newColumns.find(c => c.name === fromCol)!;
    const newTo = newColumns.find(c => c.name === toCol)!;
    const [task] = newFrom.tasks.splice(taskIdx, 1);
    if (/done|termin|closed|complet/i.test(toCol)) task.checked = true;
    else task.checked = false;
    if (toIndex !== undefined) newTo.tasks.splice(toIndex, 0, task);
    else newTo.tasks.push(task);

    // Optimistic
    set({ columns: newColumns });
    try {
      const { tasksDirHandle } = get();
      if (!tasksDirHandle && !isServer) return;
      const affected = fromCol === toCol
        ? newColumns.filter(c => c.name === toCol)
        : newColumns.filter(c => c.name === fromCol || c.name === toCol);
      // 📖 Retry transient failures (disk full may resolve between attempts)
      // before rolling back. Non-retryable errors (permission denied, etc.)
      // bubble up immediately to the catch below (t105).
      const { failedIds } = await withRetry(
        () => persistColumnOrder(tasksDirHandle ?? null, affected, config.board.columns),
        { maxAttempts: 3 },
      );

      if (failedIds.length > 0) {
        // 📖 Partial persistence failure: some tasks moved on disk, others did
        // not. Best-effort recovery is to reload from disk so the board
        // reflects reality, plus warn the user (t104/t116).
        const msg = failedIds.length === 1
          ? `Could not save move for ${failedIds[0]}`
          : `${failedIds.length} tasks could not be moved`;
        get().toast(msg, 'warning', 8000);
        await get().reloadBoard();
      }
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — move was not saved. Free up space and try again.', 'error', 8000);
      } else {
        get().toast('Failed to save: ' + err.message, 'error');
      }
      // 📖 Full rollback of the optimistic update. We restore columns AND the
      // taskContents / searchMatches caches captured before mutation so the
      // store stays internally consistent (t104).
      set({ columns, taskContents, searchMatches });
    }
  },

  reorderInColumn: async (colName, fromIndex, toIndex) => {
    const { columns, tasksDirHandle, config, taskContents, searchMatches } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const newColumns = columns.map(c => ({ ...c, tasks: [...c.tasks] }));
    const col = newColumns.find(c => c.name === colName);
    if (!col) return;
    const [task] = col.tasks.splice(fromIndex, 1);
    col.tasks.splice(toIndex, 0, task);
    set({ columns: newColumns });
    try {
      const { tasksDirHandle } = get();
      const isServer = isServerMode();
      if (!tasksDirHandle && !isServer) return;
      const { failedIds } = await withRetry(
        () => persistColumnOrder(tasksDirHandle ?? null, [col], config.board.columns),
        { maxAttempts: 3 },
      );
      if (failedIds.length > 0) {
        get().toast(`Could not save reorder for ${failedIds.length} task(s)`, 'warning', 8000);
        await get().reloadBoard();
      }
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — reorder was not saved.', 'error', 8000);
      } else {
        get().toast('Failed to save: ' + err.message, 'error');
      }
      // 📖 Restore columns + caches captured pre-mutation (t104).
      set({ columns, taskContents, searchMatches });
    }
  },

  addColumn: async (name) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const { config } = get();
    if (config.board.columns.some(col => col.toLowerCase() === cleanName.toLowerCase())) return;
    await get().updateConfig(current => ({
      ...current,
      board: {
        ...current.board,
        columns: [...current.board.columns, cleanName],
      },
    }));
    await get().reloadBoard();
  },

  renameColumn: async (oldName, newName) => {
    const cleanName = newName.trim();
    const { columns, tasksDirHandle, config } = get();
    if (!tasksDirHandle || !cleanName || cleanName.toLowerCase() === oldName.toLowerCase()) return;
    if (columns.some(col => col.name.toLowerCase() === cleanName.toLowerCase())) {
      get().toast('Column already exists', 'error');
      return;
    }

    const oldColumns = columns;
    const renamedColumns = columns.map(col =>
      col.name === oldName ? { ...col, name: cleanName } : col
    );
    set({ columns: renamedColumns });

    try {
      const targetColumn = oldColumns.find(col => col.name === oldName);
      if (targetColumn) {
        // 📖 Tolerate per-task failures so one unreadable file doesn't abort a
        // column rename (t116).
        const settled = await Promise.allSettled(targetColumn.tasks.map(async (task, index) => {
          const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle, task.id);
          await fsWriteTaskFile(tasksDirHandle, task.id, {
            ...frontmatter,
            id: task.id,
            status: cleanName,
            order: index,
          }, body);
        }));
        const failed = settled.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          get().toast(`${failed} task(s) could not be renamed`, 'warning', 8000);
        }
      }

      await get().updateConfig(current => {
        const nextColumnColors = { ...(current.board.columnColors ?? {}) };
        const oldColor = nextColumnColors[oldName.toLowerCase()];
        if (oldColor) {
          nextColumnColors[cleanName.toLowerCase()] = oldColor;
          delete nextColumnColors[oldName.toLowerCase()];
        }
        const currentColumns = current.board.columns.some(col => col.toLowerCase() === oldName.toLowerCase())
          ? current.board.columns
          : [...current.board.columns, oldName];
        return {
          ...current,
          board: {
            ...current.board,
            columns: currentColumns.map(col => col.toLowerCase() === oldName.toLowerCase() ? cleanName : col),
            columnColors: nextColumnColors,
          },
        };
      });
      await get().reloadBoard();
    } catch (e) {
      get().toast('Failed to rename column: ' + (e as Error).message, 'error');
      set({ columns: oldColumns });
    }
  },

  reorderColumns: async (fromIndex, toIndex) => {
    const { config, columns, tasksDirHandle } = get();
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= columns.length || toIndex >= columns.length || fromIndex === toIndex) return;
    if (!tasksDirHandle && !isServerMode()) return;

    // Build reordered columns array
    const reordered = Array.from(columns);
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    set({ columns: reordered });

    // 📖 Persist the visible column order, not the old config array indices.
    // Unknown task statuses can appear as columns after parsing; if vava drags
    // one, it should become a real configured column instead of corrupting the
    // config by splicing `undefined` from a shorter array.
    const colOrder = reordered.map(col => col.name);

    try {
      await get().updateConfig(c => ({ ...c, board: { ...c.board, columns: colOrder } }));
      // Reload board to reflect new order from config
      await get().reloadBoard();
    } catch (e) {
      get().toast('Failed to reorder columns: ' + (e as Error).message, 'error');
      // Restore previous state
      set({ columns });
    }
  },

  deleteColumn: async (name) => {
    const { columns, tasksDirHandle } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const target = columns.find(col => col.name === name);
    if (!target) return;
    const oldColumns = columns;
    set({ columns: columns.filter(col => col.name !== name) });

    try {
      // 📖 Tolerate per-task delete failures so one locked file doesn't abort
      // the whole column delete (t116).
      const settled = await Promise.allSettled(
        target.tasks.map(task => fsDeleteTaskFile(tasksDirHandle, task.id)),
      );
      const failed = settled.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        get().toast(`${failed} task(s) could not be deleted`, 'warning', 8000);
      }
      await get().updateConfig(current => {
        const nextColumnColors = { ...(current.board.columnColors ?? {}) };
        delete nextColumnColors[name.toLowerCase()];
        return {
          ...current,
          board: {
            ...current.board,
            columns: current.board.columns.filter(col => col.toLowerCase() !== name.toLowerCase()),
            columnColors: nextColumnColors,
          },
        };
      });
      await get().reloadBoard();
      get().toast('Column deleted');
    } catch (e) {
      get().toast('Failed to delete column: ' + (e as Error).message, 'error');
      set({ columns: oldColumns });
    }
  },

  createTask: async (colName, quickAddInput) => {
    const { columns, tasksDirHandle, config, taskContents, searchMatches, archivedTasks } = get();
    if (!tasksDirHandle && !isServerMode()) return null;
    if (!columns.length) return null;
    const targetColName = colName || config.board.columns[0] || columns[0].name;
    const id = nextTaskId(columns, archivedTasks);
    const targetOrder = columns.find(c => c.name === targetColName)?.tasks.length ?? 0;
    const parsed = quickAddInput ? parseQuickAddInput(quickAddInput) : null;
    const task: BoardTask = {
      id,
      title: parsed?.title || '',
      checked: false,
      // 📖 Optimistic card for a task being created right now, so its age is
      // "just now" until the write lands and the real `updated:` is parsed back.
      updatedAt: Date.now(),
      dependsOn: parsed?.depends_on || [],
      tags: parsed?.tags || [],
      assignee: parsed?.assignee || null,
      priority: (parsed?.priority as BoardTask['priority']) || (config.fields.priority ? (config.board.defaultPriority as BoardTask['priority']) : null),
      ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
      progress: null,
      frontmatter: {},
    };
    const newColumns = columns.map(c =>
      c.name === targetColName ? { ...c, tasks: [...c.tasks, task] } : c
    );
    // Optimistic update — both columns and the content cache.
    const newContents = new Map(taskContents);
    const fm: TaskFrontmatter = {
      id,
      title: parsed?.title || '',
      status: targetColName,
      order: targetOrder,
      priority: parsed?.priority || (config.fields.priority ? config.board.defaultPriority : ''),
      tags: parsed?.tags || [],
      assignee: parsed?.assignee || '',
      due: parsed?.due || '',
      depends_on: parsed?.depends_on || [],
      created: new Date().toISOString().slice(0, 10),
      ownerType: config.fields.ownerType ? config.board.defaultOwnerType : '',
      tools: '',
    };
    const body = '';
    newContents.set(id, { frontmatter: fm, subtasks: [], body });
    set({ columns: newColumns, taskContents: newContents });
    try {
      const handle = tasksDirHandle || null;
      await withRetry(() => fsWriteTaskFile(handle, id, fm, body), { maxAttempts: 3 });
      get().toast(`Created ${id.replace(/^t/, '')}`);

      // Auto-open drawer for the newly created task
      await get().openDrawer(id);

      return id;
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — task was not created.', 'error', 8000);
      } else {
        get().toast('Failed to create: ' + err.message, 'error');
      }
      // 📖 Roll back columns AND the content cache we mutated optimistically
      // (t104). searchMatches captured too for full consistency.
      set({ columns, taskContents, searchMatches });
      return null;
    }
  },

  deleteTask: async (taskId) => {
    // 📖 Capture ALL pre-mutation state so we can restore everything if the
    // filesystem delete fails (t104).
    const { columns, tasksDirHandle, taskContents, searchMatches } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    const newColumns = columns.map(c => ({ ...c, tasks: c.tasks.filter(t => t.id !== taskId) }));
    set({ columns: newColumns });

    // Remove from content cache
    const newContents = new Map(taskContents);
    newContents.delete(taskId);
    const newMatches = new Map(searchMatches);
    newMatches.delete(taskId);
    set({ taskContents: newContents, searchMatches: newMatches });

    try {
      await fsDeleteTaskFile(tasksDirHandle || null, taskId);
      get().toast('Deleted');
    } catch (e) {
      const err = e as Error;
      get().toast('Failed to delete: ' + err.message, 'error');
      // 📖 Restore columns + both caches so the store matches disk again (t104).
      set({ columns, taskContents, searchMatches });
    }
  },

  // 📖 Archive = flip the frontmatter flag on, move the file into
  // tasks/archive/, close any open drawer on it, then reload the board so it
  // disappears from the active columns and appears in the archive view.
  archiveTask: async (taskId) => {
    const { tasksDirHandle } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    try {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle || null, taskId);
      await fsArchiveTaskFile(tasksDirHandle || null, taskId, { ...frontmatter, archived: true }, body);
      if (get().drawerTaskId === taskId) get().closeDrawer();
      await get().reloadBoard();
      get().toast('Archived');
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — task was not archived.', 'error', 8000);
      } else {
        get().toast('Failed to archive: ' + err.message, 'error');
      }
    }
  },

  // 📖 Restore = drop the archived flag, move the file back to tasks/, reload.
  unarchiveTask: async (taskId) => {
    const { tasksDirHandle } = get();
    if (!tasksDirHandle && !isServerMode()) return;
    try {
      const { frontmatter, body } = await fsReadTaskFile(tasksDirHandle || null, taskId);
      const restored = { ...frontmatter };
      delete restored.archived;
      await fsUnarchiveTaskFile(tasksDirHandle || null, taskId, restored, body);
      await get().reloadBoard();
      get().toast('Restored');
    } catch (e) {
      const err = e as Error;
      if (err instanceof DiskFullError) {
        get().toast('Disk is full — task was not restored.', 'error', 8000);
      } else {
        get().toast('Failed to restore: ' + err.message, 'error');
      }
    }
  },

  setShowArchives: (show) => set({ showArchives: show }),
  setShowMetadata: (show) => set({ showMetadata: show }),
});
