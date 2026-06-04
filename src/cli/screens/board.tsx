/**
 * @file TUI Board Screen
 * @description Interactive kanban board for the Kandown CLI. Renders columns
 * and tasks with keyboard + mouse navigation, inline context menu, task move
 * flow, detail view, and AI agent launch.
 *
 * 📖 Modes:
 *  - 'browse'       — main board, navigate columns/tasks (keyboard + mouse)
 *  - 'context-menu' — inline menu under a task: "Open task" / "Move task"
 *  - 'move-target'  — pick target column to move task (↓ placeholders)
 *  - 'detail'       — full-screen task detail
 *  - 'agent-picker' — AI agent selection overlay
 *
 * 📖 Mouse (v2 — no stdin interception):
 *  - Terminal mouse mode enabled via ANSI \x1b[?1006h (SGR)
 *  - Click sequences detected in Ink's useInput via parseMouseInput()
 *  - Click on task → focus it + open inline context menu
 *  - Click on "Open" / "Move" in context menu → execute action
 *  - Click on ↓ placeholder → move task
 *  - Click outside → cancel current mode
 *
 * 📖 Keyboard:
 *  browse:       h/l ←/→ columns, j/k ↑/↓ tasks, Enter=detail, m=menu, a=agent, r=reload, q=quit
 *  context-menu: j/k ↑/↓ options, Enter=confirm, Esc=cancel
 *  move-target:  h/l ←/→ columns, Enter=confirm, Esc=cancel
 *  detail:       j/k scroll, a=agent, Esc=back
 *
 * @functions
 *  → Board — main screen component
 *
 * @exports Board
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { readBoard, readTask, moveTaskToColumn } from '../lib/board-reader.js';
import { createWatcher } from '../lib/file-watcher.js';
import { detectInstalledAgents, type AgentDef } from '../lib/agents.js';
import { launchAgent, isInTmux } from '../lib/launcher.js';
import type { ParsedBoard, BoardTask, ParsedTask } from '../../lib/types.js';
import { AgentPicker } from './agent-picker.js';
import { useMouseMode, parseMouseInput, isMouseInput } from '../hooks/use-mouse.js';
import { InlineContextMenu, MENU_HEIGHT } from '../components/task-context-menu.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'browse' | 'detail' | 'agent-picker' | 'context-menu' | 'move-target';

interface BoardProps {
  kandownDir: string;
  version?: string;
}

// ─── Layout constants ────────────────────────────────────────────────────────

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
const TASKS_START_Y = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function pad(str: string, len: number): string {
  const t = truncate(str, len);
  return t + ' '.repeat(Math.max(0, len - t.length));
}

function termWidth(): number {
  return process.stdout.columns || 80;
}

function calcColWidth(numCols: number): number {
  const available = termWidth() - (numCols - 1);
  return Math.max(12, Math.floor(available / numCols));
}

// 📖 Hoisted regexes
const RE_HEADER     = /^#{1,3}\s/;
const RE_SUBTASK    = /^\s*-\s+\[([ xX])\]/;
const RE_DONE       = /^\s*-\s+\[x\]/i;
const RE_BRACKET_TAG = /^\[([^\]]+)\]\s*/;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaskRow({ task, focused, colWidth }: {
  task: BoardTask; focused: boolean; colWidth: number;
}) {
  const cursor = focused ? '▸' : ' ';
  const check  = task.checked ? '✓' : '○';
  const idStr  = task.id;

  const tagMatch = task.title.match(RE_BRACKET_TAG);
  const tag = tagMatch ? `[${tagMatch[1]}]` : '';
  const titleClean = tagMatch ? task.title.slice(tagMatch[0].length) : task.title;

  const fixedChars = 4 + idStr.length + 1;
  const tagChars = tag ? tag.length + 1 : 0;
  const titleStr = truncate(titleClean, Math.max(4, colWidth - fixedChars - tagChars));

  return (
    <Box>
      <Text color={focused ? 'cyan' : undefined} bold={focused}>{cursor}{' '}</Text>
      <Text color={task.checked ? 'green' : focused ? 'white' : 'gray'}>{check}{' '}</Text>
      <Text color={focused ? 'cyan' : 'yellow'} bold={focused}>{idStr}</Text>
      {tag && <Text color={focused ? 'white' : 'magenta'} bold>{' '}{tag}</Text>}
      <Text color={focused ? 'white' : 'gray'}>{' '}{titleStr}</Text>
    </Box>
  );
}

