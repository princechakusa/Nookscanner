/**
 * delete-account (Stage 10.6, APP_STORE_COMPLIANCE S3/S4). POST with the user's own session.
 * The user is taken from the verified token, never from the request body. Refused while the user
 * is the only owner of a company (409 SOLE_OWNER with the company names). Otherwise an audit entry
 * is written and the auth user deleted (memberships and profile cascade; company data stays).
 */

export interface AccountDeps {
  /** User id for a valid access token, or null. */
  userFromToken(token: string): Promise<string | null>;
  blockers(userId: string): Promise<string[]>;
  record(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  allowedOrigins: string[];
}

function headers(req: Request, deps: AccountDeps): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
  if (deps.allowedOrigins.includes(origin)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-allow-headers'] = 'authorization, content-type, apikey, x-client-info';
    h.vary = 'origin';
  }
  return h;
}

export async function handleDeleteAccount(req: Request, deps: AccountDeps): Promise<Response> {
  const h = headers(req, deps);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST')
    return new Response('{"error":"METHOD_NOT_ALLOWED"}', { status: 405, headers: h });
  const token = /^Bearer (\S{20,4096})$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const userId = token ? await deps.userFromToken(token) : null;
  if (!userId) return new Response('{"error":"UNAUTHENTICATED"}', { status: 401, headers: h });
  const sole = await deps.blockers(userId);
  if (sole.length > 0) {
    return new Response(JSON.stringify({ error: 'SOLE_OWNER', organizations: sole }), {
      status: 409,
      headers: h,
    });
  }
  await deps.record(userId);
  await deps.deleteUser(userId);
  return new Response('{"deleted":true}', { status: 200, headers: h });
}

/** SQL side (pg in the function, PGlite/stack in tests). */
export function sqlAccountDb(sql: {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}) {
  return {
    async blockers(userId: string) {
      const { rows } = await sql.query<{ b: string[] }>(
        'select private.account_deletion_blockers($1::uuid) as b',
        [userId],
      );
      return rows[0]?.b ?? [];
    },
    async record(userId: string) {
      await sql.query('select private.record_account_deletion($1::uuid)', [userId]);
    },
  };
}
