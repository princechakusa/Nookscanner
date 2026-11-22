import { useCallback, useEffect, useState } from 'react';
import { brand } from '@nookscanner/design-tokens';
import { loadExperience, loadMedia, type GuestMedia, type LoadResult } from './api.ts';
import { DEMO_EXPERIENCE } from './demo.ts';
import { Experience } from './Experience.tsx';
import { detectLocale, directionOf, messages, type Locale } from './i18n.ts';
import { parseGuestToken } from './route.ts';
import { hasWebGL2 } from './webgl.ts';

export interface AppProps {
  pathname: string;
  languages: readonly string[];
  /** Injectable for tests (defaults to the guest-experience Edge Function). */
  load?: (token: string) => Promise<LoadResult>;
  /** Injectable for tests (defaults to the guest-instruction Edge Function). */
  media?: (token: string, applianceId: string) => Promise<GuestMedia[]>;
}

/**
 * Guest app routes: `/a/<token>` (QR entry, resolved by the Edge Function in Phase 9),
 * `/demo` (fictional demo apartment for design review and tests), anything else asks the guest
 * to scan the QR code.
 */
export function App({ pathname, languages, load = loadExperience, media = loadMedia }: AppProps) {
  // The guest's language choice is remembered on this phone (convenience only; storage may be
  // unavailable in private browsing, then the browser language is used).
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem('nookscanner.locale');
      if (saved === 'en' || saved === 'ar') return saved;
    } catch {
      /* storage blocked */
    }
    return detectLocale(languages);
  });
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('nookscanner.locale', l);
    } catch {
      /* storage blocked */
    }
  }, []);
  const [webgl] = useState(() => hasWebGL2());
  const token = parseGuestToken(pathname);
  const isDemo = /^\/demo\/?$/.test(pathname);
  const t = messages[locale];
  const [result, setResult] = useState<LoadResult | null>(null);
  const fetchGuide = useCallback(() => {
    if (!token) return;
    setResult(null);
    void load(token).then(setResult);
  }, [token, load]);
  useEffect(fetchGuide, [fetchGuide]);
  const mediaFor = useCallback(
    (applianceId: string) => (token ? media(token, applianceId) : Promise.resolve([])),
    [token, media],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  if (isDemo) {
    // Development/measurement only: attach a locally stored scene to the fictional demo
    // (VITE_DEV_SCENE_URL, never set in production builds; the file is never committed).
    const devScene = import.meta.env.VITE_DEV_SCENE_URL as string | undefined;
    const experience = devScene
      ? {
          ...DEMO_EXPERIENCE,
          scene: {
            url: devScene,
            sizeBytes: 1,
            // One pin 2 m in front of the starting camera, to exercise markers on a real scene.
            hotspots: [
              {
                applianceId: DEMO_EXPERIENCE.appliances[0]!.id,
                position: [0, 0, -2] as [number, number, number],
              },
            ],
          },
        }
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

  if (result?.kind === 'ok' && token) {
    return (
      <Experience
        experience={result.experience}
        locale={locale}
        onLocaleChange={setLocale}
        webgl={webgl}
        loadMedia={mediaFor}
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
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
        >
          {/* WCAG 2.5.3: the accessible name starts with the visible word. */}
          <span lang={locale === 'en' ? 'ar' : 'en'}>{t.languageToggle}</span>
          <span className="g-visually-hidden"> ({t.languageToggleLabel})</span>
        </button>
      </header>
      <main className="nt-guest__stage">
        {token && !result ? (
          <section className="nt-guest__panel" aria-live="polite">
            <div className="nt-guest__spinner" aria-hidden="true" />
            <h1>{t.loadingTitle}</h1>
            <p>{t.loadingBody}</p>
          </section>
        ) : token && result ? (
          <section className="nt-guest__panel" role="alert">
            <h1>
              {result.kind === 'not-found'
                ? t.linkInactiveTitle
                : result.kind === 'rate-limited'
                  ? t.rateLimitedTitle
                  : t.loadErrorTitle}
            </h1>
            <p>
              {result.kind === 'not-found'
                ? t.linkInactiveBody
                : result.kind === 'rate-limited'
                  ? t.rateLimitedBody
                  : t.loadErrorBody}
            </p>
            {result.kind !== 'not-found' && (
              <button type="button" className="nt-guest__retry" onClick={fetchGuide}>
                {t.retry}
              </button>
            )}
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
