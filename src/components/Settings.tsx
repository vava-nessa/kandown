/**
 * @file Settings modal for the web app
 * @description Modal overlay with all configurable settings from kandown.json.
 * Mirrors the TUI settings screen but rendered as a web modal.
 *
 * @functions
 *  → Settings — main modal component
 *
 * @exports Settings
 */

import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';
import { Icon } from './Icons';

type SettingType = 'toggle' | 'select' | 'number';

interface SettingDef {
  key: string;
  label: string;
  section: string;
  type: SettingType;
  options?: string[];
  min?: number;
  max?: number;
  allowCustom?: boolean;
}

const SETTINGS: SettingDef[] = [
  // UI
  { key: 'ui.language', label: 'Language', section: 'UI', type: 'select', options: ['en', 'fr', 'es', 'de', 'pt', 'ja', 'zh', 'ko', 'it', 'nl', 'ru'] },
  { key: 'ui.theme', label: 'Theme', section: 'UI', type: 'select', options: ['auto', 'light', 'dark'] },
  // Agent
  { key: 'agent.suggestFollowUp', label: 'Suggest follow-up tasks', section: 'Agent', type: 'toggle' },
  { key: 'agent.maxSuggestions', label: 'Max suggestions', section: 'Agent', type: 'number', min: 1, max: 5 },
  // Board
  { key: 'board.taskPrefix', label: 'Task prefix', section: 'Board', type: 'select', options: ['t', 'task', 'kandown', 'feat', 'bug', 'fix', 'custom'], allowCustom: true },
  { key: 'board.defaultPriority', label: 'Default priority', section: 'Board', type: 'select', options: ['P1', 'P2', 'P3', 'P4'] },
  { key: 'board.defaultOwnerType', label: 'Default owner', section: 'Board', type: 'select', options: ['human', 'ai'] },
  // Fields
  { key: 'fields.priority', label: 'Priority', section: 'Fields', type: 'toggle' },
  { key: 'fields.assignee', label: 'Assignee', section: 'Fields', type: 'toggle' },
  { key: 'fields.tags', label: 'Tags', section: 'Fields', type: 'toggle' },
  { key: 'fields.dueDate', label: 'Due date', section: 'Fields', type: 'toggle' },
  { key: 'fields.ownerType', label: 'Owner type', section: 'Fields', type: 'toggle' },
];

const SECTIONS = ['UI', 'Agent', 'Board', 'Fields'];

const SECTION_ICONS: Record<string, string> = {
  UI: '🎨',
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
  const result = JSON.parse(JSON.stringify(config));
  const parts = path.split('.');
  let current: Record<string, unknown> = result;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

export function Settings() {
  const settingsOpen = useStore(s => s.settingsOpen);
  const setSettingsOpen = useStore(s => s.setSettingsOpen);
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const dirHandle = useStore(s => s.dirHandle);

  if (!dirHandle) return null;

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSettingsOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[92vw] z-[101] glass rounded-[12px] shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-semibold">Settings</span>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="btn-icon" title="Close">
                <Icon.X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto p-5">
              {SECTIONS.map(section => {
                const items = SETTINGS.filter(s => s.section === section);
                const icon = SECTION_ICONS[section] ?? '•';

                return (
                  <div key={section} className="mb-6 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[13px]">{icon}</span>
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
    <div className="flex items-center justify-between py-2 px-3 rounded-[6px] hover:bg-bg-2 transition-colors">
      <span className="text-[14.5px] text-fg">{setting.label}</span>
      <div>
        {setting.type === 'toggle' && (
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-success' : 'bg-bg-3'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-1'}`} />
          </button>
        )}
        {setting.type === 'select' && setting.options && (
          <select
            value={String(value)}
            onChange={handleSelectChange}
            className="bg-bg-2 border border-border rounded-[6px] px-2.5 py-1 text-[14.5px] text-fg outline-none focus:border-border-focus"
          >
            {setting.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
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
