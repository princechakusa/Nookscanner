import { describe, expect, it } from 'vitest';
import { isAuthPage, isProtectedPath } from './routes.ts';

describe('route guard classification', () => {
  it.each(['/app', '/app/', '/app/properties/1', '/reset-password', '/invite/abc'])(
    '%s is protected',
    (p) => expect(isProtectedPath(p)).toBe(true),
  );

  it.each(['/', '/login', '/signup', '/application', '/apps', '/auth/confirm'])(
    '%s is not protected',
    (p) => expect(isProtectedPath(p)).toBe(false),
  );

  it.each(['/login', '/signup', '/forgot-password'])('%s is an auth page', (p) =>
    expect(isAuthPage(p)).toBe(true),
  );

  it('reset-password and confirm are not auth pages (they need or create a session)', () => {
    expect(isAuthPage('/reset-password')).toBe(false);
    expect(isAuthPage('/auth/confirm')).toBe(false);
  });
});
