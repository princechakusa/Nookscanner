import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from './lib/env.ts';
import { contentSecurityPolicy, createNonce } from './lib/security-headers.ts';
import { isAuthPage, isProtectedPath } from './lib/routes.ts';

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware):
 * 1. per-request CSP nonce (Next.js applies it to its own scripts),
 * 2. Supabase session refresh (rotated cookies written to the response),
 * 3. route guard: protected paths need a verified session; signed-in users skip auth pages.
 * Authorization itself is enforced by RLS; this guard only improves UX.
 */
export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  const nonce = createNonce();
  const csp = contentSecurityPolicy({
    isDev: process.env.NODE_ENV !== 'production',
    supabaseUrl: env.supabaseUrl,
    nonce,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response = next();
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        requestHeaders.set('cookie', request.cookies.toString());
        response = next();
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser asks the Auth server, so revoked sessions (sign-out elsewhere, password change) are
  // detected. A local JWT check (getClaims) would still accept them until expiry and disagree
  // with the pages, which caused a redirect loop (KNOWN_ISSUES R-010).
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);
  const { pathname, search } = request.nextUrl;

  let redirectTo: URL | null = null;
  if (!signedIn && isProtectedPath(pathname)) {
    redirectTo = new URL('/login', request.url);
    redirectTo.searchParams.set('next', `${pathname}${search}`);
  } else if (signedIn && isAuthPage(pathname)) {
    redirectTo = new URL('/app', request.url);
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    response = redirect;
  }

  response.headers.set('Content-Security-Policy', csp);
  // Authenticated pages must never be cached by shared caches.
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  // Everything except static assets and image optimisation.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
