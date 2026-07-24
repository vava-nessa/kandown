/**
 * @file Settings — language picker dropdown
 * @description Searchable flag+name dropdown over ORDERED_LANGUAGES, with
 * arrow-key navigation and Enter-to-select. Extracted from SettingsPage.tsx
 * as-is; not currently wired into any SettingRow render path (the language
 * setting type has no consumer yet), kept for parity with the pre-split file.
 *
 * @exports LanguageDropdown
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconSearch } from '@tabler/icons-react';
import { LANGUAGE_LABELS } from '../../lib/i18n';
import { LANGUAGE_FLAG_EMOJI, ORDERED_LANGUAGES } from './schema';

export function LanguageDropdown({
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
