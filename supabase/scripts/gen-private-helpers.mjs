/**
 * One-off generator for migration 20261120000400_private_helpers.sql (kept for auditability).
 * Moves internal SECURITY DEFINER helpers out of the API-exposed `public` schema and rewrites every
 * function body that calls them. Reads definitions from the LOCAL stack inside a rolled-back
 * transaction; prints SQL to stdout.
 */
import pg from 'pg';

const HELPERS = [
  'is_org_member(uuid)',
  'org_role_of(uuid)',
  'has_org_permission(uuid, text)',
  'has_property_permission(uuid, uuid, text)',
  'can_access_property(uuid, text)',
  'can_access_apartment(uuid, text)',
  'can_access_scan_session(uuid, text)',
  'shares_org_with(uuid)',
  'is_platform_admin()',
  'storage_path_apartment(text)',
  'can_upload_raw_footage(text)',
  'can_read_raw_footage(text)',
  'can_access_storage_apartment(text, text)',
  'generate_token()',
];
const names = HELPERS.map((h) => h.slice(0, h.indexOf('(')));

const client = new pg.Client(
  process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56522/postgres',
);
await client.connect();
const out = [];
try {
  await client.query('begin');
  await client.query('create schema private');
  for (const h of HELPERS) await client.query(`alter function public.${h} set schema private`);
  const { rows } = await client.query(`
    select n.nspname, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
    order by n.nspname desc, p.proname`);
  const re = new RegExp(`public\\.(${names.join('|')})\\(`, 'g');
  for (const r of rows) {
    if (!re.test(r.def)) continue;
    re.lastIndex = 0;
    out.push(`${r.def.replace(re, 'private.$1(').trimEnd()};\n`);
  }
} finally {
  await client.query('rollback');
  await client.end();
}

process.stdout.write(
  [
    ...HELPERS.map((h) => `alter function public.${h} set schema private;`),
    '',
    '-- Function bodies that call the moved helpers (generated from pg_get_functiondef).',
    ...out,
  ].join('\n'),
);
