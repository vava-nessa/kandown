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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  IconAdjustmentsHorizontal,
  IconBell,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconInfoCircle,
  IconLayoutBoard,
  IconPalette,
  IconPlus,
  IconRobot,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTags,
  IconTerminal2,
  type TablerIcon,
} from '@tabler/icons-react';
import { KANDOWN_VERSION } from '../lib/version';
import { KbdButton } from './KbdButton';
import { ThemeSwitcher } from './ui/theme-switcher-1';
import { useStore } from '../lib/store';
import { fileWatcher } from '../lib/watcher';
import { BACKGROUND_OPTIONS, FONT_OPTIONS, SKIN_OPTIONS, getAllThemes, registerCustomThemes, applyProjectTheme, THEME_PRESETS } from '../lib/theme';
import { ThemePreviewCard } from './ThemePreviewCard';
import { ThemeCustomizerModal } from './ThemeCustomizerModal';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '../lib/i18n';
import { getBrowserNotificationPermission, requestBrowserNotificationPermission, type BrowserNotificationPermission } from '../lib/notifications';
import { readProjectInstructions, writeProjectInstructions } from '../lib/filesystem';
import { DEFAULT_WORK_OUTPUT } from '../lib/types';
import type { BoardTask, KandownConfig, KandownTheme, ThemeMode, WorkOutputConfig, WorkOutputBaseRulesMode } from '../lib/types';

type SettingType = 'toggle' | 'select' | 'number' | 'text' | 'skin' | 'theme' | 'language' | 'permission';
type SettingsSectionId = 'appearance' | 'agent' | 'board' | 'fields' | 'notifications' | 'about';

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

const LANGUAGE_FLAG_EMOJI: Record<string, string> = {
  en: '🇺🇸', zh: '🇨🇳', hi: '🇮🇳', es: '🇪🇸', fr: '🇫🇷', ar: '🇸🇦',
  bn: '🇧🇩', ru: '🇷🇺', pt: '🇧🇷', id: '🇮🇩', ur: '🇵🇰', tr: '🇹🇷',
  de: '🇩🇪', ja: '🇯🇵', pcm: '🇳🇬', vi: '🇻🇳', ko: '🇰🇷', it: '🇮🇹',
  pl: '🇵🇱', uk: '🇺🇦', fa: '🇮🇷', nl: '🇳🇱', el: '🇬🇷', ro: '🇷🇴',
  sv: '🇸🇪', cs: '🇨🇿', hu: '🇭🇺', fi: '🇫🇮', da: '🇩🇰', no: '🇳🇴',
  sk: '🇸🇰', bg: '🇧🇬', sr: '🇷🇸', hr: '🇭🇷', lt: '🇱🇹', lv: '🇱🇻',
  et: '🇪🇪', sl: '🇸🇮',
};

// Original 8 (en, fr, zh, es, pt, hi, de, it) first, then rest sorted by population
const LANGUAGE_ORDER = [
  'en', 'fr', 'zh', 'es', 'pt', 'hi', 'de', 'it',
  'ar', 'bn', 'ru', 'id', 'ur', 'tr', 'ja', 'vi', 'ko', 'fa',
  'pl', 'uk', 'nl', 'el', 'ro', 'cs', 'sv', 'hu', 'fi', 'da', 'no', 'sk', 'bg', 'sr', 'hr', 'lt', 'lv', 'et', 'sl',
];

const ORDERED_LANGUAGES = LANGUAGE_ORDER
  .filter(code => SUPPORTED_LANGUAGES.includes(code as typeof SUPPORTED_LANGUAGES[number]))
  .map(code => ({
    code,
    flag: LANGUAGE_FLAG_EMOJI[code] ?? '🌐',
    nameEn: LANGUAGE_LABELS[code as typeof SUPPORTED_LANGUAGES[number]] ?? code,
  }));

function LanguageDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = ORDERED_LANGUAGES.find(l => l.code === value);

  const filtered = ORDERED_LANGUAGES.filter(
    lang =>
      lang.nameEn.toLowerCase().includes(search.toLowerCase()) ||
      lang.code.toLowerCase().includes(search.toLowerCase())
  );

  const open = () => {
    setIsOpen(true);
    setSearch('');
    setHighlightedIndex(0);
  };

  const close = () => {
    setIsOpen(false);
    setSearch('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[highlightedIndex];
        if (item) { onChange(item.code); close(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, filtered, highlightedIndex]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const item = menuRef.current?.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  const displayLabel = selected
    ? `${selected.flag} ${selected.nameEn} — ${t(`languageNames.${selected.code}`)}`
    : `${LANGUAGE_FLAG_EMOJI['en']} ${LANGUAGE_LABELS['en']} — ${t('languageNames.en')}`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={isOpen ? close : open}
        className="flex h-8 w-full items-center justify-between gap-2 truncate rounded-[7px] border border-border bg-bg-2 px-2.5 text-[13.5px] text-fg outline-none transition-colors hover:bg-bg-3 focus:border-border-focus md:w-[240px]"
      >
        <span className="truncate">{displayLabel}</span>
        <span className={`shrink-0 text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-[320px] rounded-xl border border-border bg-bg shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <IconSearch className="shrink-0 text-fg-muted" size={14} />
              <input
                ref={inputRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setHighlightedIndex(0); }}
                placeholder={t('settings.searchPlaceholder')}
                className="flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint"
              />
            </div>
            <ul ref={menuRef} className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-[12.5px] text-fg-muted">{t('settings.noOptionFound')}</li>
              )}
              {filtered.map((lang, i) => (
                <li key={lang.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(lang.code); close(); }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                      i === highlightedIndex ? 'bg-bg-2 text-fg' : 'text-fg hover:bg-bg-2'
                    } ${lang.code === value ? 'font-medium' : ''}`}
                  >
                    <span className="shrink-0 text-base">{lang.flag}</span>
                    <span className="truncate">{lang.nameEn}</span>
                    <span className="shrink-0 text-fg-muted">—</span>
                    <span className="truncate text-fg-muted">{t(`languageNames.${lang.code}`)}</span>
                    {lang.code === value && (
                      <span className="ml-auto shrink-0 text-fg-muted">✓</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-3 py-1.5 text-center text-[10.5px] text-fg-faint">
              ↑↓ {t('settings.navigate')} · Enter {t('settings.select')} · Esc {t('common.close')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const SECTIONS = (t: ReturnType<typeof useTranslation>['t']): SettingsSection[] => [
  {
    id: 'appearance',
    label: t('settings.appearance'),
    kicker: t('settings.kickerInterface'),
    description: t('settings.appearanceDesc'),
    icon: IconPalette,
  },
  {
    id: 'agent',
    label: t('settings.agent'),
    kicker: t('settings.kickerAutomation'),
    description: t('settings.agentDesc'),
    icon: IconRobot,
  },
  {
    id: 'board',
    label: t('settings.board'),
    kicker: t('settings.kickerIdentifiers'),
    description: t('settings.boardDesc'),
    icon: IconLayoutBoard,
  },
  {
    id: 'fields',
    label: t('settings.fields'),
    kicker: t('settings.kickerMetadata'),
    description: t('settings.fieldsDesc'),
    icon: IconTags,
  },
  {
    id: 'notifications',
    label: t('settings.notifications'),
    kicker: t('settings.kickerSignals'),
    description: t('settings.notificationsDesc'),
    icon: IconBell,
  },
  {
    id: 'about',
    label: t('settings.about') ?? 'About',
    kicker: t('settings.kickerAbout') ?? 'Version & updates',
    description: t('settings.aboutDesc') ?? 'Kandown version and auto-update status.',
    icon: IconInfoCircle,
  },
];

const getSETTINGS = (t: ReturnType<typeof useTranslation>['t']): SettingDef[] => [
  {
    key: 'ui.language',
    label: t('settings.language'),
    section: 'appearance',
    type: 'language',
    description: t('settings.languageDesc'),
    keywords: ['locale', 'translation'],
  },
  {
    key: 'ui.theme',
    label: t('settings.mode'),
    section: 'appearance',
    type: 'theme',
    description: t('settings.modeDesc'),
    options: [
      { value: 'auto', label: t('settings.auto') },
      { value: 'light', label: t('settings.light') },
      { value: 'dark', label: t('settings.dark') },
    ],
    keywords: ['dark', 'light', 'auto'],
  },
  {
    key: 'ui.skin',
    label: t('settings.skin'),
    section: 'appearance',
    type: 'skin',
    description: t('settings.skinDesc'),
    options: SKIN_OPTIONS.map(skin => ({ value: skin.id, label: skin.label })),
    keywords: ['color', 'theme', 'palette'],
  },
  {
    key: 'ui.background',
    label: t('settings.background'),
    section: 'appearance',
    type: 'select',
    description: t('settings.backgroundDesc'),
    options: BACKGROUND_OPTIONS.map(background => ({ value: background.id, label: background.label })),
    keywords: ['liquid', 'solid', 'animation'],
  },
  {
    key: 'ui.font',
    label: t('settings.font'),
    section: 'appearance',
    type: 'select',
    description: t('settings.fontDesc'),
    options: FONT_OPTIONS.map(font => ({ value: font.id, label: font.label })),
    keywords: ['typography', 'text'],
  },
  {
    key: 'agent.suggestFollowUp',
    label: t('settings.suggestFollowUp'),
    section: 'agent',
    type: 'toggle',
    description: t('settings.suggestFollowUpDesc'),
    keywords: ['ai', 'suggestions', 'automation'],
  },
  {
    key: 'agent.maxSuggestions',
    label: t('settings.maxSuggestions'),
    section: 'agent',
    type: 'number',
    description: t('settings.maxSuggestionsDesc'),
    min: 1,
    max: 5,
    keywords: ['limit', 'follow-up'],
  },
  {
    key: 'agent.extraArgs',
    label: 'Agent Extra Arguments',
    section: 'agent',
    type: 'text',
    description: 'Extra CLI flags passed when launching agents from Kandown (e.g. --dangerously-skip-permissions)',
    placeholder: '--dangerously-skip-permissions',
    keywords: ['flags', 'arguments', 'cli', 'agent'],
  },
  
  {
    key: 'board.columns',
    label: t('settings.columns'),
    section: 'board',
    type: 'text',
    description: t('settings.columnsDesc'),
    placeholder: 'Backlog, Todo, In Progress, Review, Done',
    keywords: ['statuses', 'workflow', 'kanban'],
  },
  {
    key: 'board.stackDefaultState',
    label: t('settings.stackDefaultState'),
    section: 'board',
    type: 'select',
    description: t('settings.stackDefaultStateDesc'),
    options: [
      { value: 'collapsed', label: t('settings.stackCollapsed') },
      { value: 'expanded', label: t('settings.stackExpanded') },
    ],
    keywords: ['group', 'stack', 'collapse', 'expand', 'tag', 'bracket', 'hashtag'],
  },
  {
    key: 'board.defaultPriority',
    label: t('settings.defaultPriority'),
    section: 'fields',
    type: 'select',
    description: t('settings.defaultPriorityDesc'),
    options: ['P1', 'P2', 'P3', 'P4'].map(value => ({ value, label: value })),
    keywords: ['p1', 'p2', 'p3', 'p4', 'priority default'],
    parentKey: 'fields.priority',
  },
  {
    key: 'board.defaultOwnerType',
    label: t('settings.defaultOwner'),
    section: 'fields',
    type: 'select',
    description: t('settings.defaultOwnerDesc'),
    options: ['human', 'ai'].map(value => ({ value, label: value })),
    keywords: ['human', 'ai', 'owner default'],
    parentKey: 'fields.ownerType',
  },
  {
    key: 'fields.priority',
    label: t('settings.priority'),
    section: 'fields',
    type: 'toggle',
    description: t('settings.priorityDesc'),
    keywords: ['p1', 'p2', 'importance'],
  },
  {
    key: 'fields.assignee',
    label: t('settings.assignee'),
    section: 'fields',
    type: 'toggle',
    description: t('settings.assigneeDesc'),
    keywords: ['owner', 'person', 'user'],
  },
  {
    key: 'fields.tags',
    label: t('settings.tags'),
    section: 'fields',
    type: 'toggle',
    description: t('settings.tagsDesc'),
    keywords: ['labels', 'categories'],
  },
  {
    key: 'fields.dueDate',
    label: t('settings.dueDate'),
    section: 'fields',
    type: 'toggle',
    description: t('settings.dueDateDesc'),
    keywords: ['deadline', 'date'],
  },
  {
    key: 'fields.ownerType',
    label: t('settings.ownerType'),
    section: 'fields',
    type: 'toggle',
    description: t('settings.ownerTypeDesc'),
    keywords: ['human', 'ai', 'agent'],
  },
  {
    key: 'fields.tools',
    label: t('settings.tools'),
    section: 'fields',
    type: 'toggle',
    description: t('settings.toolsDesc'),
    keywords: ['filesystem', 'cli', 'websearch', 'browser', 'mcp'],
  },
  {
    key: 'notifications.permission',
    label: t('settings.notificationPermission'),
    section: 'notifications',
    type: 'permission',
    description: t('settings.notificationPermissionDesc'),
    keywords: ['chrome', 'browser', 'permission'],
  },
  {
    key: 'notifications.browser',
    label: t('settings.browserNotifications'),
    section: 'notifications',
    type: 'toggle',
    description: t('settings.browserNotificationsDesc'),
    keywords: ['chrome', 'desktop', 'system'],
  },
  {
    key: 'notifications.statusChanges',
    label: t('settings.statusChangeNotifications'),
    section: 'notifications',
    type: 'toggle',
    description: t('settings.statusChangeNotificationsDesc'),
    keywords: ['status', 'column', 'workflow'],
  },
  {
    key: 'notifications.taskEdits',
    label: t('settings.taskEditNotifications'),
    section: 'notifications',
    type: 'toggle',
    description: t('settings.taskEditNotificationsDesc'),
    keywords: ['file', 'ai', 'external edit', 'debounce'],
  },
  {
    key: 'notifications.subtaskCompletions',
    label: t('settings.subtaskNotifications'),
    section: 'notifications',
    type: 'toggle',
    description: t('settings.subtaskNotificationsDesc'),
    keywords: ['subtask', 'checklist', 'done'],
  },
  {
    key: 'notifications.sound',
    label: t('settings.notificationSound'),
    section: 'notifications',
    type: 'toggle',
    description: t('settings.notificationSoundDesc'),
    keywords: ['audio', 'sound', 'listen'],
  },
  {
    key: 'notifications.soundId',
    label: t('settings.notificationSoundChoice'),
    section: 'notifications',
    type: 'select',
    description: t('settings.notificationSoundChoiceDesc'),
    options: [
      { value: 'soft', label: t('settings.soundSoft') },
      { value: 'chime', label: t('settings.soundChime') },
      { value: 'ping', label: t('settings.soundPing') },
      { value: 'pop', label: t('settings.soundPop') },
    ],
    keywords: ['audio', 'tone', 'sound'],
    parentKey: 'notifications.sound',
  },
  {
    key: 'notifications.webhookUrl',
    label: 'Outgoing Webhook URL',
    section: 'notifications',
    type: 'text',
    description: 'POST JSON notifications to Slack, Discord, or n8n on task status updates',
    placeholder: 'https://hooks.slack.com/services/...',
    keywords: ['webhook', 'slack', 'discord', 'http', 'post'],
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
  const { t } = useTranslation();
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const setCurrentPage = useStore(s => s.setCurrentPage);
  const dirHandle = useStore(s => s.dirHandle);
  const isOpen = useStore(s => s.isOpen);
  const projectName = useStore(s => s.projectName);
  const loadConfig = useStore(s => s.loadConfig);
  const toast = useStore(s => s.toast);
  const columns = useStore(s => s.columns);

  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>('appearance');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(() => getBrowserNotificationPermission());
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'available' | 'error'>('idle');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  // 📖 Check npm for a newer version — auto-check on mount for the about section
  const checkForUpdate = useCallback(async () => {
    if (updateStatus === 'checking') return;
    setUpdateStatus('checking');
    setLatestVersion(null);
    try {
      const res = await fetch(`https://registry.npmjs.org/kandown/latest`);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json() as { version: string };
      const latest = data.version;
      if (latest === KANDOWN_VERSION) {
        setUpdateStatus('upToDate');
      } else {
        setLatestVersion(latest);
        setUpdateStatus('available');
      }
    } catch {
      setUpdateStatus('error');
    }
  }, [updateStatus]);

  useEffect(() => {
    const off = fileWatcher.on('configChanged', () => {
      void loadConfig();
      toast(t('toast.settingsUpdatedExternally'), 'info');
    });
    return off;
  }, [loadConfig, toast, t]);

  useEffect(() => {
    // 📖 Search waits for typing to pause so filtering does not reshuffle the
    // settings list on every keystroke.
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const settings = getSETTINGS(t);
  const activeSection = SECTIONS(t).find(section => section.id === activeSectionId) ?? SECTIONS(t)[0];

  const sectionCounts = useMemo(() => {
    return SECTIONS(t).reduce<Record<SettingsSectionId, number>>((acc, section) => {
      acc[section.id] = settings.filter(setting => setting.section === section.id && isSettingVisible(setting, config)).length;
      return acc;
    }, { appearance: 0, agent: 0, board: 0, fields: 0, notifications: 0, about: 0 });
  }, [config, t, settings]);

  const visibleSettings = useMemo(() => {
    if (!normalizedQuery) {
      return settings.filter(setting => setting.section === activeSectionId && isSettingVisible(setting, config));
    }

    return settings.filter(setting =>
      isSettingVisible(setting, config) &&
      getSettingSearchText(setting, getConfigValue(config, setting.key)).includes(normalizedQuery)
    );
  }, [activeSectionId, config, normalizedQuery, settings]);

  const handleChange = (setting: SettingDef, newValue: unknown) => {
    if (setting.type === 'permission') return;
    if (setting.key === 'board.columns') {
      const columns = String(newValue)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      if (columns.length === 0) return;
      updateConfig(currentConfig => setConfigValue(currentConfig, setting.key, columns));
      return;
    }
    updateConfig(currentConfig => setConfigValue(currentConfig, setting.key, newValue));
  };

  const handleRequestNotificationPermission = async () => {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      toast(t('settings.notificationPermissionGranted'), 'success');
    } else if (permission === 'denied') {
      toast(t('settings.notificationPermissionDenied'), 'error');
    } else if (permission === 'unsupported') {
      toast(t('settings.notificationPermissionUnsupported'), 'error');
    }
  };

  if (!dirHandle && !isOpen) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-fg-muted">{t('settings.noProjectOpen')}</p>
      </div>
    );
  }

  const settingsProjectName = dirHandle?.name ?? projectName ?? 'Server project';

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-[292px] flex-none flex-col border-r border-border bg-bg/75">
        <div className="border-b border-border px-4 py-3">
          <KbdButton
            variant="ghost"
            icon="ArrowLeft"
            label={t('settings.backToBoard')}
            onClick={() => setCurrentPage('board')}
            title={t('settings.backToBoard')}
            className="mb-3 h-7 px-1.5 text-[12.5px]"
            iconSize={14}
          />
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-border bg-bg-2 text-fg">
              <IconSettings size={17} stroke={1.8} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-fg">{t('settings.settingsTitle')}</h1>
              <p className="truncate text-[12.5px] text-fg-muted">{settingsProjectName}</p>
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
              placeholder={t('settings.searchPlaceholder')}
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
            {t('settings.pages')}
          </div>
          <div className="flex flex-col gap-1">
            {SECTIONS(t).map(section => {
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
                  {normalizedQuery ? t('settings.searchResults') : activeSection.kicker}
                </p>
                <h2 className="text-[22px] font-semibold tracking-tight text-fg">
                  {normalizedQuery ? `"${query.trim()}"` : activeSection.label}
                </h2>
                <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-fg-muted">
                  {normalizedQuery
                    ? `${visibleSettings.length} ${t('settings.matchingOptions')}`
                    : activeSection.description}
                </p>
              </div>
              <div className="hidden items-center gap-1 rounded-[7px] border border-border bg-bg-2 px-2 py-1 text-[12px] text-fg-muted sm:flex">
                <IconAdjustmentsHorizontal size={13} stroke={1.8} />
                {visibleSettings.length} options
              </div>
            </div>

            <div className={!normalizedQuery && activeSectionId === 'agent' ? 'max-w-[1360px]' : 'max-w-4xl'}>
              {activeSectionId === 'about' ? (
                <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
                  <AboutVersionCard
                    currentVersion={KANDOWN_VERSION}
                    updateStatus={updateStatus}
                    latestVersion={latestVersion}
                    onCheckUpdate={checkForUpdate}
                  />
                </div>
              ) : !normalizedQuery && activeSectionId === 'agent' ? (
                <WorkOutputConfigurator
                  config={config}
                  columns={columns}
                  dirHandle={dirHandle}
                  onChange={(next) => {
                    void updateConfig(currentConfig => setConfigValue(currentConfig, 'agent.workOutput', next));
                  }}
                  toast={toast}
                  agentSettings={visibleSettings}
                  getConfigValue={(key) => getConfigValue(config, key)}
                  handleChange={handleChange}
                  notificationPermission={notificationPermission}
                  onRequestNotificationPermission={handleRequestNotificationPermission}
                />
              ) : visibleSettings.length === 0 ? (
                <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1 px-4 py-10 text-center">
                  <p className="text-[14px] font-medium text-fg">{t('settings.noOptionFound')}</p>
                  <p className="mt-1 text-[13px] text-fg-muted">{t('settings.tryAnotherSearch')}</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
                  {visibleSettings.map((setting, index) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      value={getConfigValue(config, setting.key)}
                      showSection={!!normalizedQuery}
                      isLast={index === visibleSettings.length - 1}
                      onChange={(newValue) => handleChange(setting, newValue)}
                      nested={Boolean(setting.parentKey)}
                      notificationPermission={notificationPermission}
                      onRequestNotificationPermission={handleRequestNotificationPermission}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

const CONCISE_RULES_PREVIEW = `# Kandown agent rules — concise

- Task state lives in project-root \`tasks/*.md\`; do not maintain a separate board index.
- Before work, read the relevant task file and keep it updated while you progress.
- Move tasks by editing frontmatter \`status:\`; complete work by setting \`status: Done\` and adding a markdown \`report:\` summary.
- Update subtasks in-place: \`- [ ]\` → \`- [x]\`, with a short \`report:\` line for meaningful progress.
- Board columns live in \`.kandown/kandown.json\` under \`board.columns\`; project instructions live in \`.kandown/instructions.md\`.
- Never put Kandown task data inside \`.kandown/\`; tasks belong in \`./tasks/\`.`;

function estimateTokenCount(text: string): number {
  return Math.max(0, Math.ceil(text.trim().length / 4));
}

function buildDigestPreview(columns: { name: string; tasks: BoardTask[] }[], options: WorkOutputConfig['boardDigest']): string {
  const lines = ['## Current board', ''];
  if (options.showColumnCounts) {
    lines.push(`**Columns:** ${columns.map(col => `${col.name} (${col.tasks.length})`).join(' · ')}`);
  }
  if (options.showTasks) {
    for (const col of columns) {
      if (col.tasks.length === 0) continue;
      lines.push('', `### ${col.name}`);
      for (const task of col.tasks.slice(0, 8)) {
        const pri = options.showPriority && task.priority ? `[${task.priority}] ` : '';
        const assignee = options.showAssignee && task.assignee ? ` (@${task.assignee})` : '';
        const blocked = options.showBlockedBy && task.dependsOn.length > 0 ? ` ⛔ blocked by ${task.dependsOn.join(', ')}` : '';
        lines.push(`- ${task.id} ${pri}${task.title || '(untitled)'}${assignee}${blocked}`);
      }
      if (col.tasks.length > 8) lines.push(`- … ${col.tasks.length - 8} more`);
    }
  }
  if (options.showNextActionable) {
    const next = columns.flatMap(col => col.tasks.map(task => ({ task, status: col.name }))).find(item => item.task.dependsOn.length === 0);
    lines.push('', '### Next actionable task');
    lines.push(next ? `→ **${next.task.id}** — ${next.task.title} (${next.task.priority ?? 'no priority'}, ${next.status})` : 'None — every task is done, archived, or blocked.');
  }
  return lines.join('\n');
}

const FULL_RULES_PREVIEW = `# Kandown — AI Agent Rules

## Quick CLI Reference

| Command | Description |
|---------|-------------|
| \`kandown work\` | Output agent rules + live board state digest |
| \`kandown list\` | List tasks (\`--status "In Progress"\`, \`--priority P1\`) |
| \`kandown show <id>\` | Display task details & subtasks |
| \`kandown create "<title>"\` | Create new task (\`--priority P1 --assignee user\`) |
| \`kandown move <id> <status>\` | Move task column (e.g. \`kandown move t1 "Done"\`) |
| \`kandown assign <id> <user>\` | Assign task |
| \`kandown commit\` | Commit board changes to git |

---

## The System

Kandown is a file-based Kanban backed by plain markdown. All task state lives in \`tasks/*.md\` at the project root — no separate board index, no database.

\`\`\`
.kandown/             # config, web UI, agent docs
├── kandown.json      # Board columns + project settings
├── kandown.html      # Web UI (single-file bundle)
├── AGENT.md          # AI-agent conventions
└── AGENT_KANDOWN.md  # full reference

tasks/                # source of truth — one .md per task
├── t1.md
├── t2.md
└── archive/          # archived tasks (.md files moved here)
    └── t99.md
\`\`\`

**Board columns** are configured in \`kandown.json\` at \`board.columns\`. Tasks without a \`status\` go to **Backlog**.

---

## Critical: Real-Time Task Updates

⚠️ **ALWAYS keep task files up to date as you work.** This is not optional — it lets the user see exactly what you're doing, what was decided, and what's left.

When you make progress:
1. Check off completed subtasks: \`- [ ]\` → \`- [x]\`
2. Add a \`report:\` under each done subtask with what changed
3. Move the task to the appropriate column by updating \`status:\` in frontmatter
4. Write a completion \`report:\` in frontmatter when the task is done

---

## Task Lifecycle

### Start working on a task
Update the task frontmatter: \`status: In Progress\`

### While working — UPDATE THE TASK FILE AS YOU GO

Every time you make progress — writing code, making a decision, discovering something — update the task file immediately. Do not wait until the task is done.

For each subtask you complete:
1. Check it off: \`- [ ]\` → \`- [x]\`
2. Add a \`report:\` line under it with what changed

### Complete a task

When the task is done:
1. Set \`status: Done\` in the frontmatter
2. Write a completion \`report:\` in the frontmatter summarizing:
   - **Changes**: What was created/modified/deleted
   - **Decisions**: Why you chose a particular approach
   - **Files**: List of affected files

---

## Mutation Rules

| Action | File to edit |
|--------|-------------|
| Move task between columns | Task file: update \`status:\` in frontmatter |
| Reorder task | Task file: update \`order:\` in frontmatter |
| Change title/priority/tags/assignee | Task file frontmatter |
| Edit description/notes/subtasks | Task file body only |
| Create task | Create one new \`tasks/t-NNN.md\` |
| Delete task | Delete the task file |
| Create/rename/delete columns | \`.kandown/kandown.json\` at \`board.columns\` |

**One task file = one source of truth.** Never maintain a separate board index.`;

const OPTIMIZED_RULES_PREVIEW = `# Kandown agent rules

## CLI Commands
- \`kandown list\` (list tasks) · \`kandown show <id>\` (view task)
- \`kandown create "<title>"\` (create task) · \`kandown move <id> <status>\` (move task column)
- \`kandown assign <id> <user>\` · \`kandown commit\` (commit board to git)

## Rules
- Task state lives in project-root \`tasks/*.md\`; do not maintain a separate board index.
- Before work, read the relevant task file and keep it updated while you progress.
- Move tasks by editing frontmatter \`status:\`; complete work by setting \`status: Done\` and adding a markdown \`report:\` summary.
- Update subtasks in-place: \`- [ ]\` → \`- [x]\`, with a short \`report:\` line for meaningful progress.
- Board columns live in \`.kandown/kandown.json\` under \`board.columns\`; project instructions live in \`.kandown/instructions.md\`.
- Never put Kandown task data inside \`.kandown/\`; tasks belong in \`./tasks/\`.`;

const CAVEMAN_RULES_PREVIEW = `# Kandown agent rules

CLI: kandown list | kandown show <id> | kandown create "<title>" | kandown move <id> <status> | kandown assign <id> <user> | kandown commit
RULES: TASKS IN ./tasks/*.md. READ TASK BEFORE WORK. UPDATE SUBTASKS - [ ] -> - [x] + REPORT. MOVE: EDIT status:. DONE: status: Done + report:.`;

function getBaseRulesPreview(mode: string): string {
  if (mode === 'caveman') return CAVEMAN_RULES_PREVIEW;
  if (mode === 'optimized' || mode === 'concise') return OPTIMIZED_RULES_PREVIEW;
  return FULL_RULES_PREVIEW;
}

interface PreviewBlockSection {
  id: 'baseRules' | 'projectInstructions' | 'boardDigest' | 'rawTemplate';
  subId?: 'columnCounts' | 'taskList' | 'nextActionable';
  label: string;
  content: string;
}

function renderWorkPreviewBlocks(
  config: WorkOutputConfig,
  projectInstructions: string,
  columns: { name: string; tasks: BoardTask[] }[]
): PreviewBlockSection[] {
  const rules = getBaseRulesPreview(config.baseRulesMode);
  const instrContent = projectInstructions.trim()
    ? `## Project-specific instructions\n\n${projectInstructions.trim()}`
    : `## Project-specific instructions\n\n*(No custom project instructions defined yet in .kandown/instructions.md)*`;

  if (config.mode === 'raw') {
    const rawText = config.rawTemplate
      .replaceAll('{{baseRules}}', rules)
      .replaceAll('{{projectInstructions}}', instrContent)
      .replaceAll('{{boardDigest}}', buildDigestPreview(columns, config.boardDigest))
      .trim();

    return [
      {
        id: 'rawTemplate',
        label: 'Raw Template Output',
        content: rawText,
      },
    ];
  }

  const result: PreviewBlockSection[] = [];

  for (const section of config.sectionOrder) {
    if (section === 'baseRules' && config.includeBaseRules) {
      result.push({
        id: 'baseRules',
        label: 'Base Kandown Rules',
        content: rules,
      });
    }
    if (section === 'projectInstructions' && config.includeProjectInstructions) {
      result.push({
        id: 'projectInstructions',
        label: 'Project Instructions (.kandown/instructions.md)',
        content: instrContent,
      });
    }
    if (section === 'boardDigest' && config.includeBoardDigest) {
      result.push({
        id: 'boardDigest',
        label: 'Live Board Digest',
        content: buildDigestPreview(columns, config.boardDigest),
      });
    }
  }

  return result;
}

function renderWorkPreview(config: WorkOutputConfig, projectInstructions: string, columns: { name: string; tasks: BoardTask[] }[]): string {
  return renderWorkPreviewBlocks(config, projectInstructions, columns)
    .map(b => b.content)
    .join('\n\n---\n\n');
}

const COLOR_THEMES: Record<string, { border: string; bg: string; badge: string; text: string }> = {
  baseRules: {
    border: 'border-emerald-500/80',
    bg: 'bg-emerald-500/10',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    text: 'text-emerald-200',
  },
  projectInstructions: {
    border: 'border-amber-500/80',
    bg: 'bg-amber-500/10',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    text: 'text-amber-200',
  },
  boardDigest: {
    border: 'border-sky-500/80',
    bg: 'bg-sky-500/10',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    text: 'text-sky-200',
  },
  columnCounts: {
    border: 'border-indigo-500/80',
    bg: 'bg-indigo-500/10',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    text: 'text-indigo-200',
  },
  taskList: {
    border: 'border-purple-500/80',
    bg: 'bg-purple-500/10',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    text: 'text-purple-200',
  },
  nextActionable: {
    border: 'border-rose-500/80',
    bg: 'bg-rose-500/10',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    text: 'text-rose-200',
  },
  rawTemplate: {
    border: 'border-cyan-500/80',
    bg: 'bg-cyan-500/10',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    text: 'text-cyan-200',
  },
};

interface WorkOutputConfiguratorProps {
  config: KandownConfig;
  columns: { name: string; tasks: BoardTask[] }[];
  dirHandle: FileSystemDirectoryHandle | null;
  onChange: (next: WorkOutputConfig) => void;
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
  agentSettings: SettingDef[];
  getConfigValue: (key: string) => unknown;
  handleChange: (setting: SettingDef, newValue: unknown) => void;
  notificationPermission: BrowserNotificationPermission;
  onRequestNotificationPermission: () => void;
}

function WorkOutputConfigurator({
  config,
  columns,
  dirHandle,
  onChange,
  toast,
  agentSettings,
  getConfigValue,
  handleChange,
  notificationPermission,
  onRequestNotificationPermission,
}: WorkOutputConfiguratorProps) {
  const workOutput = { ...DEFAULT_WORK_OUTPUT, ...config.agent.workOutput, boardDigest: { ...DEFAULT_WORK_OUTPUT.boardDigest, ...config.agent.workOutput?.boardDigest } };
  const [instructions, setInstructions] = useState('');
  const [savedInstructions, setSavedInstructions] = useState('');
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  // Load instructions & watch file changes in real-time
  useEffect(() => {
    let cancelled = false;
    setLoadingInstructions(true);

    const loadInst = () => {
      readProjectInstructions(dirHandle)
        .then(text => {
          if (cancelled) return;
          setInstructions(text);
          setSavedInstructions(text);
        })
        .catch(e => toast(`Failed to load .kandown/instructions.md: ${(e as Error).message}`, 'error'))
        .finally(() => {
          if (!cancelled) setLoadingInstructions(false);
        });
    };

    loadInst();

    const unbindConfig = fileWatcher.on('configChanged', () => {
      loadInst();
    });

    const unbindTask = fileWatcher.on('taskChanged', () => {
      // Board digest updates automatically via store columns prop
    });

    return () => {
      cancelled = true;
      unbindConfig();
      unbindTask();
    };
  }, [dirHandle, toast]);

  const previewBlocks = renderWorkPreviewBlocks(workOutput, instructions, columns);
  const preview = renderWorkPreview(workOutput, instructions, columns);
  const estimatedTokens = estimateTokenCount(preview) + (workOutput.baseRulesMode === 'full' && workOutput.includeBaseRules ? 1100 : 0);

  const patch = (partial: Partial<WorkOutputConfig>) => {
    try {
      onChange({ ...workOutput, ...partial });
    } catch (e) {
      toast(`Failed to update setting: ${(e as Error).message}`, 'error');
    }
  };

  const patchDigest = (partial: Partial<WorkOutputConfig['boardDigest']>) => {
    try {
      onChange({
        ...workOutput,
        boardDigest: { ...workOutput.boardDigest, ...partial },
      });
    } catch (e) {
      toast(`Failed to update digest setting: ${(e as Error).message}`, 'error');
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      await writeProjectInstructions(dirHandle, instructions);
      setSavedInstructions(instructions);
      toast('Saved .kandown/instructions.md', 'success');
    } catch (e) {
      toast(`Failed to save instructions: ${(e as Error).message}`, 'error');
    } finally {
      setSavingInstructions(false);
    }
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(preview).then(() => {
      setCopied(true);
      toast('Copied kandown work output to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      toast(`Failed to copy: ${(err as Error).message}`, 'error');
    });
  };

  const isInstructionsDirty = instructions !== savedInstructions;

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-start">
      {/* Left Column: Options & Controls */}
      <div className="lg:col-span-7 flex flex-col gap-4">

        {/* Intro Overview Card */}
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-bg-1/90 p-5 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconTerminal2 size={22} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-fg">Agent instructions (<code className="text-primary font-mono text-[13px]">kandown work</code>)</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
                When an AI agent runs <code className="text-primary font-mono">kandown work</code> in your terminal, Kandown combines 3 layers of context into a single prompt:
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3 text-[12px] font-medium">
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">1</span>
              <span>🟢 Base Rules</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-400">2</span>
              <span>🟡 Project Notes</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sky-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[11px] font-bold text-sky-400">3</span>
              <span>🔵 Live Board</span>
            </div>
          </div>
        </div>

        {/* STEP 1: Base Rules */}
        <div
          onMouseEnter={() => setHoveredSection('baseRules')}
          onMouseLeave={() => setHoveredSection(null)}
          className={`rounded-xl border bg-bg-1/90 p-5 transition-all duration-300 backdrop-blur ${
            hoveredSection === 'baseRules'
              ? 'border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/5'
              : 'border-border/80 hover:border-border-focus'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[12px] font-bold text-white shadow-md shadow-emerald-500/20">1</span>
              <div>
                <h4 className="text-[14.5px] font-bold text-fg">Step 1: Base Rules</h4>
                <p className="text-[12px] text-fg-muted">How Kandown task management works for agents</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted cursor-pointer hover:text-fg">
              <input
                type="checkbox"
                checked={workOutput.includeBaseRules}
                onChange={e => patch({ includeBaseRules: e.target.checked })}
                className="h-4 w-4 rounded accent-emerald-500"
              />
              <span>Include</span>
            </label>
          </div>

          {workOutput.includeBaseRules && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-faint">Rule style & density</span>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {[
                  { value: 'verbose', label: 'Verbose 📜', badge: '~1100 tokens', desc: 'Full reference guide' },
                  { value: 'optimized', label: 'Optimized ⚡', badge: 'Recommended', desc: 'Concise LLM rules' },
                  { value: 'caveman', label: 'Caveman 🦍', badge: '~40 tokens', desc: 'Minimal token rules' },
                ].map(item => {
                  const active =
                    workOutput.baseRulesMode === item.value ||
                    (item.value === 'verbose' && workOutput.baseRulesMode === 'full') ||
                    (item.value === 'optimized' && workOutput.baseRulesMode === 'concise');
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onMouseEnter={() => setHoveredSection('baseRules')}
                      onClick={() => patch({ baseRulesMode: item.value as WorkOutputBaseRulesMode })}
                      className={`relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all duration-200 ${
                        active
                          ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-300 font-semibold shadow-md ring-1 ring-emerald-500/40'
                          : 'border-border/80 bg-bg-2/80 text-fg-dim hover:bg-bg-3 hover:text-fg'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[13px] font-bold">{item.label}</span>
                        {item.badge === 'Recommended' ? (
                          <span className="rounded-full bg-emerald-500/30 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300">
                            ★ Recommended
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-fg-faint">{item.badge}</span>
                        )}
                      </div>
                      <p className="text-[11px] leading-snug text-fg-muted">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: Project Instructions (.kandown/instructions.md) */}
        <div
          onMouseEnter={() => setHoveredSection('projectInstructions')}
          onMouseLeave={() => setHoveredSection(null)}
          className={`rounded-xl border bg-bg-1/90 p-5 transition-all duration-300 backdrop-blur ${
            hoveredSection === 'projectInstructions'
              ? 'border-amber-500/80 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/5'
              : 'border-border/80 hover:border-border-focus'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-[12px] font-bold text-white shadow-md shadow-amber-500/20">2</span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-[14.5px] font-bold text-fg">Step 2: Project Guidelines</h4>
                  {isInstructionsDirty && (
                    <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-400">
                      Unsaved changes
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-fg-muted">Custom rules stored in <code className="font-mono text-amber-400/90">.kandown/instructions.md</code></p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted cursor-pointer hover:text-fg">
              <input
                type="checkbox"
                checked={workOutput.includeProjectInstructions}
                onChange={e => patch({ includeProjectInstructions: e.target.checked })}
                className="h-4 w-4 rounded accent-amber-500"
              />
              <span>Include</span>
            </label>
          </div>

          {workOutput.includeProjectInstructions && (
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    void saveInstructions();
                  }
                }}
                disabled={loadingInstructions}
                placeholder="e.g. Always use pnpm. Write commit messages in English. Run pnpm test before moving tasks to Done..."
                className="min-h-[140px] w-full resize-y rounded-lg border border-border/80 bg-bg-2/90 px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-faint focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all"
              />

              {/* Quick Preset Rule Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-fg-faint flex items-center gap-1 mr-1">
                  <IconSparkles size={13} className="text-amber-400" /> Quick add:
                </span>
                {[
                  { label: '📦 pnpm', text: 'Use pnpm as the default package manager.' },
                  { label: '🧪 Test rule', text: 'Run pnpm test before marking any task Done.' },
                  { label: '🌳 Git rule', text: 'Write commit messages in English using imperative mood.' },
                  { label: '⚡ Task log', text: 'Update subtasks - [ ] -> - [x] with report: lines in real time.' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      const trimmed = instructions.trim();
                      const nextText = trimmed ? `${trimmed}\n- ${chip.text}` : `- ${chip.text}`;
                      setInstructions(nextText);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-all hover:bg-amber-500/20 hover:scale-[1.02] active:scale-95"
                  >
                    <IconPlus size={11} />
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-fg-faint">Press <kbd className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">⌘S</kbd> to save</span>
                <button
                  type="button"
                  onClick={saveInstructions}
                  disabled={savingInstructions || !isInstructionsDirty}
                  className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-bold transition-all ${
                    isInstructionsDirty
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 shadow-md shadow-amber-500/10 active:scale-95'
                      : 'border-border/60 bg-bg-2 text-fg-faint disabled:cursor-default'
                  }`}
                >
                  {savingInstructions ? 'Saving…' : isInstructionsDirty ? 'Save changes' : 'Saved ✓'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* STEP 3: Live Board Digest */}
        <div
          onMouseEnter={() => setHoveredSection('boardDigest')}
          onMouseLeave={() => setHoveredSection(null)}
          className={`rounded-xl border bg-bg-1/90 p-5 transition-all duration-300 backdrop-blur ${
            hoveredSection === 'boardDigest' || ['columnCounts', 'taskList', 'nextActionable'].includes(hoveredSection ?? '')
              ? 'border-sky-500/80 ring-2 ring-sky-500/20 shadow-lg shadow-sky-500/5'
              : 'border-border/80 hover:border-border-focus'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-[12px] font-bold text-white shadow-md shadow-sky-500/20">3</span>
              <div>
                <h4 className="text-[14.5px] font-bold text-fg">Step 3: Live Board State</h4>
                <p className="text-[12px] text-fg-muted">Real-time columns, task list, and next actionable task pick</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted cursor-pointer hover:text-fg">
              <input
                type="checkbox"
                checked={workOutput.includeBoardDigest}
                onChange={e => patch({ includeBoardDigest: e.target.checked })}
                className="h-4 w-4 rounded accent-sky-500"
              />
              <span>Include</span>
            </label>
          </div>

          {workOutput.includeBoardDigest && (
            <div className="mt-4 rounded-lg border border-border/80 bg-bg-2/80 p-3.5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-400/90">Details included in board state</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['showColumnCounts', 'Column counts', 'columnCounts'],
                  ['showTasks', 'Task list per column', 'taskList'],
                  ['showPriority', 'Priority labels (P1–P4)', 'taskList'],
                  ['showAssignee', 'Assignees (@user)', 'taskList'],
                  ['showBlockedBy', 'Blocked-by dependencies', 'taskList'],
                  ['showNextActionable', 'Next actionable task pick', 'nextActionable'],
                ].map(([key, label, sectionKey]) => (
                  <label
                    key={key}
                    onMouseEnter={() => setHoveredSection(sectionKey)}
                    onMouseLeave={() => setHoveredSection('boardDigest')}
                    className={`flex items-center justify-between gap-3 text-[12.5px] cursor-pointer rounded-lg px-2.5 py-1.5 transition-all ${
                      hoveredSection === sectionKey ? 'bg-sky-500/20 text-sky-200 font-semibold' : 'text-fg-dim hover:text-fg hover:bg-bg-3/60'
                    }`}
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(workOutput.boardDigest[key as keyof WorkOutputConfig['boardDigest']])}
                      onChange={e => patchDigest({ [key]: e.target.checked } as Partial<WorkOutputConfig['boardDigest']>)}
                      className="h-4 w-4 rounded accent-sky-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Advanced Options */}
        <details className="group rounded-xl border border-border/80 bg-bg-1/90 backdrop-blur">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-[13px] font-bold text-fg-dim transition-colors hover:text-fg">
            <span>⚙️ Advanced options (Custom template & CLI settings)</span>
            <span className="text-[11px] text-fg-faint group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="border-t border-border/80 p-5 space-y-4">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-faint">Output Mode</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[{ value: 'blocks', label: 'Structured Blocks' }, { value: 'raw', label: 'Raw Custom Template' }].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patch({ mode: option.value as WorkOutputConfig['mode'] })}
                    className={`rounded-lg border px-3.5 py-2 text-left text-[12.5px] font-semibold transition-colors ${
                      workOutput.mode === option.value
                        ? 'border-border-focus bg-bg-3 text-fg shadow-sm'
                        : 'border-border/80 bg-bg-2 text-fg-dim hover:bg-bg-3 hover:text-fg'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {workOutput.mode === 'raw' && (
              <div
                onMouseEnter={() => setHoveredSection('rawTemplate')}
                onMouseLeave={() => setHoveredSection(null)}
                className={`rounded-xl border bg-bg-1 p-3.5 transition-all duration-200 ${
                  hoveredSection === 'rawTemplate'
                    ? 'border-cyan-500/80 ring-2 ring-cyan-500/20 shadow-md'
                    : 'border-border/80'
                }`}
              >
                <h4 className="mb-1 text-[13px] font-bold text-fg">Raw template string</h4>
                <textarea
                  value={workOutput.rawTemplate}
                  onChange={e => patch({ rawTemplate: e.target.value })}
                  className="min-h-[120px] w-full resize-y rounded-lg border border-border/80 bg-bg-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-fg outline-none focus:border-border-focus"
                />
                <span className="mt-1 block text-[11px] text-fg-muted">Variables: <code>{'{{baseRules}}'}</code>, <code>{'{{projectInstructions}}'}</code>, <code>{'{{boardDigest}}'}</code></span>
              </div>
            )}

            {agentSettings.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-faint">Follow-Up & CLI Suggestions</div>
                <div className="rounded-lg border border-border/80 bg-bg-2 overflow-hidden">
                  {agentSettings.map((setting, index) => (
                    <SettingRow
                      key={setting.key}
                      setting={setting}
                      value={getConfigValue(setting.key)}
                      showSection={false}
                      isLast={index === agentSettings.length - 1}
                      onChange={(newValue) => handleChange(setting, newValue)}
                      nested={Boolean(setting.parentKey)}
                      notificationPermission={notificationPermission}
                      onRequestNotificationPermission={onRequestNotificationPermission}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>

      </div>

      {/* Right Column: Live Output Terminal-style Preview Panel */}
      <div className="lg:col-span-5 lg:sticky lg:top-4 lg:h-[calc(100vh-140px)] flex flex-col">
        <div className="flex flex-col flex-1 overflow-hidden rounded-xl border border-border/80 bg-bg-1/90 shadow-xl backdrop-blur">
          {/* Terminal Panel Header */}
          <div className="flex flex-none flex-col border-b border-border/80 bg-bg-2/90 px-4 py-3 gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-[12.5px] font-bold text-fg flex items-center gap-1.5">
                  <IconRobot size={16} className="text-primary" /> kandown work
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-bg-3/90 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-dim border border-border/50">
                  ~{estimatedTokens} tokens
                </span>
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-bg-1 px-2.5 py-1 text-[12px] font-bold text-fg transition-all hover:bg-bg-3 active:scale-95 shadow-sm"
                  title="Copy markdown prompt context"
                >
                  {copied ? <IconCheck size={14} className="text-success" /> : <IconCopy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            {/* Visual Layer Badges Legend */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-medium pt-1.5 border-t border-border/40">
              <span className="text-fg-faint font-semibold">Layers:</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300 border border-emerald-500/30 font-semibold">🟢 Step 1: Base Rules</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300 border border-amber-500/30 font-semibold">🟡 Step 2: Project Notes</span>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-300 border border-sky-500/30 font-semibold">🔵 Step 3: Live Board</span>
            </div>
          </div>

          {/* Panel Output Display with Block Highlights */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-bg-2/90 p-3.5 space-y-3 font-mono text-[11.5px] leading-relaxed text-fg selection:bg-primary/20 selection:text-fg">
            {previewBlocks.length === 0 ? (
              <div className="p-6 text-center text-[12.5px] text-fg-faint italic">
                (No section included in output)
              </div>
            ) : (
              previewBlocks.map((block, idx) => {
                const isHovered =
                  hoveredSection === block.id ||
                  (hoveredSection && block.id === 'boardDigest' && ['columnCounts', 'taskList', 'nextActionable'].includes(hoveredSection));
                const activeHoverKey = isHovered ? (hoveredSection ?? block.id) : block.id;
                const theme = COLOR_THEMES[activeHoverKey] ?? COLOR_THEMES.baseRules;

                return (
                  <div
                    key={block.id + idx}
                    onMouseEnter={() => setHoveredSection(block.id)}
                    onMouseLeave={() => setHoveredSection(null)}
                    className={`relative rounded-lg border p-3.5 transition-all duration-300 ${
                      isHovered
                        ? `border-l-4 ${theme.border} ${theme.bg} shadow-lg shadow-black/20`
                        : 'border-transparent hover:bg-bg-3/50'
                    }`}
                  >
                    {isHovered && (
                      <div className="mb-2 flex items-center justify-between border-b border-border/40 pb-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold tracking-wide ${theme.badge}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          {block.label}
                        </span>
                        <span className="text-[10px] font-bold text-fg-faint uppercase font-mono tracking-wider">✦ Section highlighted</span>
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed">
                      {block.content}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SearchResultsProps {
  settings: SettingDef[];
  activeSectionId: SettingsSectionId;
  onSelect: (setting: SettingDef) => void;
}

function SearchResults({ settings, activeSectionId, onSelect }: SearchResultsProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-5">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
        {t('settings.matches')}
      </div>
      <div className="flex flex-col gap-1">
        {settings.slice(0, 12).map(setting => {
          const section = SECTIONS(t).find(item => item.id === setting.section);
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
  nested: boolean;
  notificationPermission: BrowserNotificationPermission;
  onRequestNotificationPermission: () => void;
}

function SettingRow({
  setting,
  value,
  showSection,
  isLast,
  onChange,
  nested,
  notificationPermission,
  onRequestNotificationPermission,
}: SettingRowProps) {
  const { t } = useTranslation();
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
      className={`grid gap-3 px-4 py-3 transition-colors hover:bg-bg-2 focus-within:bg-bg-2 md:grid-cols-[minmax(0,1fr)_minmax(128px,190px)] md:items-center ${
      isLast ? '' : 'border-b border-border'
    } ${nested ? 'bg-bg/35 pl-8' : ''}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium text-fg">{setting.label}</span>
          {showSection && (
            <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
              {SECTIONS(t).find(section => section.id === setting.section)?.label ?? setting.section}
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
          <ThemeGalleryPicker value={String(value)} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function ThemeGalleryPicker({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
  const config = useStore(s => s.config);
  const updateConfig = useStore(s => s.updateConfig);
  const resolvedMode = (config.ui.theme === 'auto'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : config.ui.theme) as 'light' | 'dark';

  const [editingTheme, setEditingTheme] = useState<KandownTheme | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const allThemes = getAllThemes();

  const handleOpenCustomizer = (themeToEdit?: KandownTheme) => {
    const baseTheme = themeToEdit ?? THEME_PRESETS[0];
    const initialTheme: KandownTheme = themeToEdit
      ? { ...themeToEdit }
      : {
          id: `custom-${Date.now().toString(36)}`,
          name: 'My Custom Theme',
          author: 'User',
          description: 'Custom theme defined in kandown.json',
          isCustom: true,
          base: baseTheme.id,
          appearance: { ...baseTheme.appearance },
          fonts: { ...baseTheme.fonts },
          light: { ...baseTheme.light },
          dark: { ...baseTheme.dark },
        };
    setEditingTheme(initialTheme);
    setModalOpen(true);
  };

  const handleSaveCustomTheme = (savedTheme: KandownTheme) => {
    updateConfig(cfg => {
      const existing = cfg.ui.customThemes || [];
      const idx = existing.findIndex(t => t.id === savedTheme.id);
      const nextCustoms = idx >= 0
        ? [...existing.slice(0, idx), savedTheme, ...existing.slice(idx + 1)]
        : [...existing, savedTheme];

      registerCustomThemes(nextCustoms);
      applyProjectTheme(cfg.ui.theme, savedTheme.id, cfg.ui.font, cfg.ui.background);

      return {
        ...cfg,
        ui: {
          ...cfg.ui,
          skin: savedTheme.id,
          customThemes: nextCustoms,
        },
      };
    });
  };

  return (
    <div className="w-full space-y-3 pt-2">
      {/* Header bar with New Custom Theme button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
          Theme Presets & Customs ({allThemes.length})
        </span>

        <button
          type="button"
          onClick={() => handleOpenCustomizer()}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
        >
          <IconPlus className="w-3.5 h-3.5" />
          Create Custom Theme
        </button>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {allThemes.map(t => (
          <ThemePreviewCard
            key={t.id}
            theme={t}
            active={t.id === value || (value === 'kandown' && t.id === 'vercel')}
            mode={resolvedMode}
            onSelect={() => onChange(t.id)}
            onEdit={t.isCustom ? () => handleOpenCustomizer(t) : undefined}
            onDuplicate={() => handleOpenCustomizer({ ...t, id: `${t.id}-copy-${Date.now().toString(36)}`, name: `${t.name} Copy`, isCustom: true })}
            onExport={() => handleOpenCustomizer(t)}
          />
        ))}
      </div>

      {/* Editor Modal */}
      {modalOpen && editingTheme && (
        <ThemeCustomizerModal
          isOpen={modalOpen}
          initialTheme={editingTheme}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveCustomTheme}
        />
      )}
    </div>
  );
}



interface AboutVersionCardProps {
  currentVersion: string;
  updateStatus: 'idle' | 'checking' | 'upToDate' | 'available' | 'error';
  latestVersion: string | null;
  onCheckUpdate: () => void;
}

function AboutVersionCard({ currentVersion, updateStatus, latestVersion, onCheckUpdate }: AboutVersionCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-fg-muted">Version</span>
          <span className="rounded-[5px] bg-bg-2 px-2.5 py-1 font-mono text-[13px] font-semibold text-fg">
            v{currentVersion}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-fg-muted">Status</span>
          {updateStatus === 'idle' && (
            <button
              onClick={onCheckUpdate}
              className="rounded-[5px] bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg transition-colors hover:bg-bg-3"
            >
              {t('settings.checkForUpdates')}
            </button>
          )}
          {updateStatus === 'checking' && (
            <span className="text-[12.5px] text-fg-muted">{t('settings.checkingForUpdates')}</span>
          )}
          {updateStatus === 'upToDate' && (
            <span className="rounded-[5px] bg-success/10 px-2.5 py-1 text-[12.5px] font-medium text-success">
              ✓ {t('settings.upToDate')}
            </span>
          )}
          {updateStatus === 'available' && (
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-warning/10 px-2.5 py-1 text-[12.5px] font-medium text-warning">
                v{latestVersion} {t('settings.available')}
              </span>
              <button
                onClick={onCheckUpdate}
                className="rounded-[5px] bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg transition-colors hover:bg-bg-3"
              >
                {t('settings.refresh')}
              </button>
            </div>
          )}
          {updateStatus === 'error' && (
            <button
              onClick={onCheckUpdate}
              className="rounded-[5px] bg-bg-2 px-2.5 py-1 text-[12.5px] text-fg-muted transition-colors hover:bg-bg-3"
            >
              {t('settings.retry')}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[7px] border border-border bg-bg-2 p-3">
        <p className="text-[12.5px] text-fg-muted">
          {t('settings.autoUpdateDescription') ?? 'Kandown auto-updates when you run npx kandown. To force an update, run npm install -g kandown.'}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-fg-faint">
          {t('settings.links') ?? 'Links'}
        </span>
        <a
          href="https://vanessadepraute.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          Author: Vanessa Depraute
        </a>
        <a
          href="https://github.com/vava-nessa"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          GitHub: vava-nessa
        </a>
        <a
          href="https://github.com/vava-nessa/kandown"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          Repository
        </a>
        <a
          href="https://www.npmjs.com/package/kandown"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-fg underline underline-offset-2 hover:text-fg-muted"
        >
          npm
        </a>
      </div>
    </div>
  );
}
