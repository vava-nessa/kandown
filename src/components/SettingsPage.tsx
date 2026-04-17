/**
 * @file Settings page for the web app
 * @description Dense settings workspace with an iOS-style sidebar, global
 * option search, section navigation, and compact controls for kandown.json.
 *
 * 📖 Settings are described as searchable metadata first, then rendered through
 * a small set of controls. This keeps the left search menu and the right
 * detail pane in sync without duplicating labels, descriptions, or config keys.
 *
 * @functions
 *  → SettingsPage — main settings workspace with sidebar search/navigation
 *  → SettingRow — compact setting row with the correct control
 *  → SkinPicker — dense color-skin selector with light/dark swatches
 *  → SearchResults — searchable option list shown from the sidebar query
 *
 * @exports SettingsPage
 * @see src/lib/theme.ts
 * @see src/lib/types.ts
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  IconAdjustmentsHorizontal,
  IconChevronRight,
  IconLayoutBoard,
  IconPalette,
  IconRobot,
  IconSearch,
  IconSettings,
  IconTags,
  type TablerIcon,
} from '@tabler/icons-react';
import { KbdButton } from './KbdButton';
import { useStore } from '../lib/store';
import { fileWatcher } from '../lib/watcher';
import { BACKGROUND_OPTIONS, FONT_OPTIONS, SKIN_OPTIONS } from '../lib/theme';
import type { KandownConfig } from '../lib/types';

type SettingType = 'toggle' | 'select' | 'number' | 'text' | 'skin';
type SettingsSectionId = 'appearance' | 'agent' | 'board' | 'fields';

interface SettingOption {
  value: string;
  label: string;
}

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  kicker: string;
  description: string;
  icon: TablerIcon;
}

interface SettingDef {
  key: string;
  label: string;
  section: SettingsSectionId;
  type: SettingType;
  description: string;
  options?: SettingOption[];
  min?: number;
  max?: number;
  placeholder?: string;
  keywords?: string[];
  parentKey?: string;
}

const SECTIONS: SettingsSection[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    kicker: 'Interface',
    description: 'Theme, skin, background, font, and language.',
    icon: IconPalette,
  },
  {
    id: 'agent',
    label: 'Agent',
    kicker: 'Automation',
    description: 'Follow-up behavior for AI-assisted task work.',
    icon: IconRobot,
  },
  {
    id: 'board',
    label: 'Board',
    kicker: 'Identifiers',
    description: 'Task id behavior and board-level defaults.',
    icon: IconLayoutBoard,
  },
  {
    id: 'fields',
    label: 'Fields',
    kicker: 'Metadata',
    description: 'Optional fields shown on tasks and board cards.',
    icon: IconTags,
  },
];

const SETTINGS: SettingDef[] = [
  {
    key: 'ui.language',
    label: 'Language',
    section: 'appearance',
    type: 'select',
    description: 'UI language stored in this project config.',
    options: ['en', 'fr', 'es', 'de', 'pt', 'ja', 'zh', 'ko', 'it', 'nl', 'ru'].map(value => ({ value, label: value })),
    keywords: ['locale', 'translation'],
  },
  {
    key: 'ui.theme',
    label: 'Mode',
    section: 'appearance',
    type: 'select',
    description: 'Auto follows your system light or dark preference.',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    keywords: ['dark', 'light', 'auto'],
  },
  {
    key: 'ui.skin',
    label: 'Skin',
    section: 'appearance',
    type: 'skin',
    description: 'Color tokens are stored per project in kandown.json.',
    options: SKIN_OPTIONS.map(skin => ({ value: skin.id, label: skin.label })),
    keywords: ['color', 'theme', 'palette'],
  },
  {
    key: 'ui.background',
    label: 'Background',
    section: 'appearance',
    type: 'select',
    description: 'Choose a flat surface or animated liquid background.',
    options: BACKGROUND_OPTIONS.map(background => ({ value: background.id, label: background.label })),
    keywords: ['liquid', 'solid', 'animation'],
  },
  {
    key: 'ui.font',
    label: 'Font',
    section: 'appearance',
    type: 'select',
    description: 'Local system font stack, with no network request.',
    options: FONT_OPTIONS.map(font => ({ value: font.id, label: font.label })),
    keywords: ['typography', 'text'],
  },
  {
    key: 'agent.suggestFollowUp',
    label: 'Suggest follow-up tasks',
    section: 'agent',
    type: 'toggle',
    description: 'Ask agents to propose next tasks after finishing one.',
    keywords: ['ai', 'suggestions', 'automation'],
  },
  {
    key: 'agent.maxSuggestions',
    label: 'Max suggestions',
    section: 'agent',
    type: 'number',
    description: 'Caps the number of follow-up tasks an agent may propose.',
    min: 1,
    max: 5,
    keywords: ['limit', 'follow-up'],
  },
  {
    key: 'board.taskPrefix',
    label: 'Task prefix',
    section: 'board',
    type: 'text',
    description: 'Prefix for new task ids, such as t-001 or bug-001.',
    placeholder: 't',
    keywords: ['id', 'identifier', 'task id'],
  },
  {
    key: 'board.defaultPriority',
    label: 'Default priority',
    section: 'fields',
    type: 'select',
    description: 'Initial priority for new tasks when the Priority field is enabled.',
    options: ['P1', 'P2', 'P3', 'P4'].map(value => ({ value, label: value })),
    keywords: ['p1', 'p2', 'p3', 'p4', 'priority default'],
    parentKey: 'fields.priority',
  },
  {
    key: 'board.defaultOwnerType',
    label: 'Default owner',
    section: 'fields',
    type: 'select',
    description: 'Initial owner for new tasks when the Owner field is enabled.',
    options: ['human', 'ai'].map(value => ({ value, label: value })),
    keywords: ['human', 'ai', 'owner default'],
    parentKey: 'fields.ownerType',
  },
  {
    key: 'fields.priority',
    label: 'Priority',
    section: 'fields',
    type: 'toggle',
    description: 'Enable priority metadata on tasks.',
    keywords: ['p1', 'p2', 'importance'],
  },
  {
    key: 'fields.assignee',
    label: 'Assignee',
    section: 'fields',
    type: 'toggle',
    description: 'Enable assignee metadata on tasks.',
    keywords: ['owner', 'person', 'user'],
  },
  {
    key: 'fields.tags',
    label: 'Tags',
    section: 'fields',
    type: 'toggle',
    description: 'Enable tag metadata on tasks.',
    keywords: ['labels', 'categories'],
  },
  {
    key: 'fields.dueDate',
    label: 'Due date',
    section: 'fields',
    type: 'toggle',
    description: 'Enable due date metadata on tasks.',
    keywords: ['deadline', 'date'],
  },
  {
    key: 'fields.ownerType',
    label: 'Owner type',
    section: 'fields',
    type: 'toggle',
    description: 'Enable human/AI ownership metadata on tasks.',
    keywords: ['human', 'ai', 'agent'],
  },
  {
    key: 'fields.tools',
    label: 'Tools',
    section: 'fields',
    type: 'toggle',
    description: 'Enable free-form tool hints for AI-agent tasks.',
    keywords: ['filesystem', 'cli', 'websearch', 'browser', 'mcp'],
  },
];

function getConfigValue(config: KandownConfig, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setConfigValue(config: KandownConfig, path: string, value: unknown): KandownConfig {
  const result = structuredClone(config);
  const parts = path.split('.');
  let current = result as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

function stringifySettingValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (value === null || value === undefined) return '';
  return String(value);
}

function getSettingSearchText(setting: SettingDef, value: unknown): string {
  return [
    setting.label,
    setting.key,
    setting.description,
    setting.section,
    stringifySettingValue(value),
    ...(setting.keywords ?? []),
    ...(setting.options?.flatMap(option => [option.label, option.value]) ?? []),
  ].join(' ').toLowerCase();
}

function isSettingVisible(setting: SettingDef, config: KandownConfig): boolean {
  if (!setting.parentKey) return true;
  return Boolean(getConfigValue(config, setting.parentKey));
}

export function SettingsPage() {
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const setCurrentPage = useStore(s => s.setCurrentPage);
  const dirHandle = useStore(s => s.dirHandle);
  const loadConfig = useStore(s => s.loadConfig);
  const toast = useStore(s => s.toast);

  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>('appearance');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeHelpKey, setActiveHelpKey] = useState<string | null>(null);

  useEffect(() => {
    const off = fileWatcher.on('configChanged', () => {
      void loadConfig();
      toast('Settings updated externally — reloaded', 'info');
    });
    return off;
  }, [loadConfig, toast]);

  useEffect(() => {
    // 📖 Search waits for typing to pause so filtering does not reshuffle the
    // settings list on every keystroke.
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const activeSection = SECTIONS.find(section => section.id === activeSectionId) ?? SECTIONS[0];
  const helpSetting =
    SETTINGS.find(setting => setting.key === activeHelpKey) ??
    SETTINGS.find(setting => setting.section === activeSectionId) ??
    SETTINGS[0];

  const sectionCounts = useMemo(() => {
    return SECTIONS.reduce<Record<SettingsSectionId, number>>((acc, section) => {
      acc[section.id] = SETTINGS.filter(setting => setting.section === section.id && isSettingVisible(setting, config)).length;
      return acc;
    }, { appearance: 0, agent: 0, board: 0, fields: 0 });
  }, [config]);

  const visibleSettings = useMemo(() => {
    if (!normalizedQuery) {
      return SETTINGS.filter(setting => setting.section === activeSectionId && isSettingVisible(setting, config));
    }

    return SETTINGS.filter(setting =>
      isSettingVisible(setting, config) &&
      getSettingSearchText(setting, getConfigValue(config, setting.key)).includes(normalizedQuery)
    );
  }, [activeSectionId, config, normalizedQuery]);

  const handleChange = (setting: SettingDef, newValue: unknown) => {
    updateConfig(currentConfig => setConfigValue(currentConfig, setting.key, newValue));
  };

  if (!dirHandle) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-fg-muted">No project open</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-[292px] flex-none flex-col border-r border-border bg-bg/75">
        <div className="border-b border-border px-4 py-3">
          <KbdButton
            variant="ghost"
            icon="ArrowLeft"
            label="Board"
            onClick={() => setCurrentPage('board')}
            title="Back to board"
            className="mb-3 h-7 px-1.5 text-[12.5px]"
            iconSize={14}
          />
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-border bg-bg-2 text-fg">
              <IconSettings size={17} stroke={1.8} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-fg">Settings</h1>
              <p className="truncate text-[12.5px] text-fg-muted">{dirHandle.name}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-border px-4 py-3">
          <label className="relative block">
            <IconSearch
              aria-hidden="true"
              size={14}
              stroke={1.8}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint"
            />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search any option"
              className="h-8 w-full rounded-[7px] border border-border bg-bg-2 pl-8 pr-8 text-[13.5px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border-focus focus:bg-bg-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] px-1 text-[12px] text-fg-muted hover:bg-bg-3 hover:text-fg"
              >
                esc
              </button>
            )}
          </label>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
            Pages
          </div>
          <div className="flex flex-col gap-1">
            {SECTIONS.map(section => {
              const SectionIcon = section.icon;
              const active = !normalizedQuery && activeSectionId === section.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setActiveSectionId(section.id);
                    setQuery('');
                  }}
                  className={`flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'bg-bg-3 text-fg'
                      : 'text-fg-dim hover:bg-bg-2 hover:text-fg'
                  }`}
                >
                  <SectionIcon size={16} stroke={1.8} className="flex-none text-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{section.label}</span>
                    <span className="block truncate text-[11.5px] text-fg-muted">{section.kicker}</span>
                  </span>
                  <span className="rounded-full bg-bg px-1.5 py-0.5 text-[11px] text-fg-muted tabular-nums">
                    {sectionCounts[section.id]}
                  </span>
                  <IconChevronRight size={13} stroke={1.8} className="text-fg-faint" />
                </button>
              );
            })}
          </div>

          {normalizedQuery && (
            <SearchResults
              settings={visibleSettings}
              activeSectionId={activeSectionId}
              onSelect={(setting) => {
                setActiveSectionId(setting.section);
                setQuery('');
              }}
            />
          )}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <motion.div
            key={normalizedQuery ? `search-${normalizedQuery}` : activeSection.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
                  {normalizedQuery ? 'Search results' : activeSection.kicker}
                </p>
                <h2 className="text-[22px] font-semibold tracking-tight text-fg">
                  {normalizedQuery ? `“${query.trim()}”` : activeSection.label}
                </h2>
                <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-fg-muted">
                  {normalizedQuery
                    ? `${visibleSettings.length} matching option${visibleSettings.length === 1 ? '' : 's'} across project settings.`
                    : activeSection.description}
                </p>
              </div>
              <div className="hidden items-center gap-1 rounded-[7px] border border-border bg-bg-2 px-2 py-1 text-[12px] text-fg-muted sm:flex">
                <IconAdjustmentsHorizontal size={13} stroke={1.8} />
                {visibleSettings.length} options
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(360px,50%)_minmax(280px,1fr)]">
              <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
                {visibleSettings.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-[14px] font-medium text-fg">No option found</p>
                    <p className="mt-1 text-[13px] text-fg-muted">Try another search term.</p>
                  </div>
                ) : (
                  visibleSettings.map((setting, index) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      value={getConfigValue(config, setting.key)}
                      showSection={!!normalizedQuery}
                      isLast={index === visibleSettings.length - 1}
                      onChange={(newValue) => handleChange(setting, newValue)}
                      onHelp={() => setActiveHelpKey(setting.key)}
                      nested={Boolean(setting.parentKey)}
                    />
                  ))
                )}
              </div>

              <aside className="hidden min-h-[420px] items-center justify-center xl:flex">
                <div className="sticky top-6 w-full max-w-[360px] rounded-[8px] border border-border bg-bg-1 px-5 py-5">
                  <SettingHelp setting={helpSetting} value={getConfigValue(config, helpSetting.key)} />
                </div>
              </aside>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

interface SearchResultsProps {
  settings: SettingDef[];
  activeSectionId: SettingsSectionId;
  onSelect: (setting: SettingDef) => void;
}

function SearchResults({ settings, activeSectionId, onSelect }: SearchResultsProps) {
  return (
    <div className="mt-5">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
        Matches
      </div>
      <div className="flex flex-col gap-1">
        {settings.slice(0, 12).map(setting => {
          const section = SECTIONS.find(item => item.id === setting.section);
          const active = setting.section === activeSectionId;

          return (
            <button
              key={setting.key}
              type="button"
              onClick={() => onSelect(setting)}
              className="rounded-[7px] px-2.5 py-2 text-left text-fg-dim transition-colors hover:bg-bg-2 hover:text-fg"
            >
              <span className="block truncate text-[13px] font-medium">{setting.label}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-fg-muted">
                {section?.label ?? setting.section}
                {active && <span className="text-fg-faint">current</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SettingRowProps {
  setting: SettingDef;
  value: unknown;
  showSection: boolean;
  isLast: boolean;
  onChange: (value: unknown) => void;
  onHelp: () => void;
  nested: boolean;
}

function SettingRow({ setting, value, showSection, isLast, onChange, onHelp, nested }: SettingRowProps) {
  const handleToggle = () => {
    if (setting.type === 'toggle') {
      onChange(!value);
    }
  };

  const handleNumberChange = (delta: number) => {
    const num = Number(value);
    const min = setting.min ?? 0;
    const max = setting.max ?? 99;
    onChange(Math.max(min, Math.min(max, num + delta)));
  };

  return (
    <div
      onMouseEnter={onHelp}
      onFocus={onHelp}
      className={`grid gap-3 px-4 py-3 transition-colors hover:bg-bg-2 focus-within:bg-bg-2 md:grid-cols-[minmax(0,1fr)_minmax(128px,190px)] md:items-center ${
      isLast ? '' : 'border-b border-border'
    } ${nested ? 'bg-bg/35 pl-8' : ''}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium text-fg">{setting.label}</span>
          {showSection && (
            <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
              {SECTIONS.find(section => section.id === setting.section)?.label ?? setting.section}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-fg-muted">{setting.description}</p>
        <p className="mt-1 font-mono text-[11px] text-fg-faint">{setting.key}</p>
      </div>

      <div className="flex justify-start md:justify-end">
        {setting.type === 'toggle' && (
          <button
            type="button"
            onClick={handleToggle}
            aria-pressed={Boolean(value)}
            className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
              value ? 'bg-success' : 'bg-bg-3'
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              value ? 'translate-x-[21px]' : 'translate-x-1'
            }`} />
          </button>
        )}

        {setting.type === 'skin' && (
          <SkinPicker value={String(value)} onChange={onChange} />
        )}

        {setting.type === 'select' && setting.options && (
          <select
            value={String(value)}
            onChange={e => onChange(e.target.value)}
            className="h-8 w-full rounded-[7px] border border-border bg-bg-2 px-2.5 text-[13.5px] text-fg outline-none transition-colors focus:border-border-focus focus:bg-bg-3 md:w-[168px]"
          >
            {setting.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        {setting.type === 'text' && (
          <input
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value.trim())}
            placeholder={setting.placeholder}
            className="h-8 w-full rounded-[7px] border border-border bg-bg-2 px-2.5 text-[13.5px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-border-focus focus:bg-bg-3 md:w-[168px]"
          />
        )}

        {setting.type === 'number' && (
          <div className="inline-flex h-8 items-center overflow-hidden rounded-[7px] border border-border bg-bg-2">
            <button
              type="button"
              onClick={() => handleNumberChange(-1)}
              className="h-8 w-8 text-[15px] text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg"
            >
              -
            </button>
            <span className="w-9 text-center text-[13.5px] text-fg tabular-nums">{String(value)}</span>
            <button
              type="button"
              onClick={() => handleNumberChange(1)}
              className="h-8 w-8 text-[15px] text-fg-muted transition-colors hover:bg-bg-3 hover:text-fg"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingHelp({ setting, value }: { setting: SettingDef; value: unknown }) {
  const section = SECTIONS.find(item => item.id === setting.section);
  const SectionIcon = section?.icon ?? IconSettings;
  const currentValue = stringifySettingValue(value) || 'empty';
  const options = setting.options?.map(option => option.label).join(', ');

  return (
    <div className="flex min-h-[280px] flex-col justify-center">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-border bg-bg-2 text-fg">
        <SectionIcon size={19} stroke={1.8} />
      </div>
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-muted">
        {section?.label ?? setting.section}
      </p>
      <h3 className="text-[18px] font-semibold tracking-tight text-fg">{setting.label}</h3>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">{setting.description}</p>
      <div className="mt-5 space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-fg-muted">Current value</span>
          <span className="rounded-[5px] bg-bg-2 px-2 py-1 font-mono text-fg">{currentValue}</span>
        </div>
        <div className="flex items-start justify-between gap-3 text-[12.5px]">
          <span className="text-fg-muted">Config key</span>
          <span className="max-w-[210px] break-all rounded-[5px] bg-bg-2 px-2 py-1 font-mono text-right text-fg">
            {setting.key}
          </span>
        </div>
        {options && (
          <div className="flex items-start justify-between gap-3 text-[12.5px]">
            <span className="text-fg-muted">Choices</span>
            <span className="max-w-[210px] text-right leading-relaxed text-fg-dim">{options}</span>
          </div>
        )}
      </div>
      <p className="mt-5 text-[12.5px] leading-relaxed text-fg-faint">
        Hover or tab through another option to update this help panel.
      </p>
    </div>
  );
}

function SkinPicker({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
  return (
    <div className="grid w-full grid-cols-1 gap-1.5 md:w-[190px]">
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
            className={`rounded-[7px] border px-2 py-1.5 text-left transition-colors ${
              active
                ? 'border-border-focus bg-bg-3 text-fg'
                : 'border-border bg-bg-2 text-fg-dim hover:border-border-strong hover:text-fg'
            }`}
            title={skin.description}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[12.5px] font-medium">{skin.label}</span>
              <span className="flex flex-none overflow-hidden rounded-[3px] border border-border">
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
