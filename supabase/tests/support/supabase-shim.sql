-- =====================================================================================
-- TEST-ONLY shim that reproduces the parts of a Supabase database our migrations depend on,
-- so migrations and RLS can be tested in PGlite (in-process Postgres) without Docker.
-- NOT a migration. Never applied to a real Supabase project (which already has these).
-- Mirrors: auth.users, auth.uid(), auth.jwt(), roles anon/authenticated/service_role and
-- Supabase's default privileges (which grant ALL on new public tables to the API roles,
-- so our migrations must explicitly revoke what they do not want exposed).
-- Limitations documented in docs/KNOWN_ISSUES.md (KI-002).
-- =====================================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub'),
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
