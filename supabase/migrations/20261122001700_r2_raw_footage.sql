-- =====================================================================================
-- Nookscanner Stage 5.7: raw footage on Cloudflare R2 (ADR-024, ADR-025).
-- Parts stay as they are (server-built paths, <= 45 MiB each, ADR-016). Each upload now records
-- its storage backend, taken from a platform setting at registration ('supabase' by default;
-- the hosted project switches to 'r2' once the upload Worker is live). For R2 parts the Worker
-- (no Supabase service key) asks, WITH THE USER'S SESSION, where a part goes (r2_part_target),
-- stores it in R2 and completes it with an HMAC receipt (complete_media_upload_part_r2). The
-- receipt secret lives in private.platform_secrets, never readable by clients.
-- =====================================================================================

create table private.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value text not null check (char_length(value) <= 200)
);
create table private.platform_secrets (
  name text primary key check (name ~ '^[a-z0-9_]{2,60}$'),
  value text not null check (char_length(value) between 32 and 200)
);
revoke all on private.platform_settings, private.platform_secrets from public, anon, authenticated;
grant all on private.platform_settings, private.platform_secrets to service_role;
insert into private.platform_settings (key, value) values ('raw_footage_backend', 'supabase');

alter table public.media_uploads
  add column storage_backend text not null default 'supabase'
    check (storage_backend in ('supabase', 'r2'));

create function private.set_upload_backend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.storage_backend := coalesce(
    (select s.value from private.platform_settings s where s.key = 'raw_footage_backend'),
    'supabase');
  return new;
end;
$$;
create trigger media_uploads_backend before insert on public.media_uploads
  for each row execute function private.set_upload_backend();
-- The backend never changes after registration.
create function private.protect_upload_backend()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_backend is distinct from old.storage_backend then
    raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger media_uploads_backend_immutable before update of storage_backend on public.media_uploads
  for each row execute function private.protect_upload_backend();

-- HMAC-SHA256 (RFC 2104) on core sha256(), hex output; no pgcrypto needed (PGlite, Supabase).
create function private.hmac_sha256_hex(p_key text, p_message text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key bytea := convert_to(p_key, 'UTF8');
  v_ipad bytea;
  v_opad bytea;
  i integer;
begin
  if length(v_key) > 64 then
    v_key := sha256(v_key);
  end if;
  v_key := v_key || decode(repeat('00', 64 - length(v_key)), 'hex');
  v_ipad := v_key;
  v_opad := v_key;
  for i in 0..63 loop
    v_ipad := set_byte(v_ipad, i, get_byte(v_key, i) # 54);
    v_opad := set_byte(v_opad, i, get_byte(v_key, i) # 92);
  end loop;
  return encode(sha256(v_opad || sha256(v_ipad || convert_to(p_message, 'UTF8'))), 'hex');
end;
$$;

-- Shared checks: the caller registered this upload, may still capture for the session, and the
-- upload is an R2 upload that is still pending.
create function private.r2_upload_for_caller(p_upload uuid)
returns public.media_uploads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.media_uploads;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_upload from public.media_uploads mu where mu.id = p_upload for update;
  if v_upload.id is null or v_upload.created_by is distinct from (select auth.uid())
     or v_upload.storage_backend <> 'r2'
     or not coalesce(private.can_access_scan_session(v_upload.scan_session_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_upload;
end;
$$;

-- Where a part goes and how big it must be (called by the Worker with the user's session).
create function public.r2_part_target(p_upload uuid, p_part integer)
returns table (object_path text, size_bytes integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.media_uploads := private.r2_upload_for_caller(p_upload);
begin
  if v_upload.status <> 'pending' and v_upload.status <> 'uploaded' then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  return query
    select p.object_path, p.size_bytes, p.status::text from public.media_upload_parts p
    where p.media_upload_id = p_upload and p.part_number = p_part;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Marks an R2 part uploaded when the Worker's receipt matches; same roll-up as
-- complete_media_upload_part (migration 20261120000500). Returns the parts still pending.
create function public.complete_media_upload_part_r2(p_upload uuid, p_part integer, p_receipt text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.media_uploads := private.r2_upload_for_caller(p_upload);
  v_part public.media_upload_parts;
  v_secret text;
  v_remaining integer;
begin
  select * into v_part from public.media_upload_parts p
  where p.media_upload_id = p_upload and p.part_number = p_part;
  if v_part.media_upload_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_part.status = 'pending' then
    select s.value into v_secret from private.platform_secrets s where s.name = 'r2_receipt_secret';
    if v_secret is null or p_receipt is null or p_receipt <> private.hmac_sha256_hex(
         v_secret, p_upload::text || ':' || p_part || ':' || v_part.size_bytes || ':' || v_part.object_path) then
      raise exception 'PART_INCOMPLETE' using errcode = '55000';
    end if;
    update public.media_upload_parts set status = 'uploaded', uploaded_at = now()
    where media_upload_id = p_upload and part_number = p_part;
  end if;
  select count(*) into v_remaining from public.media_upload_parts p
  where p.media_upload_id = p_upload and p.status = 'pending';
  if v_remaining = 0 and v_upload.status = 'pending' then
    update public.media_uploads set status = 'uploaded' where id = p_upload;
    update public.scan_sessions s set status = 'uploaded'
    where s.id = v_upload.scan_session_id and s.status = 'uploading'
      and not exists (select 1 from public.media_uploads mu
                      where mu.scan_session_id = s.id and mu.status = 'pending');
  end if;
  return v_remaining;
end;
$$;

revoke execute on function private.set_upload_backend(), private.protect_upload_backend(),
  private.hmac_sha256_hex(text, text), private.r2_upload_for_caller(uuid) from public, anon, authenticated;
grant execute on function private.hmac_sha256_hex(text, text) to service_role;
revoke execute on function public.r2_part_target(uuid, integer),
  public.complete_media_upload_part_r2(uuid, integer, text) from public, anon;
grant execute on function public.r2_part_target(uuid, integer),
  public.complete_media_upload_part_r2(uuid, integer, text) to authenticated;
