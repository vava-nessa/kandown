/**
 * @file Full-screen settings TUI screen
 * @description Interactive settings editor for kandown.json. Renders a navigable list
 * of all configuration options grouped by section. Auto-saves on every change.
 *
 * 📖 Keyboard controls:
 *  ↑↓ — navigate between settings
 *  ←→ — cycle select/number values
 *  Space/Enter — toggle booleans, confirm custom prefix
 *  Backspace — delete char in custom prefix mode
 *  Esc/Q — exit
 *
 * @functions
 *  → Settings — main screen component
 *
 * @exports Settings
 * @see src/cli/lib/config.ts — config read/write utilities
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  type KandownConfig,
} from '../lib/config.js';

// ─── Setting definitions ───────────────────────────────────────────────────

type SettingType = 'toggle' | 'select' | 'number';

interface SettingDef {
  key: string;
  label: string;
  section: string;
  type: SettingType;
  options?: string[];
  min?: number;
  max?: number;
  // 📖 When true, selecting the last option triggers custom text input mode
  allowCustom?: boolean;
}

// 📖 Flat list of all configurable settings — order matters for navigation
const SETTINGS: SettingDef[] = [
  // UI
  {
    key: 'ui.language',
    label: 'Language',
    section: 'Appearance',
    type: 'select',
    options: ['en', 'fr', 'es', 'de', 'pt', 'ja', 'zh', 'ko', 'it', 'nl', 'ru'],
  },
  {
    key: 'ui.theme',
    label: 'Mode',
    section: 'Appearance',
    type: 'select',
    options: ['auto', 'light', 'dark'],
  },
  {
    key: 'ui.skin',
    label: 'Skin',
    section: 'Appearance',
    type: 'select',
    options: ['kandown', 'graphite', 'sage', 'cobalt', 'rose'],
  },
  {
    key: 'ui.font',
    label: 'Font',
    section: 'Appearance',
    type: 'select',
    options: ['inter', 'system', 'serif', 'mono', 'rounded'],
  },

  // Agent
  {
    key: 'agent.suggestFollowUp',
    label: 'Suggest follow-up tasks',
    section: 'Agent',
    type: 'toggle',
  },
  {
    key: 'agent.maxSuggestions',
    label: 'Max suggestions',
    section: 'Agent',
    type: 'number',
    min: 1,
    max: 5,
  },

  // Board
  {
    key: 'board.taskPrefix',
    label: 'Task prefix',
    section: 'Board',
    type: 'select',
    options: ['t', 'task', 'kandown', 'feat', 'bug', 'fix', 'custom'],
    allowCustom: true,
  },
  {
    key: 'board.defaultPriority',
    label: 'Default priority',
    section: 'Board',
    type: 'select',
    options: ['P1', 'P2', 'P3', 'P4'],
  },
  {
    key: 'board.defaultOwnerType',
    label: 'Default owner',
    section: 'Board',
    type: 'select',
    options: ['human', 'ai'],
  },

  // Fields
  { key: 'fields.priority', label: 'Priority', section: 'Fields', type: 'toggle' },
  { key: 'fields.assignee', label: 'Assignee', section: 'Fields', type: 'toggle' },
  { key: 'fields.tags', label: 'Tags', section: 'Fields', type: 'toggle' },
  { key: 'fields.dueDate', label: 'Due date', section: 'Fields', type: 'toggle' },
  { key: 'fields.ownerType', label: 'Owner type', section: 'Fields', type: 'toggle' },
];

// 📖 Ordered sections for rendering — determines visual grouping
const SECTIONS = ['Appearance', 'Agent', 'Board', 'Fields'];

// ─── Helpers ────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 30;
const VALUE_WIDTH = 20;

// 📖 Section header icons for visual appeal
const SECTION_ICONS: Record<string, string> = {
  Appearance: '🎨',
  Agent: '🤖',
  Board: '📋',
  Fields: '📝',
};

// ─── Component ──────────────────────────────────────────────────────────────

interface SettingsProps {
  kandownDir: string;
}

export function Settings({ kandownDir }: SettingsProps) {
  const { exit } = useApp();
  const [config, setConfig] = useState<KandownConfig | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // 📖 Custom prefix editing state — activated when user selects "custom" in taskPrefix
  const [editingCustom, setEditingCustom] = useState(false);
  const [customBuffer, setCustomBuffer] = useState('');

  // 📖 Load config on mount
  useEffect(() => {
    const loaded = loadConfig(kandownDir);
    setConfig(loaded);

    // 📖 If the current prefix isn't in the preset list, we're in custom mode
    const presets = ['t', 'task', 'kandown', 'feat', 'bug', 'fix'];
    if (!presets.includes(loaded.board.taskPrefix)) {
      setCustomBuffer(loaded.board.taskPrefix);
    }
  }, [kandownDir]);

  // 📖 Auto-save: persist config to disk on every change
  const persistConfig = useCallback(
    (newConfig: KandownConfig) => {
      setConfig(newConfig);
      saveConfig(kandownDir, newConfig);
      setSavedAt(Date.now());
    },
    [kandownDir],
  );

  // 📖 Clear "saved" indicator after 2 seconds
  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  // ─── Keyboard handling ──────────────────────────────────────────────────

  useInput((input, key) => {
    if (!config) return;

    // 📖 Custom prefix text input mode — captures all keystrokes
    if (editingCustom) {
      if (key.return) {
        // Confirm custom prefix
        const prefix = customBuffer.trim() || 't';
        persistConfig(setConfigValue(config, 'board.taskPrefix', prefix));
        setEditingCustom(false);
        return;
      }
      if (key.escape) {
        // Cancel custom edit
        setEditingCustom(false);
        setCustomBuffer(
          (['t', 'task', 'kandown', 'feat', 'bug', 'fix'].includes(config.board.taskPrefix)
            ? ''
            : config.board.taskPrefix),
        );
        return;
      }
      if (key.backspace || key.delete) {
        setCustomBuffer((prev) => prev.slice(0, -1));
        return;
      }
      // 📖 Only allow alphanumeric and hyphens for task prefix slugs
      if (input && /^[a-zA-Z0-9-]$/.test(input)) {
        setCustomBuffer((prev) => prev + input);
        return;
      }
      return;
    }

    // 📖 Global shortcuts
    if (key.escape || input === 'q') {
      exit();
      return;
    }

    // 📖 Navigation
    if (key.upArrow) {
      setFocusIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setFocusIndex((i) => Math.min(SETTINGS.length - 1, i + 1));
      return;
    }

    const setting = SETTINGS[focusIndex];
    if (!setting) return;
    const currentValue = getConfigValue(config, setting.key);

    // 📖 Toggle boolean settings with Space or Enter
    if (setting.type === 'toggle' && (input === ' ' || key.return)) {
      persistConfig(setConfigValue(config, setting.key, !currentValue));
      return;
    }

    // 📖 Cycle select options with ←→
    if (setting.type === 'select' && setting.options) {
      const options = setting.options;
      const currentIdx = options.indexOf(String(currentValue));
      let newIdx = currentIdx;

      if (key.leftArrow) {
        newIdx = Math.max(0, currentIdx - 1);
      } else if (key.rightArrow) {
        newIdx = Math.min(options.length - 1, currentIdx + 1);
      } else if (input === ' ' || key.return) {
        // Space/Enter cycles forward (wraps)
        newIdx = (currentIdx + 1) % options.length;
      } else {
        return;
      }

      const newValue = options[newIdx];

      // 📖 "custom" triggers text input mode for taskPrefix
      if (newValue === 'custom' && setting.allowCustom) {
        setEditingCustom(true);
        setCustomBuffer('');
        return;
      }

      // 📖 If cycling away from a custom value, and the value isn't in presets
      persistConfig(setConfigValue(config, setting.key, newValue));
      return;
    }

    // 📖 Increment/decrement number settings with ←→
    if (setting.type === 'number') {
      const num = Number(currentValue);
      const min = setting.min ?? 0;
      const max = setting.max ?? 99;

      if (key.leftArrow) {
        persistConfig(setConfigValue(config, setting.key, Math.max(min, num - 1)));
      } else if (key.rightArrow) {
        persistConfig(setConfigValue(config, setting.key, Math.min(max, num + 1)));
      }
    }
  });

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!config) {
    return (
      <Box>
        <Text dimColor>Loading…</Text>
      </Box>
    );
  }

  const showSaved = savedAt !== null;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text bold color="cyan">
            {'  ╭─ '}
          </Text>
          <Text bold color="white">
            KANDOWN SETTINGS
          </Text>
          <Text bold color="cyan">
            {' ─╮'}
          </Text>
        </Box>
        <Box>
          {showSaved && (
            <Text color="green" bold>
              ✓ saved{' '}
            </Text>
          )}
        </Box>
      </Box>

      {/* Settings grouped by section */}
      {SECTIONS.map((section) => {
        const items = SETTINGS.filter((s) => s.section === section);
        const icon = SECTION_ICONS[section] ?? '•';

        return (
          <Box key={section} flexDirection="column" marginBottom={1}>
            {/* Section header */}
            <Box>
              <Text color="cyan" bold>
                {'  '}
                {icon} {section}
              </Text>
            </Box>
            <Box>
              <Text dimColor>{'  ' + '─'.repeat(LABEL_WIDTH + VALUE_WIDTH + 4)}</Text>
            </Box>

            {/* Setting rows */}
            {items.map((setting) => {
              const globalIdx = SETTINGS.indexOf(setting);
              const focused = globalIdx === focusIndex;
              const value = getConfigValue(config, setting.key);

              return (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  value={value}
                  focused={focused}
                  editingCustom={editingCustom && setting.key === 'board.taskPrefix'}
                  customBuffer={customBuffer}
                />
              );
            })}
          </Box>
        );
      })}

      {/* Footer — keyboard shortcuts */}
      <Box marginTop={1}>
        <Text dimColor>
          {'  '}
          {editingCustom
            ? 'Type prefix → Enter confirm  Esc cancel'
            : '↑↓ navigate   Space toggle   ←→ change   Q quit'}
        </Text>
      </Box>
    </Box>
  );
}

