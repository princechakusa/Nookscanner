/** Route classification used by the proxy guard (unit-tested). */
const PROTECTED_PREFIXES = ['/app', '/reset-password'] as const;
const AUTH_PAGES = ['/login', '/signup', '/forgot-password'] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => matches(pathname, p));
}
