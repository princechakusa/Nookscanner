-- =====================================================================================
-- Nookscanner Stage 2.2: tables needed before Phase 5.
-- Spec: docs/DATABASE_SCHEMA.md 4.6, 4.10-4.12, 4.25; threats T01-T04, T06, T07, T19.
-- Creates: organization_invitations, qr_codes, scan_sessions, scan_checkpoints,
-- media_uploads; RPCs create_invitation, accept_invitation, revoke_invitation,
-- create_qr_code, revoke_qr_code, register_media_upload.
-- Secrets (QR tokens, invitation tokens) are generated server-side only; invitation tokens
-- are stored as SHA-256 hashes; neither ever reaches audit_logs.
-- =====================================================================================

-- ---------- Enum types ---------------------------------------------------------------
create type public.capture_method as enum ('guided_capture', 'video_upload');
create type public.scan_status as enum (
  'draft', 'recording', 'uploading', 'uploaded', 'submitted', 'processing', 'succeeded',
  'failed', 'cancelled'
);
create type public.upload_status as enum (
  'pending', 'uploaded', 'validating', 'validated', 'rejected', 'deleted'
);
create type public.qr_status as enum ('active', 'revoked');

-- ---------- Random token helper ---------------------------------------------------------
-- 32 bytes from two v4 UUIDs (gen_random_uuid uses the server CSPRNG): 244 random bits,
-- base64url without padding (43 chars). Avoids a pgcrypto dependency (available on Supabase,
-- not in PGlite) while exceeding the 128-bit minimum in ADR-012.
create function public.generate_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
    rtrim(
      encode(
        decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'),
        'base64'
      ),
      '='
    ),
    '+/',
    '-_'
  );
$$;

-- ---------- Organization invitations (4.6) ----------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  -- Ownership is never granted by invitation (ownership transfer is a separate owner action).
  role public.org_role not null check (role <> 'owner'),
  scope public.member_scope not null default 'organization',
  property_ids uuid[] not null default '{}',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_scoped_roles
    check (scope = 'organization' or role in ('manager', 'editor', 'viewer')),
  constraint organization_invitations_scope_properties
    check ((scope = 'properties') = (cardinality(property_ids) > 0))
);

create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create unique index organization_invitations_one_open_per_email
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function public.set_updated_at();

-- ---------- QR codes (4.25) -------------------------------------------------------------
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22,64}$'),
  label text check (label is null or char_length(label) <= 80),
  status public.qr_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_codes_revocation_consistent check ((status = 'revoked') = (revoked_at is not null))
);

create index qr_codes_apartment_idx on public.qr_codes (apartment_id);
create index qr_codes_organization_idx on public.qr_codes (organization_id);

create trigger qr_codes_set_updated_at before update on public.qr_codes
  for each row execute function public.set_updated_at();
create trigger qr_codes_prevent_org_change before update on public.qr_codes
  for each row execute function public.prevent_org_change();

-- ---------- Scan sessions (4.10) --------------------------------------------------------
create table public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  method public.capture_method not null,
  status public.scan_status not null default 'draft',
  checkpoint_plan jsonb not null default '[]'::jsonb check (jsonb_typeof(checkpoint_plan) = 'array'),
  -- Model, OS, app version only. Never location (privacy, docs/SECURITY.md).
  device_info jsonb not null default '{}'::jsonb check (
    jsonb_typeof(device_info) = 'object'
    and not (device_info ?| array['location', 'latitude', 'longitude', 'gps'])
  ),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scan_sessions_apartment_created_idx on public.scan_sessions (apartment_id, created_at desc);
create index scan_sessions_organization_idx on public.scan_sessions (organization_id);

create trigger scan_sessions_set_updated_at before update on public.scan_sessions
  for each row execute function public.set_updated_at();
create trigger scan_sessions_prevent_org_change before update on public.scan_sessions
  for each row execute function public.prevent_org_change();

-- ---------- Scan checkpoints (4.11) -----------------------------------------------------
create table public.scan_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scan_session_id uuid not null references public.scan_sessions (id) on delete cascade,
  sequence integer not null check (sequence between 0 and 999),
  label_en text not null check (char_length(btrim(label_en)) between 1 and 80),
  label_ar text check (label_ar is null or char_length(label_ar) <= 80),
  room_type public.room_type not null,
  room_id uuid references public.rooms (id) on delete set null,
  media_upload_id uuid,
  start_ms integer check (start_ms is null or start_ms >= 0),
  end_ms integer check (end_ms is null or end_ms >= 0),
  quality jsonb not null default '{}'::jsonb check (jsonb_typeof(quality) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'recorded', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_session_id, sequence),
  constraint scan_checkpoints_time_order check (start_ms is null or end_ms is null or end_ms >= start_ms)
);

