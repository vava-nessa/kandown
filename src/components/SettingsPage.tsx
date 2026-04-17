/**
 * @file Settings page for the web app
 * @description Full-page view with all configurable settings from kandown.json.
 * Replaces the old modal popup with a dedicated route-like page.
 *
 * @functions
 *  → SettingsPage — main page component
 *  → SettingRow — individual setting control
 *  → SkinPicker — visual color-skin selector with light/dark swatches
 *
 * @exports SettingsPage
 * @see src/lib/theme.ts
 */

import { motion } from 'motion/react';
import { useStore } from '../lib/store';
import { FONT_OPTIONS, SKIN_OPTIONS } from '../lib/theme';
import { Icon } from './Icons';

type SettingType = 'toggle' | 'select' | 'number';

interface SettingOption {
  value: string;
  label: string;
}

interface SettingDef {
  key: string;
  label: string;
  section: string;
  type: SettingType;
  description?: string;
  options?: SettingOption[];
  min?: number;
  max?: number;
  allowCustom?: boolean;
}

const SETTINGS: SettingDef[] = [
  // UI
  {
    key: 'ui.language',
    label: 'Language',
    section: 'Appearance',
    type: 'select',
    options: ['en', 'fr', 'es', 'de', 'pt', 'ja', 'zh', 'ko', 'it', 'nl', 'ru'].map(value => ({ value, label: value })),
  },
  {
    key: 'ui.theme',
    label: 'Mode',
    section: 'Appearance',
    type: 'select',
    description: 'Auto follows your system light or dark preference.',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
  {
    key: 'ui.skin',
    label: 'Skin',
    section: 'Appearance',
    type: 'select',
    description: 'Color tokens are stored per project in kandown.json.',
    options: SKIN_OPTIONS.map(skin => ({ value: skin.id, label: skin.label })),
  },
  {
    key: 'ui.font',
    label: 'Font',
    section: 'Appearance',
    type: 'select',
    description: 'Uses local system font stacks, no network request.',
    options: FONT_OPTIONS.map(font => ({ value: font.id, label: font.label })),
  },
  // Agent
  { key: 'agent.suggestFollowUp', label: 'Suggest follow-up tasks', section: 'Agent', type: 'toggle' },
  { key: 'agent.maxSuggestions', label: 'Max suggestions', section: 'Agent', type: 'number', min: 1, max: 5 },
  // Board
  { key: 'board.taskPrefix', label: 'Task prefix', section: 'Board', type: 'select', options: ['t', 'task', 'kandown', 'feat', 'bug', 'fix', 'custom'].map(value => ({ value, label: value })), allowCustom: true },
  { key: 'board.defaultPriority', label: 'Default priority', section: 'Board', type: 'select', options: ['P1', 'P2', 'P3', 'P4'].map(value => ({ value, label: value })) },
  { key: 'board.defaultOwnerType', label: 'Default owner', section: 'Board', type: 'select', options: ['human', 'ai'].map(value => ({ value, label: value })) },
  // Fields
  { key: 'fields.priority', label: 'Priority', section: 'Fields', type: 'toggle' },
  { key: 'fields.assignee', label: 'Assignee', section: 'Fields', type: 'toggle' },
  { key: 'fields.tags', label: 'Tags', section: 'Fields', type: 'toggle' },
  { key: 'fields.dueDate', label: 'Due date', section: 'Fields', type: 'toggle' },
  { key: 'fields.ownerType', label: 'Owner type', section: 'Fields', type: 'toggle' },
];

const SECTIONS = ['Appearance', 'Agent', 'Board', 'Fields'];

const SECTION_ICONS: Record<string, string> = {
  Appearance: '🎨',
  Agent: '🤖',
  Board: '📋',
  Fields: '📝',
};

function getConfigValue(config: ReturnType<typeof useStore.getState>['config'], path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setConfigValue(config: ReturnType<typeof useStore.getState>['config'], path: string, value: unknown): ReturnType<typeof useStore.getState>['config'] {
  const result = structuredClone(config);
  const parts = path.split('.');
  let current = result as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

export function SettingsPage() {
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const setCurrentPage = useStore(s => s.setCurrentPage);
  const dirHandle = useStore(s => s.dirHandle);

  if (!dirHandle) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p className="text-fg-muted">No project open</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setCurrentPage('board')}
            className="btn-icon"
            title="Back to board"
          >
            <Icon.ArrowLeft size={14} />
          </button>
          <div>
            <h1 className="text-[18px] font-semibold">Settings</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">Configure this project board</p>
          </div>
        </div>

        {/* Sections */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-8"
        >
          {SECTIONS.map(section => {
            const items = SETTINGS.filter(s => s.section === section);
            const icon = SECTION_ICONS[section] ?? '•';

            return (
              <div key={section} className="glass rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[14px]">{icon}</span>
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-muted">{section}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {items.map(setting => {
                    const value = getConfigValue(config, setting.key);
                    return (
                      <SettingRow
                        key={setting.key}
                        setting={setting}
                        value={value}
                        onChange={(newValue) => {
                          updateConfig(c => setConfigValue(c, setting.key, newValue));
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

interface SettingRowProps {
  setting: SettingDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

function SettingRow({ setting, value, onChange }: SettingRowProps) {
  const handleToggle = () => {
    if (setting.type === 'toggle') {
      onChange(!value);
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  const handleNumberChange = (delta: number) => {
    const num = Number(value);
    const min = setting.min ?? 0;
    const max = setting.max ?? 99;
    onChange(Math.max(min, Math.min(max, num + delta)));
  };

  return (
    <div className="flex flex-col gap-3 py-2.5 px-1 rounded-[6px] hover:bg-bg-2 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="flex flex-col gap-0.5">
        <span className="text-[14.5px] text-fg">{setting.label}</span>
        {setting.description && (
          <span className="text-[12px] text-fg-muted">{setting.description}</span>
        )}
      </span>
      <div className="w-full flex-shrink-0 sm:w-auto">
        {setting.type === 'toggle' && (
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-success' : 'bg-bg-3'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-1'}`} />
          </button>
        )}
        {setting.key === 'ui.skin' && (
          <SkinPicker value={String(value)} onChange={onChange} />
        )}
        {setting.type === 'select' && setting.options && (
          setting.key === 'ui.skin' ? null : (
            <select
              value={String(value)}
              onChange={handleSelectChange}
              className="bg-bg-2 border border-border rounded-[6px] px-2.5 py-1 text-[14.5px] text-fg outline-none focus:border-border-focus"
            >
              {setting.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )
        )}
        {setting.type === 'number' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleNumberChange(-1)}
              className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-bg-2 border border-border text-fg hover:bg-bg-3 text-[15px]"
            >
              −
            </button>
            <span className="w-8 text-center text-[14.5px] text-fg tabular-nums">{String(value)}</span>
            <button
              onClick={() => handleNumberChange(1)}
              className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-bg-2 border border-border text-fg hover:bg-bg-3 text-[15px]"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SkinPicker({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SKIN_OPTIONS.map(skin => {
        const active = skin.id === value;
        const swatches = [
          skin.light.background,
          skin.light.primary,
          skin.dark.background,
          skin.dark.primary,
        ];

        return (
          <button
            key={skin.id}
            type="button"
            onClick={() => onChange(skin.id)}
            className={`w-full rounded-[6px] border px-2.5 py-2 text-left transition-colors sm:min-w-[136px] ${
              active
                ? 'border-border-focus bg-bg-3 text-fg'
                : 'border-border bg-bg-2 text-fg-dim hover:border-border-strong hover:text-fg'
            }`}
            title={skin.description}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium">{skin.label}</span>
              <span className="flex overflow-hidden rounded-[3px] border border-border">
                {swatches.map((color, index) => (
                  <span
                    key={`${skin.id}-${index}`}
                    className="h-3 w-3"
                    style={{ backgroundColor: `hsl(${color})` }}
                  />
                ))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
