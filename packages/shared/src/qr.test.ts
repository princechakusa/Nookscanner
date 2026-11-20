import { describe, expect, it } from 'vitest';
import {
  QR_TOKEN_PATTERN,
  guestQrUrl,
  parseGuestBaseUrl,
  qrFileName,
  qrLabelSchema,
} from './qr.ts';

const token = 'A'.repeat(21) + '_-' + 'z'.repeat(20);

describe('parseGuestBaseUrl', () => {
  it('accepts https and local http, normalising trailing slashes', () => {
    expect(parseGuestBaseUrl('https://guest.nookscanner.com/')).toBe(
      'https://guest.nookscanner.com',
    );
    expect(parseGuestBaseUrl('https://example.com/guest//')).toBe('https://example.com/guest');
    expect(parseGuestBaseUrl('http://localhost:5173')).toBe('http://localhost:5173');
    expect(parseGuestBaseUrl('http://127.0.0.1:4173/')).toBe('http://127.0.0.1:4173');
  });

  it('rejects plain http on public hosts, credentials, queries and junk', () => {
    for (const bad of [
      undefined,
      '',
      'guest.nookscanner.com',
      'http://guest.nookscanner.com',
      'https://user:pw@guest.nookscanner.com',
      'https://guest.nookscanner.com/?x=1',
      'https://guest.nookscanner.com/#a',
      'javascript:alert(1)',
      'ftp://localhost',
    ]) {
      expect(parseGuestBaseUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('guestQrUrl', () => {
  it('builds the /a/<token> URL', () => {
    expect(guestQrUrl('https://guest.nookscanner.com/', token)).toBe(
      `https://guest.nookscanner.com/a/${token}`,
    );
  });

  it('refuses invalid tokens or bases', () => {
    expect(() => guestQrUrl('https://g.example', 'short')).toThrow('Invalid QR token');
    expect(() => guestQrUrl('https://g.example', `${token}/../x`)).toThrow('Invalid QR token');
    expect(() => guestQrUrl('http://g.example', token)).toThrow('Invalid guest base URL');
  });

  it('token pattern matches the DB check (22..64 base64url chars)', () => {
    expect(QR_TOKEN_PATTERN.test('a'.repeat(22))).toBe(true);
    expect(QR_TOKEN_PATTERN.test('a'.repeat(21))).toBe(false);
    expect(QR_TOKEN_PATTERN.test('a'.repeat(65))).toBe(false);
    expect(QR_TOKEN_PATTERN.test('a'.repeat(30) + '=')).toBe(false);
  });
});

describe('qr labels and file names', () => {
  it('labels are trimmed and at most 80 characters', () => {
    expect(qrLabelSchema.parse('  Front door ')).toBe('Front door');
    expect(qrLabelSchema.safeParse('x'.repeat(81)).success).toBe(false);
  });

  it('file names are safe', () => {
    expect(qrFileName('Marina View 2BR', 'Front door', 'svg')).toBe(
      'nookscanner-qr-marina-view-2br-front-door.svg',
    );
    expect(qrFileName('شقة', null, 'png')).toBe('nookscanner-qr.png');
    expect(qrFileName('../../etc', '"; rm', 'png')).toBe('nookscanner-qr-etc-rm.png');
  });
});
