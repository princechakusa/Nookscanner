/** Route classification used by the proxy guard (unit-tested). */
const PROTECTED_PREFIXES = ['/app', '/reset-password', '/invite'] as const;
const AUTH_PAGES = ['/login', '/signup', '/forgot-password'] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => matches(pathname, p));
}

/** Generated image routes (QR codes): served with a no-script, sandboxed CSP instead of the page CSP. */
const IMAGE_ROUTE = /^\/app\/apartments\/[0-9a-f-]{36}\/qr\/[0-9a-f-]{36}$/;
export const IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export function isImageRoute(pathname: string): boolean {
  return IMAGE_ROUTE.test(pathname);
}
