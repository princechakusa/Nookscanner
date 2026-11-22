/**
 * Guest Edge Functions (Stage 9.1, ADR-023): no login, a QR token in the query string.
 *
 *   GET /guest-experience?t=<token>                 -> the published apartment (guest payload)
 *   GET /guest-instruction?t=<token>&a=<appliance>  -> that appliance's photos/videos
 *
 * Unknown, malformed or revoked tokens and unpublished apartments all get the SAME 404 (status,
 * body and headers), so tokens cannot be probed. Private files (3D scene, media) are returned as
 * short-lived signed URLs. Rate limits use a SHA-256 of the client address; raw addresses are
 * never stored. Logic is here with injected dependencies (unit-tested in supabase/tests).
 */

export interface GuestDb {
  /** Latest published snapshot for an active token, or null. */
  lookup(token: string): Promise<Record<string, unknown> | null>;
  /** Counts one hit in the current window; false when over the limit. */
  rateHit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface GuestStorage {
  /** Signed GET URL for a private object, or null if it cannot be signed. */
  sign(
    bucket: 'scene-drafts' | 'instruction-media',
    path: string,
    seconds: number,
  ): Promise<string | null>;
}

export interface GuestDeps {
  db: GuestDb;
  storage: GuestStorage;
  /** Allowed browser origin of the guest app (CORS), e.g. https://guest.nookscanner.app. */
  allowedOrigin: string;
  /** Requests per minute per client (default 60) and per token (default 600). */
  limits?: { perClient: number; perToken: number };
}

const TOKEN = /^[A-Za-z0-9_-]{22,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The 3D file is large (tens of MB on 4G): an hour to download; media: 10 minutes.
const SCENE_URL_SECONDS = 3600;
const MEDIA_URL_SECONDS = 600;

function headers(origin: string, extra: Record<string, string> = {}): Headers {
  return new Headers({
    'content-type': 'application/json; charset=utf-8',
    // Signed URLs inside: never cached by browsers or proxies.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
    ...extra,
  });
}

/** The one and only "not found" answer. */
export function notFound(origin: string): Response {
  return new Response('{"error":"NOT_FOUND"}', { status: 404, headers: headers(origin) });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Client address from the platform's proxy header (first hop), for rate limiting only. */
export function clientAddress(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]!.trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

async function limited(req: Request, token: string, deps: GuestDeps): Promise<Response | null> {
  const { perClient, perToken } = deps.limits ?? { perClient: 60, perToken: 600 };
  const client = `client:${await sha256Hex(clientAddress(req))}`;
  const byToken = `token:${await sha256Hex(token)}`;
  const ok =
    (await deps.db.rateHit(client, perClient, 60)) &&
    (await deps.db.rateHit(byToken, perToken, 60));
  if (ok) return null;
  return new Response('{"error":"RATE_LIMITED"}', {
    status: 429,
    headers: headers(deps.allowedOrigin, { 'retry-after': '60' }),
  });
}

type Snapshot = Record<string, unknown> & {
  scene?: Record<string, unknown> & { path?: string };
  appliances?: (Record<string, unknown> & {
    id: string;
    media?: { kind: string; path: string }[];
  })[];
};

async function common(
  req: Request,
  deps: GuestDeps,
): Promise<{ response: Response } | { snapshot: Snapshot; url: URL }> {
  const origin = deps.allowedOrigin;
  if (req.method === 'OPTIONS')
    return { response: new Response(null, { status: 204, headers: headers(origin) }) };
  if (req.method !== 'GET') {
    return {
      response: new Response('{"error":"METHOD_NOT_ALLOWED"}', {
        status: 405,
        headers: headers(origin, { allow: 'GET, OPTIONS' }),
      }),
    };
  }
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  // Malformed tokens are counted too, so guessing costs the same as using real ones.
  const limit = await limited(req, token, deps);
  if (limit) return { response: limit };
  if (!TOKEN.test(token)) return { response: notFound(origin) };
  const snapshot = (await deps.db.lookup(token)) as Snapshot | null;
  if (!snapshot) return { response: notFound(origin) };
  return { snapshot, url };
}

/** GET guest-experience: the payload of packages/shared guestExperienceSchema. */
export async function handleGuestExperience(req: Request, deps: GuestDeps): Promise<Response> {
  const r = await common(req, deps);
  if ('response' in r) return r.response;
  const { scene, appliances, ...rest } = r.snapshot;
  let outScene: Record<string, unknown> | undefined;
  if (scene?.path) {
    const signed = await deps.storage.sign('scene-drafts', scene.path, SCENE_URL_SECONDS);
    if (signed) {
      // Hotspots are kept for 9.2; the private path never leaves the server.
      const { path: _path, ...sceneRest } = scene;
      outScene = { ...sceneRest, url: signed };
    }
  }
  const body = {
    ...rest,
    // Media URLs come from guest-instruction when a guest opens an appliance.
    appliances: (appliances ?? []).map(({ media: _media, ...a }) => a),
    ...(outScene ? { scene: outScene } : {}),
  };
  return new Response(JSON.stringify(body), { status: 200, headers: headers(deps.allowedOrigin) });
}

/** GET guest-instruction: signed media of one appliance of the published apartment. */
export async function handleGuestInstruction(req: Request, deps: GuestDeps): Promise<Response> {
  const r = await common(req, deps);
  if ('response' in r) return r.response;
  const applianceId = r.url.searchParams.get('a') ?? '';
  const appliance = UUID.test(applianceId)
    ? (r.snapshot.appliances ?? []).find((a) => a.id === applianceId)
    : undefined;
  if (!appliance) return notFound(deps.allowedOrigin);
  const media = [];
  for (const m of appliance.media ?? []) {
    const url = await deps.storage.sign('instruction-media', m.path, MEDIA_URL_SECONDS);
    if (url) {
      const { path: _path, ...rest } = m as Record<string, unknown>;
      media.push({ ...rest, url });
    }
  }
  return new Response(JSON.stringify({ applianceId, media }), {
    status: 200,
    headers: headers(deps.allowedOrigin),
  });
}

/** PlatformDb-style adapter over a direct SQL connection (pg in the function, PGlite in tests). */
export function sqlGuestDb(sql: {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}): GuestDb {
  return {
    async lookup(token) {
      const { rows } = await sql.query<{ s: Record<string, unknown> | null }>(
        'select private.guest_lookup($1::text) as s',
        [token],
      );
      return rows[0]?.s ?? null;
    },
    async rateHit(key, limit, windowSeconds) {
      const { rows } = await sql.query<{ ok: boolean }>(
        'select private.guest_rate_hit($1::text, $2::int, $3::int) as ok',
        [key, limit, windowSeconds],
      );
      return rows[0]?.ok === true;
    },
  };
}