function MovePlaceholder({ name, focused, colWidth }: {
  name: string; focused: boolean; colWidth: number;
}) {
  return (
    <Box>
      <Text
        color={focused ? 'black' : 'yellow'}
        backgroundColor={focused ? 'yellow' : undefined}
        bold={focused}
      >
        {'  '}{pad(`↓ ${name}`, colWidth - 2)}
      </Text>
    </Box>
  );
}

function KanbanColumn({ name, tasks, focusedRow, isFocused, colWidth,
  contextMenuRow, contextMenuCursor, showMoveTarget, isMoveFocused }: {
  name: string; tasks: BoardTask[]; focusedRow: number;
  isFocused: boolean; colWidth: number;
  /** Task index that has the context menu open (-1 = none) */
  contextMenuRow?: number;
  /** Which context-menu option is highlighted (0 or 1) */
  contextMenuCursor?: number;
  showMoveTarget?: boolean; isMoveFocused?: boolean;
}) {
  const headerBg    = isFocused ? 'cyan' : undefined;
  const headerColor = isFocused ? 'black' : 'cyan';
  const countStr    = tasks.length > 0 ? ` (${tasks.length})` : '';

  // 📖 Build task rows with optional inline context menu
  const rows: React.ReactNode[] = [];
  tasks.forEach((task, idx) => {
    rows.push(
      <TaskRow
        key={task.id}
        task={task}
        focused={isFocused && idx === focusedRow}
        colWidth={colWidth}
      />
    );
    // 📖 Insert context menu directly after the focused task
    if (contextMenuRow === idx) {
      rows.push(
        <InlineContextMenu
          key="ctx-menu"
          cursor={contextMenuCursor ?? 0}
          colWidth={colWidth}
        />
      );
    }
  });

  return (
    <Box flexDirection="column" width={colWidth} marginRight={1}>
      <Box backgroundColor={headerBg}>
        <Text color={headerColor} bold>{pad(`${name}${countStr}`, colWidth)}</Text>
      </Box>
      <Text color={isFocused ? 'cyan' : 'gray'}>{'─'.repeat(colWidth)}</Text>

      {tasks.length === 0 ? (
        <Text color="gray" dimColor>{' '.repeat(2)}(empty)</Text>
      ) : rows}

      {showMoveTarget && (
        <MovePlaceholder name={name} focused={!!isMoveFocused} colWidth={colWidth} />
      )}
    </Box>
  );
}

function BoardHeader({ title, inTmux, modeHint, version }: {
  title: string; inTmux: boolean; modeHint?: string; version?: string;
}) {
  const tmuxHint    = inTmux ? ' tmux' : '';
  const versionTag  = version ? ` v${version}` : '';
  const hint = modeHint || 'h/l cols · j/k tasks · Enter detail · m menu · a agent · r reload · q quit';
  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Text bold color="cyan">{'  '}KANDOWN{tmuxHint}{versionTag}{'  '}{title}</Text>
      <Text color="gray" dimColor>{hint}</Text>
    </Box>
  );
}

function StatusBar({ message, task }: { message: string; task: BoardTask | null }) {
  if (message) {
    return <Box marginTop={1}><Text color="yellow">{message}</Text></Box>;
  }
  if (!task) return <Box marginTop={1}><Text color="gray"> </Text></Box>;
  return (
    <Box marginTop={1}>
      <Text color="gray">
        {task.id}
        {task.progress ? `  (${task.progress.done}/${task.progress.total})` : ''}
        {'  '}{task.checked ? '✓ done' : '○ open'}
      </Text>
    </Box>
  );
}

function TaskDetail({ task, taskId, scrollOffset }: {
  task: ParsedTask; taskId: string; scrollOffset: number;
}) {
  const fm = task.frontmatter;
  const bodyLines = task.body.split('\n');
  const maxVisible = (process.stdout.rows || 24) - 10;
  const visibleLines = bodyLines.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box marginBottom={1}>
        <Text bold color="cyan">{taskId}</Text>
        <Text color="white" bold>{'  '}{fm.title}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">
          status: <Text color="yellow">{fm.status ?? '—'}</Text>
          {fm.priority ? `  priority: ${fm.priority}` : ''}
          {fm.assignee ? `  assignee: ${fm.assignee}` : ''}
          {fm.due ? `  due: ${fm.due}` : ''}
        </Text>
      </Box>
      <Text color="gray">{'─'.repeat(termWidth() - 4)}</Text>
      {visibleLines.map((line, idx) => {
        const isH = RE_HEADER.test(line);
        const isS = RE_SUBTASK.test(line);
        const isD = RE_DONE.test(line);
        return (
          <Text key={scrollOffset + idx}
            color={isH ? 'cyan' : isD ? 'green' : isS ? 'white' : 'gray'}
            bold={isH}
          >{line || ' '}</Text>
        );
      })}
      {bodyLines.length > maxVisible && (
        <Text color="gray" dimColor>
          {'  '}↑↓ scroll  ({scrollOffset + 1}–{Math.min(scrollOffset + maxVisible, bodyLines.length)}/{bodyLines.length} lines)
        </Text>
      )}
    </Box>
  );
}

