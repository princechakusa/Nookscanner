/** Stage 8.3: instructions with append-only EN/AR versions and media rows. */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'editor' | 'viewer' | 'ownerB', string>;
let org: string;
let apartment: string;
let room: string;
let category: string;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const id = async (p: Promise<{ rows: { id: string }[] }>) => (await one(p)).id;
const STEPS = JSON.stringify([
  { text: 'Press **Power** on the remote.' },
  { text: 'Choose Cool.' },
]);

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'editor', 'viewer', 'ownerB'] as const)
    u[k] = await createUser(db, `in-${k}`);
  org = await asUser(db, u.owner, (tx) =>
    id(tx.query(`select public.create_organization('In', $1) as id`, [slug('in')])),
  );
  await asUser(db, u.ownerB, (tx) =>
    tx.query(`select public.create_organization('InB', $1)`, [slug('inb')]),
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'editor'), ($1, $3, 'viewer')`,
    [org, u.editor, u.viewer],
  );
  const prop = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
        [org],
      ),
    ),
  );
  apartment = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(`insert into public.apartments (property_id, name) values ($1, 'A') returning id`, [
        prop,
      ]),
    ),
  );
  room = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Living room', 'living') returning id`,
        [apartment],
      ),
    ),
  );
  category = await id(
    db.query(`select id from public.appliance_categories where key = 'air_conditioner'`),
  );
}, 120_000);

