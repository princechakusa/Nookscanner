/**
 * Stage 9.1: guest Edge Functions over the real SQL (PGlite / local stack): published payload,
 * uniform 404s, rate limits, schema, signed URLs, no private paths in responses.
 */
import { guestExperienceSchema } from '@nookscanner/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  handleGuestExperience,
  handleGuestInstruction,
  sqlGuestDb,
  type GuestDeps,
} from '../functions/_shared/guest.ts';
import { asUser, createTestDb, createUser, slug, type TestDb } from './support/db.ts';

let db: TestDb;
let owner: string;
let org: string;
let apt: string;
let ac: string;
let token: string;
let revokedToken: string;
let scenePath: string;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const id = async (p: Promise<{ rows: { id: string }[] }>) => (await one(p)).id;
const ORIGIN = 'https://guest.example';
const signed: string[] = [];

const deps = (limits?: GuestDeps['limits']): GuestDeps => ({
  db: sqlGuestDb(db),
  storage: {
    async sign(bucket, path, seconds) {
      signed.push(`${bucket}:${path}`);
      return `https://storage.example/${bucket}/${encodeURIComponent(path)}?exp=${seconds}&sig=x`;
    },
  },
  allowedOrigin: ORIGIN,
  ...(limits ? { limits } : {}),
});
let ip = 0;
/** A distinct client address per request unless given, so rate limits do not interfere. */
const get = (query: string, address = `10.0.${Math.floor(++ip / 250)}.${ip % 250}`) =>
  new Request(`https://fn.example/guest?${query}`, { headers: { 'x-forwarded-for': address } });

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, 'gf-owner');
  org = await asUser(db, owner, (tx) =>
    id(tx.query(`select public.create_organization('Gf', $1) as id`, [slug('gf')])),
  );
  const prop = await asUser(db, owner, (tx) =>
    id(
      tx.query(
        `insert into public.properties (organization_id, name, support_phone) values ($1, 'Tower', '+971 4 123 4567') returning id`,
        [org],
      ),
    ),
  );
  apt = await asUser(db, owner, (tx) =>
    id(
      tx.query(
        `insert into public.apartments (property_id, name) values ($1, 'Flat 12') returning id`,
        [prop],
      ),
    ),
  );
  // Seeded as the platform (fast); publishing itself goes through the RPC.
  const room = await id(
    db.query(
      `insert into public.rooms (apartment_id, name_en, room_type, sort_order) values ($1, 'Living room', 'entrance', 1) returning id`,
      [apt],
    ),
  );
  const s = await id(
    db.query(
      `insert into public.scan_sessions (apartment_id, method, status) values ($1, 'video_upload', 'succeeded') returning id`,
      [apt],
    ),
  );
  const j = await id(
    db.query(
      `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, status, attempt)
       values ($1, $2, $3, gen_random_uuid()::text, 'succeeded', 1) returning id`,
      [org, s, apt],
    ),
  );
  scenePath = `org/${org}/apartments/${apt}/scenes/${j}/a1/scene.sog`;
  const scene = await id(
    db.query(
      `insert into public.scene_versions (organization_id, apartment_id, processing_job_id, version, status, scene_path, alignment, bounds)
       values ($1, $2, $3, 1, 'approved', $4, '{"matrix":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"scale":1}', '{"min":[-3,0,-4],"max":[3,2.6,4]}') returning id`,
      [org, apt, j, scenePath],
    ),
  );
  await db.query(
    `insert into public.scene_room_views (organization_id, scene_version_id, room_id, position, target) values ($1, $2, $3, '{0,1.5,0}', '{0,1.5,-1}')`,
    [org, scene, room],
  );
  ac = await id(
    db.query(
      `insert into public.appliances (apartment_id, room_id, category_id, name_en)
       select $1, $2, c.id, 'Living room AC' from public.appliance_categories c where c.key = 'air_conditioner' returning id`,
      [apt, room],
    ),
  );
  const ins = await id(
    db.query(`insert into public.instructions (appliance_id) values ($1) returning id`, [ac]),
  );
  await db.query(
    `insert into public.instruction_versions (instruction_id, locale, version, title, steps) values ($1, 'en', 1, 'Cooling', '[{"text":"Press Power"}]')`,
    [ins],
  );
  await db.query(
    `insert into public.instruction_media (instruction_id, kind, object_path, size_bytes, caption_en) values ($1, 'image', $2, 100, 'The remote')`,
    [ins, `org/${org}/apartments/${apt}/instructions/${ins}/remote.jpg`],
  );
  await db.query(`select set_config('nookscanner.verifying', 'on', false)`);
  await db.query(
    `update public.instruction_versions set verification_status = 'verified' where instruction_id = $1`,
    [ins],
  );
  await db.query(`select set_config('nookscanner.verifying', '', false)`);
  await asUser(db, owner, (tx) =>
    tx.query(`select public.publish_apartment($1, $2)`, [apt, scene]),
  );
  const qr = (label: string) =>
    asUser(
      db,
      owner,
      async (tx) =>
        (
          await tx.query<{ token: string }>(`select token from public.create_qr_code($1, $2)`, [
            apt,
            label,
          ])
        ).rows[0]!.token,
    );
  token = await qr('Door');
  revokedToken = await qr('Old');
  const { id: revokedId } = await one(
    db.query<{ id: string }>(`select id from public.qr_codes where token = $1`, [revokedToken]),
  );
  await asUser(db, owner, (tx) => tx.query(`select public.revoke_qr_code($1)`, [revokedId]));
}, 120_000);

