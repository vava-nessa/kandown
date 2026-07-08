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
 *  browse:       h/l ←/→ columns, j/k ↑/↓ tasks, Enter=detail, m=menu, a=agent, d=daemon, r=reload, q=quit
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
import { loadConfig } from '../lib/config.js';
import { getDaemonStatus, startProjectDaemon, stopProjectDaemon, type DaemonStatus } from '../lib/daemon.js';
import { createWatcher } from '../lib/file-watcher.js';
import { detectInstalledAgents, type AgentDef } from '../lib/agents.js';
import { launchAgent, isInTmux } from '../lib/launcher.js';
import type { ParsedBoard, BoardTask, ParsedTask } from '../../lib/types.js';
import { AgentPicker } from './agent-picker.js';
import { useMouseMode, parseMouseInput, isMouseInput } from '../hooks/use-mouse.js';
import { InlineContextMenu, MENU_HEIGHT } from '../components/task-context-menu.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'browse' | 'detail' | 'agent-picker' | 'context-menu' | 'move-target' | 'dragging';

interface MousePressState {
  taskId: string;
  colIndex: number;
  rowIndex: number;
  startX: number;
  startY: number;
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
  if (maxLen <= 0) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + '…';
}

/**
 * 📖 OSC 8 terminal hyperlink. Terminals that support it make the label
 * clickable; terminals without hyperlink support simply render the visible
 * label. Callers truncate/pad the plain label first so layout remains stable.
 */
