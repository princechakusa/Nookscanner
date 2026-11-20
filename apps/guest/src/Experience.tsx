/**
 * Guest experience shell (DESIGN_SYSTEM 9.1, 9.2, 9.4; mockups docs/design/01, 02, 04).
 * The 3D apartment (Scene3D, lazy chunk) fills the stage when a scene is published and the
 * device supports WebGL2; around it: top bar, room chips, search, instruction sheet and the
 * accessible appliance list, which doubles as the screen-reader view and the fallback
 * (DESIGN_SYSTEM 8).
 */
import {
  pick,
  searchAppliances,
  type GuestAppliance,
  type GuestExperience,
} from '@nookscanner/shared';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BrandMark, Icon, categoryIcon, roomIcon } from './icons.tsx';
import { Scene3D } from './Scene3D.tsx';
import { format, localDigits, messages, type Locale } from './i18n.ts';

export interface ExperienceProps {
  experience: GuestExperience;
  locale: Locale;
  onLocaleChange: (l: Locale) => void;
  webgl: boolean;
  demo?: boolean;
}

export function Experience({ experience, locale, onLocaleChange, webgl, demo }: ExperienceProps) {
  const t = messages[locale];
  const [roomId, setRoomId] = useState<string | null>(experience.rooms[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const searchId = useId();

  const hits = useMemo(
    () => searchAppliances(experience, query, locale),
    [experience, query, locale],
  );
  const open = experience.appliances.find((a) => a.id === openId) ?? null;
  const roomName = (id: string) => {
    const r = experience.rooms.find((x) => x.id === id);
    return r ? pick(r.name, locale) : '';
  };

  const viewerMessage = !webgl ? t.viewerUnsupported : experience.scene ? null : t.viewerPending;

  return (
    <div className="g-exp">
      <header className="g-top g-glass">
        <span className="g-top__brand">
          <BrandMark />
          <span className="g-top__brandname">Nookscanner</span>
        </span>
        <h1 className="g-top__title">
          <span className="g-top__name">{pick(experience.apartment.name, locale)}</span>
          {demo && <span className="g-badge">{t.demoBadge}</span>}
        </h1>
        <div className="g-lang" role="group" aria-label={t.languageGroupLabel}>
          {(['en', 'ar'] as const).map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              className="g-lang__btn"
              aria-pressed={locale === l}
              onClick={() => onLocaleChange(l)}
            >
              {l === 'en' ? 'EN' : 'عربي'}
            </button>
          ))}
        </div>
      </header>

      <section className="g-stage" aria-label="3D">
        {webgl && experience.scene && (
          <Scene3D
            url={experience.scene.url}
            labels={{ loading: t.sceneLoading, failed: t.sceneFailed }}
          />
        )}
        {viewerMessage && (
          <p className="g-stage__note g-glass" role="status">
            {viewerMessage}
          </p>
        )}
      </section>

      <div className="g-dock">
        <nav aria-label={t.roomsLabel} className="g-chips">
          {experience.rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              className="g-chip"
              aria-pressed={roomId === r.id}
              onClick={() => setRoomId(r.id)}
            >
              <Icon name={roomIcon(r.type)} />
              {pick(r.name, locale)}
            </button>
          ))}
        </nav>

        <div className="g-search g-glass" role="search">
          <Icon name="search" />
          <label htmlFor={searchId} className="g-visually-hidden">
            {t.searchLabel}
          </label>
          <input
            id={searchId}
            type="search"
            inputMode="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t.searchPlaceholder}
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            aria-controls={query.trim() ? `${searchId}-results` : undefined}
          />
        </div>
      </div>

      {query.trim() && (
        <section
          id={`${searchId}-results`}
          className="g-results"
          aria-live="polite"
          aria-label={t.searchLabel}
        >
          {hits.length > 0 ? (
            <ul className="g-list">
              {hits.map((h) => (
                <li key={h.appliance.id}>
                  <ApplianceRow
                    appliance={h.appliance}
                    room={roomName(h.appliance.roomId)}
                    locale={locale}
                    note={h.matchedAlias ? format(t.matches, { alias: h.matchedAlias }) : undefined}
                    onOpen={() => {
                      setRoomId(h.appliance.roomId);
                      setOpenId(h.appliance.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="g-results__empty">{format(t.noResults, { q: query.trim() })}</p>
          )}
        </section>
      )}

      <section className="g-browse" aria-labelledby={`${searchId}-browse`}>
        <h2 id={`${searchId}-browse`} className="g-browse__title">
          {roomId ? format(t.appliancesIn, { room: roomName(roomId) }) : t.allRooms}
        </h2>
        {(webgl ? experience.rooms.filter((r) => r.id === roomId) : experience.rooms).map((r) => {
          const items = experience.appliances.filter((a) => a.roomId === r.id);
          if (items.length === 0) return null;
          return (
            <div key={r.id} className="g-room">
              {!webgl && <h3 className="g-room__title">{pick(r.name, locale)}</h3>}
              <ul className="g-list">
                {items.map((a) => (
                  <li key={a.id}>
                    <ApplianceRow
                      appliance={a}
                      room={pick(r.name, locale)}
                      locale={locale}
                      onOpen={() => setOpenId(a.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <InstructionSheet
        appliance={open}
        roomName={open ? roomName(open.roomId) : ''}
        experience={experience}
        locale={locale}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function ApplianceRow({
  appliance,
  room,
  locale,
  note,
  onOpen,
}: {
  appliance: GuestAppliance;
  room: string;
  locale: Locale;
  note?: string | undefined;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="g-row" onClick={onOpen}>
      <span className="g-hotspot" aria-hidden="true">
        <Icon name={categoryIcon(appliance.category)} />
      </span>
      <span className="g-row__text">
        <span className="g-row__name">{pick(appliance.name, locale)}</span>
        <span className="g-row__meta">
          {room}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
      <span className="g-row__chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function InstructionSheet({
  appliance,
  roomName,
  experience,
  locale,
  onClose,
}: {
  appliance: GuestAppliance | null;
  roomName: string;
  experience: GuestExperience;
  locale: Locale;
  onClose: () => void;
}) {
  const t = messages[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (appliance && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!appliance && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [appliance]);

  const s = experience.support;
  const supportHref = s.whatsapp
    ? `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`
    : s.phone
      ? `tel:${s.phone.replace(/[^\d+]/g, '')}`
      : s.email
        ? `mailto:${s.email}`
        : null;

  return (
    <dialog
      ref={ref}
      className="g-sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Tap on the backdrop closes the sheet.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {appliance && (
        <div className="g-sheet__inner">
          <span className="g-sheet__handle" aria-hidden="true" />
          <div className="g-sheet__head">
            <div>
              <h2 id={titleId} className="g-sheet__title">
                {pick(appliance.name, locale)}
              </h2>
              <p className="g-sheet__meta">
                {[
                  appliance.brand && appliance.model
                    ? `${appliance.brand} ${appliance.model}`
                    : appliance.brand,
                  roomName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                {appliance.verified && (
                  <span className="g-verified">
                    <Icon name="check" />
                    {t.verified}
                  </span>
                )}
              </p>
            </div>
            <button type="button" className="g-iconbtn" aria-label={t.close} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          {appliance.video && (
            <a className="g-video" href={appliance.video.url} target="_blank" rel="noreferrer">
              <span className="g-video__play" aria-hidden="true">
                <Icon name="play" />
              </span>
              {format(t.watchVideo, { s: appliance.video.durationSec })}
            </a>
          )}

          {appliance.steps.length > 0 && (
            <>
              <h3 className="g-visually-hidden">{t.stepsTitle}</h3>
              <ol className="g-steps">
                {appliance.steps.map((step, i) => (
                  <li key={i} className="g-step">
                    <span className="g-step__n" aria-hidden="true">
                      {localDigits(i + 1, locale)}
                    </span>
                    <span>{pick(step.text, locale)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {appliance.troubleshooting.map((tr, i) => (
            <details key={i} className="g-trouble">
              <summary>
                <Icon name="help" />
                {pick(tr.problem, locale)}
              </summary>
              <p>{pick(tr.solution, locale)}</p>
            </details>
          ))}

          {supportHref && (
            <a
              className="g-support"
              href={supportHref}
              target={supportHref.startsWith('https:') ? '_blank' : undefined}
              rel="noreferrer"
            >
              <Icon name="support" />
              {t.contactSupport}
            </a>
          )}
        </div>
      )}
    </dialog>
  );
}
