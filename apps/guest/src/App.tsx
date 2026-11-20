import { useEffect, useState } from 'react';
import { brand } from '@nookscanner/design-tokens';
import { DEMO_EXPERIENCE } from './demo.ts';
import { Experience } from './Experience.tsx';
import { detectLocale, directionOf, messages, type Locale } from './i18n.ts';
import { parseGuestToken } from './route.ts';
import { hasWebGL2 } from './webgl.ts';

export interface AppProps {
  pathname: string;
  languages: readonly string[];
}

/**
 * Guest app routes: `/a/<token>` (QR entry, resolved by the Edge Function in Phase 9),
 * `/demo` (fictional demo apartment for design review and tests), anything else asks the guest
 * to scan the QR code.
 */
export function App({ pathname, languages }: AppProps) {
  const [locale, setLocale] = useState<Locale>(() => detectLocale(languages));
  const [webgl] = useState(() => hasWebGL2());
  const token = parseGuestToken(pathname);
  const isDemo = /^\/demo\/?$/.test(pathname);
  const t = messages[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  if (isDemo) {
    // Development/measurement only: attach a locally stored scene to the fictional demo
    // (VITE_DEV_SCENE_URL, never set in production builds; the file is never committed).
    const devScene = import.meta.env.VITE_DEV_SCENE_URL as string | undefined;
    const experience = devScene
      ? { ...DEMO_EXPERIENCE, scene: { url: devScene, sizeBytes: 1 } }
      : DEMO_EXPERIENCE;
    return (
      <Experience
        experience={experience}
        locale={locale}
        onLocaleChange={setLocale}
        webgl={webgl}
        demo
      />
    );
  }

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
