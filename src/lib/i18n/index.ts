/**
 * @file i18n configuration
 * @description Initializes react-i18next with language detection and
 * namespace-based translation loading for the Kandown UI.
 *
 * 📖 Translations are organized by namespace: "translation" contains all UI strings.
 * Language preference is read from the project config (ui.language) when available.
 *
 * @functions
 *  → i18n — configured i18next instance
 *  → initI18n — initializes i18next based on config language
 *  → changeLanguage — updates active language and persists to config
 *
 * @exports i18n, initI18n, changeLanguage
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';
import zh from './locales/zh.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'Français',
  zh: '中文',
};

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  zh: { translation: zh },
};

export function initI18n(language: SupportedLanguage = 'en') {
  return i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

export async function changeLanguage(
  lang: SupportedLanguage,
  onConfigUpdate?: (lang: SupportedLanguage) => void
) {
  await i18n.changeLanguage(lang);
  onConfigUpdate?.(lang);
}

export default i18n;
