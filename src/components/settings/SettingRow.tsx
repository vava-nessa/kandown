/**
 * @file Settings — single setting row + theme gallery
 * @description Renders one SettingDef as either a dense toggle row, a
 * full-width theme gallery (for the 'skin' type), or one of the
 * secondary controls — select dropdown, number stepper, text input,
 * language picker, theme mode switcher, or notification permission
 * button. ThemeGalleryPicker owns the custom-theme create/edit/duplicate
 * flow through ThemeCustomizerModal.
 *
 * 📖 Every SettingType defined in schema.ts must have a control here.
 * Anything not wired renders an empty right-hand column (bug source:
 * the v0.30.0 Fable UI Themes release replaced SkinPicker with
 * ThemeGalleryPicker and accidentally dropped the other branches).
 *
 * @exports SettingRow, ThemeGalleryPicker
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlus } from '@tabler/icons-react';
import { useStore } from '../../lib/store';
import { getAllThemes, registerCustomThemes, applyProjectTheme, THEME_PRESETS } from '../../lib/theme';
import { ThemePreviewCard } from '../ThemePreviewCard';
import { ThemeCustomizerModal } from '../ThemeCustomizerModal';
import { ThemeSwitcher } from '../ui/theme-switcher-1';
import { LanguageDropdown } from './LanguageDropdown';
import type { KandownTheme, ThemeMode } from '../../lib/types';
import type { BrowserNotificationPermission } from '../../lib/notifications';
import { SECTIONS, type SettingDef } from './schema';

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

export function SettingRow({
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

  if (setting.type === 'skin') {
    return (
      <div className={`flex flex-col gap-4 p-5 transition-colors ${isLast ? '' : 'border-b border-border'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-fg">{setting.label}</span>
              {showSection && (
                <span className="rounded-full bg-bg-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
                  {SECTIONS(t).find(section => section.id === setting.section)?.label ?? setting.section}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{setting.description}</p>
            <p className="mt-1 font-mono text-[11px] text-fg-faint">{setting.key}</p>
          </div>
        </div>

        <div className="w-full pt-1">
          <ThemeGalleryPicker value={String(value)} onChange={onChange} />
        </div>
      </div>
    );
  }

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

        {setting.type === 'theme' && (
          <ThemeSwitcher value={String(value) as ThemeMode} onChange={onChange as (value: ThemeMode) => void} />
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

        {setting.type === 'language' && (
          <LanguageDropdown value={String(value)} onChange={v => onChange(v)} />
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

        {setting.type === 'permission' && (
          <button
            type="button"
            onClick={onRequestNotificationPermission}
            disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
            className="h-8 rounded-[7px] border border-border bg-bg-2 px-2.5 text-[13px] text-fg transition-colors hover:bg-bg-3 disabled:cursor-default disabled:text-fg-muted disabled:hover:bg-bg-2"
          >
            {notificationPermission === 'granted' && t('settings.permissionGranted')}
            {notificationPermission === 'denied' && t('settings.permissionDenied')}
            {notificationPermission === 'default' && t('settings.permissionAsk')}
            {notificationPermission === 'unsupported' && t('settings.permissionUnsupported')}
          </button>
        )}
      </div>
    </div>
  );
}

export function ThemeGalleryPicker({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
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
    <div className="w-full space-y-4 pt-1">
      {/* Header bar with New Custom Theme button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
          Theme Presets & Custom Skins ({allThemes.length})
        </span>

        <button
          type="button"
          onClick={() => handleOpenCustomizer()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors shadow-xs"
        >
          <IconPlus className="w-4 h-4" />
          Create Custom Theme
        </button>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
