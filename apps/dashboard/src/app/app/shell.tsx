'use client';

import { brand } from '@nookscanner/design-tokens';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { OrgSummary } from '../../lib/active-org.ts';
import { NAV_ITEMS, breadcrumbsFor, isActive, type NavItem } from '../../lib/nav.ts';
import { signOutAction } from '../(auth)/actions.ts';
import { setActiveOrganization } from './actions.ts';

const ICONS: Record<NavItem['icon'], string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  apartment: 'M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 8h2M14 8h2M8 12h2M14 12h2',
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  appliance: 'M5 4h14v16H5zM5 9h14M9 6.5h.01M12 14.5m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .2 1.7 1.7 0 0 0-.8 1.5V22h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9-.2l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15H2v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.2A1.7 1.7 0 0 0 8 2.1V2h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9.2l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H22v4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

function Icon({ name }: { name: NavItem['icon'] }) {
  return (
    <svg className="ns-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const COLLAPSE_KEY = 'ns.sidebarCollapsed';

export function AppShell({
  orgs,
  activeOrg,
  userEmail,
  children,
}: {
  orgs: readonly OrgSummary[];
  activeOrg: OrgSummary | null;
  userEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // ignore
      }
      return !c;
    });
  };

  const crumbs = breadcrumbsFor(pathname);

  return (
    <div className={`ns-shell${collapsed ? ' ns-shell--collapsed' : ''}`}>
      <a className="ns-skip" href="#main">
        Skip to content
      </a>
      <aside className={`ns-sidebar${mobileOpen ? ' ns-sidebar--open' : ''}`} id="ns-sidebar">
        <div className="ns-sidebar__top">
          <span className="ns-sidebar__brand">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="ns-sidebar__mark">
              <path
                d="M5 21V10a7 7 0 0 1 14 0v11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M9 21v-8a3 3 0 0 1 6 0v8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <span className="ns-sidebar__label">{brand.name.toLowerCase()}</span>
          </span>
          <button
            type="button"
            className="ns-icon-btn ns-sidebar__collapse"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-pressed={collapsed}
            onClick={toggle}
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
        </div>

        {orgs.length > 0 && (
          <form action={setActiveOrganization} className="ns-orgswitch">
            <label htmlFor="ns-org" className="ns-sidebar__label ns-orgswitch__label">
              Organization
            </label>
            <select
              id="ns-org"
              name="organizationId"
              className="ns-input"
              defaultValue={activeOrg?.id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <noscript>
              <button type="submit">Switch</button>
            </noscript>
          </form>
        )}

        <nav aria-label="Main" className="ns-nav">
          <ul>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`ns-nav__link${active ? ' ns-nav__link--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon name={item.icon} />
                    <span className="ns-sidebar__label">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ns-sidebar__footer">
          <p className="ns-sidebar__label ns-sidebar__user" title={userEmail}>
            {userEmail}
          </p>
          <form action={signOutAction}>
            <button type="submit" className="ns-btn ns-btn--ghost ns-btn--sm ns-sidebar__signout">
              <span className="ns-sidebar__label">Sign out</span>
              <span aria-hidden="true" className="ns-sidebar__signout-icon">
                ⎋
              </span>
            </button>
          </form>
        </div>
      </aside>

      <div className="ns-main">
        <header className="ns-header">
          <button
            type="button"
            className="ns-icon-btn ns-header__menu"
            aria-label="Open navigation"
            aria-controls="ns-sidebar"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <nav aria-label="Breadcrumb">
            <ol className="ns-crumbs">
              {crumbs.map((c, i) => (
                <li key={c.href}>
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page">{c.label}</span>
                  ) : (
                    <Link href={c.href}>{c.label}</Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          {activeOrg && <span className="ns-header__org">{activeOrg.name}</span>}
        </header>
        <main id="main" className="ns-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
