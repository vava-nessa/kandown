/**
 * @file TUI Board Screen
 * @description Interactive kanban board for the Kandown CLI. Renders all columns
 * and tasks derived from task frontmatter with keyboard navigation, **mouse click
 * support**, task detail view, context menu, and AI agent launch.
 *
 * 📖 Modes:
 *  - 'browse'       — main board view, navigate columns and tasks (keyboard + mouse)
 *  - 'detail'       — full-screen task detail (Enter from browse, or "Open task" from menu)
 *  - 'agent-picker' — agent selection overlay (press 'a' in browse or detail)
 *  - 'context-menu' — small popup on task click: "Open task" / "Move task"
 *  - 'move-target'  — pick target column to move task (placeholders in other columns)
 *
 * 📖 Mouse support:
 *  - Uses SGR extended mouse mode (\x1b[?1006h) for reliable click tracking
 *  - Click on a task → opens context menu
 *  - Click on context menu option → executes action
 *  - In move-target mode, click on a column placeholder → moves task
 *  - Keyboard still works everywhere (h/j/k/l, Enter, Esc)
 *
 * 📖 Keyboard shortcuts:
 *  browse:       h/l or ←/→  navigate columns
 *                j/k or ↑/↓  navigate tasks within column
 *                Enter        open task detail
 *                a            open agent picker for focused task
 *                r            reload board from disk
 *                q/Esc        quit
 *  detail:       j/k or ↑/↓  scroll content
 *                a            open agent picker
 *                Esc/q        back to board
 *  agent-picker: ↑/↓          navigate agents
 *                Enter        launch selected agent
 *                Esc/q        cancel
 *  context-menu: ↑/↓ or j/k   navigate options
 *                Enter         confirm
 *                Esc/q         cancel
 *  move-target:  ←/→           navigate columns
 *                Enter         confirm move
 *                Esc/q         cancel
 *
 * @functions
 *  → Board — main screen component
 *
 * @exports Board
 * @see src/cli/lib/board-reader.ts — scans task files and builds columns
 * @see src/cli/lib/agents.ts       — agent registry and detection
 * @see src/cli/lib/launcher.ts     — process spawning
 * @see src/cli/screens/agent-picker.tsx — agent selection overlay
 * @see src/cli/hooks/use-mouse.ts — terminal mouse tracking hook
 * @see src/cli/components/task-context-menu.tsx — task action popup
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { readBoard, readTask, moveTaskToColumn } from '../lib/board-reader.js';
import { createWatcher, type FileWatcher } from '../lib/file-watcher.js';
import { detectInstalledAgents, type AgentDef } from '../lib/agents.js';
import { launchAgent, isInTmux } from '../lib/launcher.js';
import type { ParsedBoard, BoardTask, ParsedTask } from '../../lib/types.js';
import { AgentPicker } from './agent-picker.js';
import { useMouse, type MouseEvent } from '../hooks/use-mouse.js';
import { TaskContextMenu, type ContextMenuOption } from '../components/task-context-menu.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'browse' | 'detail' | 'agent-picker' | 'context-menu' | 'move-target';

interface BoardProps {
  kandownDir: string;
  /** 📖 Current kandown version, displayed in the header (auto-injected from package.json via bin/kandown.js) */
  version?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// 📖 Number of lines at the top of the TUI before the task rows start:
// Line 0: BoardHeader
// Line 1: (spacing)
// Line 2: Column header
// Line 3: Column divider (─)
// Line 4+: Task rows
const HEADER_LINES = 4;

// 📖 Number of chars at the left of each column (cursor + space + check + space + id + space)
const TASK_ROW_LEFT_PADDING = 6; // "▸ ○ id "

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 📖 Truncate a string to maxLen chars, appending '…' if cut. */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** 📖 Pads a string to exactly len chars (truncating or space-padding). */
function pad(str: string, len: number): string {
  const t = truncate(str, len);
  return t + ' '.repeat(Math.max(0, len - t.length));
}

/** 📖 Returns the number of visible terminal columns available. */
function termWidth(): number {
  return process.stdout.columns || 80;
}

