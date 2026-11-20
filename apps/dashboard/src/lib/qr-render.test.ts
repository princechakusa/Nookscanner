import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestBaseUrl, renderQrPng, renderQrSvg } from './qr-render.ts';

const url = `https://guest.nookscanner.com/a/${'Ab3_-'.repeat(8)}xyz`;

describe('QR rendering', () => {
  it('PNG decodes back to exactly the guest URL', async () => {
    const png = PNG.sync.read(await renderQrPng(url));
    expect(png.width).toBe(1024);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(url);
  });

  it('SVG is a standalone black-on-white image with no scripts', async () => {
    const svg = await renderQrSvg(url);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('#ffffff');
    expect(svg).toContain('#000000');
    expect(svg).not.toMatch(/<script|on\w+=/i);
  });
});

describe('guestBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the configured https URL', () => {
    vi.stubEnv('NEXT_PUBLIC_GUEST_URL', 'https://guest.nookscanner.com/');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    expect(guestBaseUrl()).toBe('https://guest.nookscanner.com');
  });

  it('falls back to the local dev server only in local', () => {
    vi.stubEnv('NEXT_PUBLIC_GUEST_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'local');
    expect(guestBaseUrl()).toBe('http://localhost:5173');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    expect(guestBaseUrl()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GUEST_URL', 'http://guest.nookscanner.com');
    expect(guestBaseUrl()).toBeNull();
  });
});
