/** Dashboard navigation (DESIGN_SYSTEM section 5 "Navigation"). */
export interface NavItem {
  href: string;
  label: string;
  icon: 'home' | 'apartment' | 'building' | 'scan' | 'appliance' | 'chart' | 'settings';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/app', label: 'Overview', icon: 'home' },
  { href: '/app/apartments', label: 'Apartments', icon: 'apartment' },
  { href: '/app/properties', label: 'Properties', icon: 'building' },
  { href: '/app/scans', label: 'Scans', icon: 'scan' },
  { href: '/app/appliances', label: 'Appliances & instructions', icon: 'appliance' },
  { href: '/app/analytics', label: 'Analytics', icon: 'chart' },
  { href: '/app/settings', label: 'Settings', icon: 'settings' },
];

/** Overview matches only itself; other items also match their sub-pages. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/app') return pathname === '/app';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function breadcrumbsFor(pathname: string): Array<{ href: string; label: string }> {
  const crumbs = [{ href: '/app', label: 'Overview' }];
  const item = NAV_ITEMS.find((i) => i.href !== '/app' && isActive(i, pathname));
  if (item) crumbs.push({ href: item.href, label: item.label });
  return crumbs;
}
