/**
 * @file Agent Picker overlay component
 * @description Modal-style overlay for picking the AI agent a task is assigned
 * to and launched on. Displayed as a centered box over the board view.
 *
 * 📖 The list is exactly what `detectInstalledAgents` returned, so an agent the
 * machine does not have is never offered: no greyed-out rows, no "install this
 * first" dead ends. Each row is the agent name plus, dimmed in parentheses, the
 * absolute path of the binary that would be spawned (`~` for $HOME, elided in
 * the middle when the terminal is narrow). Marketing descriptions are
 * deliberately gone: when several installs of the same tool are on PATH, the
 * path is the only line that actually disambiguates them.
 *
 * 📖 This component handles its own keyboard input: the parent board component
 * passes control to it by rendering it instead of the normal board view.
 * `onSelect` and `onCancel` callbacks return control to the parent.
 *
 * @functions
 *  → AgentPicker  — agent selection overlay component
 *  → shortenPath  — $HOME → ~ and middle-elide a binary path to fit the box
 *
 * @exports AgentPicker
 * @see src/cli/lib/agents.ts — agent definitions (AgentDef) + `which` detection
 */

import { useState } from 'react';
import { homedir } from 'node:os';
import { Box, Text, useInput, useStdout } from 'ink';
import type { AgentDef } from '../lib/agents.js';

/**
 * 📖 Renders a binary path for a narrow box: `$HOME` collapses to `~`, and an
 * over-long result is elided in the *middle* so both the install root
 * (`/opt/homebrew`, `~/.nvm/…`) and the binary name stay readable. Returns the
 * path untouched when it already fits.
 */
export function shortenPath(path: string, max: number): string {
  const home = homedir();
  let p = home && path.startsWith(home + '/') ? `~${path.slice(home.length)}` : path;
  if (max < 8 || p.length <= max) return p;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  p = `${p.slice(0, head)}…${p.slice(p.length - tail)}`;
  return p;
}

/** 📖 Longest agent name in the list, 0 for an empty list (guards the spread). */
function maxLongestName(agents: AgentDef[]): number {
  return agents.reduce((m, a) => Math.max(m, a.name.length), 0);
}

interface AgentPickerProps {
  /** Only installed agents should be passed here */
  agents: AgentDef[];
  /** Task ID being launched (shown in the header) */
  taskId: string;
  /** Called when user confirms an agent selection */
  onSelect: (agentId: string) => void;
  /** Called when user cancels (Esc/q) */
  onCancel: () => void;
}

export function AgentPicker({ agents, taskId, onSelect, onCancel }: AgentPickerProps) {
  // 📖 Functional setState used for stable cursor navigation (rerender-functional-setstate)
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') { onCancel(); return; }

    if (key.downArrow || input === 'j') {
      setCursor(c => Math.min(c + 1, agents.length - 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setCursor(c => Math.max(c - 1, 0));
      return;
    }

    if (key.return) {
      const agent = agents[cursor];
      if (agent) onSelect(agent.id);
      return;
    }

    // 📖 Number shortcuts: press 1-9 to quickly select an agent by position
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= agents.length) {
      const agent = agents[num - 1];
      if (agent) onSelect(agent.id);
    }
  });

  // 📖 Box width adapts to the longest "name (path)" row, but never wider than
  // the terminal (minus the border + padding the Box itself eats), so a deep
  // nvm/homebrew path can widen the box without ever wrapping a row.
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const chrome = 8; // 2 border columns + paddingX 2 on each side
  const maxRowLen = agents.length > 0
    ? Math.max(...agents.map(a => a.name.length + (a.binPath ? a.binPath.length + 3 : 0)))
    : 0;
  const boxWidth = Math.min(Math.max(termWidth - 2, 30), Math.max(44, maxRowLen + 6));
  // 📖 Budget left for the path once the number hint, cursor and name are drawn.
  const pathBudget = Math.max(12, boxWidth - chrome - maxLongestName(agents) - 6);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={boxWidth}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">ASSIGN & LAUNCH</Text>
        <Text color="gray">{'  '}<Text color="yellow">{taskId}</Text></Text>
      </Box>

      {/* Agent list — installed binaries only */}
      {agents.length === 0 && (
        <Text color="yellow">No agent CLI found in PATH. Install claude, codex, opencode…</Text>
      )}
      {agents.map((agent, idx) => {
        const isFocused = idx === cursor;
        const numHint = idx < 9 ? `${idx + 1} ` : '  ';
        return (
          <Box key={agent.id}>
            <Text color="gray" dimColor>{numHint}</Text>
            <Text color={isFocused ? 'black' : undefined} backgroundColor={isFocused ? 'cyan' : undefined}>
              {isFocused ? '›' : ' '}
              {' '}
              <Text bold={isFocused}>{agent.name}</Text>
            </Text>
            {agent.binPath && (
              <Text color="gray" dimColor>{'  ('}{shortenPath(agent.binPath, pathBudget)}{')'}</Text>
            )}
          </Box>
        );
      })}

      {/* Footer hints */}
      <Box marginTop={1} flexDirection="column">
        <Text color="gray" dimColor>↑↓ or 1–{agents.length} select  Enter assign + launch  Esc cancel</Text>
      </Box>
    </Box>
  );
}