// ─── Setting Row ────────────────────────────────────────────────────────────

interface SettingRowProps {
  setting: SettingDef;
  value: unknown;
  focused: boolean;
  editingCustom: boolean;
  customBuffer: string;
}

function SettingRow({ setting, value, focused, editingCustom, customBuffer }: SettingRowProps) {
  const marker = focused ? '›' : ' ';
  const markerColor = focused ? 'yellow' : undefined;
  const labelColor = focused ? 'white' : 'gray';

  return (
    <Box>
      {/* Focus marker */}
      <Text color={markerColor} bold={focused}>
        {'  '}
        {marker}{' '}
      </Text>

      {/* Label */}
      <Box width={LABEL_WIDTH}>
        <Text color={labelColor} bold={focused}>
          {setting.label}
        </Text>
      </Box>

      {/* Value */}
      <Box width={VALUE_WIDTH} justifyContent="flex-end">
        <ValueDisplay
          setting={setting}
          value={value}
          focused={focused}
          editingCustom={editingCustom}
          customBuffer={customBuffer}
        />
      </Box>
    </Box>
  );
}

// ─── Value Display ──────────────────────────────────────────────────────────

interface ValueDisplayProps {
  setting: SettingDef;
  value: unknown;
  focused: boolean;
  editingCustom: boolean;
  customBuffer: string;
}