describe('guest-experience', () => {
  it('returns the published apartment in the guest schema with a signed scene URL', async () => {
    const res = await handleGuestExperience(get(`t=${token}`), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const text = await res.text();
    // Private storage paths never leave the server.
    expect(text).not.toContain('org/');
    const payload = guestExperienceSchema.parse(JSON.parse(text));
    expect(payload.apartment.name.en).toBe('Flat 12');
    expect(payload.appliances.map((a) => a.name.en)).toEqual(['Living room AC']);
    expect(payload.scene?.url).toMatch(/^https:\/\/storage\.example\/scene-drafts\//);
    expect(payload.support.phone).toBe('+971 4 123 4567');
    expect(signed).toContain(`scene-drafts:${scenePath}`);
  });

  it('answers unknown, malformed, revoked and unpublished alike (uniform 404)', async () => {
    const bodies: string[] = [];
    const answer = async (query: string) => {
      const res = await handleGuestExperience(get(query), deps());
      bodies.push(`${res.status} ${[...res.headers].sort().join('|')} ${await res.text()}`);
    };
    await answer(`t=${'A'.repeat(43)}`);
    await answer('t=short');
    await answer('t=');
    await answer(`t=${revokedToken}`);
    await asUser(db, owner, (tx) => tx.query(`select public.unpublish_apartment($1)`, [apt]));
    await answer(`t=${token}`);
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toMatch(/^404 /);
    // Publish again for the other tests.
    const { id: scene } = await one(
      db.query<{ id: string }>(`select id from public.scene_versions where apartment_id = $1`, [
        apt,
      ]),
    );
    await asUser(db, owner, (tx) =>
      tx.query(`select public.publish_apartment($1, $2)`, [apt, scene]),
    );
    expect((await handleGuestExperience(get(`t=${token}`), deps())).status).toBe(200);
  });

  it('rate-limits per client address, also for wrong tokens (no raw address stored)', async () => {
    const d = deps({ perClient: 3, perToken: 1000 });
    const statuses = [];
    for (let i = 0; i < 5; i++)
      statuses.push(
        (await handleGuestExperience(get(`t=${'B'.repeat(30)}`, `203.0.113.7-${slug('ip')}`), d))
          .status,
      );
    expect(statuses).toEqual([404, 404, 404, 429, 429]);
    const limited = await handleGuestExperience(get(`t=${token}`, `203.0.113.7-${slug('ip')}`), d);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    // Another client is unaffected.
    expect(
      (await handleGuestExperience(get(`t=${token}`, `198.51.100.1-${slug('ip')}`), d)).status,
    ).toBe(200);
    const keys = (
      await db.query<{ key: string }>(`select key from public.guest_rate_limits`)
    ).rows.map((r) => r.key);
    expect(keys.some((k) => k.includes(`203.0.113.7-${slug('ip')}`))).toBe(false);
    expect(keys.every((k) => /^(client|token):[0-9a-f]{64}$/.test(k))).toBe(true);
  });

  it('allows only GET (and the CORS preflight)', async () => {
    const post = new Request(`https://fn.example/guest?t=${token}`, { method: 'POST' });
    expect((await handleGuestExperience(post, deps())).status).toBe(405);
    const pre = new Request('https://fn.example/guest', { method: 'OPTIONS' });
    const res = await handleGuestExperience(pre, deps());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
  });
});

describe('guest-instruction', () => {
  it('returns signed media of a published appliance; other ids get the uniform 404', async () => {
    const res = await handleGuestInstruction(get(`t=${token}&a=${ac}`), deps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      media: { kind: string; url: string; caption?: { en: string } }[];
    };
    expect(body.media).toEqual([
      {
        kind: 'image',
        caption: { en: 'The remote' },
        url: expect.stringMatching(/^https:\/\/storage\.example\/instruction-media\//),
      },
    ]);
    const missing = await handleGuestInstruction(
      get(`t=${token}&a=${crypto.randomUUID()}`),
      deps(),
    );
    const malformed = await handleGuestInstruction(get(`t=${token}&a=x`), deps());
    const unknown = await handleGuestInstruction(get(`t=${'C'.repeat(40)}&a=${ac}`), deps());
    const texts = await Promise.all(
      [missing, malformed, unknown].map(async (r) => `${r.status}${await r.text()}`),
    );
    expect(new Set(texts)).toEqual(new Set(['404{"error":"NOT_FOUND"}']));
  });
});
