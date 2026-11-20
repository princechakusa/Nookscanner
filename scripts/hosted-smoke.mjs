/**
 * Read-only security smoke test against a hosted Supabase project, as an ANONYMOUS caller.
 * Uses only public values (project URL + publishable key) from apps/dashboard/.env.local or the
 * environment. It creates nothing: no sign-ups, no uploads that could succeed, no writes.
 * Usage: node scripts/hosted-smoke.mjs   (exit code 1 if any check fails)
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync('apps/dashboard/.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch {
    // fall back to process.env only
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}
if (key.startsWith('sb_secret_')) {
  console.error('Refusing to run with a secret key; this test must run as anon.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const TABLES = [
  'profiles',
  'permissions',
  'role_permissions',
  'organizations',
  'organization_members',
  'property_members',
  'properties',
  'apartments',
  'rooms',
  'audit_logs',
  'organization_invitations',
  'qr_codes',
  'scan_sessions',
  'scan_checkpoints',
  'media_uploads',
  'media_upload_parts',
  'processing_jobs',
  'processing_results',
];
for (const t of TABLES) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  check(
    `anon cannot read ${t}`,
    Boolean(error) || (data ?? []).length === 0,
    error?.code ?? `rows=${data?.length}`,
  );
}

for (const [fn, args] of [
  ['create_organization', { p_name: 'x', p_slug: 'anon-probe' }],
  ['accept_invitation', { p_token: 'A'.repeat(43) }],
  ['create_qr_code', { p_apartment: '00000000-0000-0000-0000-000000000000' }],
  ['submit_scan_for_processing', { p_session: '00000000-0000-0000-0000-000000000000' }],
]) {
  const { error } = await sb.rpc(fn, args);
  check(`anon cannot call ${fn}`, Boolean(error), error?.code ?? 'no error');
}

// Internal helpers must not be reachable through the API at all (migration 0400).
for (const fn of [
  'apply_job_event',
  'claim_processing_jobs',
  'shares_org_with',
  'is_org_member',
  'storage_path_apartment',
  'has_org_permission',
]) {
  const { error } = await sb.rpc(fn, {});
  check(
    `helper ${fn} not exposed`,
    Boolean(error) && /PGRST202|42883|404/.test(`${error.code} ${error.message}`),
    error?.code ?? 'no error',
  );
}

for (const bucket of ['raw-footage', 'scene-masters', 'scene-drafts', 'instruction-media']) {
  const { data } = await sb.storage.from(bucket).list('org', { limit: 1 });
  check(`anon cannot list ${bucket}`, (data ?? []).length === 0, `items=${data?.length ?? 0}`);
}
const up = await sb.storage
  .from('published-assets')
  .upload(`anon-probe-${Date.now()}.txt`, new Blob(['x']), { contentType: 'text/plain' });
check(
  'anon cannot upload to published-assets',
  Boolean(up.error),
  up.error?.message ?? 'UPLOADED (bad)',
);

const signIn = await sb.auth.signInWithPassword({
  email: `no-such-user-${Date.now()}@example.invalid`,
  password: 'Wrong-Passw0rd-x',
});
check(
  'unknown account gets invalid_credentials (no enumeration)',
  signIn.error?.code === 'invalid_credentials',
  signIn.error?.code ?? 'signed in?!',
);

const settings = await (
  await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
).json();
check(
  'email confirmation required (mailer_autoconfirm=false)',
  settings.mailer_autoconfirm === false,
  `mailer_autoconfirm=${settings.mailer_autoconfirm}`,
);
check(
  'email sign-up enabled',
  settings.external?.email === true && settings.disable_signup === false,
  `email=${settings.external?.email} disable_signup=${settings.disable_signup}`,
);

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
}
console.log(`\n${results.length - failed}/${results.length} passed against ${new URL(url).host}`);
process.exit(failed ? 1 : 0);
