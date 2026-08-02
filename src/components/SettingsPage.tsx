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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  IconAdjustmentsHorizontal,
  IconChevronRight,
  IconSearch,
  IconSettings,
} from '@tabler/icons-react';
import { KANDOWN_VERSION } from '../lib/version';
import { KbdButton } from './KbdButton';
import { ThemeSwitcher } from './ui/theme-switcher-1';
import { useStore } from '../lib/store';
import { fileWatcher } from '../lib/watcher';
import { getBrowserNotificationPermission, requestBrowserNotificationPermission, type BrowserNotificationPermission } from '../lib/notifications';
import type { KandownConfig, ThemeMode } from '../lib/types';
import {
  SECTIONS,
  getConfigValue,
  getSETTINGS,
  getSettingSearchText,
  isSettingVisible,
  setConfigValue,
  type SettingDef,
  type SettingsSectionId,
} from './settings/schema';
import { SearchResults } from './settings/SearchResults';
import { SettingRow } from './settings/SettingRow';
import { WorkOutputConfigurator } from './settings/WorkOutputConfigurator';
import { AboutVersionCard } from './settings/AboutVersionCard';
import { ExtensionsPanel } from './settings/ExtensionsPanel';
import { ThemesPanel } from './settings/ThemesPanel';

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

  // 📖 The skin picker's "Get more themes" button fires this event so we can
  // jump straight to the Themes section without scrolling.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === 'themes') setActiveSectionId('themes');
    };
    window.addEventListener('kandown:open-section', handler);
    return () => window.removeEventListener('kandown:open-section', handler);
  }, []);

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
    }, { appearance: 0, agent: 0, board: 0, fields: 0, notifications: 0, extensions: 0, themes: 0, about: 0 });
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

  // 📖 Button-type settings have no value to read or write — they trigger an
  // action. Today the only one is the "Re-open onboarding tour" button under
  // Appearance; it dispatches the same window event `OnboardingTour` listens
  // for, so the modal can be re-opened from Settings without coupling the
  // page to the modal's component state.
  const handleSettingAction = (actionKey: string) => {
    if (actionKey === 'showOnboarding') {
      window.dispatchEvent(new CustomEvent('kandown:showOnboarding'));
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

            <div className={!normalizedQuery && (activeSectionId === 'agent' || activeSectionId === 'appearance') ? 'max-w-[1360px]' : 'max-w-4xl'}>
              {activeSectionId === 'about' ? (
                <div className="overflow-hidden rounded-[8px] border border-border bg-bg-1">
                  <AboutVersionCard
                    currentVersion={KANDOWN_VERSION}
                    updateStatus={updateStatus}
                    latestVersion={latestVersion}
                    onCheckUpdate={checkForUpdate}
                  />
                </div>
              ) : activeSectionId === 'extensions' ? (
                <ExtensionsPanel />
              ) : activeSectionId === 'themes' ? (
                <ThemesPanel />
              ) : !normalizedQuery && activeSectionId === 'agent' ? (
                <WorkOutputConfigurator
                  config={config}
                  columns={columns}
                  dirHandle={dirHandle}
                  onChange={(next) => {
                    void updateConfig(currentConfig => setConfigValue(currentConfig, 'agent.workOutput', next));
                  }}
                  onWorkflowChange={(next) => {
                    void updateConfig(currentConfig => setConfigValue(currentConfig, 'workflow', next));
                  }}
                  onColumnMetaChange={(next) => {
                    void updateConfig(currentConfig => setConfigValue(currentConfig, 'board.columnMeta', next));
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
                      onAction={handleSettingAction}
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
