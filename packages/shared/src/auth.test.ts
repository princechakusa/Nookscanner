import { describe, expect, it } from 'vitest';
import {
  mapAuthError,
  newPasswordSchema,
  passwordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from './auth.ts';

describe('password policy (mirrors supabase/config.toml)', () => {
  it.each([
    ['short1A', 'PASSWORD_TOO_SHORT'],
    ['alllowercase123', 'PASSWORD_TOO_WEAK'],
    ['ALLUPPERCASE123', 'PASSWORD_TOO_WEAK'],
    ['NoDigitsAtAllHere', 'PASSWORD_TOO_WEAK'],
    [`Aa1${'x'.repeat(70)}`, 'PASSWORD_TOO_LONG'],
  ])('rejects %s', (pw, code) => {
    const r = passwordSchema.safeParse(pw);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(code);
  });

  it('accepts a compliant password', () => {
    expect(passwordSchema.safeParse('Apartment2026').success).toBe(true);
  });

  it('requires matching confirmation', () => {
    const r = newPasswordSchema.safeParse({ password: 'Apartment2026', confirm: 'Apartment2027' });
    expect(r.error?.issues[0]?.message).toBe('PASSWORDS_DO_NOT_MATCH');
  });
});

describe('sign-up / sign-in input', () => {
  it('normalises email', () => {
    const r = signUpSchema.parse({
      fullName: ' Sam ',
      email: '  Sam@Example.COM ',
      password: 'Apartment2026',
    });
    expect(r).toEqual({ fullName: 'Sam', email: 'sam@example.com', password: 'Apartment2026' });
  });

  it('rejects invalid email and empty password', () => {
    const r = signInSchema.safeParse({ email: 'not-an-email', password: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).sort()).toEqual([
      'INVALID_EMAIL',
      'PASSWORD_REQUIRED',
    ]);
  });
});

describe('safeNextPath (open-redirect guard)', () => {
  it.each([
    ['/app/properties?x=1#y', '/app/properties?x=1#y'],
    ['/reset-password', '/reset-password'],
  ])('keeps %s', (input, out) => expect(safeNextPath(input)).toBe(out));

  it.each([
    'https://evil.example/',
    '//evil.example/x',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/app\r\nSet-Cookie: x=1',
    '/app\tx',
    'app',
    '',
    null,
    undefined,
    `/${'a'.repeat(600)}`,
  ])('rejects %s', (input) => expect(safeNextPath(input)).toBe('/app'));
});

describe('mapAuthError (no account enumeration)', () => {
  it('maps unknown user and wrong password to the same code', () => {
    expect(mapAuthError({ code: 'user_not_found' })).toBe('INVALID_CREDENTIALS');
    expect(mapAuthError({ code: 'invalid_credentials' })).toBe('INVALID_CREDENTIALS');
  });

  it('maps rate limits and expired links', () => {
    expect(mapAuthError({ code: 'over_email_send_rate_limit' })).toBe('RATE_LIMITED');
    expect(mapAuthError({ status: 429 })).toBe('RATE_LIMITED');
    expect(mapAuthError({ code: 'otp_expired' })).toBe('LINK_INVALID');
    expect(mapAuthError({ code: 'something_new' })).toBe('UNKNOWN');
  });
});
