/**
 * @file Settings page — schema & config helpers
 * @description Declarative metadata describing every setting (section,
 * type, description, keywords) plus pure functions for reading/writing
 * dotted config paths and building the sidebar search index. Kept separate
 * from rendering so SettingsPage, SearchResults, and SettingRow can all
 * consume the same source of truth.
 *
 * @functions
 *  → SECTIONS, getSETTINGS — translated section/setting metadata
 *  → getConfigValue, setConfigValue — dotted-path config read/write
 *  → stringifySettingValue, getSettingSearchText — sidebar search index text
 *  → isSettingVisible — parentKey-gated visibility (e.g. nested priority default)
 *
 * @exports SettingType, SettingsSectionId, SettingOption, SettingsSection,
 *   SettingDef, LANGUAGE_FLAG_EMOJI, LANGUAGE_ORDER, ORDERED_LANGUAGES,
 *   SECTIONS, getSETTINGS, getConfigValue, setConfigValue,
 *   stringifySettingValue, getSettingSearchText, isSettingVisible
 */

import {
  IconBell,
  IconInfoCircle,
  IconLayoutBoard,
  IconPalette,
  IconPuzzle,
  IconRobot,
  IconTags,
  type TablerIcon,
} from '@tabler/icons-react';
import type { useTranslation } from 'react-i18next';
import { BACKGROUND_OPTIONS, FONT_OPTIONS, SKIN_OPTIONS } from '../../lib/theme';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '../../lib/i18n';
import type { KandownConfig } from '../../lib/types';

export type SettingType = 'toggle' | 'select' | 'number' | 'text' | 'skin' | 'theme' | 'language' | 'permission' | 'button';
export type SettingsSectionId = 'appearance' | 'agent' | 'board' | 'fields' | 'notifications' | 'extensions' | 'themes' | 'about';

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  kicker: string;
  description: string;
  icon: TablerIcon;
}

export interface SettingDef {
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
  /** 📖 For type `'button'`: the visible label of the trigger button. */
  buttonLabel?: string;
  /** 📖 For type `'button'`: a stable string the parent (SettingsPage) maps
   * to an action. Keeping it as a plain string keeps the schema declarative —
   * the renderer stays generic and the page decides which action fires. */
  actionKey?: string;
}

export const LANGUAGE_FLAG_EMOJI: Record<string, string> = {
  en: '🇺🇸', zh: '🇨🇳', hi: '🇮🇳', es: '🇪🇸', fr: '🇫🇷', ar: '🇸🇦',
  bn: '🇧🇩', ru: '🇷🇺', pt: '🇧🇷', id: '🇮🇩', ur: '🇵🇰', tr: '🇹🇷',
  de: '🇩🇪', ja: '🇯🇵', pcm: '🇳🇬', vi: '🇻🇳', ko: '🇰🇷', it: '🇮🇹',
  pl: '🇵🇱', uk: '🇺🇦', fa: '🇮🇷', nl: '🇳🇱', el: '🇬🇷', ro: '🇷🇴',
  sv: '🇸🇪', cs: '🇨🇿', hu: '🇭🇺', fi: '🇫🇮', da: '🇩🇰', no: '🇳🇴',
  sk: '🇸🇰', bg: '🇧🇬', sr: '🇷🇸', hr: '🇭🇷', lt: '🇱🇹', lv: '🇱🇻',
  et: '🇪🇪', sl: '🇸🇮',
};

// Original 8 (en, fr, zh, es, pt, hi, de, it) first, then rest sorted by population
export const LANGUAGE_ORDER = [
  'en', 'fr', 'zh', 'es', 'pt', 'hi', 'de', 'it',
  'ar', 'bn', 'ru', 'id', 'ur', 'tr', 'ja', 'vi', 'ko', 'fa',
  'pl', 'uk', 'nl', 'el', 'ro', 'cs', 'sv', 'hu', 'fi', 'da', 'no', 'sk', 'bg', 'sr', 'hr', 'lt', 'lv', 'et', 'sl',
];

export const ORDERED_LANGUAGES = LANGUAGE_ORDER
  .filter(code => SUPPORTED_LANGUAGES.includes(code as typeof SUPPORTED_LANGUAGES[number]))
  .map(code => ({
    code,
    flag: LANGUAGE_FLAG_EMOJI[code] ?? '🌐',
    nameEn: LANGUAGE_LABELS[code as typeof SUPPORTED_LANGUAGES[number]] ?? code,
  }));

export const SECTIONS = (t: ReturnType<typeof useTranslation>['t']): SettingsSection[] => [
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
  {
    id: 'extensions',
    label: t('settings.extensions', { defaultValue: 'Extensions' }),
    kicker: t('settings.kickerExtensions', { defaultValue: 'Plugins & integrations' }),
    description: t('settings.extensionsDesc', { defaultValue: 'Manage installed extensions: enable, disable and restricted mode.' }),
    icon: IconPuzzle,
  },
];

export const getSETTINGS = (t: ReturnType<typeof useTranslation>['t']): SettingDef[] => [
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
    key: 'ui.categoryChips',
    label: t('settings.categoryChips'),
    section: 'appearance',
    type: 'toggle',
    description: t('settings.categoryChipsDesc'),
    keywords: ['category', 'color', 'chip', 'hash', 'icon'],
  },
  {
    // 📖 Action row: re-opens the onboarding modal. The `key` is a synthetic
    // search-only identifier (the search index reads it via `getSettingSearchText`
    // but the value column is never read from config — it has no setting
    // bound to it). SettingsPage maps `actionKey: 'showOnboarding'` to a
    // `kandown:showOnboarding` window event that `OnboardingTour` listens for.
    key: 'ui.onboardingCompleted',
    label: t('settings.onboardingTour'),
    section: 'appearance',
    type: 'button',
    description: t('settings.onboardingTourDesc'),
    buttonLabel: t('settings.showOnboardingTour'),
    actionKey: 'showOnboarding',
    keywords: ['tour', 'guide', 'intro', 'welcome', 'help', 'first time'],
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

export function getConfigValue(config: KandownConfig, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setConfigValue(config: KandownConfig, path: string, value: unknown): KandownConfig {
  const result = structuredClone(config);
  const parts = path.split('.');
  let current = result as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

export function stringifySettingValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (value === null || value === undefined) return '';
  return String(value);
}

export function getSettingSearchText(setting: SettingDef, value: unknown): string {
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

export function isSettingVisible(setting: SettingDef, config: KandownConfig): boolean {
  if (!setting.parentKey) return true;
  return Boolean(getConfigValue(config, setting.parentKey));
}
