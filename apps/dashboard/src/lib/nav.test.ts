import { describe, expect, it } from 'vitest';
import { resolveActiveOrg } from './active-org.ts';
import { NAV_ITEMS, breadcrumbsFor, isActive } from './nav.ts';

const byHref = (href: string) => NAV_ITEMS.find((i) => i.href === href)!;

describe('navigation', () => {
  it('overview is active only on /app', () => {
    expect(isActive(byHref('/app'), '/app')).toBe(true);
    expect(isActive(byHref('/app'), '/app/apartments')).toBe(false);
  });

  it('sections match their sub-pages but not look-alike paths', () => {
    expect(isActive(byHref('/app/apartments'), '/app/apartments/123')).toBe(true);
    expect(isActive(byHref('/app/apartments'), '/app/apartments-old')).toBe(false);
  });

  it('builds breadcrumbs', () => {
    expect(breadcrumbsFor('/app/scans/9')).toEqual([
      { href: '/app', label: 'Overview' },
      { href: '/app/scans', label: 'Scans' },
    ]);
    expect(breadcrumbsFor('/app')).toEqual([{ href: '/app', label: 'Overview' }]);
  });
});

describe('active organization', () => {
  const orgs = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ];
  it('uses the cookie only when the user is a member', () => {
    expect(resolveActiveOrg(orgs, 'b')?.id).toBe('b');
    expect(resolveActiveOrg(orgs, 'not-mine')?.id).toBe('a');
    expect(resolveActiveOrg(orgs, undefined)?.id).toBe('a');
    expect(resolveActiveOrg([], 'a')).toBeNull();
  });
});
