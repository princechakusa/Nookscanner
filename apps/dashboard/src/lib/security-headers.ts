/**
 * HTTP security headers for the manager dashboard (docs/SECURITY.md section 6).
 * Static headers are set in next.config.ts. The Content-Security-Policy is set per request by
 * src/proxy.ts with a fresh nonce, so production scripts need no 'unsafe-inline' (KI-008).
 * Styles keep 'unsafe-inline' (Next.js/React inline style attributes); no user HTML is rendered.
 */
export interface Header {
  key: string;
  value: string;
}

export function contentSecurityPolicy({
  isDev,
  supabaseUrl,
  nonce,
}: {
  isDev: boolean;
  supabaseUrl?: string;
  nonce?: string;
}): string {
  const supabase = supabaseUrl ? ` ${supabaseUrl} ${supabaseUrl.replace(/^http/, 'ws')}` : '';
  const storage = supabaseUrl ? ` ${supabaseUrl}` : '';
  // 'wasm-unsafe-eval' lets the 3D viewer (Spark) compile its WebAssembly module; it does not
  // allow eval() of JavaScript strings.
  const scripts = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`
    : `'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ''}`;
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': scripts,
    'style-src': "'self' 'unsafe-inline'",
    // Signed Storage URLs for instruction photos and videos (Stage 8.3); http(s) origin only.
    'img-src': `'self' data: blob:${storage}`,
    'font-src': "'self'",
    'connect-src': `'self'${supabase}`,
    'media-src': `'self' blob:${storage}`,
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

/** Static headers (everything except the per-request CSP). */
export function securityHeaders({ isDev }: { isDev: boolean }): Header[] {
  const headers: Header[] = [
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

/** 128-bit random nonce, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