// ─── Main Board ──────────────────────────────────────────────────────────────

export function Board({ kandownDir, version }: BoardProps) {
  const { exit } = useApp();

  // ─── State ────────────────────────────────────────────────────────────────

  const [board, setBoard]       = useState<ParsedBoard | null>(null);
  const [colIndex, setColIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [mode, setMode]         = useState<Mode>('browse');
  const [statusMsg, setStatusMsg] = useState('');

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

  // Agents
  const [installedAgents, setInstalledAgents] = useState<AgentDef[]>([]);

  const inTmux = isInTmux();

  // ─── Layout tracking for mouse hit-testing ────────────────────────────────

  const layoutRef = useRef<{ colStarts: number[]; colWidth: number }>({
    colStarts: [], colWidth: 0,
  });

  const updateLayout = useCallback((b: ParsedBoard | null) => {
    if (!b) return;
    const cw = calcColWidth(b.columns.length);
    const starts: number[] = [];
    let x = 1;
    for (let i = 0; i < b.columns.length; i++) {
      starts.push(x);
      x += cw + 1;
    }
    layoutRef.current = { colStarts: starts, colWidth: cw };
  }, []);

  // ─── Board loading & watching ─────────────────────────────────────────────

  useEffect(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    updateLayout(loaded);
    setInstalledAgents(detectInstalledAgents());
  }, [kandownDir, updateLayout]);

  useEffect(() => {
    const watcher = createWatcher();
    watcher.on('taskChanged', () => {
      const loaded = readBoard(kandownDir);
      setBoard(loaded);
      updateLayout(loaded);
    });
    watcher.on('newTaskDetected', (taskId: string) => {
      const loaded = readBoard(kandownDir);
      setBoard(loaded);
      updateLayout(loaded);
      setStatusMsg(`New task: ${taskId}`);
      setTimeout(() => setStatusMsg(''), 2000);
    });
    watcher.on('configChanged', () => {
      const loaded = readBoard(kandownDir);
      setBoard(loaded);
      updateLayout(loaded);
    });
    watcher.start(kandownDir);
    return () => { watcher.stop(); };
  }, [kandownDir, updateLayout]);

  const reloadBoard = useCallback(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    updateLayout(loaded);
    setStatusMsg('Board reloaded');
    setTimeout(() => setStatusMsg(''), 1500);
  }, [kandownDir, updateLayout]);

  // ─── Derived helpers ──────────────────────────────────────────────────────

  const getFocusedTask = useCallback((): BoardTask | null => {
    if (!board) return null;
    const col = board.columns[colIndex];
    if (!col || col.tasks.length === 0) return null;
    return col.tasks[Math.min(rowIndex, col.tasks.length - 1)] ?? null;
  }, [board, colIndex, rowIndex]);

  const openDetail = useCallback((taskId: string) => {
    const task = readTask(kandownDir, taskId);
    setDetailTask(task);
    setDetailTaskId(taskId);
    setDetailScroll(0);
    setMode('detail');
  }, [kandownDir]);

  const closeContextMenu = useCallback(() => {
    setCtxMenuRow(-1);
    setCtxMenuCursor(0);
  }, []);

  const handleAgentSelect = useCallback((agentId: string) => {
    const task = getFocusedTask();
    const taskId = mode === 'detail' ? detailTaskId : task?.id;
    if (!taskId) return;
    setMode('browse');
    setStatusMsg(`Launching ${agentId} for ${taskId}…`);
    setTimeout(() => {
      try {
        launchAgent({ taskId, agentId, kandownDir, onBeforeExec: () => exit() });
        reloadBoard();
        setStatusMsg(`${agentId} launched in tmux pane`);
        setTimeout(() => setStatusMsg(''), 3000);
      } catch (err) {
        setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setStatusMsg(''), 4000);
      }
    }, 50);
  }, [mode, detailTaskId, getFocusedTask, kandownDir, exit, reloadBoard]);

  // ─── Mouse mode ───────────────────────────────────────────────────────────

  useMouseMode(mode !== 'agent-picker');

  // ─── Mouse click handler (called from useInput when mouse sequence detected) ─

  const handleMouseClick = useCallback((x: number, y: number) => {
    if (!board) return;
    const layout = layoutRef.current;

    // 📖 Step 1: determine which column was clicked
    let clickedCol = -1;
    for (let c = 0; c < layout.colStarts.length; c++) {
      const start = layout.colStarts[c];
      if (x >= start && x < start + layout.colWidth) {
        clickedCol = c;
        break;
      }
    }

    if (mode === 'browse') {
      if (clickedCol < 0) return;
      const col = board.columns[clickedCol];
      // 📖 Y → task index (no context menu to offset)
      const taskIdx = y - TASKS_START_Y;
      if (taskIdx >= 0 && taskIdx < col.tasks.length) {
        setColIndex(clickedCol);
        setRowIndex(taskIdx);
        // 📖 Open context menu on this task
        setCtxMenuRow(taskIdx);
        setCtxMenuCursor(0);
        setMode('context-menu');
      }
      return;
    }

    if (mode === 'context-menu') {
      if (clickedCol < 0) { closeContextMenu(); setMode('browse'); return; }
      const col = board.columns[clickedCol];
      const hasMenu = clickedCol === colIndex && ctxMenuRow >= 0;

      if (hasMenu) {
        // 📖 This column has the inline context menu after ctxMenuRow
        // Rows 0..ctxMenuRow: normal tasks
        // Rows ctxMenuRow+1 .. ctxMenuRow+MENU_HEIGHT: context menu
        // Rows after: tasks shifted by MENU_HEIGHT
        const taskIdx = y - TASKS_START_Y;

        if (taskIdx >= 0 && taskIdx < ctxMenuRow) {
          // Clicked a task ABOVE the menu → switch focus to it
          setRowIndex(taskIdx);
          setCtxMenuRow(taskIdx);
          setCtxMenuCursor(0);
          return;
        }
        if (taskIdx === ctxMenuRow) {
          // Clicked the same task → close menu
          closeContextMenu();
          setMode('browse');
          return;
        }
        const menuOffset = taskIdx - ctxMenuRow - 1; // 0-based menu option
        if (menuOffset >= 0 && menuOffset < MENU_HEIGHT) {
          // 📖 Clicked a context menu option!
          if (menuOffset === 0) {
            // Open task
            const task = col.tasks[ctxMenuRow];
            if (task) { closeContextMenu(); openDetail(task.id); }
          } else {
            // Move task
            const task = col.tasks[ctxMenuRow];
            if (task) {
              setMoveTaskId(task.id);
              const target = colIndex === 0 ? Math.min(1, board.columns.length - 1) : 0;
              setMoveTargetCol(target);
              closeContextMenu();
              setMode('move-target');
            }
          }
          return;
        }
        // Below menu → task shifted by MENU_HEIGHT
        const belowIdx = taskIdx - MENU_HEIGHT;
        if (belowIdx >= 0 && belowIdx < col.tasks.length) {
          setRowIndex(belowIdx);
          closeContextMenu();
          setCtxMenuRow(belowIdx);
          setCtxMenuCursor(0);
          // Stay in context-menu mode for the new task
          return;
        }
      } else {
        // 📖 Clicked in a different column — no menu offset
        const taskIdx = y - TASKS_START_Y;
        if (taskIdx >= 0 && taskIdx < col.tasks.length) {
          closeContextMenu();
          setColIndex(clickedCol);
          setRowIndex(taskIdx);
          setCtxMenuRow(taskIdx);
          setCtxMenuCursor(0);
          // Stay in context-menu for the newly clicked task
          return;
        }
      }
      // Clicked empty space → cancel
      closeContextMenu();
      setMode('browse');
      return;
    }

    if (mode === 'move-target') {
      if (clickedCol < 0) { setMoveTaskId(null); setMode('browse'); return; }
      if (clickedCol === colIndex) { setMoveTaskId(null); setMode('browse'); return; }

      // 📖 Check if click is on the ↓ placeholder in this column
      const col = board.columns[clickedCol];
      const placeholderY = TASKS_START_Y + col.tasks.length;
      if (y === placeholderY) {
        // Move!
        const targetColName = col.name;
        if (moveTaskId) {
          moveTaskToColumn(kandownDir, moveTaskId, targetColName);
          const loaded = readBoard(kandownDir);
          setBoard(loaded);
          updateLayout(loaded);
          setStatusMsg(`Moved ${moveTaskId} → ${targetColName}`);
          setTimeout(() => setStatusMsg(''), 2000);
        }
        setMoveTaskId(null);
        setMode('browse');
        return;
      }
      // Clicked elsewhere → cancel move
      setMoveTaskId(null);
      setMode('browse');
      return;
    }
  }, [board, mode, colIndex, rowIndex, ctxMenuRow, moveTaskId, kandownDir, updateLayout, openDetail, closeContextMenu]);

  // ─── Input handling (keyboard + mouse) ────────────────────────────────────

  useInput((input, key) => {
    // 📖 Mouse sequence detected — parse and handle click
    if (isMouseInput(input)) {
      const mouse = parseMouseInput(input);
      if (mouse && mouse.action === 'press' && mouse.button === 0) {
        handleMouseClick(mouse.x, mouse.y);
      }
      return;
    }

    // ─── Browse mode ──────────────────────────────────────────────────────
    if (mode === 'browse') {
      if (input === 'q' || key.escape) { exit(); return; }
      if (input === 'r') { reloadBoard(); return; }

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

      // 📖 'm' = open context menu on focused task
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
        if (installedAgents.length === 0) {
          setStatusMsg('No AI agents found in PATH');
          setTimeout(() => setStatusMsg(''), 3000);
          return;
        }
        const task = getFocusedTask();
        if (!task) return;
        setMode('agent-picker');
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
          // 📖 Move task
          setMoveTaskId(task.id);
          const target = colIndex === 0 ? Math.min(1, (board?.columns.length ?? 1) - 1) : 0;
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
          moveTaskToColumn(kandownDir, moveTaskId, name);
          const loaded = readBoard(kandownDir);
          setBoard(loaded);
          updateLayout(loaded);
          setStatusMsg(`Moved ${moveTaskId} → ${name}`);
          setTimeout(() => setStatusMsg(''), 2000);
        }
        setMoveTaskId(null);
        setMode('browse');
        return;
      }
    }

    // ─── Detail mode ──────────────────────────────────────────────────────
    if (mode === 'detail') {
      if (key.escape || input === 'q') { setMode('browse'); return; }
      if (input === 'j' || key.downArrow) { setDetailScroll(s => s + 1); return; }
      if (input === 'k' || key.upArrow) { setDetailScroll(s => Math.max(0, s - 1)); return; }
      if (input === 'a') {
        if (installedAgents.length === 0) {
          setStatusMsg('No AI agents found in PATH');
          setTimeout(() => setStatusMsg(''), 3000);
          return;
        }
        setMode('agent-picker');
        return;
      }
    }
    // agent-picker handled by AgentPicker component
  });

  // ─── Loading / empty states ───────────────────────────────────────────────

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
    modeHint = '←/→ pick column · Enter confirm · Esc cancel · or click ↓';
  }

  // ─── Agent picker ─────────────────────────────────────────────────────────

  if (mode === 'agent-picker') {
    const taskId = detailTaskId || focusedTask?.id || '';
    return (
      <Box flexDirection="column">
        <BoardHeader title={board.title} inTmux={inTmux} version={version} />
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
          <Text color="gray" dimColor>KANDOWN  {board.title}</Text>
        </Box>
        <TaskDetail task={detailTask} taskId={detailTaskId} scrollOffset={detailScroll} />
        {statusMsg && <Box marginTop={1}><Text color="yellow">{statusMsg}</Text></Box>}
      </Box>
    );
  }

  // ─── Main board view ──────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      <BoardHeader title={board.title} inTmux={inTmux} modeHint={modeHint} version={version} />

      <Box flexDirection="row">
        {board.columns.map((col, cIdx) => (
          <KanbanColumn
            key={col.name}
            name={col.name}
            tasks={col.tasks}
            focusedRow={cIdx === colIndex ? rowIndex : -1}
            isFocused={cIdx === colIndex}
            colWidth={colWidth}
            // 📖 Context menu renders inline in the focused column only
            contextMenuRow={mode === 'context-menu' && cIdx === colIndex ? ctxMenuRow : -1}
            contextMenuCursor={ctxMenuCursor}
            showMoveTarget={mode === 'move-target' && cIdx !== colIndex}
            isMoveFocused={mode === 'move-target' && cIdx === moveTargetCol}
          />
        ))}
      </Box>

      {mode === 'move-target' && moveTaskId && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Moving <Text color="cyan">{moveTaskId}</Text>
            <Text color="gray"> — click </Text>
            <Text color="yellow" bold>↓</Text>
            <Text color="gray"> or ←/→ + Enter</Text>
          </Text>
        </Box>
      )}

      <StatusBar message={statusMsg} task={focusedTask} />
    </Box>
  );
}