/** 📖 Returns the number of visible terminal rows. */
function termHeight(): number {
  return process.stdout.rows || 24;
}

// 📖 Column width calculation: distribute terminal width evenly across all board columns,
// with a minimum of 12 chars per column (to keep it readable on narrow terminals).
function calcColWidth(numCols: number): number {
  const available = termWidth() - (numCols - 1); // 1 char separator between each column
  return Math.max(12, Math.floor(available / numCols));
}

// 📖 Hoisted regexes — defined at module level to avoid re-creation inside render loops (js-hoist-regexp)
const RE_HEADER = /^#{1,3}\s/;
const RE_SUBTASK = /^\s*-\s+\[([ xX])\]/;
const RE_DONE_SUBTASK = /^\s*-\s+\[x\]/i;

// ─── Sub-components ───────────────────────────────────────────────────────────

// 📖 Regex to extract a leading bracket tag from task titles (e.g. "[optimization]", "[CLI REFACTOR-3]")
const RE_BRACKET_TAG = /^\[([^\]]+)\]\s*/;

/** 📖 Single task row in a column. Shows cursor marker, ID, and title.
 *  If the title starts with a bracketed tag like [optimization], it renders bold on the ID line. */
function TaskRow({
  task,
  focused,
  colWidth,
}: {
  task: BoardTask;
  focused: boolean;
  colWidth: number;
}) {
  const cursor = focused ? '▸' : ' ';
  const check = task.checked ? '✓' : '○';
  const idStr = task.id;

  // 📖 Extract optional bracket prefix (e.g. "[optimization]") from the title
  const tagMatch = task.title.match(RE_BRACKET_TAG);
  const tag = tagMatch ? `[${tagMatch[1]}]` : '';
  const titleWithoutTag = tagMatch ? task.title.slice(tagMatch[0].length) : task.title;

  // 📖 Layout: "▸ ○ t-019 [tag] title…"  — cursor(1)+space(1)+check(1)+space(1) + id + space + tag + space + title
  const fixedChars = 4 + idStr.length + 1; // cursor+space+check+space + id + trailing space
  const tagChars = tag ? tag.length + 1 : 0; // tag + space after tag
  const available = colWidth - fixedChars - tagChars;
  const titleStr = truncate(titleWithoutTag, Math.max(4, available));

  return (
    <Box>
      <Text color={focused ? 'cyan' : undefined} bold={focused}>
        {cursor}{' '}
      </Text>
      <Text color={task.checked ? 'green' : focused ? 'white' : 'gray'}>
        {check}{' '}
      </Text>
      <Text color={focused ? 'cyan' : 'yellow'} bold={focused}>
        {idStr}
      </Text>
      {tag && (
        <Text color={focused ? 'white' : 'magenta'} bold>
          {' '}{tag}
        </Text>
      )}
      <Text color={focused ? 'white' : 'gray'}>{' '}{titleStr}</Text>
    </Box>
  );
}

/** 📖 Move-target placeholder — shown at the bottom of other columns during move mode. */
function MovePlaceholder({
  name,
  focused,
  colWidth,
}: {
  name: string;
  focused: boolean;
  colWidth: number;
}) {
  const label = `↓ ${name}`;
  return (
    <Box>
      <Text
        color={focused ? 'black' : 'yellow'}
        backgroundColor={focused ? 'yellow' : undefined}
        bold={focused}
      >
        {'  '}
        {pad(label, colWidth - 2)}
      </Text>
    </Box>
  );
}

