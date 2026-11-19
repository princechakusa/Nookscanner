import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { detectLocale } from './i18n.ts';
import { parseGuestToken } from './route.ts';

afterEach(cleanup);

const VALID_TOKEN = 'k3J9_xQ2-LmN8pR4sT6vWy';

describe('parseGuestToken', () => {
  it('accepts a well-formed QR token', () => {
    expect(parseGuestToken(`/a/${VALID_TOKEN}`)).toBe(VALID_TOKEN);
    expect(parseGuestToken(`/a/${VALID_TOKEN}/`)).toBe(VALID_TOKEN);
  });

  it('rejects short, malformed or injected tokens', () => {
    expect(parseGuestToken('/a/short')).toBeNull();
    expect(parseGuestToken(`/a/${VALID_TOKEN}%27--`)).toBeNull();
    expect(parseGuestToken(`/a/${VALID_TOKEN}/extra`)).toBeNull();
    expect(parseGuestToken('/')).toBeNull();
  });
});

describe('detectLocale', () => {
  it('prefers Arabic when the browser asks for it', () => {
    expect(detectLocale(['ar-AE', 'en-US'])).toBe('ar');
  });
  it('falls back to English', () => {
    expect(detectLocale(['fr-FR'])).toBe('en');
  });
});

describe('guest shell', () => {
  it('asks to scan the QR code when there is no token', () => {
    render(<App pathname="/" languages={['en-US']} />);
    expect(screen.getByRole('heading', { name: /scan the qr code/i })).toBeTruthy();
  });

  it('shows the loading state for a valid token', () => {
    render(<App pathname={`/a/${VALID_TOKEN}`} languages={['en-US']} />);
    expect(screen.getByRole('heading', { name: /preparing your apartment/i })).toBeTruthy();
  });

  it('switches to Arabic with right-to-left layout', () => {
    render(<App pathname="/" languages={['en-US']} />);
    fireEvent.click(screen.getByRole('button', { name: /switch to arabic/i }));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByRole('heading', { name: 'امسح رمز QR الموجود في شقتك' })).toBeTruthy();
  });
});
