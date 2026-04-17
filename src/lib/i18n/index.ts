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
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import uk from './locales/uk.json';
import ro from './locales/ro.json';
import sv from './locales/sv.json';
import cs from './locales/cs.json';
import el from './locales/el.json';
import hu from './locales/hu.json';
import fi from './locales/fi.json';
import da from './locales/da.json';
import no from './locales/no.json';
import sk from './locales/sk.json';
import bg from './locales/bg.json';
import sr from './locales/sr.json';
import hr from './locales/hr.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import sl from './locales/sl.json';
import et from './locales/et.json';

export const SUPPORTED_LANGUAGES = [
  'en', 'fr', 'zh', 'es', 'pt', 'hi', 'de', 'it',
  'nl', 'pl', 'uk', 'ro', 'sv', 'cs', 'el', 'hu',
  'fi', 'da', 'no', 'sk', 'bg', 'sr', 'hr', 'lt', 'lv', 'sl', 'et',
] as const;
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
  nl: 'Nederlands',
  pl: 'Polski',
  uk: 'Українська',
  ro: 'Română',
  sv: 'Svenska',
  cs: 'Čeština',
  el: 'Ελληνικά',
  hu: 'Magyar',
  fi: 'Suomi',
  da: 'Dansk',
  no: 'Norsk',
  sk: 'Slovenčina',
  bg: 'Български',
  sr: 'Српски',
  hr: 'Hrvatski',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  sl: 'Slovenščina',
  et: 'Eesti',
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
  nl: { translation: nl },
  pl: { translation: pl },
  uk: { translation: uk },
  ro: { translation: ro },
  sv: { translation: sv },
  cs: { translation: cs },
  el: { translation: el },
  hu: { translation: hu },
  fi: { translation: fi },
  da: { translation: da },
  no: { translation: no },
  sk: { translation: sk },
  bg: { translation: bg },
  sr: { translation: sr },
  hr: { translation: hr },
  lt: { translation: lt },
  lv: { translation: lv },
  sl: { translation: sl },
  et: { translation: et },
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