/** 📖 A single kanban column: header + task list + optional move placeholder. */
function KanbanColumn({
  name,
  tasks,
  focusedRow,
  isFocused,
  colWidth,
  showMoveTarget,
  isMoveFocused,
}: {
  name: string;
  tasks: BoardTask[];
  focusedRow: number;
  isFocused: boolean;
  colWidth: number;
  /** Whether to show the move-target placeholder (move mode, other columns only) */
  showMoveTarget?: boolean;
  /** Whether the move target in this column is focused */
  isMoveFocused?: boolean;
}) {
  const headerBg = isFocused ? 'cyan' : undefined;
  const headerColor = isFocused ? 'black' : 'cyan';
  const countStr = tasks.length > 0 ? ` (${tasks.length})` : '';
  const headerText = truncate(`${name}${countStr}`, colWidth);

  return (
    <Box flexDirection="column" width={colWidth} marginRight={1}>
      {/* Column header */}
      <Box backgroundColor={headerBg}>
        <Text color={headerColor} bold>
          {pad(headerText, colWidth)}
        </Text>
      </Box>
      {/* Divider */}
      <Text color={isFocused ? 'cyan' : 'gray'}>
        {'─'.repeat(colWidth)}
      </Text>

      {/* Task rows */}
      {tasks.length === 0 ? (
        <Text color="gray" dimColor>
          {' '.repeat(2)}{'(empty)'}
        </Text>
      ) : (
        tasks.map((task, idx) => (
          <TaskRow
            key={task.id}
            task={task}
            focused={isFocused && idx === focusedRow}
            colWidth={colWidth}
          />
        ))
      )}

      {/* Move-target placeholder — shown in other columns during move mode */}
      {showMoveTarget && (
        <MovePlaceholder name={name} focused={!!isMoveFocused} colWidth={colWidth} />
      )}
    </Box>
  );
}

/** 📖 Header bar showing board title and key hints. */
function BoardHeader({ title, inTmux, modeHint, version }: { title: string; inTmux: boolean; modeHint?: string; version?: string }) {
  const tmuxHint = inTmux ? ' tmux' : '';
  const hint = modeHint || 'h/l cols  j/k tasks  Enter detail  a agent  r reload  q quit';
  const versionTag = version ? ` v${version}` : '';
  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Text bold color="cyan">
        {'  '}KANDOWN{tmuxHint}{versionTag}{'  '}{title}
      </Text>
      <Text color="gray" dimColor>
        {hint}
      </Text>
    </Box>
  );
}

/** 📖 Status bar at the bottom — shows focused task info or a message. */
function StatusBar({ message, task }: { message: string; task: BoardTask | null }) {
  if (message) {
    return (
      <Box marginTop={1}>
        <Text color="yellow">{message}</Text>
      </Box>
    );
  }
  if (!task) return <Box marginTop={1}><Text color="gray"> </Text></Box>;
  return (
    <Box marginTop={1}>
      <Text color="gray">
{task.id.replace(/^t/, '')}
        {task.progress ? `  (${task.progress.done}/${task.progress.total})` : ''}
        {'  '}
        {task.checked ? '✓ done' : '○ open'}
      </Text>
    </Box>
  );
}

// ─── Task Detail View ─────────────────────────────────────────────────────────

/** 📖 Full-screen task detail. Shows frontmatter info + full body. Scrollable. */
function TaskDetail({
  task,
  taskId,
  scrollOffset,
}: {
  task: ParsedTask;
  taskId: string;
  scrollOffset: number;
}) {
  const fm = task.frontmatter;
  const bodyLines = task.body.split('\n');
  const maxVisible = (process.stdout.rows || 24) - 10; // reserve space for header/footer
  const visibleLines = bodyLines.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" paddingX={2}>
      {/* Task header */}
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

      {/* Body content */}
      {visibleLines.map((line, idx) => {
        const isHeader = RE_HEADER.test(line);
        const isSubtask = RE_SUBTASK.test(line);
        const isDone = RE_DONE_SUBTASK.test(line);
        return (
          <Text
            key={scrollOffset + idx}
            color={isHeader ? 'cyan' : isDone ? 'green' : isSubtask ? 'white' : 'gray'}
            bold={isHeader}
          >
            {line || ' '}
          </Text>
        );
      })}

      {/* Scroll hint */}
      {bodyLines.length > maxVisible && (
        <Text color="gray" dimColor>
          {'  '}↑↓ scroll  ({scrollOffset + 1}–{Math.min(scrollOffset + maxVisible, bodyLines.length)}/{bodyLines.length} lines)
        </Text>
      )}
    </Box>
  );
}

// ─── Main Board Component ─────────────────────────────────────────────────────

