/**
 * Stage 5.7: the uploads Worker's handler against the REAL local Supabase API (stack only): a
 * manager's session uploads an R2 part, the database checks the Worker's receipt and rolls the
 * upload up; other users and a Worker with the wrong secret are refused. R2 is in memory here
 * (the Worker's own tests cover R2 behaviour).
 */
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { handle, type R2Like } from '../../services/uploads-worker/src/handler.ts';
import { createTestDb, dbTarget, runId, type TestDb } from './support/db.ts';

const stack = dbTarget === 'stack';
const SECRET = 'r2-worker-stack-test-secret-0123456789abcdef';
const password = `Test-${runId}-Passw0rd`;

function stackEnv() {
  const out = execSync('npx -y supabase@3.2.0 status -o env', {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => /^([A-Z_]+)="?([^"]*)"?$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
  return { url: env.API_URL!, anon: env.ANON_KEY!, service: env.SERVICE_ROLE_KEY! };
}

function memoryR2(): R2Like & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, body) {
      const bytes = new Uint8Array(await new Response(body as ReadableStream).arrayBuffer());
      objects.set(key, bytes);
      return { size: bytes.length };
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.length } : null;
    },
    async get() {
      return null;
    },
  };
}

describe.skipIf(!stack)('uploads Worker against the local Supabase API (5.7)', () => {
  let env: ReturnType<typeof stackEnv>;
  let db: TestDb;
  let managerToken: string;
  let outsiderToken: string;
  let uploadId: string;

  const session = async (label: string) => {
    const admin = createClient(env.url, env.service, { auth: { persistSession: false } });
    const email = `${label}-${runId}@example.test`;
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const client = createClient(env.url, env.anon, { auth: { persistSession: false } });
    const { data, error: e2 } = await client.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return { client, token: data.session!.access_token };
  };

  beforeAll(async () => {
    env = stackEnv();
    db = await createTestDb();
    await db.query(
      `insert into private.platform_secrets (name, value) values ('r2_receipt_secret', $1)
       on conflict (name) do update set value = excluded.value`,
      [SECRET],
    );
    const manager = await session('r2w-manager');
    managerToken = manager.token;
    outsiderToken = (await session('r2w-outsider')).token;
    const c = manager.client;
    const { data: org } = await c.rpc('create_organization', {
      p_name: 'R2W',
      p_slug: `r2w-${runId}`,
    });
    const { data: prop } = await c
      .from('properties')
      .insert({ organization_id: org, name: 'P' })
      .select('id')
      .single();
    const { data: apt } = await c
      .from('apartments')
      .insert({ property_id: prop!.id, name: 'A' })
      .select('id')
      .single();
    const { data: s } = await c
      .from('scan_sessions')
      .insert({ apartment_id: apt!.id, method: 'video_upload' })
      .select('id')
      .single();
    const { data: up, error } = await c.rpc('register_media_upload', {
      p_scan_session: s!.id,
      p_filename: 'walk.mp4',
      p_mime: 'video/mp4',
      p_size_bytes: 4096,
    });
    if (error) throw error;
    uploadId = (up as { id: string }).id;
    // As the platform: this upload uses R2 (the global setting stays untouched).
    await db.query(
      `alter table public.media_uploads disable trigger media_uploads_backend_immutable`,
    );
    await db.query(`update public.media_uploads set storage_backend = 'r2' where id = $1`, [
      uploadId,
    ]);
    await db.query(
      `alter table public.media_uploads enable trigger media_uploads_backend_immutable`,
    );
  }, 120_000);

  const deps = (receiptSecret = SECRET) => ({
    raw: memoryR2(),
    supabaseUrl: env.url,
    publishableKey: env.anon,
    receiptSecret,
    readSecret: 'unused-read-secret-0123456789abcdef',
    allowedOrigins: [],
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  });
  const put = (token: string, bytes = 4096) =>
    new Request(`https://w.example/parts/${uploadId}/1`, {
      method: 'PUT',
      body: new Uint8Array(bytes),
      headers: { authorization: `Bearer ${token}`, 'content-length': String(bytes) },
    });

  it('refuses other users and a Worker with the wrong receipt secret', async () => {
    expect((await handle(put(outsiderToken), deps())).status).toBe(404);
    const wrong = await handle(put(managerToken), deps('a-different-secret-0123456789abcdef'));
    expect(wrong.status).toBe(409);
    const { rows } = await db.query<{ status: string }>(
      `select status::text from public.media_upload_parts where media_upload_id = $1`,
      [uploadId],
    );
    expect(rows[0]!.status).toBe('pending');
  });

  it('the uploader stores the part and the upload and session become uploaded', async () => {
    const d = deps();
    const res = await handle(put(managerToken), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ remaining: 0 });
    expect([...d.raw.objects.values()][0]!.length).toBe(4096);
    const { rows } = await db.query<{ u: string; s: string }>(
      `select mu.status::text as u, s.status::text as s from public.media_uploads mu
       join public.scan_sessions s on s.id = mu.scan_session_id where mu.id = $1`,
      [uploadId],
    );
    expect(rows[0]).toEqual({ u: 'uploaded', s: 'uploaded' });
  });
});

describe('dispatcher-signed R2 reads open in the Worker (5.7)', () => {
  it('a link signed by the Supabase functions is accepted by the Worker; a tampered one is not', async () => {
    const { signR2Read } = await import('../functions/_shared/storage.ts');
    const readSecret = 'shared-read-secret-0123456789abcdef0123';
    const path = `org/${crypto.randomUUID()}/scans/${crypto.randomUUID()}/${crypto.randomUUID()}/part-00001.mp4`;
    const bytes = new TextEncoder().encode('walkthrough');
    const raw: R2Like = {
      put: async () => null,
      head: async () => null,
      get: async (key) =>
        key === path ? { body: new Response(bytes).body!, size: bytes.length } : null,
    };
    const deps = {
      raw,
      supabaseUrl: 'https://unused.example',
      publishableKey: 'x',
      receiptSecret: 'unused-receipt-secret-0123456789abcd',
      readSecret,
      allowedOrigins: [],
      fetch: (() => Promise.reject(new Error('no network'))) as unknown as typeof fetch,
    };
    const url = await signR2Read({ workerUrl: 'https://w.example/', readSecret }, path, 600);
    expect(url).toMatch(/^https:\/\/w\.example\/raw\?path=/);
    const ok = await handle(new Request(url), deps);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('walkthrough');
    const tampered = url.replace(
      /path=[^&]+/,
      `path=${encodeURIComponent(path.replace('00001', '00002'))}`,
    );
    expect((await handle(new Request(tampered), deps)).status).toBe(404);
  });
});
