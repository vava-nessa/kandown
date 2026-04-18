/**
 * @file Agent Picker overlay component
 * @description Modal-style overlay for selecting an AI agent to launch a task.
 * Displayed as a centered box over the board view. Only shows agents that are
 * currently installed (detected via `which`).
 *
 * 📖 This component handles its own keyboard input — the parent board component
 * passes control to it by rendering it instead of the normal board view.
 * `onSelect` and `onCancel` callbacks return control to the parent.
 *
 * @functions
 *  → AgentPicker — agent selection overlay component
 *
 * @exports AgentPicker
 * @see src/cli/lib/agents.ts — agent definitions (AgentDef)
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AgentDef } from '../lib/agents.js';

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

  // 📖 Box width adapts to longest agent name + description (min 40, max 60)
  const maxNameLen = Math.max(...agents.map(a => a.name.length));
  const boxWidth = Math.min(60, Math.max(40, maxNameLen + 30));

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
        <Text bold color="cyan">SELECT AGENT</Text>
        <Text color="gray">{'  '}for <Text color="yellow">{taskId}</Text></Text>
      </Box>

      {/* Agent list */}
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
              {'  '}
              <Text dimColor={!isFocused}>{agent.description}</Text>
            </Text>
          </Box>
        );
      })}

      {/* Footer hints */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>↑↓ or 1–{agents.length} select  Enter launch  Esc cancel</Text>
      </Box>
    </Box>
  );
}