export function Board({ kandownDir, version }: BoardProps) {
  const { exit } = useApp();

  // 📖 Board data and cursor state
  const [board, setBoard] = useState<ParsedBoard | null>(null);
  const [colIndex, setColIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);

  // 📖 View mode state
  const [mode, setMode] = useState<Mode>('browse');
  const [detailTask, setDetailTask] = useState<ParsedTask | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string>('');
  const [detailScroll, setDetailScroll] = useState(0);

  // 📖 Agent picker state
  const [installedAgents, setInstalledAgents] = useState<AgentDef[]>([]);

  // 📖 Status message (e.g. "Launching agent…", "No agents installed")
  const [statusMsg, setStatusMsg] = useState('');

  // 📖 Context menu state — which task was clicked
  const [contextTaskId, setContextTaskId] = useState<string | null>(null);

  // 📖 Move mode state — which task is being moved, and cursor for target column
  const [moveTaskId, setMoveTaskId] = useState<string | null>(null);
  const [moveTargetCol, setMoveTargetCol] = useState(0);

  const inTmux = isInTmux();

  // ─── Layout tracking for mouse hit-testing ──────────────────────────────────

  // 📖 We need to know the exact pixel position of each task row on screen
  // so we can map mouse clicks to tasks. We track column positions and row counts.
  const layoutRef = useRef<{
    colStarts: number[];   // x-position (1-based) where each column starts
    colWidth: number;      // width of each column
    colTaskCounts: number[]; // number of tasks in each column
  }>({
    colStarts: [],
    colWidth: 0,
    colTaskCounts: [],
  });

  // 📖 Update layout info whenever board changes
  const updateLayout = useCallback((b: ParsedBoard | null) => {
    if (!b) return;
    const cw = calcColWidth(b.columns.length);
    const starts: number[] = [];
    let x = 1; // 1-based terminal columns
    for (let i = 0; i < b.columns.length; i++) {
      starts.push(x);
      x += cw + 1; // +1 for marginRight separator
    }
    layoutRef.current = {
      colStarts: starts,
      colWidth: cw,
      colTaskCounts: b.columns.map(c => c.tasks.length),
    };
  }, []);

  // 📖 Load board on mount, detect agents in background
  useEffect(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    updateLayout(loaded);
    setInstalledAgents(detectInstalledAgents());
  }, [kandownDir, updateLayout]);

  // 📖 Live file watcher — uses content hashing, fires silently (no status flash),
  // preserves cursor position. Max delay from disk change to board update: 500ms.
  useEffect(() => {
    const watcher = createWatcher();

    watcher.on('taskChanged', () => {
      const loaded = readBoard(kandownDir);
      setBoard(loaded);
      updateLayout(loaded);
    });

    watcher.on('newTaskDetected', (taskId) => {
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

    return () => {
      watcher.stop();
    };
  }, [kandownDir, updateLayout]);

  // 📖 Reload board from disk (press 'r')
  const reloadBoard = useCallback(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    updateLayout(loaded);
    setStatusMsg('Board reloaded');
    setTimeout(() => setStatusMsg(''), 1500);
  }, [kandownDir, updateLayout]);

  // 📖 Get the task currently under the cursor (or null if column empty)
  const getFocusedTask = useCallback((): BoardTask | null => {
    if (!board) return null;
    const col = board.columns[colIndex];
    if (!col || col.tasks.length === 0) return null;
    return col.tasks[Math.min(rowIndex, col.tasks.length - 1)] ?? null;
  }, [board, colIndex, rowIndex]);

  // 📖 Open task detail view for a given task ID
  const openDetail = useCallback((taskId: string) => {
    const task = readTask(kandownDir, taskId);
    setDetailTask(task);
    setDetailTaskId(taskId);
    setDetailScroll(0);
    setMode('detail');
  }, [kandownDir]);

  // 📖 Launch the selected agent for the currently focused (or detail) task
  const handleAgentSelect = useCallback((agentId: string) => {
    const task = getFocusedTask();
    const taskId = mode === 'detail' ? detailTaskId : task?.id;
    if (!taskId) return;

    setMode('browse');
    setStatusMsg(`Launching ${agentId} for ${taskId}…`);

    setTimeout(() => {
      try {
        launchAgent({
          taskId,
          agentId,
          kandownDir,
          onBeforeExec: () => exit(),
        });
        reloadBoard();
        setStatusMsg(`${agentId} launched in tmux pane`);
        setTimeout(() => setStatusMsg(''), 3000);
      } catch (err) {
        setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setStatusMsg(''), 4000);
      }
    }, 50);
  }, [mode, detailTaskId, getFocusedTask, kandownDir, exit, reloadBoard]);

  // ─── Mouse click handler ──────────────────────────────────────────────────

  const handleMouseClick = useCallback((evt: MouseEvent) => {
    if (evt.button !== 0) return; // left click only
    if (!board) return;

    const { x, y } = evt;
    const layout = layoutRef.current;

    if (mode === 'browse') {
      // 📖 Hit-test: determine which column and row was clicked
      // Row mapping: HEADER_LINES + taskRowIndex = terminal row (1-based)
      for (let c = 0; c < board.columns.length; c++) {
        const colStart = layout.colStarts[c] || 0;
        const colEnd = colStart + layout.colWidth;

        if (x >= colStart && x <= colEnd) {
          const taskRow = y - HEADER_LINES;
          if (taskRow >= 0 && taskRow < board.columns[c].tasks.length) {
            // 📖 Clicked on a valid task — update cursor and open context menu
            setColIndex(c);
            setRowIndex(taskRow);
            const task = board.columns[c].tasks[taskRow];
            if (task) {
              setContextTaskId(task.id);
              setMode('context-menu');
            }
            return;
          }
        }
      }
      return;
    }

    if (mode === 'context-menu') {
      // 📖 Context menu click detection
      // The menu is rendered below the column row area.
      // The tallest column determines where the menu starts on screen.
      // Row layout: HEADER_LINES + maxTaskCount + 1 (spacing) + menuOffset
      const maxTasks = Math.max(...board.columns.map(c => c.tasks.length), 0);
      const menuStartY = HEADER_LINES + maxTasks + 1;
      const menuRow = y - menuStartY;

      // Menu layout (0-based from menuStartY):
      //   Row 0: header (┌─ taskId ─┐)
      //   Row 1: "Open task"
      //   Row 2: "Move task"
      //   Row 3: footer (└──┘)
      if (menuRow === 1) {
        // 📖 "Open task" clicked
        if (contextTaskId) {
          setContextTaskId(null);
          openDetail(contextTaskId);
        }
        return;
      }
      if (menuRow === 2) {
        // 📖 "Move task" clicked
        if (contextTaskId) {
          const taskId = contextTaskId;
          setContextTaskId(null);
          setMoveTaskId(taskId);
          const target = colIndex === 0 ? Math.min(1, board.columns.length - 1) : 0;
          setMoveTargetCol(target);
          setMode('move-target');
        }
        return;
      }

      // 📖 Clicked outside the menu → cancel and go back to browse
      if (menuRow < 0 || menuRow > 3) {
        // Also check if they clicked on a task in a different column → open context for that task
        for (let c = 0; c < board.columns.length; c++) {
          const colStart = layout.colStarts[c] || 0;
          const colEnd = colStart + layout.colWidth;
          if (x >= colStart && x <= colEnd) {
            const taskRow = y - HEADER_LINES;
            if (taskRow >= 0 && taskRow < board.columns[c].tasks.length) {
              // Clicked on another task — switch context to it
              setColIndex(c);
              setRowIndex(taskRow);
              const task = board.columns[c].tasks[taskRow];
              if (task) {
                setContextTaskId(task.id);
              }
              return;
            }
          }
        }
        // Clicked on empty space → close menu
        setContextTaskId(null);
        setMode('browse');
      }
      return;
    }

    if (mode === 'move-target') {
      // 📖 Click on a column's move placeholder to move the task
      let clickedPlaceholder = false;
      for (let c = 0; c < board.columns.length; c++) {
        if (c === colIndex) continue; // skip source column
        const colStart = layout.colStarts[c] || 0;
        const colEnd = colStart + layout.colWidth;
        const colTaskCount = board.columns[c].tasks.length;
        const placeholderRow = HEADER_LINES + colTaskCount;

        if (x >= colStart && x <= colEnd && y === placeholderRow) {
          // 📖 Move task to this column!
          const targetColName = board.columns[c].name;
          if (moveTaskId && targetColName) {
            moveTaskToColumn(kandownDir, moveTaskId, targetColName);
            const loaded = readBoard(kandownDir);
            setBoard(loaded);
            updateLayout(loaded);
            setStatusMsg(`Moved ${moveTaskId} → ${targetColName}`);
            setTimeout(() => setStatusMsg(''), 2000);
          }
          setMoveTaskId(null);
          setMode('browse');
          clickedPlaceholder = true;
          break;
        }
      }
      // 📖 Clicked outside any placeholder → cancel move mode
      if (!clickedPlaceholder) {
        // Check if they clicked on a task in a column
        let clickedTask = false;
        for (let c = 0; c < board.columns.length; c++) {
          const colStart = layout.colStarts[c] || 0;
          const colEnd = colStart + layout.colWidth;
          if (x >= colStart && x <= colEnd) {
            const taskRow = y - HEADER_LINES;
            if (taskRow >= 0 && taskRow < board.columns[c].tasks.length) {
              clickedTask = true;
              break;
            }
          }
        }
        if (!clickedTask) {
          setMoveTaskId(null);
          setMode('browse');
        }
      }
      return;
    }
  }, [board, mode, colIndex, contextTaskId, moveTaskId, kandownDir, updateLayout, openDetail]);

  // ─── Enable mouse tracking ───────────────────────────────────────────────

  useMouse(handleMouseClick, { enabled: mode !== 'agent-picker' });

  // ─── Keyboard handling ────────────────────────────────────────────────────

  useInput((input, key) => {
    if (mode === 'browse') {
      // Quit
      if (input === 'q' || key.escape) { exit(); return; }

      // Reload
      if (input === 'r') { reloadBoard(); return; }

      // Column navigation
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

      // Task navigation
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

      // Open detail
      if (key.return) {
        const task = getFocusedTask();
        if (task) openDetail(task.id);
        return;
      }

      // Open agent picker
      if (input === 'a') {
        if (installedAgents.length === 0) {
          setStatusMsg('No AI agents found in PATH (install claude, codex, aider, goose…)');
          setTimeout(() => setStatusMsg(''), 3000);
          return;
        }
        const task = getFocusedTask();
        if (!task) return;
        setMode('agent-picker');
        return;
      }
    }

    // 📖 context-menu mode: keyboard is handled entirely by TaskContextMenu component.
    // We skip here to avoid double-handling (Ink fires all useInput hooks for the same key).
    if (mode === 'context-menu') {
      return;
    }

    if (mode === 'move-target') {
      // Cancel
      if (key.escape || input === 'q') {
        setMoveTaskId(null);
        setMode('browse');
        return;
      }

      // Navigate between target columns
      if (input === 'l' || key.rightArrow) {
        if (!board) return;
        const otherCols = board.columns
          .map((_, i) => i)
          .filter(i => i !== colIndex);
        const currentIdx = otherCols.indexOf(moveTargetCol);
        const nextIdx = Math.min(currentIdx + 1, otherCols.length - 1);
        setMoveTargetCol(otherCols[nextIdx] ?? 0);
        return;
      }
      if (input === 'h' || key.leftArrow) {
        if (!board) return;
        const otherCols = board.columns
          .map((_, i) => i)
          .filter(i => i !== colIndex);
        const currentIdx = otherCols.indexOf(moveTargetCol);
        const prevIdx = Math.max(currentIdx - 1, 0);
        setMoveTargetCol(otherCols[prevIdx] ?? 0);
        return;
      }

      // Confirm move
      if (key.return) {
        if (!board || !moveTaskId) return;
        const targetColName = board.columns[moveTargetCol]?.name;
        if (targetColName) {
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
    }

    if (mode === 'detail') {
      // Back to board
      if (key.escape || input === 'q') { setMode('browse'); return; }

      // Scroll
      if (input === 'j' || key.downArrow) {
        setDetailScroll(s => s + 1);
        return;
      }
      if (input === 'k' || key.upArrow) {
        setDetailScroll(s => Math.max(0, s - 1));
        return;
      }

      // Open agent picker from detail view
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

    // agent-picker mode is handled inside AgentPicker component
  });

  // ─── Loading state ────────────────────────────────────────────────────────

  if (!board) {
    return (
      <Box padding={2}>
        <Text color="gray">Loading board…</Text>
      </Box>
    );
  }

  // ─── No kandown found ─────────────────────────────────────────────────────

  if (board.columns.length === 0) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="red" bold>No board found at {kandownDir}</Text>
        <Text color="gray">Run <Text color="cyan">kandown init</Text> to set up kandown in this project.</Text>
      </Box>
    );
  }

  const colWidth = calcColWidth(board.columns.length);
  const focusedTask = getFocusedTask();

  // ─── Agent picker overlay ─────────────────────────────────────────────────

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

  // ─── Task detail view ─────────────────────────────────────────────────────

  if (mode === 'detail' && detailTask) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} justifyContent="space-between">
          <Text color="gray">Esc back  a launch agent  j/k scroll</Text>
          <Text color="gray" dimColor>KANDOWN  {board.title}</Text>
        </Box>
        <TaskDetail task={detailTask} taskId={detailTaskId} scrollOffset={detailScroll} />
        {statusMsg && (
          <Box marginTop={1}><Text color="yellow">{statusMsg}</Text></Box>
        )}
      </Box>
    );
  }

  // ─── Context menu options ──────────────────────────────────────────────────

  const contextMenuOptions: ContextMenuOption[] = [
    { id: 'open', label: 'Open task', icon: '📖' },
    { id: 'move', label: 'Move task', icon: '↗' },
  ];

  // ─── Determine mode hint ───────────────────────────────────────────────────

  let modeHint: string | undefined;
  if (mode === 'context-menu') {
    modeHint = '↑/↓ navigate  Enter confirm  Esc cancel  (or click)';
  } else if (mode === 'move-target') {
    modeHint = '←/→ pick column  Enter confirm  Esc cancel  (or click ↓ placeholder)';
  }

  // ─── Main board view (browse / context-menu / move-target) ────────────────

  return (
    <Box flexDirection="column">
      <BoardHeader title={board.title} inTmux={inTmux} modeHint={modeHint} version={version} />

      {/* Column layout */}
      <Box flexDirection="row">
        {board.columns.map((col, cIdx) => (
          <KanbanColumn
            key={col.name}
            name={col.name}
            tasks={col.tasks}
            focusedRow={cIdx === colIndex ? rowIndex : -1}
            isFocused={cIdx === colIndex}
            colWidth={colWidth}
            showMoveTarget={
              mode === 'move-target' && cIdx !== colIndex
            }
            isMoveFocused={
              mode === 'move-target' && cIdx === moveTargetCol
            }
          />
        ))}
      </Box>

      {/* Context menu — rendered below the task that was clicked */}
      {mode === 'context-menu' && contextTaskId && (
        <Box marginTop={0}>
          <TaskContextMenu
            taskId={contextTaskId}
            options={contextMenuOptions}
            onSelect={(optionId) => {
              if (optionId === 'open') {
                setContextTaskId(null);
                openDetail(contextTaskId);
              } else if (optionId === 'move') {
                setContextTaskId(null);
                setMoveTaskId(contextTaskId);
                const target = colIndex === 0 ? Math.min(1, board.columns.length - 1) : 0;
                setMoveTargetCol(target);
                setMode('move-target');
              }
            }}
            onCancel={() => {
              setContextTaskId(null);
              setMode('browse');
            }}
            mouseX={layoutRef.current.colStarts[colIndex]}
            mouseY={HEADER_LINES + rowIndex}
          />
        </Box>
      )}

      {/* Move mode status */}
      {mode === 'move-target' && moveTaskId && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Moving <Text color="cyan">{moveTaskId}</Text>
            <Text color="gray"> — click a </Text>
            <Text color="yellow" bold>↓</Text>
            <Text color="gray"> placeholder or use ←/→ + Enter</Text>
          </Text>
        </Box>
      )}

      <StatusBar message={statusMsg} task={focusedTask} />
    </Box>
  );
}
