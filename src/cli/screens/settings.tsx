/**
 * @file Full-screen settings TUI screen
 * @description Interactive settings editor for kandown.json. Renders a navigable list
 * of all configuration options grouped by section. Auto-saves on every change.
 *
 * 📖 The list is longer than a typical terminal, so it scrolls: the rendered
 * window follows the focused row and the footer reports how many settings sit
 * above and below it. Without this the trailing sections are clipped by the
 * fixed-height frame in `app.tsx` with no indication that they exist.
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

const ALL_LANGUAGES = [
  'en', 'fr', 'zh', 'es', 'pt', 'hi', 'de', 'it',
  'nl', 'pl', 'uk', 'ro', 'sv', 'cs', 'el', 'hu',
  'fi', 'da', 'no', 'sk', 'bg', 'sr', 'hr', 'lt', 'lv', 'sl', 'et',
  'ar', 'bn', 'ru', 'ja', 'ko', 'tr', 'vi', 'id', 'ur', 'fa',
  'th', 'ms', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'si', 'my', 'km',
];

// 📖 Flat list of all configurable settings — order matters for navigation
const SETTINGS: SettingDef[] = [
  // UI
  {
    key: 'ui.language',
    label: 'Language',
    section: 'Appearance',
    type: 'select',
    options: ALL_LANGUAGES,
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
    key: 'board.stackDefaultState',
    label: 'Task groups',
    section: 'Board',
    type: 'select',
    options: ['collapsed', 'expanded'],
  },
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

  // Terminal UI
  {
    key: 'tui.defaultView',
    label: 'Default view',
    section: 'Terminal UI',
    type: 'select',
    options: ['list', 'board'],
  },
  { key: 'tui.showDetailPane', label: 'Detail pane under list', section: 'Terminal UI', type: 'toggle' },
  {
    key: 'tui.listSort',
    label: 'List sort',
    section: 'Terminal UI',
    type: 'select',
    options: ['status', 'age', 'priority', 'id'],
  },
  // 📖 List columns. ID and Description are deliberately absent: they are what
  // makes a row identifiable, so they are not switchable. Everything else is.
  { key: 'tui.columns.age', label: 'Column: Age', section: 'Terminal UI', type: 'toggle' },
  { key: 'tui.columns.status', label: 'Column: Status', section: 'Terminal UI', type: 'toggle' },
  { key: 'tui.columns.priority', label: 'Column: Priority', section: 'Terminal UI', type: 'toggle' },
  { key: 'tui.columns.owner', label: 'Column: Owner', section: 'Terminal UI', type: 'toggle' },
  { key: 'tui.columns.deps', label: 'Column: Dependencies', section: 'Terminal UI', type: 'toggle' },
  { key: 'tui.columns.tags', label: 'Column: Tags', section: 'Terminal UI', type: 'toggle' },

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
const SECTIONS = ['Appearance', 'Agent', 'Board', 'Fields', 'Terminal UI', 'Notifications'];

// ─── Helpers ────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 30;
const VALUE_WIDTH = 20;

// 📖 Section header icons for visual appeal
const SECTION_ICONS: Record<string, string> = {
  Appearance: '🎨',
  Agent: '🤖',
  Board: '📋',
  Fields: '📝',
  'Terminal UI': '⌨️',
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

  // 📖 Auto-save: persist config to disk on every change. Wrapped in try/catch
  // so a disk-full / permission error doesn't crash the TUI (t114). On failure
  // we log + bump savedAt to null so the UI shows "saving…" indefinitely as a
  // subtle signal; the local state still updates so the user's edit isn't lost.
  const persistConfig = useCallback(
    (newConfig: KandownConfig) => {
      setConfig(newConfig);
      try {
        saveConfig(kandownDir, newConfig);
        setSavedAt(Date.now());
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[kandown] Failed to save config:', e);
      }
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

  // 📖 The settings list is taller than most terminals, and Ink clips whatever
  // overflows the fixed-height frame in App — silently, with no scrollbar. So we
  // window it ourselves around the focused row, otherwise the last sections are
  // simply unreachable on a normal 40-row terminal.
  //
  // Budget: 2 lines of header, 2 of footer, and 3 per rendered section (title,
  // rule, trailing margin). We assume every section could be on screen, which
  // under-fills slightly rather than overflowing — the failure mode we can see
  // is better than the one we cannot.
  const termRows = process.stdout.rows || 24;
  const scrollFor = (capacity: number) =>
    Math.max(0, Math.min(focusIndex - Math.floor(capacity / 2), SETTINGS.length - capacity));

  // 📖 Section chrome costs 3 lines (title, rule, trailing margin) but only for
  // the sections actually on screen — reserving it for all of them would waste
  // ~18 lines and shrink a 24-row terminal to three visible settings. The window
  // size therefore depends on its own contents, so we iterate to a fixed point.
  // Three passes is plenty: each one can only shrink the window, so it converges
  // fast, and the `Math.max(3, …)` floor guarantees it terminates regardless.
  let capacity = Math.max(3, termRows - 6);
  for (let pass = 0; pass < 3; pass++) {
    const start = scrollFor(capacity);
    const slice = SETTINGS.slice(start, start + capacity);
    const sectionCount = new Set(slice.map(item => item.section)).size;
    const next = Math.max(3, termRows - 6 - sectionCount * 3);
    if (next === capacity) break;
    capacity = next;
  }

  const scroll = scrollFor(capacity);
  const windowEnd = Math.min(SETTINGS.length, scroll + capacity);
  const visible = new Set<number>();
  for (let i = scroll; i < windowEnd; i++) visible.add(i);
  const hiddenAbove = scroll;
  const hiddenBelow = SETTINGS.length - windowEnd;

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

      {/* Settings grouped by section, windowed to what the terminal can show */}
      {SECTIONS.map((section) => {
        const items = SETTINGS.filter(
          (s) => s.section === section && visible.has(SETTINGS.indexOf(s)),
        );
        if (items.length === 0) return null;
        const icon = SECTION_ICONS[section] ?? '•';

        // 📖 flexShrink={0}: the root frame in app.tsx has a fixed height and
        // `overflow: hidden`, and Yoga's default is to *shrink* children that
        // overflow rather than clip them — which silently ate one row out of the
        // middle of a section instead of dropping the tail. (That is how "Skin"
        // vanished from Appearance while later sections rendered fine.) Refusing
        // to shrink turns it into honest clipping, which the ▼ counter reports.
        return (
          <Box key={section} flexDirection="column" marginBottom={1} flexShrink={0}>
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

      {/* Footer — scroll position + keyboard shortcuts */}
      <Box marginTop={1}>
        <Text dimColor>
          {'  '}
          {hiddenAbove > 0 ? `▲ ${hiddenAbove}   ` : ''}
          {hiddenBelow > 0 ? `▼ ${hiddenBelow}   ` : ''}
          {`${focusIndex + 1}/${SETTINGS.length}   `}
          {'↑↓ navigate   Space toggle   ←→ change   Q quit'}
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
