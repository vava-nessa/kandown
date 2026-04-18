/**
 * @file TUI Board Screen
 * @description Interactive kanban board for the Kandown CLI. Renders all columns and
 * tasks from board.md with keyboard navigation, task detail view, and AI agent launch.
 *
 * 📖 Modes:
 *  - 'browse'       — main board view, navigate columns and tasks
 *  - 'detail'       — full-screen task detail (Enter from browse)
 *  - 'agent-picker' — agent selection overlay (press 'a' in browse or detail)
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
 *
 * @functions
 *  → Board — main screen component
 *
 * @exports Board
 * @see src/cli/lib/board-reader.ts — reads board.md and task files
 * @see src/cli/lib/agents.ts       — agent registry and detection
 * @see src/cli/lib/launcher.ts     — process spawning
 * @see src/cli/screens/agent-picker.tsx — agent selection overlay
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { readBoard, readTask } from '../lib/board-reader.js';
import { detectInstalledAgents, type AgentDef } from '../lib/agents.js';
import { launchAgent, isInTmux } from '../lib/launcher.js';
import type { ParsedBoard, BoardTask, ParsedTask } from '../../lib/types.js';
import { AgentPicker } from './agent-picker.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'browse' | 'detail' | 'agent-picker';

interface BoardProps {
  kandownDir: string;
}

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

/** 📖 Single task row in a column. Shows cursor marker, ID, and title. */
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
  // 📖 Layout: "▸ ○ t-019 title…"  — cursor(1) + space(1) + check(1) + space(1) + id + space + title
  const idStr = task.id;
  const available = colWidth - 4 - idStr.length - 1; // 4 = cursor+space+check+space, 1 = space after id
  const titleStr = truncate(task.title, Math.max(4, available));

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
      <Text color={focused ? 'white' : 'gray'}>{' '}{titleStr}</Text>
    </Box>
  );
}

/** 📖 A single kanban column: header + task list. */
function KanbanColumn({
  name,
  tasks,
  focusedRow,
  isFocused,
  colWidth,
}: {
  name: string;
  tasks: BoardTask[];
  focusedRow: number;
  isFocused: boolean;
  colWidth: number;
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
    </Box>
  );
}

/** 📖 Header bar showing board title and key hints. */
function BoardHeader({ title, inTmux }: { title: string; inTmux: boolean }) {
  const tmuxHint = inTmux ? ' tmux' : '';
  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Text bold color="cyan">
        {'  '}KANDOWN{tmuxHint}{'  '}{title}
      </Text>
      <Text color="gray" dimColor>
        h/l cols  j/k tasks  Enter detail  a agent  r reload  q quit
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
        {task.id}
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

export function Board({ kandownDir }: BoardProps) {
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

  const inTmux = isInTmux();

  // 📖 Load board on mount, detect agents in background
  useEffect(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    setInstalledAgents(detectInstalledAgents());
  }, [kandownDir]);

  // 📖 Reload board from disk (press 'r')
  const reloadBoard = useCallback(() => {
    const loaded = readBoard(kandownDir);
    setBoard(loaded);
    setStatusMsg('Board reloaded');
    setTimeout(() => setStatusMsg(''), 1500);
  }, [kandownDir]);

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

    // 📖 Small delay so the status message renders before we potentially replace the process
    setTimeout(() => {
      try {
        launchAgent({
          taskId,
          agentId,
          kandownDir,
          onBeforeExec: () => exit(),
        });
        // 📖 If we're in tmux the process continues here; reload the board
        reloadBoard();
        setStatusMsg(`${agentId} launched in tmux pane`);
        setTimeout(() => setStatusMsg(''), 3000);
      } catch (err) {
        setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setStatusMsg(''), 4000);
      }
    }, 50);
  }, [mode, detailTaskId, getFocusedTask, kandownDir, exit, reloadBoard]);

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
        <BoardHeader title={board.title} inTmux={inTmux} />
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

  // ─── Main board view ──────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      <BoardHeader title={board.title} inTmux={inTmux} />

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
          />
        ))}
      </Box>

      <StatusBar message={statusMsg} task={focusedTask} />
    </Box>
  );
}