create index scan_checkpoints_organization_idx on public.scan_checkpoints (organization_id);

create trigger scan_checkpoints_set_updated_at before update on public.scan_checkpoints
  for each row execute function public.set_updated_at();
create trigger scan_checkpoints_prevent_org_change before update on public.scan_checkpoints
  for each row execute function public.prevent_org_change();

-- ---------- Media uploads (4.12) --------------------------------------------------------
create table public.media_uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scan_session_id uuid not null references public.scan_sessions (id) on delete cascade,
  bucket text not null default 'raw-footage' check (bucket = 'raw-footage'),
  object_path text not null unique check (char_length(object_path) <= 512),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in ('video/mp4', 'video/quicktime')),
  -- 10 GiB pilot limit, mirrored in packages/shared UPLOAD_LIMITS.maxBytes.
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10737418240),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  fps numeric(6, 2) check (fps is null or fps > 0),
  codec text check (codec is null or char_length(codec) <= 40),
  status public.upload_status not null default 'pending',
  validation_report jsonb check (validation_report is null or jsonb_typeof(validation_report) = 'object'),
  retain_until timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_uploads_scan_session_idx on public.media_uploads (scan_session_id);
create index media_uploads_status_idx on public.media_uploads (status);
create index media_uploads_organization_idx on public.media_uploads (organization_id);

alter table public.scan_checkpoints
  add constraint scan_checkpoints_media_upload_fk
  foreign key (media_upload_id) references public.media_uploads (id) on delete set null;

create trigger media_uploads_set_updated_at before update on public.media_uploads
  for each row execute function public.set_updated_at();
create trigger media_uploads_prevent_org_change before update on public.media_uploads
  for each row execute function public.prevent_org_change();

-- ---------- Parent/tenant consistency (extends the foundation trigger, threat T03) -------
create or replace function public.enforce_parent_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_org uuid;
begin
  if tg_table_name in ('apartments', 'property_members') then
    select p.organization_id into v_parent_org from public.properties p where p.id = new.property_id;
  elsif tg_table_name in ('rooms', 'scan_sessions', 'qr_codes') then
    select a.organization_id into v_parent_org from public.apartments a where a.id = new.apartment_id;
  elsif tg_table_name in ('scan_checkpoints', 'media_uploads') then
    select s.organization_id into v_parent_org from public.scan_sessions s where s.id = new.scan_session_id;
  else
    raise exception 'enforce_parent_org not configured for %', tg_table_name;
  end if;

  if v_parent_org is null then
    raise exception 'parent row not found' using errcode = '23503';
  end if;
  if new.organization_id is null then
    new.organization_id := v_parent_org;
  elsif new.organization_id <> v_parent_org then
    raise exception 'organization mismatch with parent row' using errcode = '42501';
  end if;

  if tg_table_name = 'property_members' then
    -- Nested IF: new.user_id only exists on property_members rows.
    if not exists (
      select 1 from public.organization_members m
      where m.organization_id = new.organization_id and m.user_id = new.user_id
    ) then
      raise exception 'user is not a member of the organization' using errcode = '23503';
    end if;
  elsif tg_table_name = 'scan_checkpoints' then
    -- A checkpoint's room must belong to the scanned apartment.
    if new.room_id is not null and not exists (
      select 1 from public.rooms r join public.scan_sessions s on s.apartment_id = r.apartment_id
      where r.id = new.room_id and s.id = new.scan_session_id
    ) then
      raise exception 'room does not belong to the scanned apartment' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger qr_codes_enforce_parent_org before insert or update of apartment_id, organization_id
  on public.qr_codes for each row execute function public.enforce_parent_org();
create trigger scan_sessions_enforce_parent_org before insert or update of apartment_id, organization_id
  on public.scan_sessions for each row execute function public.enforce_parent_org();
create trigger scan_checkpoints_enforce_parent_org before insert or update of scan_session_id, organization_id, room_id
  on public.scan_checkpoints for each row execute function public.enforce_parent_org();
create trigger media_uploads_enforce_parent_org before insert or update of scan_session_id, organization_id
  on public.media_uploads for each row execute function public.enforce_parent_org();

-- Immutable columns on scan sessions and uploads (prevent re-parenting or path tampering).
create function public.protect_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'scan_sessions' then
    if new.apartment_id <> old.apartment_id or new.method <> old.method
       or new.created_by is distinct from old.created_by then
      raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
    end if;
  elsif tg_table_name = 'media_uploads' then
    if new.scan_session_id <> old.scan_session_id or new.object_path <> old.object_path
       or new.bucket <> old.bucket or new.created_by is distinct from old.created_by then
      raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger scan_sessions_protect_immutable before update on public.scan_sessions
  for each row execute function public.protect_immutable_columns();