function terminalHyperlink(label: string, url: string): string {
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

function webLinkLabel(url: string): string {
  return `↗ ${url.replace(/^https?:\/\//, '')}`;
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

function columnAccentColor(name: string): string {
  const normalized = name.toLowerCase();
  if (/backlog/.test(normalized)) return 'magenta';
  if (/todo/.test(normalized)) return 'cyan';
  if (/progress|doing/.test(normalized)) return 'yellow';
  if (/review/.test(normalized)) return 'blue';
  if (/done|archive|closed|complete/.test(normalized)) return 'green';
  return 'cyan';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * 📖 Single-line row for tasks WITHOUT a bracket tag / hashtag category.
 * Unchanged from the previous flat layout.
 */
function SingleTaskRow({ task, focused, dragging, colWidth }: {
  task: BoardTask; focused: boolean; dragging?: boolean; colWidth: number;
}) {
  const cursor = dragging ? '↕' : focused ? '▸' : ' ';
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
      <Text color={dragging ? 'yellow' : focused ? 'cyan' : undefined} bold={focused || dragging}>{cursor}{' '}</Text>
      <Text color={dragging ? 'yellow' : task.checked ? 'green' : focused ? 'white' : 'gray'}>{check}{' '}</Text>
      <Text color={dragging ? 'yellow' : focused ? 'cyan' : 'yellow'} bold={focused || dragging}>{idStr}</Text>
      {task.dependsOn && task.dependsOn.length > 0 && (
        // 📖 TUI equivalent of the web card's `↪N` chip. Surfaces blocked
        // work inline so the user doesn't try to move a task they can't
        // unblock without a different upstream task first.
        <Text color="yellow">{' '}↪{task.dependsOn.length}</Text>
      )}
      {tag && <Text color={focused ? 'white' : 'magenta'} bold>{' '}{tag}</Text>}
      <Text color={focused ? 'white' : 'gray'}>{' '}{titleStr}</Text>
    </Box>
  );
}

/**
 * 📖 Returns the bracket tag / hashtag extracted from a task title.
 * Used to decide whether a task should render as CategoryTaskRow.
 * Mirrors extractGroupKey from src/lib/grouping.ts but also captures the
 * display label (without brackets / hash) for the category line.
 */
function getTitleCategory(title: string): { key: string; label: string } | null {
  const bracket = title.match(/^\[([^\]]+)\]\s*/);
  if (bracket) return { key: `[${bracket[1].toLowerCase()}]`, label: bracket[1] };
  const hash = title.match(/#(\w+)/);
  if (hash) return { key: `#${hash[1].toLowerCase()}`, label: `#${hash[1]}` };
  return null;
}

/**
 * 📖 3-line dark-gray block for tasks that have a bracket tag or hashtag.
 *
 * Layout (all inside one Box flexDirection="column"):
 *   Line 1 — ▸ t102          (cursor + task ID)
 *   Line 2 —   refactor       (category tag, indented)
 *   Line 3 —   My task title (clean title, indented)
 *
 * The outer Box counts as one logical row in the column's task list, so
 * focusedRow navigation (j/k) continues to work correctly.
 */
function CategoryTaskRow({ task, focused, dragging, colWidth }: {
  task: BoardTask; focused: boolean; dragging?: boolean; colWidth: number;
}) {
  const cursor   = dragging ? '↕' : focused ? '▸' : ' ';
  const check    = task.checked ? '✓' : '○';
  const idStr    = task.id;
  const category = getTitleCategory(task.title);

  // Strip the bracket tag / hashtag from the title for the 3rd line
  const titleClean = category
    ? task.title.slice(task.title.indexOf(category.key) + category.key.length).trim()
    : task.title;

  // colWidth − 2 for left indent (cursor prefix + one space)
  const contentWidth = Math.max(4, colWidth - 2);
  const titleStr     = truncate(titleClean, contentWidth);

  // Color scheme: dark bg (#222), white text, magenta category
  const bg       = dragging ? 'yellow' : focused ? 'cyan' : '#222';
  const txtColor = dragging ? 'black'  : focused ? 'black' : 'white';
  const catColor = dragging ? 'black'  : focused ? 'black' : 'magenta';

  return (
    <Box flexDirection="column" backgroundColor={bg}>
      {/* Line 1: cursor + checkbox + task ID */}
      <Text color={txtColor} bold={focused || dragging}>
        {cursor} {check}{' '}{idStr}
      </Text>
      {/* Line 2: category tag (magenta, always bold for visual pop) */}
      {category && (
        <Text color={catColor} bold>
          {'  '}{category.label}
        </Text>
      )}
      {/* Line 3: title (clean, truncated) */}
      <Text color={txtColor}>
        {'  '}{titleStr}
      </Text>
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
  contextMenuRow, contextMenuCursor, showMoveTarget, isMoveFocused, draggedTaskId }: {
  name: string; tasks: BoardTask[]; focusedRow: number;
  isFocused: boolean; colWidth: number;
  /** Task index that has the context menu open (-1 = none) */
  contextMenuRow?: number;
  /** Which context-menu option is highlighted (0 or 1) */
  contextMenuCursor?: number;
  showMoveTarget?: boolean; isMoveFocused?: boolean;
  draggedTaskId?: string | null;
}) {
  const accent = columnAccentColor(name);
  const headerBg    = isFocused ? accent : undefined;
  const headerColor = isFocused ? 'black' : accent;
  const countStr    = tasks.length > 0 ? ` (${tasks.length})` : '';

  // 📖 Build task rows: CategoryTaskRow for tagged tasks, SingleTaskRow otherwise.
  // A thin separator line (─) is inserted between tasks for visual separation.
  const rows: React.ReactNode[] = [];
  tasks.forEach((task, idx) => {
    const hasCategory = getTitleCategory(task.title) !== null;
    rows.push(
      hasCategory
        ? <CategoryTaskRow key={task.id} task={task} focused={!!(isFocused && idx === focusedRow)} dragging={task.id === draggedTaskId} colWidth={colWidth} />
        : <SingleTaskRow  key={task.id} task={task} focused={!!(isFocused && idx === focusedRow)} dragging={task.id === draggedTaskId} colWidth={colWidth} />
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
    // 📖 Separator line between tasks (but not after the last one)
    if (idx < tasks.length - 1) {
      rows.push(
        <Text key={`sep-${task.id}`} color={isFocused ? 'cyan' : 'gray'} dimColor>{'─'.repeat(colWidth)}</Text>
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

function BoardHeader({ title, inTmux, modeHint, version, daemonStatus, daemonBusy }: {
  title: string;
  inTmux: boolean;
  modeHint?: string;
  version?: string;
  daemonStatus: DaemonStatus;
  daemonBusy: boolean;
}) {
  const tmuxHint    = inTmux ? ' tmux' : '';
  const versionTag  = version ? ` v${version}` : '';
  const daemonLabel = daemonBusy
    ? '◌ daemon…'
    : daemonStatus.running
      ? `● web ${daemonStatus.metadata?.port ?? ''}`
      : '○ web off';
  const hint = modeHint || 'h/l cols · j/k tasks · drag tasks · a agent · g send-hook · d daemon · r reload · q quit';
  const width = termWidth();
  const leftWidth = Math.min(Math.max(34, Math.floor(width * 0.46)), width);
  const daemonWidth = Math.min(16, Math.max(0, width - leftWidth));
  const rightWidth = Math.max(0, width - leftWidth - daemonWidth);
  const left = pad(`  ◆ KANDOWN${tmuxHint}${versionTag}  ${title}`, leftWidth);
  const daemon = pad(daemonLabel, daemonWidth);
  const webUrl = daemonStatus.running ? daemonStatus.metadata?.url : null;
  const rightPlain = webUrl ? truncate(webLinkLabel(webUrl), rightWidth) : truncate(hint, rightWidth);
  const right = rightPlain.padStart(rightWidth, ' ');
  const rightPadding = right.slice(0, Math.max(0, right.length - rightPlain.length));
  const rightContent = webUrl ? `${rightPadding}${terminalHyperlink(rightPlain, webUrl)}` : right;

  return (
    <Box marginBottom={1}>
      <Text bold color="cyan">{left}</Text>
      {daemonWidth > 0 && <Text color={daemonStatus.running ? 'green' : 'yellow'} bold>{daemon}</Text>}
      {rightWidth > 0 && (
        <Text color={webUrl ? 'blue' : 'gray'} dimColor={!webUrl} underline={!!webUrl}>{rightContent}</Text>
      )}
    </Box>
  );
}

function StatusBar({ message, task, daemonStatus }: {
  message: string;
  task: BoardTask | null;
  daemonStatus: DaemonStatus;
}) {
  const daemonText = daemonStatus.running && daemonStatus.metadata
    ? `web daemon ON · ${daemonStatus.metadata.url}`
    : 'web daemon OFF · press d to start';

  return (
    <Box marginTop={1} flexDirection="column">
      {message ? (
        <Text color="yellow" bold>  ✦ {message}</Text>
      ) : task ? (
        <Text color="gray">
          {'  '}◆ <Text color="yellow" bold>{task.id}</Text>
          {task.progress ? `  checklist ${task.progress.done}/${task.progress.total}` : ''}
          {'  '}{task.checked ? '✓ done' : '○ open'}
        </Text>
      ) : (
        <Text color="gray"> </Text>
      )}
      <Text color={daemonStatus.running ? 'green' : 'yellow'} dimColor={!daemonStatus.running}>
        {'  '}{daemonStatus.running ? '●' : '○'} {daemonText}
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
      {Array.isArray(fm.depends_on) && fm.depends_on.length > 0 && (
        // 📖 TUI equivalent of the web Drawer's dependency chips. Lists raw
        // ids — the user can `cat tasks/<id>.md` to inspect any one. We don't
        // resolve live status here (read-only context) but the move gate in
        // the TUI blocks the user from moving into Done until they're clear.
        <Box marginBottom={1}>
          <Text color="gray">depends on: </Text>
          <Text color="yellow">{fm.depends_on.join(', ')}</Text>
        </Box>
      )}
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

  const columnAtX = useCallback((x: number): number => {
    const layout = layoutRef.current;
    for (let c = 0; c < layout.colStarts.length; c++) {
      const start = layout.colStarts[c];
      if (x >= start && x < start + layout.colWidth) return c;
    }
    return -1;
  }, []);

  const taskHitAt = useCallback((x: number, y: number): MousePressState | null => {
    if (!board) return null;
    const clickedCol = columnAtX(x);
    if (clickedCol < 0) return null;
    const col = board.columns[clickedCol];
    if (!col) return null;
    const taskIdx = y - TASKS_START_Y;
    const task = taskIdx >= 0 ? col.tasks[taskIdx] : undefined;
    if (!task) return null;
    return { taskId: task.id, colIndex: clickedCol, rowIndex: taskIdx, startX: x, startY: y };
  }, [board, columnAtX]);

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
      updateLayout(loaded);
      setBoardError(null);
      return loaded;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBoardError(`Failed to load board: ${msg}`);
      setStatusMsg('');
      return null;
    }
  }, [kandownDir, updateLayout]);

  useEffect(() => {
    loadBoardInto();
    setInstalledAgents(detectInstalledAgents());
  }, [kandownDir, loadBoardInto]);

  useEffect(() => {
    const watcher = createWatcher();
    watcher.on('taskChanged', () => {
      loadBoardInto();
    });
    watcher.on('newTaskDetected', (taskId: string) => {
      loadBoardInto();
      setStatusMsg(`New task: ${taskId}`);
      setTimeout(() => setStatusMsg(''), 2000);
    });
    watcher.on('configChanged', () => {
      loadBoardInto();
    });
    watcher.start(kandownDir);
    return () => { watcher.stop(); };
  }, [kandownDir, loadBoardInto]);

  const reloadBoard = useCallback(() => {
    const loaded = loadBoardInto();
    if (loaded) {
      setStatusMsg('Board reloaded');
      setTimeout(() => setStatusMsg(''), 1500);
    }
  }, [loadBoardInto]);

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
        setStatusMsg('Web daemon stopped');
      } else {
        const next = await startProjectDaemon(kandownDir, preferredDaemonPort);
        setDaemonStatus(next);
        if (next.running && next.metadata) setPreferredDaemonPort(next.metadata.port);
        setStatusMsg(next.running ? 'Web daemon started' : 'Web daemon failed to start');
      }
    } catch (error) {
      setStatusMsg(`Daemon error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDaemonBusy(false);
      setTimeout(() => setStatusMsg(''), 2500);
    }
  }, [daemonBusy, kandownDir, preferredDaemonPort]);

  // 📖 TUI gate check: refuses to move a task to the terminal column when at
  // least one of its `depends_on` ids is not yet resolved (terminal or
  // archived). Mirrors the web store's gate. Returns true when the move
  // is safe to perform, false when it was blocked.
  const tryMoveWithGate = useCallback((taskId: string, targetCol: string): boolean => {
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
      setStatusMsg(`Blocked: ${taskId} ← ${list}`);
      setTimeout(() => setStatusMsg(''), 3500);
      return false;
    }
    return true;
  }, [board, kandownDir]);

  // 📖 Forwards a task to the agent hook configured on the CLI daemon. The
  // hook is strictly opt-in via KANDOWN_AGENT_HOOK_URL on the daemon process.
  // If the hook is unconfigured, the daemon returns 501 — we surface that
  // instead of silently no-op'ing so users learn the feature exists.
  const sendTaskToAgentHook = useCallback(async (taskId: string) => {
    const status = await getDaemonStatus(kandownDir);
    if (!status.running || !status.metadata) {
      setStatusMsg('Web daemon not running (press d to start)');
      setTimeout(() => setStatusMsg(''), 2500);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${status.metadata.port}/api/tasks/${encodeURIComponent(taskId)}/agent`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        setStatusMsg(`Sent ${taskId} to agent hook`);
      } else {
        const body = await res.text().catch(() => '');
        setStatusMsg(`Agent hook: ${res.status}${body ? ' — ' + body.slice(0, 60) : ''}`);
      }
    } catch (error) {
      setStatusMsg(`Agent hook failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTimeout(() => setStatusMsg(''), 3000);
    }
  }, [kandownDir]);

  // ─── Derived helpers ──────────────────────────────────────────────────────

  const getFocusedTask = useCallback((): BoardTask | null => {
    if (!board) return null;
    const col = board.columns[colIndex];
    if (!col || col.tasks.length === 0) return null;
    return col.tasks[Math.min(rowIndex, col.tasks.length - 1)] ?? null;
  }, [board, colIndex, rowIndex]);

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
      setStatusMsg(`Error opening task: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setStatusMsg(''), 4000);
    }
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
          if (!tryMoveWithGate(moveTaskId, targetColName)) {
            setMoveTaskId(null);
            setMode('browse');
            return;
          }
          moveTaskToColumn(kandownDir, moveTaskId, targetColName);
          loadBoardInto();
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
  }, [board, mode, colIndex, rowIndex, ctxMenuRow, moveTaskId, kandownDir, updateLayout, openDetail, closeContextMenu, loadBoardInto]);

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
            setStatusMsg(`Dragged ${taskDrag.taskId} → ${targetColName}`);
            setTimeout(() => setStatusMsg(''), 2000);
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
  }, [board, mode, mousePress, taskDrag, taskHitAt, columnAtX, closeContextMenu, handleMouseClick, kandownDir, updateLayout]);

  // ─── Input handling (keyboard + mouse) ────────────────────────────────────

  useInput((input, key) => {
    // 📖 Mouse sequence detected — parse and handle click
    if (isMouseInput(input)) {
      const mouse = parseMouseInput(input);
      if (mouse) handleMouseEvent(mouse);
      return;
    }

    // ─── Browse mode ──────────────────────────────────────────────────────
    if (mode === 'browse') {
      if (input === 'q' || key.escape) { exit(); return; }
      if (input === 'r') { reloadBoard(); return; }
      if (input === 'd') { void toggleDaemon(); return; }

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
    modeHint = '←/→ pick column · Enter confirm · Esc cancel · or click ↓';
  } else if (mode === 'dragging') {
    modeHint = 'drag over target column · release to drop · Esc cancel';
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

  // ─── Main board view ──────────────────────────────────────────────────────

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
            // 📖 Context menu renders inline in the focused column only
            contextMenuRow={mode === 'context-menu' && cIdx === colIndex ? ctxMenuRow : -1}
            contextMenuCursor={ctxMenuCursor}
            showMoveTarget={(mode === 'move-target' && cIdx !== colIndex) || (mode === 'dragging' && cIdx !== taskDrag?.sourceCol)}
            isMoveFocused={(mode === 'move-target' || mode === 'dragging') && cIdx === moveTargetCol}
            draggedTaskId={taskDrag?.taskId ?? null}
          />
        ))}
      </Box>

      {(mode === 'move-target' || mode === 'dragging') && moveTaskId && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Moving <Text color="cyan">{moveTaskId}</Text>
            <Text color="gray"> — </Text>
            <Text color="yellow" bold>{mode === 'dragging' ? 'release over a column' : 'click ↓'}</Text>
            <Text color="gray">{mode === 'dragging' ? ' · Esc cancel' : ' or ←/→ + Enter'}</Text>
          </Text>
        </Box>
      )}

      <StatusBar message={statusMsg} task={focusedTask} daemonStatus={daemonStatus} />
    </Box>
  );
}
