import { useEffect, useState } from 'react';
import { brand } from '@nookscanner/design-tokens';
import { detectLocale, directionOf, messages, type Locale } from './i18n.ts';
import { parseGuestToken } from './route.ts';

export interface AppProps {
  pathname: string;
  languages: readonly string[];
}

/**
 * Guest shell (foundation). The 3D experience, search and instructions are built in Phases 7-9;
 * this shell already provides routing, EN/AR with RTL, and the loading/empty states.
 */
export function App({ pathname, languages }: AppProps) {
  const [locale, setLocale] = useState<Locale>(() => detectLocale(languages));
  const token = parseGuestToken(pathname);
  const t = messages[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  return (
    <div className="nt-guest">
      <header className="nt-guest__bar">
        <span className="nt-guest__brand">{brand.name.toLowerCase()}</span>
        <button
          type="button"
          className="nt-guest__lang"
          aria-label={t.languageToggleLabel}
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
        >
          {t.languageToggle}
        </button>
      </header>
      <main className="nt-guest__stage">
        {token ? (
          <section className="nt-guest__panel" aria-live="polite">
            <div className="nt-guest__spinner" aria-hidden="true" />
            <h1>{t.loadingTitle}</h1>
            <p>{t.notConnected}</p>
          </section>
        ) : (
          <section className="nt-guest__panel">
            <h1>{t.scanPromptTitle}</h1>
            <p>{t.scanPromptBody}</p>
          </section>
        )}
      </main>
    </div>
  );
}