create trigger media_uploads_protect_immutable before update on public.media_uploads
  for each row execute function public.protect_immutable_columns();

-- ---------- Audit (extends the foundation trigger; strips secrets, threat T19) ----------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_org uuid;
  v_entity text;
begin
  -- Token material never enters the audit log.
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - 'token' - 'token_hash'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new) - 'token' - 'token_hash'; end if;

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  else
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  end if;

  v_entity := coalesce(
    v_new ->> 'id', v_old ->> 'id',
    concat_ws(':', coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id', v_new ->> 'property_id', v_old ->> 'property_id'),
                   coalesce(v_new ->> 'user_id', v_old ->> 'user_id'))
  );

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, old_data, new_data)
  values (v_org, (select auth.uid()), lower(tg_op), tg_table_name, v_entity, v_old, v_new);

  return coalesce(new, old);
end;
$$;

create trigger organization_invitations_audit after insert or update or delete on public.organization_invitations
  for each row execute function public.audit_trigger();
create trigger qr_codes_audit after insert or update or delete on public.qr_codes
  for each row execute function public.audit_trigger();
create trigger scan_sessions_audit after insert or update or delete on public.scan_sessions
  for each row execute function public.audit_trigger();
create trigger media_uploads_audit after insert or update or delete on public.media_uploads
  for each row execute function public.audit_trigger();

-- ---------- RPC: invitations ------------------------------------------------------------
-- Returns the plaintext token exactly once; only its SHA-256 is stored. The caller (an Edge
-- Function in Phase 4) emails the link; the token is never logged.
create function public.create_invitation(
  p_org uuid,
  p_email text,
  p_role public.org_role,
  p_scope public.member_scope default 'organization',
  p_property_ids uuid[] default '{}'
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := public.generate_token();
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not public.has_org_permission(p_org, 'member.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'OWNER_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_property_ids, '{}')) as pid
    where not exists (select 1 from public.properties p where p.id = pid and p.organization_id = p_org)
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.organization_members m join auth.users u on u.id = m.user_id
    where m.organization_id = p_org and lower(u.email) = lower(btrim(p_email))
  ) then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  insert into public.organization_invitations (organization_id, email, role, scope, property_ids, token_hash, invited_by)
  values (p_org, lower(btrim(p_email)), p_role, p_scope, coalesce(p_property_ids, '{}'),
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), (select auth.uid()))
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv public.organization_invitations;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22,64}$' then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_inv from public.organization_invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  -- Uniform NOT_FOUND for unknown, used, revoked or expired tokens (no oracle).
  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.revoked_at is not null
     or v_inv.expires_at <= now() then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  if v_email is distinct from v_inv.email then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, role, scope, invited_by)
  values (v_inv.organization_id, v_user, v_inv.role, v_inv.scope, v_inv.invited_by)
  on conflict (organization_id, user_id) do nothing;

  if v_inv.scope = 'properties' then
    insert into public.property_members (property_id, user_id, organization_id)
    select pid, v_user, v_inv.organization_id
    from unnest(v_inv.property_ids) as pid
    where exists (select 1 from public.properties p where p.id = pid and p.organization_id = v_inv.organization_id)
    on conflict do nothing;
  end if;

  update public.organization_invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

create function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select i.organization_id into v_org from public.organization_invitations i where i.id = p_invitation;
  if v_org is null or not public.has_org_permission(v_org, 'member.manage') then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.organization_invitations
  set revoked_at = now()
  where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

