/** Stage 10.6: account deletion (sole-owner rule, audit, cascades, handler responses). */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  handleDeleteAccount,
  sqlAccountDb,
  type AccountDeps,
} from '../functions/_shared/account.ts';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const org = async (owner: string, name: string) =>
  (
    await asUser(db, owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.create_organization($1, $2) as id`, [
          name,
          slug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
        ]),
      ),
    )
  ).id;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe('account deletion (10.6)', () => {
  it('blocks the only owner of a company, not a co-owner or a plain member', async () => {
    const sole = await createUser(db, 'del-sole');
    const co = await createUser(db, 'del-co');
    const member = await createUser(db, 'del-member');
    const a = await org(sole, 'Solo Stays');
    const b = await org(co, 'Shared Stays');
    await db.query(
      `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner'), ($3, $4, 'editor')`,
      [b, sole, a, member],
    );
    const s = sqlAccountDb(db);
    expect(await s.blockers(sole)).toEqual(['Solo Stays']); // co-owner of Shared Stays is fine
    expect(await s.blockers(co)).toEqual([]); // sole is also an owner of Shared Stays
    expect(await s.blockers(member)).toEqual([]);
  });

  it('records an audit entry and the cascades keep company data', async () => {
    const owner = await createUser(db, 'del-owner');
    const leaver = await createUser(db, 'del-leaver');
    const company = await org(owner, 'Keep Stays');
    await db.query(
      `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'manager')`,
      [company, leaver],
    );
    const prop = await asUser(db, owner, (tx) =>
      one(
        tx.query<{ id: string }>(
          `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
          [company],
        ),
      ),
    );
    const apt = await asUser(db, owner, (tx) =>
      one(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
          [prop.id],
        ),
      ),
    );
    const scan = await asUser(db, leaver, (tx) =>
      one(
        tx.query<{ id: string }>(
          `insert into public.scan_sessions (apartment_id, method) values ($1, 'guided_capture') returning id`,
          [apt.id],
        ),
      ),
    );
    await sqlAccountDb(db).record(leaver);
    const audit = await db.query<{ organization_id: string }>(
      `select organization_id from public.audit_logs where action = 'account.deleted' and entity_id = $1`,
      [leaver],
    );
    expect(audit.rows.map((r) => r.organization_id)).toEqual([company]);
    // What deleteUser does underneath: remove the auth user.
    await db.query(`delete from auth.users where id = $1`, [leaver]);
    const left = await db.query(`select 1 from public.organization_members where user_id = $1`, [
      leaver,
    ]);
    expect(left.rows).toHaveLength(0);
    const kept = await one(
      db.query<{ created_by: string | null }>(
        `select created_by from public.scan_sessions where id = $1`,
        [scan.id],
      ),
    );
    expect(kept.created_by).toBeNull();
    expect(
      (await db.query(`select 1 from public.organizations where id = $1`, [company])).rows,
    ).toHaveLength(1);
  });

  it('the handler: no session 401, sole owner 409 with names, otherwise records then deletes', async () => {
    const calls: string[] = [];
    const deps = (sole: string[]): AccountDeps => ({
      userFromToken: async (t) => (t === 'valid-token-0123456789' ? 'user-1' : null),
      blockers: async () => sole,
      record: async () => void calls.push('record'),
      deleteUser: vi.fn(async () => void calls.push('delete')),
      allowedOrigins: ['https://dash.example'],
    });
    const post = (auth?: string) =>
      new Request('https://fn.example/delete-account', {
        method: 'POST',
        headers: auth ? { authorization: auth, origin: 'https://dash.example' } : {},
      });
    expect((await handleDeleteAccount(post(), deps([]))).status).toBe(401);
    expect(
      (await handleDeleteAccount(post('Bearer wrong-token-0123456789'), deps([]))).status,
    ).toBe(401);
    const blocked = await handleDeleteAccount(
      post('Bearer valid-token-0123456789'),
      deps(['Solo Stays']),
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: 'SOLE_OWNER', organizations: ['Solo Stays'] });
    expect(calls).toEqual([]);
    const ok = await handleDeleteAccount(post('Bearer valid-token-0123456789'), deps([]));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://dash.example');
    expect(calls).toEqual(['record', 'delete']);
    expect(
      (await handleDeleteAccount(new Request('https://fn.example/x', { method: 'GET' }), deps([])))
        .status,
    ).toBe(405);
  });

  it('a manager who wrote and verified instructions, added media and QR codes can leave; content stays verified', async () => {
    const owner = await createUser(db, 'del-o2');
    const mgr = await createUser(db, 'del-m2');
    const company = await org(owner, 'Content Stays');
    await db.query(
      `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'manager')`,
      [company, mgr],
    );
    const as = <T>(u: string, sql: string, params: unknown[] = []) =>
      asUser(db, u, (tx) => one(tx.query<T>(sql, params)));
    const prop = await as<{ id: string }>(
      owner,
      `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
      [company],
    );
    const apt = await as<{ id: string }>(
      owner,
      `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
      [prop.id],
    );
    const room = await as<{ id: string }>(
      owner,
      `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Living room', 'living') returning id`,
      [apt.id],
    );
    const appl = await as<{ id: string }>(
      mgr,
      `insert into public.appliances (apartment_id, room_id, category_id, name_en)
       select $1, $2, c.id, 'AC' from public.appliance_categories c where c.key = 'air_conditioner' returning id`,
      [apt.id, room.id],
    );
    const ins = await as<{ id: string }>(
      mgr,
      `insert into public.instructions (appliance_id) values ($1) returning id`,
      [appl.id],
    );
    const v = await as<{ id: string }>(
      mgr,
      `insert into public.instruction_versions (instruction_id, locale, version, title, steps) values ($1, 'en', 1, 'Cool', '[{"text":"Press Power"}]') returning id`,
      [ins.id],
    );
    await as(mgr, `select public.verify_instruction_version($1)`, [v.id]);
    await as(
      mgr,
      `insert into public.instruction_media (instruction_id, kind, object_path, size_bytes) values ($1, 'image', $2, 10) returning id`,
      [ins.id, `org/${company}/apartments/${apt.id}/instructions/${ins.id}/remote.jpg`],
    );
    await as(mgr, `select token from public.create_qr_code($1, 'Door')`, [apt.id]);
    // A client cannot clear the verifier directly (depth 1): still verified BY someone.
    expect(
      await expectError(
        asUser(db, owner, (tx) =>
          tx.query(`update public.instruction_versions set verified_by = null where id = $1`, [
            v.id,
          ]),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      (
        await one(
          db.query<{ verified_by: string }>(
            `select verified_by from public.instruction_versions where id = $1`,
            [v.id],
          ),
        )
      ).verified_by,
    ).toBe(mgr);

    await db.query(`delete from auth.users where id = $1`, [mgr]);
    const after = await one(
      db.query<{
        verification_status: string;
        verified_by: string | null;
        created_by: string | null;
      }>(
        `select verification_status::text, verified_by, created_by from public.instruction_versions where id = $1`,
        [v.id],
      ),
    );
    expect(after).toEqual({ verification_status: 'verified', verified_by: null, created_by: null });
    expect(
      (await db.query(`select 1 from public.instruction_media where instruction_id = $1`, [ins.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select 1 from public.qr_codes where apartment_id = $1 and created_by is null`,
          [apt.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
});
