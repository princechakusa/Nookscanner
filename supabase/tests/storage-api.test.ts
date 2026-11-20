/**
 * Stage 2.3 acceptance through the real Supabase services (Auth -> PostgREST -> Storage API):
 * own org allowed, other org denied, anon denied. Runs only with `npm run test:stack`; keys are
 * the local stack's development keys, read in memory from `supabase status` and never stored.
 */
import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbTarget, runId } from './support/db.ts';

const stack = dbTarget === 'stack';

interface StackEnv {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

function readStackEnv(): StackEnv {
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
  return {
    API_URL: env.API_URL!,
    ANON_KEY: env.ANON_KEY!,
    SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY!,
  };
}

const password = `Test-${runId}-Passw0rd`;
let env: StackEnv;
let anon: SupabaseClient;

async function signedInClient(label: string): Promise<SupabaseClient> {
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const email = `${label}-${runId}@example.test`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return client;
}

async function must<T = unknown>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
  return data as T;
}

const video = new Blob([new Uint8Array(2048)], { type: 'video/mp4' });

describe.skipIf(!stack)('storage through the Storage API (local Supabase stack)', () => {
  let manager: SupabaseClient;
  let outsider: SupabaseClient;
  let objectPath: string;
  let uploadId: string;
  let orgId: string;
  let apartmentId: string;
  let sessionId: string;

  const freshSession = async () =>
    (
      (await must(
        manager
          .from('scan_sessions')
          .insert({ apartment_id: apartmentId, method: 'video_upload' })
          .select('id')
          .single(),
      )) as { id: string }
    ).id;

  beforeAll(async () => {
    env = readStackEnv();
    anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    manager = await signedInClient('api-manager');
    outsider = await signedInClient('api-outsider');

    orgId = await must(
      manager.rpc('create_organization', { p_name: 'API Org', p_slug: `api-org-${runId}` }),
    );
    const property = await must(
      manager
        .from('properties')
        .insert({ organization_id: orgId, name: 'API Tower' })
        .select('id')
        .single(),
    );
    const apartment = await must(
      manager
        .from('apartments')
        .insert({ property_id: (property as { id: string }).id, name: '101' })
        .select('id')
        .single(),
    );
    apartmentId = (apartment as { id: string }).id;
    const session = await must(
      manager
        .from('scan_sessions')
        .insert({ apartment_id: apartmentId, method: 'video_upload' })
        .select('id')
        .single(),
    );
    sessionId = (session as { id: string }).id;
    const upload = await must(
      manager
        .rpc('register_media_upload', {
          p_scan_session: sessionId,
          p_filename: 'walk.mp4',
          p_mime: 'video/mp4',
          p_size_bytes: video.size,
        })
        .single(),
    );
    uploadId = (upload as { id: string }).id;
    const part = await must(
      manager
        .from('media_upload_parts')
        .select('object_path')
        .eq('media_upload_id', uploadId)
        .eq('part_number', 1)
        .single(),
    );
    objectPath = (part as { object_path: string }).object_path;
  }, 120_000);

  it('the creator uploads the part, completes it through the RPC and can download it', async () => {
    const early = await manager.rpc('complete_media_upload_part', {
      p_upload: uploadId,
      p_part: 1,
    });
    expect(early.error?.message).toMatch(/PART_INCOMPLETE/);
    const up = await manager.storage
      .from('raw-footage')
      .upload(objectPath, video, { contentType: 'video/mp4' });
    expect(up.error).toBeNull();
    const done = await manager.rpc('complete_media_upload_part', { p_upload: uploadId, p_part: 1 });
    expect(done.error).toBeNull();
    expect(done.data).toBe(0);
    const status = await must(
      manager.from('media_uploads').select('status').eq('id', uploadId).single(),
    );
    expect((status as { status: string }).status).toBe('uploaded');
    const down = await manager.storage.from('raw-footage').download(objectPath);
    expect(down.error).toBeNull();
    expect(down.data?.size).toBe(video.size);
  });

  it('objects above the 45 MiB part limit are refused by the bucket', async () => {
    const big = await must(
      manager
        .rpc('register_media_upload', {
          p_scan_session: await freshSession(),
          p_filename: 'big.mp4',
          p_mime: 'video/mp4',
          p_size_bytes: 47185920 + 1,
        })
        .single(),
    );
    const part = await must(
      manager
        .from('media_upload_parts')
        .select('object_path')
        .eq('media_upload_id', (big as { id: string }).id)
        .eq('part_number', 1)
        .single(),
    );
    const tooBig = new Blob([new Uint8Array(47185920 + 1)], { type: 'video/mp4' });
    const up = await manager.storage
      .from('raw-footage')
      .upload((part as { object_path: string }).object_path, tooBig, { contentType: 'video/mp4' });
    expect(up.error).not.toBeNull();
  }, 60_000);

  it('an unregistered path in the own org is denied', async () => {
    const up = await manager.storage
      .from('raw-footage')
      .upload(`org/${orgId}/scans/${sessionId}/rogue.mp4`, video, { contentType: 'video/mp4' });
    expect(up.error).not.toBeNull();
  });

  it('another organization cannot upload to, download or list the path', async () => {
    const up = await outsider.storage
      .from('raw-footage')
      .upload(objectPath, video, { contentType: 'video/mp4', upsert: true });
    expect(up.error).not.toBeNull();
    const down = await outsider.storage.from('raw-footage').download(objectPath);
    expect(down.error).not.toBeNull();
    const list = await outsider.storage.from('raw-footage').list(`org/${orgId}/scans/${sessionId}`);
    expect(list.data ?? []).toEqual([]);
    const rows = await outsider.from('media_uploads').select('id');
    expect(rows.data).toEqual([]);
  });

  it('anon cannot upload, download, list or call RPCs', async () => {
    const up = await anon.storage
      .from('raw-footage')
      .upload(objectPath, video, { contentType: 'video/mp4' });
    expect(up.error).not.toBeNull();
    const down = await anon.storage.from('raw-footage').download(objectPath);
    expect(down.error).not.toBeNull();
    const list = await anon.storage.from('raw-footage').list(`org/${orgId}`);
    expect(list.data ?? []).toEqual([]);
    const pub = await anon.storage
      .from('published-assets')
      .upload(`org/${orgId}/x.sog`, new Blob(['x']), { contentType: 'application/octet-stream' });
    expect(pub.error).not.toBeNull();
    const rpc = await anon.rpc('create_qr_code', { p_apartment: apartmentId });
    expect(rpc.error).not.toBeNull();
    const table = await anon.from('apartments').select('id');
    expect(table.error).not.toBeNull();
  });

  it('the bucket rejects non-video content types even on a registered path', async () => {
    const second = await must(
      manager
        .rpc('register_media_upload', {
          p_scan_session: await freshSession(),
          p_filename: 'walk2.mp4',
          p_mime: 'video/mp4',
          p_size_bytes: 10,
        })
        .single(),
    );
    const up = await manager.storage
      .from('raw-footage')
      .upload(
        `${(second as { object_path: string }).object_path.replace(/\.mp4$/, '')}/part-00001.mp4`,
        new Blob(['<script>']),
        {
          contentType: 'text/html',
        },
      );
    expect(up.error).not.toBeNull();
  });
});
