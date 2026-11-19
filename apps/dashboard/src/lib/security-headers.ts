/**
 * HTTP security headers for the manager dashboard (docs/SECURITY.md section 6).
 * The CSP will move to per-request nonces when authenticated pages land (Phase 2/3);
 * 'unsafe-inline' for scripts is allowed only in development (needed by the dev overlay).
 */
export interface Header {
  key: string;
  value: string;
}

export function contentSecurityPolicy({
  isDev,
  supabaseUrl,
}: {
  isDev: boolean;
  supabaseUrl?: string;
}): string {
  const supabase = supabaseUrl ? ` ${supabaseUrl} ${supabaseUrl.replace(/^http/, 'ws')}` : '';
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob:",
    'font-src': "'self'",
    'connect-src': `'self'${supabase}`,
    'media-src': "'self' blob:",
    'worker-src': "'self' blob:",
    'frame-ancestors': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'object-src': "'none'",
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');
}

export function securityHeaders({ isDev }: { isDev: boolean }): Header[] {
  const headers: Header[] = [
    {
      key: 'Content-Security-Policy',
      value: contentSecurityPolicy({ isDev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  if (!isDev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
  }
  return headers;
}
