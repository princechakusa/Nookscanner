import { ORG_ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '@nookscanner/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, migrationFiles, runId, type TestDb } from './support/db.ts';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

describe('migrations', () => {
  it('are named with a sortable timestamp prefix', () => {
    for (const file of migrationFiles()) expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it('enable RLS on every table in the public schema', async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('grant no table privileges to anon', async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
    `);
    expect(rows).toEqual([]);
  });

  it('pin search_path on every SECURITY DEFINER function in public and private', async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    `);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('seed the permission catalog identically to packages/shared', async () => {
    const perms = await db.query<{ key: string; level: string }>(
      'select key, level from public.permissions order by key',
    );
    expect(Object.fromEntries(perms.rows.map((r) => [r.key, r.level]))).toEqual(PERMISSIONS);

    const { rows } = await db.query<{ role: string; permission: string }>(
      'select role::text, permission from public.role_permissions',
    );
    for (const role of ORG_ROLES) {
      const fromDb = rows
        .filter((r) => r.role === role)
        .map((r) => r.permission)
        .sort();
      expect(fromDb, `role ${role}`).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });

  it('expose only the intended RPCs as SECURITY DEFINER functions in public (API surface)', async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('authenticated', p.oid, 'execute')
      order by 1
    `);
    expect(rows.map((r) => r.proname)).toEqual([
      'accept_invitation',
      'complete_media_upload_part',
      'create_invitation',
      'create_organization',
      'create_qr_code',
      'register_media_upload',
      'revoke_invitation',
      'revoke_qr_code',
    ]);
  });

  it('keep internal helpers in the non-exposed private schema, unusable by anon', async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(`
      select has_schema_privilege('anon', 'private', 'usage') as anon,
             has_schema_privilege('authenticated', 'private', 'usage') as authenticated
    `);
    expect(rows[0]).toEqual({ anon: false, authenticated: true });
  });

  it('create a profile automatically for new auth users', async () => {
    const id = crypto.randomUUID();
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      `profile-check-${runId}@example.test`,
      JSON.stringify({ full_name: 'Profile Check' }),
    ]);
    const { rows } = await db.query<{ full_name: string; is_platform_admin: boolean }>(
      'select full_name, is_platform_admin from public.profiles where id = $1',
      [id],
    );
    expect(rows).toEqual([{ full_name: 'Profile Check', is_platform_admin: false }]);
  });
});
