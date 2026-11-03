import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';

/**
 * Pick a language.
 *
 * The choice is stored in localStorage by the detector, so it is
 * per-browser rather than per-account. That is the honest scope: the
 * agent has no user-preferences store the UI can reach, and pretending
 * otherwise would mean a setting that silently fails to follow someone
 * to their second machine.
 */
export function LanguageSelect() {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="language-select" className="text-sm font-medium">
        {t('settings.language')}
      </label>
      <select
        id="language-select"
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="w-48 rounded-lg border border-border bg-secondary/20 px-2 py-1.5 text-sm"
      >
        {LANGUAGES.map((language) => (
          // Each label is in its own language, not translated — a
          // reader looking for Japanese is looking for 日本語, not for
          // whatever the current locale calls it.
          <option key={language.code} value={language.code}>
            {language.label}
            {language.reviewed ? '' : ' *'}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{t('settings.languageHint')}</p>
      {/* Marked rather than hidden. These translations were authored
          by a model: good enough to ship, not the same as checked by
          someone who speaks the language, and a reader is entitled to
          know which they are looking at. */}
      <p className="text-xs text-muted-foreground">{t('settings.languageUnreviewed')}</p>
    </div>
  );
}
