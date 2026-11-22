/**
 * Raw footage on R2 (Stage 5.7, ADR-025). The Worker holds no Supabase service key: it asks the
 * database, WITH THE UPLOADER'S SESSION, where a part goes (r2_part_target), stores exactly that
 * many bytes in R2, and completes the part with an HMAC receipt (complete_media_upload_part_r2).
 *
 *   PUT  /parts/<upload>/<part>      Authorization: Bearer <Supabase access token>
 *   GET  /raw?path=&exp=&sig=        short-lived signed read for the GPU worker (dispatcher signs)
 *
 * Pure logic with injected dependencies; worker.ts binds them to the Cloudflare runtime.
 */

export interface R2Like {
  put(
    key: string,
    body: ReadableStream | ArrayBuffer | null,
    options?: unknown,
  ): Promise<{ size: number } | null>;
  head(key: string): Promise<{ size: number } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<{
    body: ReadableStream;
    size: number;
    range?: { offset: number; length?: number };
  } | null>;
}

export interface Deps {
  raw: R2Like;
  supabaseUrl: string;
  publishableKey: string;
  receiptSecret: string;
  readSecret: string;
  allowedOrigins: string[];
  fetch: typeof fetch;
  now?: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Raw footage parts (migration 20261120000500): org/<org>/scans/<session>/<upload>/part-NNNNN.<ext>
const PATH = /^org\/[0-9a-f-]{36}\/scans\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/part-\d{5}\.(mp4|mov)$/;

const enc = new TextEncoder();
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cors(req: Request, deps: Deps): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  if (!deps.allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'PUT, GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

/** Calls a Supabase RPC as the user. */
async function rpc(deps: Deps, token: string, name: string, args: unknown): Promise<Response> {
  return deps.fetch(`${deps.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: deps.publishableKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
}

async function putPart(req: Request, deps: Deps, upload: string, part: number): Promise<Response> {
  const h = cors(req, deps);
  const auth = req.headers.get('authorization') ?? '';
  const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(auth)?.[1];
  if (!token) return json(401, { error: 'UNAUTHENTICATED' }, h);
  const t = await rpc(deps, token, 'r2_part_target', { p_upload: upload, p_part: part });
  if (t.status === 401) return json(401, { error: 'UNAUTHENTICATED' }, h);
  if (!t.ok) return json(404, { error: 'NOT_FOUND' }, h);
  const rows = (await t.json()) as { object_path: string; size_bytes: number; status: string }[];
  const target = rows[0];
  if (!target || !PATH.test(target.object_path)) return json(404, { error: 'NOT_FOUND' }, h);

  if (target.status === 'pending') {
    const length = Number(req.headers.get('content-length') ?? '-1');
    if (length !== target.size_bytes) {
      return json(400, { error: 'SIZE_MISMATCH', expected: target.size_bytes }, h);
    }
    await deps.raw.put(target.object_path, req.body, {
      httpMetadata: { contentType: 'application/octet-stream' },
    });
    const stored = await deps.raw.head(target.object_path);
    if (!stored || stored.size !== target.size_bytes) {
      return json(400, { error: 'PART_INCOMPLETE' }, h);
    }
  }
  const receipt = await hmacHex(
    deps.receiptSecret,
    `${upload}:${part}:${target.size_bytes}:${target.object_path}`,
  );
  const done = await rpc(deps, token, 'complete_media_upload_part_r2', {
    p_upload: upload,
    p_part: part,
    p_receipt: receipt,
  });
  if (!done.ok) return json(409, { error: 'PART_INCOMPLETE' }, h);
  const remaining = (await done.json()) as number;
  return json(200, { remaining }, h);
}

/** Signed read URL for the processing worker (the dispatcher signs with the same secret). */
export async function signRead(
  readSecret: string,
  path: string,
  expiresAt: number,
): Promise<string> {
  return hmacHex(readSecret, `${path}:${expiresAt}`);
}

async function getRaw(req: Request, deps: Deps, url: URL): Promise<Response> {
  const path = url.searchParams.get('path') ?? '';
  const exp = Number(url.searchParams.get('exp') ?? '0');
  const sig = url.searchParams.get('sig') ?? '';
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  // One answer for every failure: expired, forged and missing look the same.
  const denied = () => json(404, { error: 'NOT_FOUND' });
  if (!PATH.test(path) || !Number.isInteger(exp) || exp < now || exp > now + 24 * 3600)
    return denied();
  if (!sameHex(sig, await signRead(deps.readSecret, path, exp))) return denied();
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') ?? '');
  const offset = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Number(range[2]) : undefined;
  const object = await deps.raw.get(
    path,
    range
      ? { range: { offset, ...(end !== undefined ? { length: end - offset + 1 } : {}) } }
      : undefined,
  );
  if (!object) return denied();
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
  };
  if (range) {
    const length = (end ?? object.size - 1) - offset + 1;
    headers['content-range'] = `bytes ${offset}-${offset + length - 1}/${object.size}`;
    headers['content-length'] = String(length);
    return new Response(object.body, { status: 206, headers });
  }
  headers['content-length'] = String(object.size);
  return new Response(object.body, { status: 200, headers });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors(req, deps) });
  const parts = /^\/parts\/([0-9a-f-]{36})\/(\d{1,4})$/.exec(url.pathname);
  if (parts && req.method === 'PUT') {
    const part = Number(parts[2]);
    if (!UUID.test(parts[1]!) || part < 1 || part > 1000) return json(404, { error: 'NOT_FOUND' });
    return putPart(req, deps, parts[1]!, part);
  }
  if (url.pathname === '/raw' && (req.method === 'GET' || req.method === 'HEAD')) {
    return getRaw(req, deps, url);
  }
  return json(404, { error: 'NOT_FOUND' });
}
