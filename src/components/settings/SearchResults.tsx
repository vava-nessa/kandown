/**
 * @file Settings — global search results list
 * @description Shown in the sidebar below the section nav once the user
 * types a query; lists matching settings across all sections regardless of
 * which section is currently active.
 *
 * @exports SearchResults
 */

import { useTranslation } from 'react-i18next';
import { SECTIONS, type SettingDef, type SettingsSectionId } from './schema';

interface SearchResultsProps {
  settings: SettingDef[];
  activeSectionId: SettingsSectionId;
  onSelect: (setting: SettingDef) => void;
}

export function SearchResults({ settings, activeSectionId, onSelect }: SearchResultsProps) {
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