-- ---------- RPC: QR codes ---------------------------------------------------------------
create function public.create_qr_code(p_apartment uuid, p_label text default null)
returns public.qr_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.qr_codes;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not coalesce(public.can_access_apartment(p_apartment, 'qr.manage'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.qr_codes (apartment_id, token, label, created_by)
  values (p_apartment, public.generate_token(), nullif(btrim(p_label), ''), (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.revoke_qr_code(p_qr uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apartment uuid;
begin
  select q.apartment_id into v_apartment from public.qr_codes q where q.id = p_qr;
  if v_apartment is null or not coalesce(public.can_access_apartment(v_apartment, 'qr.manage'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.qr_codes
  set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid())
  where id = p_qr and status = 'active';
end;
$$;

-- ---------- RPC: register a media upload ------------------------------------------------
-- The only way to create a media_uploads row. Builds the storage path server-side
-- (org/<org>/scans/<session>/<upload>.<ext>, same as packages/shared rawFootagePath); the
-- raw-footage storage policy only accepts objects with a matching pending row.
create function public.register_media_upload(
  p_scan_session uuid,
  p_filename text,
  p_mime text,
  p_size_bytes bigint
)
returns public.media_uploads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.scan_sessions;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_row public.media_uploads;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_session from public.scan_sessions s where s.id = p_scan_session;
  if v_session.id is null or not coalesce(public.can_access_apartment(v_session.apartment_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status not in ('draft', 'recording', 'uploading') then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;

  v_ext := case lower(p_mime) when 'video/mp4' then '.mp4' when 'video/quicktime' then '.mov' end;
  if v_ext is null then
    raise exception 'UPLOAD_REJECTED' using errcode = '22023';
  end if;

  insert into public.media_uploads (id, organization_id, scan_session_id, object_path, original_filename,
                                    mime_type, size_bytes, created_by)
  values (v_id, v_session.organization_id, v_session.id,
          'org/' || v_session.organization_id || '/scans/' || v_session.id || '/' || v_id || v_ext,
          left(btrim(p_filename), 255), lower(p_mime), p_size_bytes, (select auth.uid()))
  returning * into v_row;

  update public.scan_sessions set status = 'uploading' where id = v_session.id and status = 'draft';
  return v_row;
end;
$$;

-- ---------- Row Level Security ---------------------------------------------------------
alter table public.organization_invitations enable row level security;
alter table public.qr_codes enable row level security;
alter table public.scan_sessions enable row level security;
alter table public.scan_checkpoints enable row level security;
alter table public.media_uploads enable row level security;

-- invitations: read by member managers; all writes through RPCs.
create policy invitations_select on public.organization_invitations for select to authenticated
  using (public.has_org_permission(organization_id, 'member.manage'));

-- qr_codes: read with qr.manage; writes through RPCs (token always server-generated).
create policy qr_codes_select on public.qr_codes for select to authenticated
  using (public.can_access_apartment(apartment_id, 'qr.manage'));
create policy qr_codes_update_label on public.qr_codes for update to authenticated
  using (public.can_access_apartment(apartment_id, 'qr.manage'))
  with check (public.can_access_apartment(apartment_id, 'qr.manage'));

-- scan_sessions
create policy scan_sessions_select on public.scan_sessions for select to authenticated
  using (public.can_access_apartment(apartment_id, 'scan.read'));
create policy scan_sessions_insert on public.scan_sessions for insert to authenticated
  with check (
    public.can_access_apartment(apartment_id, 'scan.create')
    and created_by = (select auth.uid())
    and status = 'draft'
  );
create policy scan_sessions_update on public.scan_sessions for update to authenticated
  using (public.can_access_apartment(apartment_id, 'scan.create'))
  with check (
    public.can_access_apartment(apartment_id, 'scan.create')
    -- Members may only move a session through capture states; processing states are set by
    -- the platform (service role) in Phase 6.
    and status in ('draft', 'recording', 'uploading', 'uploaded', 'submitted', 'cancelled')
  );
create policy scan_sessions_delete on public.scan_sessions for delete to authenticated
  using (public.can_access_apartment(apartment_id, 'scan.create') and status in ('draft', 'cancelled'));

-- scan_checkpoints (through the session's apartment)
create function public.can_access_scan_session(p_session uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.can_access_apartment(s.apartment_id, p_permission)
     from public.scan_sessions s where s.id = p_session),
    false
  );
$$;

create policy scan_checkpoints_select on public.scan_checkpoints for select to authenticated
  using (public.can_access_scan_session(scan_session_id, 'scan.read'));
create policy scan_checkpoints_insert on public.scan_checkpoints for insert to authenticated
  with check (public.can_access_scan_session(scan_session_id, 'scan.create'));
create policy scan_checkpoints_update on public.scan_checkpoints for update to authenticated
  using (public.can_access_scan_session(scan_session_id, 'scan.create'))
  with check (public.can_access_scan_session(scan_session_id, 'scan.create'));
create policy scan_checkpoints_delete on public.scan_checkpoints for delete to authenticated
  using (public.can_access_scan_session(scan_session_id, 'scan.create'));

-- media_uploads: read only; created by register_media_upload; status changed by the platform.
create policy media_uploads_select on public.media_uploads for select to authenticated
  using (public.can_access_scan_session(scan_session_id, 'scan.read'));

-- ---------- Privileges -----------------------------------------------------------------
revoke all on table
  public.organization_invitations, public.qr_codes, public.scan_sessions,
  public.scan_checkpoints, public.media_uploads
from anon, authenticated;

grant select on public.organization_invitations to authenticated;
grant select, update (label) on public.qr_codes to authenticated;
grant select, insert, update, delete on public.scan_sessions to authenticated;
grant select, insert, update, delete on public.scan_checkpoints to authenticated;
grant select on public.media_uploads to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_invitation(uuid, text, public.org_role, public.member_scope, uuid[]),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.create_qr_code(uuid, text),
  public.revoke_qr_code(uuid),
  public.register_media_upload(uuid, text, text, bigint),
  public.can_access_scan_session(uuid, text)
to authenticated;