function ValueDisplay({ setting, value, focused, editingCustom, customBuffer }: ValueDisplayProps) {
  // 📖 Custom prefix text input mode
  if (editingCustom) {
    return (
      <Box>
        <Text color="yellow" bold>
          {customBuffer}
        </Text>
        <Text color="yellow" bold>
          ▏
        </Text>
        <Text dimColor>-001</Text>
      </Box>
    );
  }

  // 📖 Boolean toggle — shows filled/empty circle with ON/OFF
  if (setting.type === 'toggle') {
    const on = Boolean(value);
    return (
      <Text color={on ? 'green' : 'gray'} bold={on}>
        {on ? '● ON' : '○ OFF'}
      </Text>
    );
  }

  // 📖 Select — shows current value with arrows when focused
  if (setting.type === 'select' && setting.options) {
    const options = setting.options;
    const idx = options.indexOf(String(value));
    const atStart = idx <= 0;
    const atEnd = idx >= options.length - 1;
    const displayValue = String(value);

    // 📖 Show preview of what the prefix looks like: "t → t-001"
    const isPrefix = setting.key === 'board.taskPrefix';
    const preview = isPrefix ? `-001` : '';

    if (focused) {
      return (
        <Box>
          <Text color={atStart ? 'gray' : 'cyan'}>◂ </Text>
          <Text color="white" bold>
            {displayValue}
          </Text>
          {preview && <Text dimColor>{preview}</Text>}
          <Text color={atEnd ? 'gray' : 'cyan'}> ▸</Text>
        </Box>
      );
    }
    return (
      <Box>
        <Text dimColor>
          {displayValue}
          {preview}
        </Text>
      </Box>
    );
  }

  // 📖 Number — shows value with arrows when focused
  if (setting.type === 'number') {
    const num = Number(value);
    const atMin = num <= (setting.min ?? 0);
    const atMax = num >= (setting.max ?? 99);

    if (focused) {
      return (
        <Box>
          <Text color={atMin ? 'gray' : 'cyan'}>◂ </Text>
          <Text color="white" bold>
            {num}
          </Text>
          <Text color={atMax ? 'gray' : 'cyan'}> ▸</Text>
        </Box>
      );
    }
    return <Text dimColor>{num}</Text>;
  }

  // 📖 Fallback for unknown types
  return <Text>{String(value)}</Text>;
}
