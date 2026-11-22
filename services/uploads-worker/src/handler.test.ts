import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handle, hmacHex, signRead, type Deps, type R2Like } from './handler.ts';

const UPLOAD = '11111111-1111-4111-8111-111111111111';
const PATH = `org/${'a'.repeat(8)}-aaaa-4aaa-8aaa-${'a'.repeat(12)}/scans/${'b'.repeat(8)}-bbbb-4bbb-8bbb-${'b'.repeat(12)}/${UPLOAD}/part-00001.mp4`;
const TOKEN = 'eyJ' + 'x'.repeat(40);

function memoryR2(): R2Like & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, body) {
      const bytes =
        body instanceof ArrayBuffer
          ? new Uint8Array(body)
          : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, bytes);
      return { size: bytes.length };
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.length } : null;
    },
    async get(key, options) {
      const o = objects.get(key);
      if (!o) return null;
      const off = options?.range?.offset ?? 0;
      const len = options?.range?.length ?? o.length - off;
      return { body: new Response(o.slice(off, off + len)).body!, size: o.length };
    },
  };
}

function deps(
  over: Partial<Deps> = {},
  target = { object_path: PATH, size_bytes: 5, status: 'pending' },
) {
  const calls: { name: string; body: unknown; auth: string | null }[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split('/rpc/')[1]!;
    calls.push({
      name,
      body: JSON.parse(String(init?.body)),
      auth: new Headers(init?.headers).get('authorization'),
    });
    if (name === 'r2_part_target') return Response.json([target]);
    return Response.json(0);
  });
  const d: Deps = {
    raw: memoryR2(),
    supabaseUrl: 'https://p.supabase.co',
    publishableKey: 'sb_publishable_x',
    receiptSecret: 'receipt-secret-0123456789abcdef0123',
    readSecret: 'read-secret-0123456789abcdef01234567',
    allowedOrigins: ['https://dash.example'],
    fetch: fetcher as unknown as typeof fetch,
    now: () => 1_800_000_000_000,
    ...over,
  };
  return { d, calls };
}
const put = (body: string, headers: Record<string, string> = {}) =>
  new Request(`https://w.example/parts/${UPLOAD}/1`, {
    method: 'PUT',
    body,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-length': String(body.length),
      ...headers,
    },
  });

describe('PUT /parts (5.7)', () => {
  it('stores exactly the expected bytes and completes with the HMAC the database expects', async () => {
    const { d, calls } = deps();
    const res = await handle(put('hello', { origin: 'https://dash.example' }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ remaining: 0 });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://dash.example');
    expect(new TextDecoder().decode((d.raw as ReturnType<typeof memoryR2>).objects.get(PATH))).toBe(
      'hello',
    );
    expect(calls.map((c) => c.name)).toEqual(['r2_part_target', 'complete_media_upload_part_r2']);
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    const expected = createHmac('sha256', d.receiptSecret)
      .update(`${UPLOAD}:1:5:${PATH}`)
      .digest('hex');
    expect(calls[1]!.body).toEqual({ p_upload: UPLOAD, p_part: 1, p_receipt: expected });
  });

  it('refuses a missing session, a wrong size, and parts the database does not give', async () => {
    expect((await handle(put('hello', { authorization: '' }), deps().d)).status).toBe(401);
    const wrong = await handle(put('hello!'), deps().d);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'SIZE_MISMATCH', expected: 5 });
    const { d } = deps({
      fetch: (async () =>
        new Response('{"code":"P0002"}', { status: 400 })) as unknown as typeof fetch,
    });
    expect((await handle(put('hello'), d)).status).toBe(404);
    // A path outside the expected layout is never written.
    const odd = deps({}, { object_path: '../etc/passwd', size_bytes: 5, status: 'pending' });
    expect((await handle(put('hello'), odd.d)).status).toBe(404);
    expect((odd.d.raw as ReturnType<typeof memoryR2>).objects.size).toBe(0);
  });

  it('an already uploaded part is not written again (retry-safe)', async () => {
    const { d } = deps({}, { object_path: PATH, size_bytes: 5, status: 'uploaded' });
    const res = await handle(put('XXXXX'), d);
    expect(res.status).toBe(200);
    expect((d.raw as ReturnType<typeof memoryR2>).objects.size).toBe(0);
  });

  it('does not answer CORS for unknown origins', async () => {
    const res = await handle(put('hello', { origin: 'https://evil.example' }), deps().d);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('GET /raw (signed reads for the GPU worker)', () => {
  it('serves a part with a valid signature, including byte ranges', async () => {
    const { d } = deps();
    await d.raw.put(PATH, new TextEncoder().encode('0123456789').buffer as ArrayBuffer);
    const exp = 1_800_000_000 + 600;
    const sig = await signRead(d.readSecret, PATH, exp);
    const url = `https://w.example/raw?path=${encodeURIComponent(PATH)}&exp=${exp}&sig=${sig}`;
    const full = await handle(new Request(url), d);
    expect(full.status).toBe(200);
    expect(await full.text()).toBe('0123456789');
    const part = await handle(new Request(url, { headers: { range: 'bytes=2-5' } }), d);
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await part.text()).toBe('2345');
  });

  it('answers expired, forged, far-future and unknown the same way', async () => {
    const { d } = deps();
    await d.raw.put(PATH, new TextEncoder().encode('x').buffer as ArrayBuffer);
    const now = 1_800_000_000;
    const link = async (exp: number, sig?: string) =>
      handle(
        new Request(
          `https://w.example/raw?path=${encodeURIComponent(PATH)}&exp=${exp}&sig=${sig ?? (await signRead(d.readSecret, PATH, exp))}`,
        ),
        d,
      );
    const results = await Promise.all([
      link(now - 1),
      link(now + 600, 'f'.repeat(64)),
      link(now + 3 * 24 * 3600),
      handle(
        new Request(
          `https://w.example/raw?path=x&exp=${now + 60}&sig=${await signRead(d.readSecret, 'x', now + 60)}`,
        ),
        d,
      ),
    ]);
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404]);
  });

  it('hmacHex matches Node', async () => {
    expect(await hmacHex('k', 'm')).toBe(createHmac('sha256', 'k').update('m').digest('hex'));
  });
});
