/**
 * @file TUI Board Screen
 * @description The Kandown CLI's main screen. Owns *two* interchangeable views
 * over the same board — a dense one-task-per-line **list** and the **kanban**
 * columns — plus all the state and input handling they share: selection, the
 * search/filter pipeline, the move flow, the detail view and agent launch.
 *
 * 📖 Two views, one `Tab` (t264). Ableton's session/arrangement split is the
 * model: neither view replaces the other, and switching is a single keypress
 * that preserves what you had selected. The **list is the default** because a
 * 5-column kanban on an 80-column terminal leaves ~15 usable characters per
 * card, which truncates every title into noise. The choice is written back to
 * `.kandown/kandown.json` (`tui.defaultView`), so each project reopens in the
 * view you left it in.
 *
 * 📖 Selection is stored per view (`colIndex`/`rowIndex` for the board,
 * `listIndex` for the list) and reconciled *by task id* on every switch — see
 * `toggleView`. Storing a shared index instead would silently jump to a
 * different task, because the list is one flat ordering and the board is many.
 *
 * 📖 `board` is the **filtered** board every view and every hit-test reads;
 * `rawBoard` is the unfiltered snapshot. Only the dependency gate uses
 * `rawBoard`, because a blocking task that happens to be hidden by the current
 * filter must still block — resolving it against the filtered board would let
 * you move a blocked task to Done just by typing in the search box.
 *
 * 📖 Modes:
 *  - 'browse'       — main board, navigate columns/tasks (keyboard + mouse)
 *  - 'context-menu' — inline menu under a task: "Open task" / "Move task"
 *  - 'move-target'  — pick target column to move task (↓ placeholders)
 *  - 'dragging'     — mouse drag/drop task between columns
 *  - 'detail'       — full-screen task detail
 *  - 'agent-picker' — AI agent selection overlay
 *
 * 📖 Mouse (v2 — no stdin interception):
 *  - Terminal mouse mode enabled via ANSI \x1b[?1006h (SGR)
 *  - Click sequences detected in Ink's useInput via parseMouseInput()
 *  - Click on task → focus it + open inline context menu
 *  - Drag task card → drop into another column
 *  - Click on "Open" / "Move" in context menu → execute action
 *  - Click on ↓ placeholder → move task
 *  - Click outside → cancel current mode
 *
 * 📖 Keyboard:
 *  both views:   Tab=switch view, /=search, f=filter, n=new, e=edit, x=archive,
 *                D=delete, u=undo, a=agent, g=agent hook, d=daemon, r=reload,
 *                ?=cheatsheet, q=quit
 *  list:         j/k ↑/↓ select, h/l ←/→ move task between columns, s=sort,
 *                z=toggle detail pane, PgUp/PgDn page, Enter=detail
 *  board:        h/l ←/→ columns, j/k ↑/↓ tasks, Enter=detail, m=menu
 *  context-menu: j/k ↑/↓ options, Enter=confirm, Esc=cancel
 *  move-target:  h/l ←/→ columns, Enter=confirm, Esc=cancel
 *  detail:       j/k scroll, a=agent, Esc=back
 *
 * @functions
 *  → Board — main screen component
 *
 * @exports Board
 * @see src/cli/screens/board/list-view.tsx — the list renderer
 * @see src/cli/screens/board/list-helpers.ts — filtering, sorting, layout
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  readBoard,
  readTask,
  moveTaskToColumn,
  createTaskInBoard,
  deleteTaskInBoard,
  archiveTaskInBoard,
  undoLastAction,
  getTasksDir,
} from '../lib/board-reader.js';
import { loadConfig, saveConfig, setConfigValue } from '../lib/config.js';
import { getDaemonStatus, startProjectDaemon, stopProjectDaemon, type DaemonStatus } from '../lib/daemon.js';
import { createWatcher } from '../lib/file-watcher.js';
import { detectInstalledAgents, resolveAgentEntry, isAgentInstalled, warmupDetection, loadCatalog, type AgentDef } from '../lib/agents.js';
import { launchAgent, isInTmux } from '../lib/launcher.js';
import type { ParsedBoard, BoardTask, ParsedTask } from '../../lib/types.js';
import { AgentPicker } from './agent-picker.js';
import { useMouseMode, parseMouseInput, isMouseInput } from '../hooks/use-mouse.js';
import { MENU_HEIGHT } from '../components/task-context-menu.js';
import { TASKS_START_Y, calcColWidth, computeScrollIdx, getTitleCategory, terminalHyperlink, termWidth, truncate, webLinkLabel } from './board/helpers.js';
import { BoardHeader, KanbanColumn, StatusBar, TaskDetail } from './board/components.js';
import {
  FILTER_MODES,
  LIST_SORTS,
  type FilterMode,
  type ListColumnPrefs,
  type ListSort,
  applyBoardFilter,
  buildListRows,
} from './board/list-helpers.js';
import {
  DETAIL_PANE_HEIGHT,
  LIST_START_Y,
  TaskDetailPane,
  TaskListView,
  computeListGeometry,
  listRowAtY,
} from './board/list-view.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'browse' | 'detail' | 'agent-picker' | 'context-menu' | 'move-target' | 'dragging' | 'create-task' | 'confirm-delete' | 'cheatsheet' | 'search';

interface MousePressState {
  taskId: string;
  colIndex: number;
  rowIndex: number;
  startX: number;
  startY: number;
  isMenu?: boolean;
}

interface TaskDragState {
  taskId: string;
  sourceCol: number;
  hoverCol: number;
}

interface BoardProps {
  kandownDir: string;
  version?: string;
}


// ─── Main Board ──────────────────────────────────────────────────────────────

export function Board({ kandownDir, version }: BoardProps) {
  const { exit } = useApp();

  // ─── State ────────────────────────────────────────────────────────────────

  const [rawBoard, setBoard]    = useState<ParsedBoard | null>(null);
  const [colIndex, setColIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [mode, setMode]         = useState<Mode>('browse');
  const [statusMsg, setStatusMsg] = useState('');
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showStatus = useCallback((msg: string, ms = 2000) => {
    setStatusMsg(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    if (msg) {
      statusTimerRef.current = setTimeout(() => {
        setStatusMsg('');
        statusTimerRef.current = null;
      }, ms);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  /** 📖 Fatal board-load error. When set, the screen renders an error box with
   * a retry hint instead of crashing the TUI to the shell (t114). */
  const [boardError, setBoardError] = useState<string | null>(null);

  // Detail view
  const [detailTask, setDetailTask]       = useState<ParsedTask | null>(null);
  const [detailTaskId, setDetailTaskId]   = useState('');
  const [detailScroll, setDetailScroll]   = useState(0);

  // Context menu
  const [ctxMenuRow, setCtxMenuRow]       = useState(-1);   // task row index, -1 = closed
  const [ctxMenuCursor, setCtxMenuCursor] = useState(0);    // 0 = Open, 1 = Move

  // Move mode
  const [moveTaskId, setMoveTaskId]       = useState<string | null>(null);
  const [moveTargetCol, setMoveTargetCol] = useState(0);

  // Mouse drag/drop mode
  const [mousePress, setMousePress] = useState<MousePressState | null>(null);
  const [taskDrag, setTaskDrag] = useState<TaskDragState | null>(null);

  // Daemon
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>({ running: false, metadata: null });
  const [daemonBusy, setDaemonBusy] = useState(false);
  const [preferredDaemonPort, setPreferredDaemonPort] = useState<number | null>(null);

  // Agents
  const [installedAgents, setInstalledAgents] = useState<AgentDef[]>([]);

  // TUI extensions
  const [createInput, setCreateInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // ─── View state (t264) ────────────────────────────────────────────────────
  // 📖 Seeded once from `.kandown/kandown.json` and written back on every
  // toggle, so a project reopens in the view/pane/sort you left it in. Read
  // lazily inside the initializer — loadConfig touches the filesystem and must
  // not run on every render.
  const [view, setView] = useState<'list' | 'board'>(() => loadConfig(kandownDir).tui.defaultView);
  const [showDetailPane, setShowDetailPane] = useState(() => loadConfig(kandownDir).tui.showDetailPane);
  const [listSort, setListSort] = useState<ListSort>(() => loadConfig(kandownDir).tui.listSort);
  /** 📖 Which optional list columns to draw, from `tui.columns`. Re-read
   * whenever kandown.json changes on disk (see the watcher below), so toggling
   * a column in `kandown settings` is reflected in an already-open board
   * without a restart. */
  const [listColumns, setListColumns] = useState<ListColumnPrefs>(() => loadConfig(kandownDir).tui.columns);
  const [listIndex, setListIndex] = useState(0);
  const [listScroll, setListScroll] = useState(0);
  /** 📖 Re-select this task id once the rows have been rebuilt. Set by any
   * action that reorders the list under the cursor (a move, a sort change) —
   * keeping the numeric index there would leave the cursor on whichever task
   * happened to slide into that slot. */
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  /**
   * 📖 Persists one `tui.*` preference without clobbering concurrent edits:
   * re-reads the config from disk first, so a change the user made in the web
   * UI or in `kandown config set` between two keypresses survives. Failures are
   * swallowed — losing a view preference must never take the board down.
   */
  const persistTuiPref = useCallback((key: 'defaultView' | 'showDetailPane' | 'listSort', value: unknown) => {
    try {
      saveConfig(kandownDir, setConfigValue(loadConfig(kandownDir), `tui.${key}`, value));
    } catch {
      // Non-fatal — the preference just won't survive this session.
    }
  }, [kandownDir]);

  const inTmux = isInTmux();

  // 📖 The board every view, every hit-test and every navigation bound reads.
  // See the file header for why the dependency gate deliberately does not.
  const board = useMemo(
    () => applyBoardFilter(rawBoard, searchQuery, filterMode),
    [rawBoard, searchQuery, filterMode],
  );

  // 📖 `board` is already filtered, so the row builder is asked for no further
  // search/filter — passing them twice would be harmless but would hide where
  // the filtering actually happens.
  const listRows = useMemo(
    () => buildListRows(board, { search: '', filter: 'all', sort: listSort }),
    [board, listSort],
  );

  const selectedRow = listRows[Math.min(listIndex, Math.max(0, listRows.length - 1))] ?? null;

  // 📖 Filtering, sorting or a file change can shrink the list under the
  // cursor. Clamp instead of letting the selection point past the end, which
  // would blank the detail pane and make Enter a no-op.
  useEffect(() => {
    setListIndex(i => Math.max(0, Math.min(i, listRows.length - 1)));
  }, [listRows.length]);

  // 📖 Same clamp for the board view: `f`/`/` can empty the column the cursor
  // sits in, which would leave `rowIndex` pointing past the end and make every
  // task-scoped key (e, x, D, a) silently do nothing.
  useEffect(() => {
    if (!board) return;
    const maxCol = Math.max(0, board.columns.length - 1);
    setColIndex(c => Math.min(c, maxCol));
    const tasks = board.columns[Math.min(colIndex, maxCol)]?.tasks.length ?? 0;
    setRowIndex(r => Math.max(0, Math.min(r, tasks - 1)));
  }, [board, colIndex]);

  useEffect(() => {
    if (!pendingFocusId) return;
    const idx = listRows.findIndex(row => row.task.id === pendingFocusId);
    if (idx >= 0) setListIndex(idx);
    setPendingFocusId(null);
  }, [pendingFocusId, listRows]);

  // 📖 Lines the list may use: the terminal minus its header block, the status
  // bar, and the detail pane when it is shown. Recomputed every render because
  // App re-renders Board on SIGWINCH, so a resize lands here for free.
  const listMaxHeight = Math.max(
    3,
    (process.stdout.rows || 24) - LIST_START_Y - 3 - (showDetailPane ? DETAIL_PANE_HEIGHT : 0),
  );

  /** 📖 Shared by the renderer and the click handler — see computeListGeometry. */
  const listGeometry = useMemo(
    () => computeListGeometry(listRows, listIndex, listScroll, listMaxHeight, termWidth(), listColumns),
    [listRows, listIndex, listScroll, listMaxHeight, listColumns],
  );

  // 📖 The geometry resolves the scroll offset; mirror it back into state so
  // the next render starts from where this one ended. Guarded on inequality so
  // it settles in one extra render instead of looping.
  useEffect(() => {
    if (listGeometry.window.scroll !== listScroll) setListScroll(listGeometry.window.scroll);
  }, [listGeometry.window.scroll, listScroll]);

  // ─── Layout tracking for mouse hit-testing ────────────────────────────────
  // 📖 columnAtX and taskHitAt compute the layout on the fly from the current
  // board + terminal size, so clicks stay accurate after a resize.

  const columnAtX = useCallback((x: number): number => {
    if (!board) return -1;
    const numCols = board.columns.length;
    const cw = calcColWidth(numCols);
    let startX = 1;
    for (let c = 0; c < numCols; c++) {
      if (x >= startX && x < startX + cw) return c;
      startX += cw + 1;
    }
    return -1;
  }, [board]);

  const taskHitAt = useCallback((x: number, y: number): MousePressState | null => {
    if (!board) return null;
    const clickedCol = columnAtX(x);
    if (clickedCol < 0) return null;
    const col = board.columns[clickedCol];
    if (!col || col.tasks.length === 0) return null;

    const maxTasksHeight = Math.max(5, (process.stdout.rows || 24) - TASKS_START_Y - 3 - ((mode === 'move-target' || mode === 'dragging') ? 2 : 0));

    // Calculate scroll offset (shared with the render — see computeScrollIdx)
    const isFocused = clickedCol === colIndex;
    const focusedRow = isFocused ? rowIndex : -1;
    const contextMenuRowVal = mode === 'context-menu' && isFocused ? ctxMenuRow : -1;
    const scrollIdx = isFocused
      ? computeScrollIdx(col.tasks, focusedRow, contextMenuRowVal, maxTasksHeight)
      : 0;

    const hasTopIndicator = scrollIdx > 0;
    let currentY = TASKS_START_Y;
    if (hasTopIndicator) {
      if (y === currentY) return null;
      currentY += 1;
    }

    let endIdx = scrollIdx;
    let accumulatedHeight = 0;
    const topIndicatorHeight = hasTopIndicator ? 1 : 0;

    while (endIdx < col.tasks.length) {
      const hasCategory = getTitleCategory(col.tasks[endIdx].title) !== null;
      const taskHeight = hasCategory ? 3 : 1;
      const sepHeight = (endIdx < col.tasks.length - 1) ? 1 : 0;

      const hasBottomIndicator = endIdx < col.tasks.length - 1;
      const bottomIndicatorHeight = hasBottomIndicator ? 1 : 0;
      const currentMax = maxTasksHeight - topIndicatorHeight - bottomIndicatorHeight;

      if (accumulatedHeight + taskHeight + sepHeight > currentMax) {
        if (endIdx === scrollIdx) {
          endIdx++;
        }
        break;
      }

      if (y >= currentY && y < currentY + taskHeight) {
        return { taskId: col.tasks[endIdx].id, colIndex: clickedCol, rowIndex: endIdx, startX: x, startY: y };
      }
      currentY += taskHeight;

      if (contextMenuRowVal === endIdx) {
        if (y >= currentY && y < currentY + MENU_HEIGHT) {
          return { taskId: col.tasks[endIdx].id, colIndex: clickedCol, rowIndex: endIdx, startX: x, startY: y, isMenu: true };
        }
        currentY += MENU_HEIGHT;
      }

      if (endIdx < col.tasks.length - 1) {
        if (y === currentY) return null;
        currentY += 1;
      }

      accumulatedHeight += taskHeight + sepHeight;
      endIdx++;
    }

    return null;
  }, [board, colIndex, rowIndex, mode, ctxMenuRow, columnAtX]);

  // ─── Board loading & watching ─────────────────────────────────────────────

  /**
   * 📖 Safe board loader. readBoard already tolerates individual unreadable
   * task files (board-reader.ts, t112), but the config read or directory scan
   * can still throw on permission errors. We catch, surface a boardError, and
   * keep the previously loaded board visible so the TUI never goes blank (t114).
   */
  const loadBoardInto = useCallback(() => {
    try {
      const loaded = readBoard(kandownDir);
      setBoard(loaded);
      setBoardError(null);
      return loaded;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBoardError(`Failed to load board: ${msg}`);
      setStatusMsg('');
      return null;
    }
  }, [kandownDir]);

  useEffect(() => {
    loadBoardInto();
    // 📖 Warm the install cache for the whole merged catalog up front so the
    // first agent-picker open (and any assignee auto-launch) is instant.
    warmupDetection(loadCatalog(kandownDir));
    setInstalledAgents(detectInstalledAgents(kandownDir));
  }, [kandownDir, loadBoardInto]);

  useEffect(() => {
    const watcher = createWatcher();
    watcher.on('taskChanged', () => {
      loadBoardInto();
    });
    watcher.on('newTaskDetected', (taskId: string) => {
      loadBoardInto();
      showStatus(`New task: ${taskId}`, 2000);
    });
    watcher.on('configChanged', () => {
      loadBoardInto();
      // 📖 `kandown settings` writes the same file, so a column toggle there
      // reaches an open board through the watcher rather than needing a restart.
      try {
        setListColumns(loadConfig(kandownDir).tui.columns);
      } catch {
        // Non-fatal — keep the columns we already have.
      }
    });
    watcher.start(kandownDir);
    return () => { watcher.stop(); };
  }, [kandownDir, loadBoardInto, showStatus]);

  const reloadBoard = useCallback(() => {
    const loaded = loadBoardInto();
    if (loaded) {
      showStatus('Board reloaded', 1500);
    }
  }, [loadBoardInto, showStatus]);

  const refreshDaemonStatus = useCallback(async () => {
    const next = await getDaemonStatus(kandownDir);
    setDaemonStatus(next);
    if (next.running && next.metadata) setPreferredDaemonPort(next.metadata.port);
  }, [kandownDir]);

  useEffect(() => {
    void refreshDaemonStatus();
    const timer = setInterval(() => {
      void refreshDaemonStatus();
    }, 2000);
    return () => clearInterval(timer);
  }, [refreshDaemonStatus]);

  const toggleDaemon = useCallback(async () => {
    if (daemonBusy) return;
    setDaemonBusy(true);
    try {
      const current = await getDaemonStatus(kandownDir);
      if (current.running) {
        if (current.metadata) setPreferredDaemonPort(current.metadata.port);
        await stopProjectDaemon(kandownDir);
        const next = await getDaemonStatus(kandownDir);
        setDaemonStatus(next);
        showStatus('Web daemon stopped', 2500);
      } else {
        const next = await startProjectDaemon(kandownDir, preferredDaemonPort);
        setDaemonStatus(next);
        if (next.running && next.metadata) setPreferredDaemonPort(next.metadata.port);
        showStatus(next.running ? 'Web daemon started' : 'Web daemon failed to start', 2500);
      }
    } catch (error) {
      showStatus(`Daemon error: ${error instanceof Error ? error.message : String(error)}`, 2500);
    } finally {
      setDaemonBusy(false);
    }
  }, [daemonBusy, kandownDir, preferredDaemonPort, showStatus]);

  // 📖 TUI gate check: refuses to move a task to the terminal column when at
  // least one of its `depends_on` ids is not yet resolved (terminal or
  // archived). Mirrors the web store's gate. Returns true when the move
  // is safe to perform, false when it was blocked.
  // 📖 Resolved against `rawBoard`, never the filtered `board`: a dependency
  // hidden by the active search/filter must still block the move, otherwise
  // typing in the search box would silently unlock the Done column.
  const tryMoveWithGate = useCallback((taskId: string, targetCol: string): boolean => {
    const board = rawBoard;
    if (!board) return false;
    const cfg = loadConfig(kandownDir);
    const cols = cfg.board.columns;
    const terminalLower = (cols[cols.length - 1] || 'Done').toLowerCase();
    const isTerminal = targetCol.toLowerCase() === terminalLower;
    if (!isTerminal) return true;
    // 📖 Build a quick id → resolved map from the current board snapshot.
    // Same shortcut as the web store: archived OR terminal status counts as
    // resolved; unknown ids / self-refs are ignored (never block).
    const resolved = new Map<string, boolean>();
    for (const col of board.columns) {
      for (const t of col.tasks) {
        const isArch = t.frontmatter && (t.frontmatter.archived === true || t.frontmatter.archived === 'true');
        resolved.set(t.id, isArch || col.name.toLowerCase() === terminalLower);
      }
    }
    const movingTask = board.columns.flatMap(c => c.tasks).find(t => t.id === taskId);
    if (!movingTask) return true;
    const deps = Array.isArray(movingTask.dependsOn) ? movingTask.dependsOn : [];
    const blocked: string[] = [];
    for (const dep of deps) {
      if (typeof dep !== 'string' || !dep.trim() || dep === taskId) continue;
      const r = resolved.get(dep);
      if (!r) blocked.push(dep);
    }
    if (blocked.length > 0) {
      const list = blocked.length === 1
        ? blocked[0]
        : `${blocked.slice(0, -1).join(', ')} and ${blocked[blocked.length - 1]}`;
      showStatus(`Blocked: ${taskId} ← ${list}`, 3500);
      return false;
    }
    return true;
  }, [rawBoard, kandownDir, showStatus]);

  // 📖 Forwards a task to the agent hook configured on the CLI daemon. The
  // hook is strictly opt-in via KANDOWN_AGENT_HOOK_URL on the daemon process.
  // If the hook is unconfigured, the daemon returns 501 — we surface that
  // instead of silently no-op'ing so users learn the feature exists.
  const sendTaskToAgentHook = useCallback(async (taskId: string) => {
    const status = await getDaemonStatus(kandownDir);
    if (!status.running || !status.metadata) {
      showStatus('Web daemon not running (press d to start)', 2500);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${status.metadata.port}/api/tasks/${encodeURIComponent(taskId)}/agent`, {
        method: 'POST',
        // 📖 The daemon requires its per-instance token (M5); the TUI reads it
        // from daemon.json via getDaemonStatus.
        headers: status.metadata.token ? { 'X-Kandown-Token': status.metadata.token } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        showStatus(`Sent ${taskId} to agent hook`, 2000);
      } else {
        const body = await res.text().catch(() => '');
        showStatus(`Agent hook: ${res.status}${body ? ' — ' + body.slice(0, 60) : ''}`, 3000);
      }
    } catch (error) {
      showStatus(`Agent hook failed: ${error instanceof Error ? error.message : String(error)}`, 3000);
    }
  }, [kandownDir, showStatus]);

  // ─── Derived helpers ──────────────────────────────────────────────────────

  const closeContextMenu = useCallback(() => {
    setCtxMenuRow(-1);
    setCtxMenuCursor(0);
  }, []);

  /**
   * 📖 The single "what is selected right now" accessor, view-agnostic. Every
   * shared action (`e`, `x`, `D`, `a`, `g`, Enter) goes through it, which is
   * why those keys needed no per-view branch at all.
   */
  const getFocusedTask = useCallback((): BoardTask | null => {
    if (view === 'list') return selectedRow?.task ?? null;
    if (!board) return null;
    const col = board.columns[colIndex];
    if (!col || col.tasks.length === 0) return null;
    return col.tasks[Math.min(rowIndex, col.tasks.length - 1)] ?? null;
  }, [view, selectedRow, board, colIndex, rowIndex]);

  /**
   * 📖 `Tab`. Reconciles the selection **by task id**, not by index: the list
   * is one flat ordering and the board is many, so carrying an index across
   * would land on an unrelated task. Falls back to the first row / first column
   * when the previously focused task is not present in the target view (it can
   * have been filtered out, archived or deleted meanwhile).
   */
  const toggleView = useCallback(() => {
    const focusedId = getFocusedTask()?.id ?? null;
    const next = view === 'list' ? 'board' : 'list';

    if (next === 'board' && focusedId && board) {
      let found = false;
      for (let c = 0; c < board.columns.length && !found; c++) {
        const r = board.columns[c].tasks.findIndex(t => t.id === focusedId);
        if (r >= 0) { setColIndex(c); setRowIndex(r); found = true; }
      }
      if (!found) { setColIndex(0); setRowIndex(0); }
    } else if (next === 'list' && focusedId) {
      const idx = listRows.findIndex(r => r.task.id === focusedId);
      setListIndex(idx >= 0 ? idx : 0);
    }

    // 📖 Leaving the board also leaves any board-only transient mode behind —
    // an open context menu or a half-finished move has no meaning in the list.
    closeContextMenu();
    setMoveTaskId(null);
    setTaskDrag(null);
    setMousePress(null);
    setMode('browse');

    setView(next);
    persistTuiPref('defaultView', next);
  }, [view, board, listRows, getFocusedTask, closeContextMenu, persistTuiPref]);

  /**
   * 📖 `h`/`l` in the list: shift the selected task one column left or right.
   *
   * The list has no columns to navigate, so the horizontal axis is repurposed
   * for the single most common board action. It runs through the same
   * dependency gate as every other move, and `u` undoes it — which is what
   * makes binding a mutation to an arrow key acceptable here.
   */
  const shiftSelectedTask = useCallback((direction: -1 | 1) => {
    if (!board || !selectedRow) return;
    const target = selectedRow.colIndex + direction;
    if (target < 0 || target >= board.columns.length) return;
    const targetName = board.columns[target].name;
    const taskId = selectedRow.task.id;
    if (!tryMoveWithGate(taskId, targetName)) return;
    if (!moveTaskToColumn(kandownDir, taskId, targetName)) {
      showStatus(`Move failed: ${taskId}`, 2500);
      return;
    }
    loadBoardInto();
    showStatus(`${taskId} → ${targetName}`, 2000);
    // 📖 The row order changes under us (default sort is board order), so
    // re-find the task by id on the next render rather than keeping the index.
    setPendingFocusId(taskId);
  }, [board, selectedRow, kandownDir, tryMoveWithGate, loadBoardInto, showStatus]);

  const cycleSort = useCallback(() => {
    const next = LIST_SORTS[(LIST_SORTS.indexOf(listSort) + 1) % LIST_SORTS.length];
    setListSort(next);
    persistTuiPref('listSort', next);
    showStatus(`Sort: ${next}`, 1800);
    setPendingFocusId(selectedRow?.task.id ?? null);
  }, [listSort, persistTuiPref, showStatus, selectedRow]);

  const toggleDetailPane = useCallback(() => {
    setShowDetailPane(prev => {
      persistTuiPref('showDetailPane', !prev);
      return !prev;
    });
  }, [persistTuiPref]);

  const openDetail = useCallback((taskId: string) => {
    // 📖 readTask returns a placeholder when the file is missing and only
    // throws on a genuine fs error — wrap anyway so a mid-read failure (file
    // deleted between existsSync and readFileSync) doesn't crash the TUI (t114).
    try {
      const task = readTask(kandownDir, taskId);
      setDetailTask(task);
      setDetailTaskId(taskId);
      setDetailScroll(0);
      setMode('detail');
    } catch (e) {
      showStatus(`Error opening task: ${e instanceof Error ? e.message : String(e)}`, 4000);
    }
  }, [kandownDir, showStatus]);

  // 📖 Core launch: move to browse, status, then spawn the agent. Shared by
  // the picker confirmation and the assignee auto-launch path so both behave
  // identically (rollback, tmux split, status messages).
  const launchTaskWithAgent = useCallback((taskId: string, agentId: string) => {
    setMode('browse');
    showStatus(`Launching ${agentId} for ${taskId}…`, 5000);
    setTimeout(() => {
      try {
        launchAgent({ taskId, agentId, kandownDir, onBeforeExec: () => exit() });
        reloadBoard();
        showStatus(`${agentId} launched in tmux pane`, 3000);
      } catch (err) {
        showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 4000);
      }
    }, 50);
  }, [kandownDir, exit, reloadBoard, showStatus, setMode]);

  const handleAgentSelect = useCallback((agentId: string) => {
    const task = getFocusedTask();
    const taskId = mode === 'detail' ? detailTaskId : task?.id;
    if (!taskId) return;
    launchTaskWithAgent(taskId, agentId);
  }, [mode, detailTaskId, getFocusedTask, launchTaskWithAgent]);

  // 📖 `a` key entry point. If the task's `assignee:` resolves to an installed
  // agent, skip the picker and launch it directly (subtask 3 — assignee field
  // is now an agent selector). Otherwise fall back to the picker as before.
  const requestAgentLaunch = useCallback((taskId: string) => {
    if (installedAgents.length === 0) {
      showStatus('No AI agents found in PATH', 3000);
      return;
    }
    try {
      const t = readTask(kandownDir, taskId);
      const assignee = typeof t.frontmatter.assignee === 'string' ? t.frontmatter.assignee : null;
      const resolved = assignee ? resolveAgentEntry(assignee, kandownDir) : undefined;
      if (resolved && isAgentInstalled(resolved.bin)) {
        launchTaskWithAgent(taskId, resolved.id);
        return;
      }
    } catch {
      // unreadable task — fall through to the picker
    }
    setMode('agent-picker');
  }, [installedAgents, kandownDir, launchTaskWithAgent, showStatus, setMode]);

  // ─── Mouse mode ───────────────────────────────────────────────────────────

  useMouseMode(mode !== 'agent-picker');

  // ─── Mouse click handler (called from useInput when mouse sequence detected) ─

  const handleMouseClick = useCallback((x: number, y: number) => {
    if (!board) return;
    const clickedCol = columnAtX(x);
    if (clickedCol < 0) {
      if (mode === 'context-menu') {
        closeContextMenu();
        setMode('browse');
      } else if (mode === 'move-target') {
        setMoveTaskId(null);
        setMode('browse');
      }
      return;
    }

    const col = board.columns[clickedCol];

    // 📖 Move-target mode: the whole target column is a drop zone, consistent
    // with drag & drop (release over a column). Clicking the source column or
    // outside the board cancels (handled above).
    if (mode === 'move-target') {
      if (clickedCol === colIndex) { setMoveTaskId(null); setMode('browse'); return; }
      if (moveTaskId) {
        if (!tryMoveWithGate(moveTaskId, col.name)) {
          setMoveTaskId(null);
          setMode('browse');
          return;
        }
        moveTaskToColumn(kandownDir, moveTaskId, col.name);
        loadBoardInto();
        showStatus(`Moved ${moveTaskId} → ${col.name}`);
      }
      setMoveTaskId(null);
      setMode('browse');
      return;
    }

    const maxTasksHeight = Math.max(5, (process.stdout.rows || 24) - TASKS_START_Y - 3 - (mode === 'dragging' ? 2 : 0));

    // Calculate scroll offset (shared with the render — see computeScrollIdx)
    const isFocused = clickedCol === colIndex;
    const focusedRow = isFocused ? rowIndex : -1;
    const contextMenuRowVal = mode === 'context-menu' && isFocused ? ctxMenuRow : -1;
    const scrollIdx = isFocused
      ? computeScrollIdx(col.tasks, focusedRow, contextMenuRowVal, maxTasksHeight)
      : 0;

    const hasTopIndicator = scrollIdx > 0;
    let currentY = TASKS_START_Y;
    if (hasTopIndicator) {
      if (y === currentY) {
        if (isFocused) {
          setRowIndex(r => Math.max(0, r - 1));
        }
        return;
      }
      currentY += 1;
    }

    let endIdx = scrollIdx;
    let accumulatedHeight = 0;
    const topIndicatorHeight = hasTopIndicator ? 1 : 0;

    let clickedTaskIdx = -1;
    let clickedMenuOffset = -1;

    while (endIdx < col.tasks.length) {
      const hasCategory = getTitleCategory(col.tasks[endIdx].title) !== null;
      const taskHeight = hasCategory ? 3 : 1;
      const sepHeight = (endIdx < col.tasks.length - 1) ? 1 : 0;

      const hasBottomIndicator = endIdx < col.tasks.length - 1;
      const bottomIndicatorHeight = hasBottomIndicator ? 1 : 0;
      const currentMax = maxTasksHeight - topIndicatorHeight - bottomIndicatorHeight;

      if (accumulatedHeight + taskHeight + sepHeight > currentMax) {
        if (endIdx === scrollIdx) {
          endIdx++;
        }
        break;
      }

      if (y >= currentY && y < currentY + taskHeight) {
        clickedTaskIdx = endIdx;
        break;
      }
      currentY += taskHeight;

      if (contextMenuRowVal === endIdx) {
        if (y >= currentY && y < currentY + MENU_HEIGHT) {
          clickedTaskIdx = endIdx;
          clickedMenuOffset = y - currentY;
          break;
        }
        currentY += MENU_HEIGHT;
      }

      if (endIdx < col.tasks.length - 1) {
        if (y === currentY) {
          return;
        }
        currentY += 1;
      }

      accumulatedHeight += taskHeight + sepHeight;
      endIdx++;
    }

    if (endIdx < col.tasks.length) {
      if (y === currentY) {
        if (isFocused) {
          setRowIndex(r => Math.min(col.tasks.length - 1, r + 1));
        }
        return;
      }
      currentY += 1; // account for bottom indicator line
    }

    if (mode === 'browse') {
      if (clickedTaskIdx >= 0) {
        setColIndex(clickedCol);
        setRowIndex(clickedTaskIdx);
        setCtxMenuRow(clickedTaskIdx);
        setCtxMenuCursor(0);
        setMode('context-menu');
      }
      return;
    }

    if (mode === 'context-menu') {
      const hasMenu = clickedCol === colIndex && ctxMenuRow >= 0;
      if (hasMenu) {
        if (clickedTaskIdx >= 0) {
          if (clickedMenuOffset >= 0) {
            if (clickedMenuOffset === 0) {
              const task = col.tasks[ctxMenuRow];
              if (task) { closeContextMenu(); openDetail(task.id); }
            } else {
              const task = col.tasks[ctxMenuRow];
              if (task) {
                setMoveTaskId(task.id);
                const target = colIndex === 0 ? Math.min(1, board.columns.length - 1) : 0;
                setMoveTargetCol(target);
                closeContextMenu();
                setMode('move-target');
              }
            }
          } else if (clickedTaskIdx === ctxMenuRow) {
            closeContextMenu();
            setMode('browse');
          } else {
            setRowIndex(clickedTaskIdx);
            closeContextMenu();
            setCtxMenuRow(clickedTaskIdx);
            setCtxMenuCursor(0);
          }
        } else {
          closeContextMenu();
          setMode('browse');
        }
      } else {
        if (clickedTaskIdx >= 0) {
          closeContextMenu();
          setColIndex(clickedCol);
          setRowIndex(clickedTaskIdx);
          setCtxMenuRow(clickedTaskIdx);
          setCtxMenuCursor(0);
        } else {
          closeContextMenu();
          setMode('browse');
        }
      }
      return;
    }

  }, [board, mode, colIndex, rowIndex, ctxMenuRow, moveTaskId, kandownDir, columnAtX, closeContextMenu, openDetail, loadBoardInto, tryMoveWithGate, taskDrag, showStatus]);

  const handleMouseEvent = useCallback((mouse: NonNullable<ReturnType<typeof parseMouseInput>>) => {
    if (!board) return;

    if (mode === 'browse') {
      if (mouse.action === 'press' && mouse.button === 0) {
        const hit = taskHitAt(mouse.x, mouse.y);
        if (hit) {
          setMousePress(hit);
          setColIndex(hit.colIndex);
          setRowIndex(hit.rowIndex);
        }
        return;
      }

      if (mouse.action === 'drag' && mousePress) {
        const delta = Math.max(Math.abs(mouse.x - mousePress.startX), Math.abs(mouse.y - mousePress.startY));
        if (delta < 1) return;
        const hoverCol = columnAtX(mouse.x);
        setTaskDrag({ taskId: mousePress.taskId, sourceCol: mousePress.colIndex, hoverCol });
        setMoveTargetCol(hoverCol >= 0 ? hoverCol : mousePress.colIndex);
        setMoveTaskId(mousePress.taskId);
        setMode('dragging');
        closeContextMenu();
        return;
      }

      if (mouse.action === 'release' && mousePress) {
        const hit = taskHitAt(mouse.x, mouse.y);
        if (hit && hit.taskId === mousePress.taskId) {
          setCtxMenuRow(mousePress.rowIndex);
          setCtxMenuCursor(0);
          setMode('context-menu');
        }
        setMousePress(null);
        return;
      }

      if (mouse.action === 'press') handleMouseClick(mouse.x, mouse.y);
      return;
    }

    if (mode === 'dragging') {
      if (!taskDrag) {
        setMode('browse');
        setMoveTaskId(null);
        setMousePress(null);
        return;
      }

      if (mouse.action === 'drag') {
        const hoverCol = columnAtX(mouse.x);
        setTaskDrag(current => current ? { ...current, hoverCol } : current);
        setMoveTargetCol(hoverCol >= 0 ? hoverCol : taskDrag.sourceCol);
        return;
      }

      if (mouse.action === 'release') {
        const targetCol = columnAtX(mouse.x);
        if (targetCol >= 0 && targetCol !== taskDrag.sourceCol) {
          const targetColName = board.columns[targetCol]?.name;
          if (targetColName) {
            if (!tryMoveWithGate(taskDrag.taskId, targetColName)) {
              setTaskDrag(null);
              setMousePress(null);
              setMode('browse');
              return;
            }
            moveTaskToColumn(kandownDir, taskDrag.taskId, targetColName);
            const loaded = loadBoardInto();
            setColIndex(targetCol);
            const movedRow = loaded?.columns[targetCol]?.tasks.findIndex(task => task.id === taskDrag.taskId) ?? 0;
            setRowIndex(Math.max(0, movedRow));
            showStatus(`Dragged ${taskDrag.taskId} → ${targetColName}`, 2000);
          }
        }
        setTaskDrag(null);
        setMousePress(null);
        setMoveTaskId(null);
        setMode('browse');
        return;
      }

      return;
    }

    if (mouse.action === 'press' && mouse.button === 0) {
      handleMouseClick(mouse.x, mouse.y);
    }
  }, [board, mode, mousePress, taskDrag, taskHitAt, columnAtX, closeContextMenu, handleMouseClick, kandownDir]);

  // ─── List view mouse ──────────────────────────────────────────────────────

  /**
   * 📖 The list only needs two gestures, so it gets its own tiny handler rather
   * than another branch inside the kanban drag/drop state machine:
   *  - wheel scrolls the window without moving the selection (like every list);
   *  - a click selects; a click on the already-selected row opens it, which is
   *    the terminal equivalent of a double-click without the timing guesswork.
   */
  const handleListMouse = useCallback((mouse: NonNullable<ReturnType<typeof parseMouseInput>>) => {
    if (mouse.action === 'scroll') {
      const delta = mouse.wheel === 'up' ? -3 : 3;
      setListScroll(s => Math.max(0, Math.min(s + delta, Math.max(0, listRows.length - 1))));
      return;
    }
    if (mouse.action !== 'press' || mouse.button !== 0) return;
    const hit = listRowAtY(listGeometry, listIndex, mouse.y);
    if (hit === null) return;
    if (hit === listIndex) {
      const task = listRows[hit]?.task;
      if (task) openDetail(task.id);
      return;
    }
    setListIndex(hit);
  }, [listRows, listGeometry, listIndex, openDetail]);

  // ─── Input handling (keyboard + mouse) ────────────────────────────────────

  useInput((input, key) => {
    // 📖 Mouse sequence detected — parse and handle click
    if (isMouseInput(input)) {
      const mouse = parseMouseInput(input);
      if (!mouse) return;
      // 📖 Only 'browse' routes to the list handler: overlays (create, search,
      // delete confirmation, cheatsheet) must not have rows selected out from
      // under them by a stray click.
      if (view === 'list' && mode === 'browse') handleListMouse(mouse);
      else handleMouseEvent(mouse);
      return;
    }

    // ─── Create Task mode ─────────────────────────────────────────────────
    if (mode === 'create-task') {
      if (key.escape) {
        setCreateInput('');
        setMode('browse');
        return;
      }
      if (key.return) {
        if (createInput.trim()) {
          // 📖 A new task lands in the column you were looking at. In list view
          // that is the selected row's status, not `colIndex` — which is stale
          // there and would drop the task into an unrelated column.
          const colName = view === 'list'
            ? (selectedRow?.status ?? board?.columns[0]?.name)
            : board?.columns[colIndex]?.name;
          const newId = createTaskInBoard(kandownDir, createInput.trim(), colName);
          loadBoardInto();
          showStatus(`Created task ${newId}`, 2500);
        }
        setCreateInput('');
        setMode('browse');
        return;
      }
      if (key.backspace || key.delete) {
        setCreateInput(s => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCreateInput(s => s + input);
        return;
      }
      return;
    }

    // ─── Confirm Delete mode ──────────────────────────────────────────────
    if (mode === 'confirm-delete') {
      if (input === 'y' || input === 'Y') {
        const task = getFocusedTask();
        if (task) {
          deleteTaskInBoard(kandownDir, task.id);
          loadBoardInto();
          showStatus(`Deleted ${task.id}`, 2000);
        }
        setMode('browse');
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('browse');
        return;
      }
      return;
    }

    // ─── Cheatsheet mode ──────────────────────────────────────────────────
    if (mode === 'cheatsheet') {
      if (key.escape || input === 'q' || input === '?') {
        setMode('browse');
        return;
      }
      return;
    }

    // ─── Search mode ──────────────────────────────────────────────────────
    if (mode === 'search') {
      if (key.escape) {
        setSearchQuery('');
        setMode('browse');
        return;
      }
      if (key.return) {
        setMode('browse');
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery(s => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchQuery(s => s + input);
        return;
      }
      return;
    }

    // ─── Browse mode ──────────────────────────────────────────────────────
    if (mode === 'browse') {
      // 📖 Tab is the whole point of t264 — checked before anything else so no
      // view-specific binding can ever shadow it.
      if (key.tab) { toggleView(); return; }

      if (input === 'q') { exit(); return; }
      // 📖 Esc clears an active search/filter before it quits. Quitting on the
      // first Esc while a filter is on would throw away the narrowing you just
      // typed, and there'd be no way to undo it.
      if (key.escape) {
        if (searchQuery || filterMode !== 'all') {
          setSearchQuery('');
          setFilterMode('all');
          showStatus('Search and filter cleared', 1800);
          return;
        }
        exit();
        return;
      }
      if (input === 'r') { reloadBoard(); return; }
      if (input === 'd') { void toggleDaemon(); return; }
      if (input === 'n') { setCreateInput(''); setMode('create-task'); return; }
      if (input === '?') { setMode('cheatsheet'); return; }
      if (input === '/') { setMode('search'); return; }
      if (input === 'u') {
        const ok = undoLastAction(kandownDir);
        if (ok) {
          loadBoardInto();
          showStatus('Undid last action', 2000);
        } else {
          showStatus('No actions to undo', 2000);
        }
        return;
      }

      if (input === 'e') {
        const task = getFocusedTask();
        if (task) {
          const taskPath = join(getTasksDir(kandownDir), `${task.id}.md`);
          const editor = process.env.EDITOR || 'nano';
          try {
            spawnSync(editor, [taskPath], { stdio: 'inherit' });
            loadBoardInto();
          } catch (err) {
            showStatus(`Editor error: ${(err as Error).message}`, 3000);
          }
        }
        return;
      }

      if (input === 'x') {
        const task = getFocusedTask();
        if (task) {
          archiveTaskInBoard(kandownDir, task.id);
          loadBoardInto();
          showStatus(`Archived ${task.id}`, 2000);
        }
        return;
      }

      if (input === 'D') {
        const task = getFocusedTask();
        if (task) {
          setMode('confirm-delete');
        }
        return;
      }

      if (input === 'f') {
        const nextMode = FILTER_MODES[(FILTER_MODES.indexOf(filterMode) + 1) % FILTER_MODES.length];
        setFilterMode(nextMode);
        showStatus(`Filter: ${nextMode}`, 2000);
        return;
      }

      // ─── List view navigation ───────────────────────────────────────────
      // 📖 Everything above this point is view-agnostic (it acts on
      // getFocusedTask()); everything below is per-view movement.
      if (view === 'list') {
        const last = Math.max(0, listRows.length - 1);
        if (input === 'j' || key.downArrow) { setListIndex(i => Math.min(i + 1, last)); return; }
        if (input === 'k' || key.upArrow)   { setListIndex(i => Math.max(i - 1, 0)); return; }
        if (key.pageDown) { setListIndex(i => Math.min(i + listGeometry.viewport, last)); return; }
        if (key.pageUp)   { setListIndex(i => Math.max(i - listGeometry.viewport, 0)); return; }
        // 📖 g/G would be the vim bindings, but `g` is already the agent hook —
        // so home/end go to the bracket keys, which nothing else claims.
        if (input === '[') { setListIndex(0); return; }
        if (input === ']') { setListIndex(last); return; }
        if (input === 'l' || key.rightArrow) { shiftSelectedTask(1); return; }
        if (input === 'h' || key.leftArrow)  { shiftSelectedTask(-1); return; }
        if (input === 's') { cycleSort(); return; }
        if (input === 'z') { toggleDetailPane(); return; }
        if (input === 'm') { showStatus('In list view: h/l move the task between columns', 2500); return; }
        if (key.return) {
          const task = selectedRow?.task;
          if (task) openDetail(task.id);
          return;
        }
        if (input === 'a') {
          if (!selectedRow) return;
          requestAgentLaunch(selectedRow.task.id);
          return;
        }
        if (input === 'g') {
          if (selectedRow) void sendTaskToAgentHook(selectedRow.task.id);
          return;
        }
        return;
      }

      if (input === 'l' || key.rightArrow) {
        const maxCol = (board?.columns.length ?? 1) - 1;
        setColIndex(c => Math.min(c + 1, maxCol));
        setRowIndex(0);
        return;
      }
      if (input === 'h' || key.leftArrow) {
        setColIndex(c => Math.max(c - 1, 0));
        setRowIndex(0);
        return;
      }
      if (input === 'j' || key.downArrow) {
        const col = board?.columns[colIndex];
        const max = Math.max(0, (col?.tasks.length ?? 1) - 1);
        setRowIndex(r => Math.min(r + 1, max));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setRowIndex(r => Math.max(r - 1, 0));
        return;
      }

      // 📖 Enter = open detail (unchanged)
      if (key.return) {
        const task = getFocusedTask();
        if (task) openDetail(task.id);
        return;
      }

      // 📖 'm' = open context menu on focused task (proposes next column to right)
      if (input === 'm') {
        const col = board?.columns[colIndex];
        if (col && col.tasks.length > 0) {
          setCtxMenuRow(rowIndex);
          setCtxMenuCursor(0);
          setMode('context-menu');
        }
        return;
      }

      if (input === 'a') {
        const task = getFocusedTask();
        if (!task) return;
        requestAgentLaunch(task.id);
        return;
      }

      // 📖 `g` forwards the focused task to the agent hook configured on the
      // daemon. Strictly opt-in: if KANDOWN_AGENT_HOOK_URL is not set, the
      // daemon returns 501 and we surface that to the user — no silent no-op.
      if (input === 'g') {
        const task = getFocusedTask();
        if (!task) return;
        void sendTaskToAgentHook(task.id);
        return;
      }
    }

    // ─── Context menu mode ────────────────────────────────────────────────
    if (mode === 'context-menu') {
      if (key.escape || input === 'q') {
        closeContextMenu();
        setMode('browse');
        return;
      }
      if (input === 'j' || key.downArrow) {
        setCtxMenuCursor(c => Math.min(c + 1, 1)); // 2 options (0, 1)
        return;
      }
      if (input === 'k' || key.upArrow) {
        setCtxMenuCursor(c => Math.max(c - 1, 0));
        return;
      }
      if (key.return) {
        const col = board?.columns[colIndex];
        if (!col) return;
        const task = col.tasks[ctxMenuRow];
        if (!task) return;

        if (ctxMenuCursor === 0) {
          // 📖 Open task
          closeContextMenu();
          openDetail(task.id);
        } else {
          // 📖 Move task (proposes next column to the right)
          setMoveTaskId(task.id);
          const target = (colIndex + 1) % (board?.columns.length ?? 1);
          setMoveTargetCol(target);
          closeContextMenu();
          setMode('move-target');
        }
        return;
      }
      // 📖 Allow column/task navigation even while context menu is open
      // (pressing h/l changes column, j/k beyond menu range changes task focus)
    }

    // ─── Move-target mode ─────────────────────────────────────────────────
    if (mode === 'dragging') {
      if (key.escape || input === 'q') {
        setTaskDrag(null);
        setMousePress(null);
        setMoveTaskId(null);
        setMode('browse');
        return;
      }
      return;
    }

    if (mode === 'move-target') {
      if (key.escape || input === 'q') {
        setMoveTaskId(null);
        setMode('browse');
        return;
      }
      if (input === 'l' || key.rightArrow) {
        if (!board) return;
        const others = board.columns.map((_, i) => i).filter(i => i !== colIndex);
        const cur = others.indexOf(moveTargetCol);
        setMoveTargetCol(others[Math.min(cur + 1, others.length - 1)] ?? 0);
        return;
      }
      if (input === 'h' || key.leftArrow) {
        if (!board) return;
        const others = board.columns.map((_, i) => i).filter(i => i !== colIndex);
        const cur = others.indexOf(moveTargetCol);
        setMoveTargetCol(others[Math.max(cur - 1, 0)] ?? 0);
        return;
      }
      if (key.return) {
        if (!board || !moveTaskId) return;
        const name = board.columns[moveTargetCol]?.name;
        if (name) {
          if (!tryMoveWithGate(moveTaskId, name)) {
            setMoveTaskId(null);
            setMode('browse');
            return;
          }
          moveTaskToColumn(kandownDir, moveTaskId, name);
          loadBoardInto();
          showStatus(`Moved ${moveTaskId} → ${name}`, 2000);
        }
        setMoveTaskId(null);
        setMode('browse');
        return;
      }
    }

    // ─── Detail mode ──────────────────────────────────────────────────────
    if (mode === 'detail') {
      if (key.escape || input === 'q') { setMode('browse'); return; }
      if (input === 'j' || key.downArrow) {
        const bodyLines = detailTask ? detailTask.body.split('\n') : [];
        const maxVisible = (process.stdout.rows || 24) - 10;
        const maxScroll = Math.max(0, bodyLines.length - maxVisible);
        setDetailScroll(s => Math.min(s + 1, maxScroll));
        return;
      }
      if (input === 'k' || key.upArrow) { setDetailScroll(s => Math.max(0, s - 1)); return; }
      if (input === 'a') {
        if (!detailTaskId) return;
        requestAgentLaunch(detailTaskId);
        return;
      }
    }
    // agent-picker handled by AgentPicker component
  });

  // ─── Loading / empty states ───────────────────────────────────────────────

  // 📖 Fatal board-load error (t114): show the message + a retry hint instead
  // of crashing the TUI to the shell. Pressing 'r' triggers reloadBoard via
  // the main useInput handler below.
  if (boardError) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="red" bold>Error loading board</Text>
        <Text color="red">{boardError}</Text>
        <Text color="gray">Press 'r' to retry or 'q' to quit.</Text>
      </Box>
    );
  }

  if (!board) {
    return <Box padding={2}><Text color="gray">Loading board…</Text></Box>;
  }
  if (board.columns.length === 0) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="red" bold>No board found at {kandownDir}</Text>
        <Text color="gray">Run <Text color="cyan">kandown init</Text> to set up.</Text>
      </Box>
    );
  }

  const colWidth    = calcColWidth(board.columns.length);
  const focusedTask = getFocusedTask();

  // ─── Mode hint for header ────────────────────────────────────────────────

  let modeHint: string | undefined;
  if (mode === 'context-menu') {
    modeHint = 'j/k choose · Enter confirm · Esc cancel · or click';
  } else if (mode === 'move-target') {
    modeHint = '←/→ pick column · Enter confirm · Esc cancel · or click a column';
  } else if (mode === 'dragging') {
    modeHint = 'drag over target column · release to drop · Esc cancel';
  }

  // ─── Cheatsheet overlay ───────────────────────────────────────────────────

  if (mode === 'cheatsheet') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>Kandown TUI Cheatsheet (Press Esc or ? to return)</Text>
        <Text color="gray">{'─'.repeat(64)}</Text>
        <Text color="cyan" bold>Both views</Text>
        <Text><Text color="yellow" bold>Tab       </Text>Switch list ⇄ board (remembered per project)</Text>
        <Text><Text color="yellow" bold>n         </Text>Create new task (inline: #tag @user p1 due:date +t12)</Text>
        <Text><Text color="yellow" bold>e         </Text>Edit task file in $EDITOR</Text>
        <Text><Text color="yellow" bold>x         </Text>Archive focused task</Text>
        <Text><Text color="yellow" bold>D         </Text>Delete focused task (with confirmation)</Text>
        <Text><Text color="yellow" bold>/         </Text>Search id, title, tags, assignee</Text>
        <Text><Text color="yellow" bold>f         </Text>Cycle filter (all, P1, AI, human, blocked)</Text>
        <Text><Text color="yellow" bold>u         </Text>Undo last action</Text>
        <Text><Text color="yellow" bold>a         </Text>Launch AI agent on task</Text>
        <Text><Text color="yellow" bold>g         </Text>Send task to agent hook</Text>
        <Text><Text color="yellow" bold>d         </Text>Toggle local web daemon</Text>
        <Text><Text color="yellow" bold>r         </Text>Reload board from disk</Text>
        <Text><Text color="yellow" bold>Enter     </Text>Open task details</Text>
        <Text><Text color="yellow" bold>q         </Text>Quit  ·  <Text color="yellow" bold>Esc</Text> clear search/filter, else quit</Text>
        <Text> </Text>
        <Text color="cyan" bold>List view</Text>
        <Text><Text color="yellow" bold>j/k ↑/↓   </Text>Move selection  ·  <Text color="yellow" bold>PgUp/PgDn</Text> page  ·  <Text color="yellow" bold>[ ]</Text> top/bottom</Text>
        <Text><Text color="yellow" bold>h/l ←/→   </Text>Move the task one column left / right</Text>
        <Text><Text color="yellow" bold>s         </Text>Cycle sort (status, age, priority, id)</Text>
        <Text><Text color="yellow" bold>z         </Text>Show / hide the detail pane</Text>
        <Text> </Text>
        <Text color="cyan" bold>Board view</Text>
        <Text><Text color="yellow" bold>h/l ←/→   </Text>Navigate columns  ·  <Text color="yellow" bold>j/k ↑/↓</Text> navigate tasks</Text>
        <Text><Text color="yellow" bold>m         </Text>Open move context menu  ·  drag a card to move it</Text>
      </Box>
    );
  }

  // ─── Agent picker ─────────────────────────────────────────────────────────

  if (mode === 'agent-picker') {
    const taskId = detailTaskId || focusedTask?.id || '';
    return (
      <Box flexDirection="column">
        <BoardHeader title={board.title} inTmux={inTmux} version={version} daemonStatus={daemonStatus} daemonBusy={daemonBusy} />
        <AgentPicker
          agents={installedAgents}
          taskId={taskId}
          onSelect={handleAgentSelect}
          onCancel={() => setMode(detailTaskId ? 'detail' : 'browse')}
        />
      </Box>
    );
  }

  // ─── Task detail ──────────────────────────────────────────────────────────

  if (mode === 'detail' && detailTask) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} justifyContent="space-between">
          <Text color="gray">Esc back · a agent · j/k scroll</Text>
          {daemonStatus.running && daemonStatus.metadata ? (
            <Text color="blue" underline>{terminalHyperlink(webLinkLabel(daemonStatus.metadata.url), daemonStatus.metadata.url)}</Text>
          ) : (
            <Text color="gray" dimColor>KANDOWN  {board.title}</Text>
          )}
        </Box>
        <TaskDetail task={detailTask} taskId={detailTaskId} scrollOffset={detailScroll} />
        {statusMsg && <Box marginTop={1}><Text color="yellow">{statusMsg}</Text></Box>}
      </Box>
    );
  }

  // ─── Shared overlays ──────────────────────────────────────────────────────
  // 📖 Prompts and banners are identical in both views, so they are built once
  // here and appended to whichever view renders. Duplicating them per view is
  // how the two would drift apart the first time one gains a new prompt.

  const overlays = (
    <>
      {mode === 'create-task' && (
        <Box marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
          <Text color="green" bold>New Task: </Text>
          <Text>{createInput}</Text>
          <Text color="gray"> █ (Enter create · Esc cancel)</Text>
        </Box>
      )}

      {mode === 'confirm-delete' && focusedTask && (
        <Box marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
          <Text color="red" bold>Delete task {focusedTask.id} ({truncate(focusedTask.title, 30)})? [y/N] </Text>
        </Box>
      )}

      {mode === 'search' && (
        <Box marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan" bold>Search: </Text>
          <Text>{searchQuery}</Text>
          <Text color="gray"> █ (Enter done · Esc clear)</Text>
        </Box>
      )}
    </>
  );

  // ─── List view (default) ──────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <Box flexDirection="column">
        <BoardHeader
          title={board.title}
          inTmux={inTmux}
          modeHint={modeHint ?? 'Tab board · j/k select · h/l move · s sort · z pane · ? help'}
          version={version}
          daemonStatus={daemonStatus}
          daemonBusy={daemonBusy}
        />

        <TaskListView
          rows={listRows}
          selectedIndex={listIndex}
          geometry={listGeometry}
          sort={listSort}
          filter={filterMode}
          search={searchQuery}
          width={termWidth()}
        />

        {showDetailPane && (
          <TaskDetailPane
            row={selectedRow}
            filePath={selectedRow ? `tasks/${selectedRow.task.id}.md` : null}
            width={termWidth()}
          />
        )}

        {overlays}

        <StatusBar message={statusMsg} task={focusedTask} daemonStatus={daemonStatus} />
      </Box>
    );
  }

  // ─── Board view ───────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      <BoardHeader title={board.title} inTmux={inTmux} modeHint={modeHint} version={version} daemonStatus={daemonStatus} daemonBusy={daemonBusy} />

      <Box flexDirection="row">
        {board.columns.map((col, cIdx) => (
          <KanbanColumn
            key={col.name}
            name={col.name}
            tasks={col.tasks}
            focusedRow={cIdx === colIndex ? rowIndex : -1}
            isFocused={cIdx === colIndex}
            colWidth={colWidth}
            contextMenuRow={mode === 'context-menu' && cIdx === colIndex ? ctxMenuRow : -1}
            contextMenuCursor={ctxMenuCursor}
            showMoveTarget={(mode === 'move-target' && cIdx !== colIndex) || (mode === 'dragging' && cIdx !== taskDrag?.sourceCol)}
            isMoveFocused={(mode === 'move-target' || mode === 'dragging') && cIdx === moveTargetCol}
            draggedTaskId={taskDrag?.taskId ?? null}
            maxTasksHeight={Math.max(5, (process.stdout.rows || 24) - TASKS_START_Y - 3 - ((mode === 'move-target' || mode === 'dragging') ? 2 : 0))}
          />
        ))}
      </Box>

      {overlays}

      {(mode === 'move-target' || mode === 'dragging') && moveTaskId && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Moving <Text color="cyan">{moveTaskId}</Text>
            <Text color="gray"> — </Text>
            <Text color="yellow" bold>{mode === 'dragging' ? 'release over a column' : 'click a column'}</Text>
            <Text color="gray">{mode === 'dragging' ? ' · Esc cancel' : ' or ←/→ + Enter'}</Text>
          </Text>
        </Box>
      )}

      <StatusBar message={statusMsg} task={focusedTask} daemonStatus={daemonStatus} />
    </Box>
  );
}