const appliance = () =>
  asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.appliances (apartment_id, room_id, category_id, name_en) values ($1, $2, $3, $4) returning id`,
        [apartment, room, category, slug('AC')],
      ),
    ),
  );
const instruction = (user: string, appl: string) =>
  asUser(db, user, (tx) =>
    id(tx.query(`insert into public.instructions (appliance_id) values ($1) returning id`, [appl])),
  );
const version = (user: string, ins: string, locale: 'en' | 'ar', steps = STEPS, trouble = '[]') =>
  asUser(db, user, (tx) =>
    one(
      tx.query<{
        version: number;
        verification_status: string;
        created_by: string;
        organization_id: string;
      }>(
        `insert into public.instruction_versions (instruction_id, locale, title, steps, troubleshooting, version, verification_status)
         values ($1, $2, 'Cooling', $3, $4, 99, 'verified')
         returning version, verification_status::text, created_by, organization_id`,
        [ins, locale, steps, trouble],
      ),
    ),
  );

describe('instructions', () => {
  it('editors add versions; each save is the next version per language and starts unverified', async () => {
    const ins = await instruction(u.editor, await appliance());
    const v1 = await version(u.editor, ins, 'en');
    const v2 = await version(u.editor, ins, 'en');
    const ar1 = await version(u.owner, ins, 'ar');
    // Client-supplied version numbers and verification are ignored.
    expect([v1.version, v2.version, ar1.version]).toEqual([1, 2, 1]);
    expect(v2).toMatchObject({
      verification_status: 'unverified',
      created_by: u.editor,
      organization_id: org,
    });
  });

  it('versions are append-only: no edits, no deletes, not even by the owner', async () => {
    const ins = await instruction(u.owner, await appliance());
    await version(u.owner, ins, 'en');
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(`update public.instruction_versions set title = 'x' where instruction_id = $1`, [
            ins,
          ]),
        ),
      ),
    ).toMatch(/permission denied/);
    // Even with table rights (platform side) the trigger refuses edits outside verification.
    expect(
      await expectError(
        db.query(`update public.instruction_versions set title = 'x' where instruction_id = $1`, [
          ins,
        ]),
      ),
    ).toMatch(/IMMUTABLE_VERSION/);
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(`delete from public.instruction_versions where instruction_id = $1`, [ins]),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it('validates steps and troubleshooting shapes', async () => {
    const ins = await instruction(u.owner, await appliance());
    for (const [steps, trouble] of [
      ['[]', '[]'],
      ['[{"text":""}]', '[]'],
      ['["plain string"]', '[]'],
      [JSON.stringify([{ text: 'x'.repeat(1001) }]), '[]'],
      [STEPS, '[{"problem":"No cold air"}]'],
    ]) {
      expect(await expectError(version(u.owner, ins, 'en', steps, trouble))).toMatch(
        /VALIDATION_FAILED|check constraint/,
      );
    }
  });

  it('viewers and other organizations cannot write; other organizations cannot read', async () => {
    const appl = await appliance();
    expect(await expectError(instruction(u.viewer, appl))).toMatch(/row-level security/);
    expect(await expectError(instruction(u.ownerB, appl))).toMatch(/row-level security/);
    const ins = await instruction(u.owner, appl);
    await version(u.owner, ins, 'en');
    expect(await expectError(version(u.viewer, ins, 'en'))).toMatch(/row-level security/);
    expect(await expectError(version(u.ownerB, ins, 'en'))).toMatch(/row-level security/);
    const seen = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query(`select 1 from public.instruction_versions where instruction_id = $1`, [
              ins,
            ])
          ).rows.length,
      );
    expect(await seen(u.viewer)).toBe(1);
    expect(await seen(u.ownerB)).toBe(0);
    // One instruction per appliance.
    expect(await expectError(instruction(u.owner, appl))).toMatch(/duplicate key/);
  });

  it('media rows must point into the instruction folder and match their kind', async () => {
    const appl = await appliance();
    const ins = await instruction(u.owner, appl);
    const base = `org/${org}/apartments/${apartment}/instructions/${ins}`;
    const media = (path: string, kind = 'image') =>
      asUser(db, u.editor, (tx) =>
        tx.query(
          `insert into public.instruction_media (instruction_id, kind, object_path, size_bytes) values ($1, $2, $3, 1000)`,
          [ins, kind, path],
        ),
      );
    await media(`${base}/remote.jpg`);
    await media(`${base}/how-to.mp4`, 'video');
    for (const [path, kind] of [
      [`${base}/../../x.jpg`, 'image'],
      [`org/${org}/apartments/${apartment}/instructions/${crypto.randomUUID()}/a.jpg`, 'image'],
      [`${base}/script.svg`, 'image'],
      [`${base}/clip.mp4`, 'image'],
    ]) {
      expect(await expectError(media(path!, kind))).toMatch(
        /object path not allowed|VALIDATION_FAILED/,
      );
    }
    expect(
      await expectError(
        asUser(db, u.viewer, (tx) =>
          tx.query(
            `insert into public.instruction_media (instruction_id, kind, object_path, size_bytes) values ($1, 'image', $2, 10)`,
            [ins, `${base}/v.jpg`],
          ),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it('deleting the appliance removes its instruction, versions and media rows', async () => {
    const appl = await appliance();
    const ins = await instruction(u.owner, appl);
    await version(u.owner, ins, 'en');
    await asUser(db, u.owner, (tx) =>
      tx.query(`delete from public.appliances where id = $1`, [appl]),
    );
    expect(
      (await db.query(`select 1 from public.instruction_versions where instruction_id = $1`, [ins]))
        .rows,
    ).toHaveLength(0);
  });
});

describe('verification (8.4)', () => {
  const latestId = (ins: string, locale: string) =>
    id(
      db.query(
        `select id from public.instruction_versions where instruction_id = $1 and locale = $2 order by version desc limit 1`,
        [ins, locale],
      ),
    );
  const verify = (user: string, version: string) =>
    asUser(db, user, (tx) => tx.query(`select public.verify_instruction_version($1)`, [version]));
  const status = async (version: string) =>
    await one(
      db.query<{ verification_status: string; verified_by: string | null }>(
        `select verification_status::text, verified_by from public.instruction_versions where id = $1`,
        [version],
      ),
    );

  it('managers verify the latest version; a new edit is a new unverified version', async () => {
    const ins = await instruction(u.owner, await appliance());
    await version(u.editor, ins, 'en');
    const v1 = await latestId(ins, 'en');
    await verify(u.owner, v1);
    expect(await status(v1)).toEqual({ verification_status: 'verified', verified_by: u.owner });
    await version(u.editor, ins, 'en');
    const v2 = await latestId(ins, 'en');
    expect((await status(v2)).verification_status).toBe('unverified');
    // The old version is superseded and can no longer be verified again.
    expect(await expectError(verify(u.owner, v1))).toMatch(/SUPERSEDED/);
  });

  it('editors, viewers and other organizations cannot verify', async () => {
    const ins = await instruction(u.owner, await appliance());
    await version(u.owner, ins, 'ar');
    const v = await latestId(ins, 'ar');
    for (const user of [u.editor, u.viewer, u.ownerB]) {
      expect(await expectError(verify(user, v))).toMatch(/NOT_FOUND/);
    }
    expect((await status(v)).verification_status).toBe('unverified');
  });

  it('the verification flag cannot be used to edit content, even when set by hand', async () => {
    const ins = await instruction(u.owner, await appliance());
    await version(u.owner, ins, 'en');
    const v = await latestId(ins, 'en');
    await db.query(`select set_config('nookscanner.verifying', 'on', false)`);
    expect(
      await expectError(
        db.query(`update public.instruction_versions set title = 'changed' where id = $1`, [v]),
      ),
    ).toMatch(/IMMUTABLE_VERSION/);
    await db.query(`select set_config('nookscanner.verifying', '', false)`);
  });
});
