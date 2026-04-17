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
import es from './locales/es.json';
import pt from './locales/pt.json';
import hi from './locales/hi.json';
import de from './locales/de.json';
import it from './locales/it.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'zh', 'es', 'pt', 'hi', 'de', 'it'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'Français',
  zh: '中文',
  es: 'Español',
  pt: 'Português',
  hi: 'हिन्दी',
  de: 'Deutsch',
  it: 'Italiano',
};

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  zh: { translation: zh },
  es: { translation: es },
  pt: { translation: pt },
  hi: { translation: hi },
  de: { translation: de },
  it: { translation: it },
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
