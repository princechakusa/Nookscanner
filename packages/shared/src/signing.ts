/**
 * HMAC-SHA256 signing for worker dispatch and callbacks (docs/API_SPECIFICATION.md section 4,
 * threat T09). Uses Web Crypto so the same code runs in Node, Deno (Edge Functions) and browsers.
 * The Python worker implements the identical scheme in nooktour_reconstruction/signing.py; both
 * are tested against the same fixed test vector.
 *
 * signature = "v1=" + hex(HMAC_SHA256(secret, `${timestamp}.${body}`))
 */

export const SIGNATURE_VERSION = 'v1';
export const MAX_CLOCK_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function signPayload(
  secret: string,
  timestamp: number,
  body: string,
): Promise<string> {
  if (secret.length < 32) throw new Error('HMAC secret must be at least 32 characters');
  return `${SIGNATURE_VERSION}=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult =
  { ok: true } | { ok: false; reason: 'STALE_TIMESTAMP' | 'BAD_SIGNATURE' };

export async function verifyPayload(params: {
  secret: string;
  timestamp: number;
  body: string;
  signature: string;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(params.timestamp) ||
    Math.abs(now - params.timestamp) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return { ok: false, reason: 'STALE_TIMESTAMP' };
  }
  const expected = await signPayload(params.secret, params.timestamp, params.body);
  return constantTimeEqual(expected, params.signature)
    ? { ok: true }
    : { ok: false, reason: 'BAD_SIGNATURE' };
}
