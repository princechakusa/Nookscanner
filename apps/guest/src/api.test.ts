import { describe, expect, it, vi } from 'vitest';
import { loadExperience } from './api.ts';
import { DEMO_EXPERIENCE } from './demo.ts';

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

describe('loadExperience (9.2)', () => {
  const base = 'https://fn.example/functions/v1';
  it('requests the token without credentials and validates the payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(res(200, DEMO_EXPERIENCE));
    const r = await loadExperience('A'.repeat(43), fetcher, base);
    expect(r.kind).toBe('ok');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${base}/guest-experience?t=${'A'.repeat(43)}`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' });
  });
  it('maps 404, 429 (Retry-After), server errors, bad payloads and network failures', async () => {
    const t = 'B'.repeat(30);
    expect(await loadExperience(t, vi.fn().mockResolvedValue(res(404, '{}')), base)).toEqual({
      kind: 'not-found',
    });
    expect(
      await loadExperience(
        t,
        vi.fn().mockResolvedValue(res(429, '{}', { 'retry-after': '30' })),
        base,
      ),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 30 });
    expect((await loadExperience(t, vi.fn().mockResolvedValue(res(500, '{}')), base)).kind).toBe(
      'error',
    );
    expect(
      (await loadExperience(t, vi.fn().mockResolvedValue(res(200, { rooms: 'x' })), base)).kind,
    ).toBe('error');
    expect(
      (await loadExperience(t, vi.fn().mockResolvedValue(res(200, 'not json')), base)).kind,
    ).toBe('error');
    expect(
      (await loadExperience(t, vi.fn().mockRejectedValue(new TypeError('offline')), base)).kind,
    ).toBe('error');
  });
});
