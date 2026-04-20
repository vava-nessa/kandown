/**
 * @file Full-screen settings TUI screen
 * @description Interactive settings editor for kandown.json. Renders a navigable list
 * of all configuration options grouped by section. Auto-saves on every change.
 *
 * 📖 Keyboard controls:
 *  ↑↓ — navigate between settings
 *  ←→ — cycle select/number values
 *  Space/Enter — toggle booleans
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
    key: 'board.defaultPriority',
    label: 'Default priority',
    section: 'Fields',
    type: 'select',
    options: ['P1', 'P2', 'P3', 'P4'],
  },
  {
    key: 'board.defaultOwnerType',
    label: 'Default owner',
    section: 'Fields',
    type: 'select',
    options: ['human', 'ai'],
  },

  // Fields
  { key: 'fields.priority', label: 'Priority', section: 'Fields', type: 'toggle' },
  { key: 'fields.assignee', label: 'Assignee', section: 'Fields', type: 'toggle' },
  { key: 'fields.tags', label: 'Tags', section: 'Fields', type: 'toggle' },
  { key: 'fields.dueDate', label: 'Due date', section: 'Fields', type: 'toggle' },
  { key: 'fields.ownerType', label: 'Owner type', section: 'Fields', type: 'toggle' },
  { key: 'fields.tools', label: 'Tools', section: 'Fields', type: 'toggle' },

  // Notifications
  { key: 'notifications.browser', label: 'Browser notifications', section: 'Notifications', type: 'toggle' },
  { key: 'notifications.statusChanges', label: 'Status changes', section: 'Notifications', type: 'toggle' },
  { key: 'notifications.taskEdits', label: 'Task edits', section: 'Notifications', type: 'toggle' },
  { key: 'notifications.subtaskCompletions', label: 'Subtask completions', section: 'Notifications', type: 'toggle' },
  { key: 'notifications.sound', label: 'Play sound', section: 'Notifications', type: 'toggle' },
  {
    key: 'notifications.soundId',
    label: 'Sound',
    section: 'Notifications',
    type: 'select',
    options: ['soft', 'chime', 'ping', 'pop'],
  },
];

// 📖 Ordered sections for rendering — determines visual grouping
const SECTIONS = ['Appearance', 'Agent', 'Board', 'Fields', 'Notifications'];

// ─── Helpers ────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 30;
const VALUE_WIDTH = 20;

// 📖 Section header icons for visual appeal
const SECTION_ICONS: Record<string, string> = {
  Appearance: '🎨',
  Agent: '🤖',
  Board: '📋',
  Fields: '📝',
  Notifications: '🔔',
};

// ─── Component ──────────────────────────────────────────────────────────────

interface SettingsProps {
  kandownDir: string;
  version?: string;
}

export function Settings({ kandownDir, version }: SettingsProps) {
  const { exit } = useApp();
  const [config, setConfig] = useState<KandownConfig | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 📖 Load config on mount
  useEffect(() => {
    const loaded = loadConfig(kandownDir);
    setConfig(loaded);
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
        newIdx = (currentIdx + 1) % options.length;
      } else {
        return;
      }

      const newValue = options[newIdx];
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
          {version && (
            <Text dimColor> v{version}</Text>
          )}
          <Text bold color="cyan">
            {' ─╮'}
          </Text>
        </Box>
        <Box>
          {version && (
            <Text dimColor>
              v{version}{'  '}
            </Text>
          )}
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
                />
              );
            })}
          </Box>
        );
      })}

      {/* Footer — keyboard shortcuts */}
      <Box marginTop={1}>
        <Text dimColor>
          {'  ↑↓ navigate   Space toggle   ←→ change   Q quit'}
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
}

function SettingRow({ setting, value, focused }: SettingRowProps) {
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
        <ValueDisplay setting={setting} value={value} focused={focused} />
      </Box>
    </Box>
  );
}

// ─── Value Display ──────────────────────────────────────────────────────────

interface ValueDisplayProps {
  setting: SettingDef;
  value: unknown;
  focused: boolean;
}

function ValueDisplay({ setting, value, focused }: ValueDisplayProps) {
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

    if (focused) {
      return (
        <Box>
          <Text color={atStart ? 'gray' : 'cyan'}>◂ </Text>
          <Text color="white" bold>
            {displayValue}
          </Text>
          <Text color={atEnd ? 'gray' : 'cyan'}> ▸</Text>
        </Box>
      );
    }
    return <Text dimColor>{displayValue}</Text>;
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
