import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from './security-headers.ts';

const byKey = (isDev: boolean) =>
  Object.fromEntries(securityHeaders({ isDev }).map((h) => [h.key, h.value]));

describe('dashboard security headers', () => {
  it('sets the baseline headers in production', () => {
    const h = byKey(false);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(h['Content-Security-Policy']).toContain("object-src 'none'");
  });

  it('does not allow eval in production', () => {
    expect(contentSecurityPolicy({ isDev: false })).not.toContain('unsafe-eval');
  });

  it('omits HSTS in development', () => {
    expect(byKey(true)['Strict-Transport-Security']).toBeUndefined();
  });

  it('allows the configured Supabase origin for API and realtime', () => {
    const csp = contentSecurityPolicy({ isDev: false, supabaseUrl: 'https://abc.supabase.co' });
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  });
});
