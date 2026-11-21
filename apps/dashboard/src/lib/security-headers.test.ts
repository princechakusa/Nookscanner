import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, createNonce, securityHeaders } from './security-headers.ts';

const byKey = (isDev: boolean) =>
  Object.fromEntries(securityHeaders({ isDev }).map((h) => [h.key, h.value]));

describe('dashboard security headers', () => {
  it('sets the baseline headers in production', () => {
    const h = byKey(false);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toContain('max-age=63072000');
  });

  it('omits HSTS in development', () => {
    expect(byKey(true)['Strict-Transport-Security']).toBeUndefined();
  });

  it('production CSP with a nonce allows no inline or eval scripts (KI-008)', () => {
    const csp = contentSecurityPolicy({ isDev: false, nonce: 'abc123==' });
    expect(csp).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    // JavaScript eval stays forbidden; only WebAssembly compilation is allowed.
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('allows the configured Supabase origin for API and realtime', () => {
    const csp = contentSecurityPolicy({ isDev: false, supabaseUrl: 'https://abc.supabase.co' });
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  });

  it('creates distinct 128-bit nonces', () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});
