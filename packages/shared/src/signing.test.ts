import { describe, expect, it } from 'vitest';
import { signPayload, verifyPayload } from './signing.ts';

// Shared cross-language test vector (also asserted in services/reconstruction/tests/test_signing.py).
const SECRET = 'nooktour-test-secret-0123456789abcdef';
const TIMESTAMP = 1763510400;
const BODY = '{"jobId":"x"}';
const EXPECTED = 'v1=501734ef2194d71b17e3f00506c1d96e1b77111b2fd05d9bc3edb0fb994ef8fd';

describe('HMAC signing', () => {
  it('matches the cross-language test vector', async () => {
    expect(await signPayload(SECRET, TIMESTAMP, BODY)).toBe(EXPECTED);
  });

  it('verifies a valid signature within the clock window', async () => {
    const result = await verifyPayload({
      secret: SECRET,
      timestamp: TIMESTAMP,
      body: BODY,
      signature: EXPECTED,
      nowSeconds: TIMESTAMP + 120,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects a tampered body', async () => {
    const result = await verifyPayload({
      secret: SECRET,
      timestamp: TIMESTAMP,
      body: '{"jobId":"y"}',
      signature: EXPECTED,
      nowSeconds: TIMESTAMP,
    });
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects stale timestamps (replay window)', async () => {
    const result = await verifyPayload({
      secret: SECRET,
      timestamp: TIMESTAMP,
      body: BODY,
      signature: EXPECTED,
      nowSeconds: TIMESTAMP + 301,
    });
    expect(result).toEqual({ ok: false, reason: 'STALE_TIMESTAMP' });
  });

  it('refuses short secrets', async () => {
    await expect(signPayload('short', TIMESTAMP, BODY)).rejects.toThrow(/at least 32/);
  });
});
