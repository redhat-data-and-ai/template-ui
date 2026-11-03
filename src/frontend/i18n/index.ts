import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import mi from './locales/mi.json';
import sw from './locales/sw.json';

/**
 * Translation setup.
 *
 * English is the source language *and* the fallback, so a key missing
 * from a locale renders the English string rather than the key. A UI
 * that shows `sidebar.newChat` to a user is worse than one that shows
 * the wrong language — the second is readable.
 *
 * Locales are bundled rather than fetched. Six small JSON files cost
 * less than the request waterfall and the loading state a backend
 * would need, and this runs behind a login on a corporate network
 * where a round trip is not free.
 *
 * Adding a language is one file in `locales/` plus one line here and
 * in `LANGUAGES`. Deliberately nothing else — a template whose
 * translation story requires touching five places does not get
 * translated.
 */

/**
 * One language per inhabited continent.
 *
 * The continent is the *selection rule*, not a claim about where a
 * language is spoken: French is picked for Europe and is spoken
 * across West Africa, Spanish is picked for South America and is from
 * Spain. The rule exists so the default set is not six European
 * languages chosen by whoever happened to be in the room.
 *
 * Antarctica has no indigenous language and no permanent population,
 * so there is nothing to pick. Saying so is more honest than quietly
 * shipping five and calling it six.
 *
 * `reviewed` records whether a native speaker has read the file.
 * These translations were authored by a model, which is a reasonable
 * starting point and not the same as correct — see docs/i18n.md.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', continent: 'North America', reviewed: true },
  { code: 'es', label: 'Español', continent: 'South America', reviewed: false },
  { code: 'fr', label: 'Français', continent: 'Europe', reviewed: false },
  { code: 'sw', label: 'Kiswahili', continent: 'Africa', reviewed: false },
  { code: 'ja', label: '日本語', continent: 'Asia', reviewed: false },
  { code: 'mi', label: 'Te Reo Māori', continent: 'Oceania', reviewed: false },
] as const;

export const STORAGE_KEY = 'template-ui.language';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      sw: { translation: sw },
      ja: { translation: ja },
      mi: { translation: mi },
    },
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((language) => language.code),
    // `en-GB` and `en-US` both resolve to `en`; without this they miss
    // every key and fall back, which works but defeats detection.
    nonExplicitSupportedLngs: true,
    detection: {
      // An explicit choice outranks the browser's guess, and survives
      // a reload. The browser is only consulted the first time.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      // React escapes already; doing it twice turns an apostrophe in
      // a conversation title into `&#39;`.
      escapeValue: false,
    },
  });

export default i18n;
