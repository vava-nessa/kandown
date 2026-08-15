/**
 * @file Board screen — presentational sub-components
 * @description Stateless render pieces for the Kanban board: task rows,
 * the move placeholder, a column (with its own scroll window), the header,
 * the status bar, and the full-screen task detail view. board.tsx composes
 * these around its stateful input/mouse handling.
 *
 * @functions
 *  → SingleTaskRow — one-line row for tasks without a bracket/hashtag category
 *  → CategoryTaskRow — 3-line row for tasks with a bracket tag / hashtag
 *  → MovePlaceholder — "↓ ColumnName" drop-target row shown in move mode
 *  → KanbanColumn — one column: header, scrolled task rows, move placeholder
 *  → BoardHeader — top title bar (project name, daemon status, hint/URL)
 *  → StatusBar — bottom transient message + daemon status line
 *  → TaskDetail — full-screen task detail body renderer
 *
 * @exports SingleTaskRow, CategoryTaskRow, MovePlaceholder, KanbanColumn,
 *   BoardHeader, StatusBar, TaskDetail
 */

import { Box, Text } from 'ink';
import type { BoardTask, ParsedTask } from '../../../lib/types.js';
import type { DaemonStatus } from '../../lib/daemon.js';
import { InlineContextMenu, MENU_HEIGHT } from '../../components/task-context-menu.js';
import {
  RE_BRACKET_TAG,
  RE_DONE,
  RE_HEADER,
  RE_SUBTASK,
  columnAccentColor,
  computeScrollIdx,
  getTitleCategory,
  pad,
  terminalHyperlink,
  termWidth,
  truncate,
  webLinkLabel,
} from './helpers.js';

/**
 * 📖 Single-line row for tasks WITHOUT a bracket tag / hashtag category.
 * Unchanged from the previous flat layout.
 */
export function SingleTaskRow({ task, focused, dragging, colWidth }: {
  task: BoardTask; focused: boolean; dragging?: boolean; colWidth: number;
}) {
  const cursor = dragging ? '↕' : focused ? '▸' : ' ';
  const check  = task.checked ? '✓' : '○';
  const idStr  = task.id;

  // 📖 Defensive: malformed files can carry a non-string title (YAML array);
  // render it as an empty string rather than crashing the whole board.
  const title = typeof task.title === 'string' ? task.title : '';
  const tagMatch = title.match(RE_BRACKET_TAG);
  const tag = tagMatch ? `[${tagMatch[1]}]` : '';
  const titleClean = tagMatch ? title.slice(tagMatch[0].length) : title;

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
export function CategoryTaskRow({ task, focused, dragging, colWidth }: {
  task: BoardTask; focused: boolean; dragging?: boolean; colWidth: number;
}) {
  const cursor   = dragging ? '↕' : focused ? '▸' : ' ';
  const check    = task.checked ? '✓' : '○';
  const idStr    = task.id;
  const category = getTitleCategory(task);

  // 📖 A frontmatter category means the title is already clean prose. A legacy
  // bracket still sitting in the title is stripped for the 3rd line regardless
  // of where the category came from, so the row reads `UI` on line 2 and
  // `Fix the button` on line 3 instead of repeating the bracket.
  const titleClean = category
    ? task.title.replace(/^\[[^\]]+\]\s*/, '').trim()
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

export function MovePlaceholder({ name, focused, colWidth }: {
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

export function KanbanColumn({ name, tasks, focusedRow, isFocused, colWidth,
  contextMenuRow, contextMenuCursor, showMoveTarget, isMoveFocused, draggedTaskId,
  maxTasksHeight }: {
  name: string; tasks: BoardTask[]; focusedRow: number;
  isFocused: boolean; colWidth: number;
  /** Task index that has the context menu open (-1 = none) */
  contextMenuRow?: number;
  /** Which context-menu option is highlighted (0 or 1) */
  contextMenuCursor?: number;
  showMoveTarget?: boolean; isMoveFocused?: boolean;
  draggedTaskId?: string | null;
  maxTasksHeight: number;
}) {
  const accent = columnAccentColor(name);
  const headerBg    = isFocused ? accent : undefined;
  const headerColor = isFocused ? 'black' : accent;
  const countStr    = tasks.length > 0 ? ` (${tasks.length})` : '';

  // Calculate scroll offset to keep the focused row in view
  const scrollIdx = isFocused
    ? computeScrollIdx(tasks, focusedRow, contextMenuRow ?? -1, maxTasksHeight)
    : 0;

  // Calculate how many tasks we can fit starting from scrollIdx
  let accumulatedHeight = 0;
  let endIdx = scrollIdx;
  const hasTopIndicator = scrollIdx > 0;
  const topIndicatorHeight = hasTopIndicator ? 1 : 0;

  while (endIdx < tasks.length) {
    const hasCategory = getTitleCategory(tasks[endIdx]) !== null;
    let taskHeight = hasCategory ? 3 : 1;
    if (contextMenuRow === endIdx) taskHeight += MENU_HEIGHT;
    const sepHeight = (endIdx < tasks.length - 1) ? 1 : 0;

    const hasBottomIndicator = endIdx < tasks.length - 1;
    const bottomIndicatorHeight = hasBottomIndicator ? 1 : 0;
    const currentMax = maxTasksHeight - topIndicatorHeight - bottomIndicatorHeight;

    if (accumulatedHeight + taskHeight + sepHeight > currentMax) {
      if (endIdx === scrollIdx) {
        endIdx++;
      }
      break;
    }
    accumulatedHeight += taskHeight + sepHeight;
    endIdx++;
  }

  const rows: React.ReactNode[] = [];

  if (hasTopIndicator) {
    rows.push(
      <Text key="scroll-up" color="cyan" dimColor>{' '.repeat(2)}▲ {scrollIdx} more</Text>
    );
  }

  for (let idx = scrollIdx; idx < endIdx; idx++) {
    const task = tasks[idx];
    const hasCategory = getTitleCategory(task) !== null;
    rows.push(
      hasCategory
        ? <CategoryTaskRow key={task.id} task={task} focused={!!(isFocused && idx === focusedRow)} dragging={task.id === draggedTaskId} colWidth={colWidth} />
        : <SingleTaskRow  key={task.id} task={task} focused={!!(isFocused && idx === focusedRow)} dragging={task.id === draggedTaskId} colWidth={colWidth} />
    );
    if (contextMenuRow === idx) {
      rows.push(
        <InlineContextMenu
          key="ctx-menu"
          cursor={contextMenuCursor ?? 0}
          colWidth={colWidth}
        />
      );
    }
    if (idx < endIdx - 1) {
      rows.push(
        <Text key={`sep-${task.id}`} color={isFocused ? 'cyan' : 'gray'} dimColor>{'─'.repeat(colWidth)}</Text>
      );
    }
  }

  if (endIdx < tasks.length) {
    rows.push(
      <Text key="scroll-down" color="cyan" dimColor>{' '.repeat(2)}▼ {tasks.length - endIdx} more</Text>
    );
  }

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

export function BoardHeader({ title, inTmux, modeHint, version, daemonStatus, daemonBusy }: {
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

export function StatusBar({ message, task, daemonStatus }: {
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

export function TaskDetail({ task, taskId, scrollOffset }: {
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
