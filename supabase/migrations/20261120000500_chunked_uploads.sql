-- =====================================================================================
-- Nookscanner Stage 5.1: chunked raw-footage uploads (ADR-016, Supabase Free plan).
-- Free caps each stored object at 50 MB, so a walkthrough video (one media_uploads row,
-- up to 10 GiB) is stored as ordered parts of at most 45 MiB. Each part is its own resumable
-- (TUS) upload to a server-built path; the worker concatenates the parts before validation.
--   org/<org>/scans/<session>/<upload>/part-00001.<ext>
-- Storage only accepts a part object while that part is pending and the caller registered the
-- upload; a part is marked uploaded only after the database sees an object of exactly the
-- expected size (complete_media_upload_part).
-- =====================================================================================

-- 45 MiB: below the 50 MB Free limit with margin; a multiple of the 6 MiB TUS chunk size
-- would not matter (TUS sends the last chunk short), so the value is about headroom only.
alter table public.media_uploads
  add column part_size_bytes integer not null default 47185920
    check (part_size_bytes between 5242880 and 47185920),
  add column part_count integer not null default 1 check (part_count between 1 and 1000);

create table public.media_upload_parts (
  media_upload_id uuid not null references public.media_uploads (id) on delete cascade,
  part_number integer not null check (part_number between 1 and 1000),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  object_path text not null unique check (char_length(object_path) <= 512),
  size_bytes integer not null check (size_bytes between 1 and 47185920),
  status public.upload_status not null default 'pending'
    check (status in ('pending', 'uploaded', 'deleted')),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (media_upload_id, part_number),
  constraint media_upload_parts_uploaded_consistent
    check ((status = 'uploaded') = (uploaded_at is not null))
);

create index media_upload_parts_organization_idx on public.media_upload_parts (organization_id);

alter table public.media_upload_parts enable row level security;

-- Read with scan.read on the session (same as media_uploads); no direct writes.
create policy media_upload_parts_select on public.media_upload_parts for select to authenticated
  using (exists (
    select 1 from public.media_uploads mu
    where mu.id = media_upload_id
      and private.can_access_scan_session(mu.scan_session_id, 'scan.read')
  ));
revoke all on public.media_upload_parts from anon, authenticated;
grant select on public.media_upload_parts to authenticated;

-- Not audited per part (up to 228 rows per video); the media_uploads row records the outcome.

-- Objects in raw-footage are now parts: cap the bucket at the part size.
update storage.buckets set file_size_limit = 47185920 where id = 'raw-footage';

-- ---------- Registration: the upload row plus its parts, all paths built here ------------
create or replace function public.register_media_upload(
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
  v_part_size constant integer := 47185920;
  v_parts integer;
  v_prefix text;
  v_row public.media_uploads;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  -- Lock the session row so concurrent registrations cannot exceed the cap.
  select * into v_session from public.scan_sessions s where s.id = p_scan_session for update;
  if v_session.id is null or not coalesce(private.can_access_apartment(v_session.apartment_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status not in ('draft', 'recording', 'uploading') then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  if (select count(*) from public.media_uploads mu where mu.scan_session_id = v_session.id) >= 20 then
    raise exception 'UPLOAD_LIMIT_REACHED' using errcode = '54000';
  end if;

  v_ext := case lower(p_mime) when 'video/mp4' then '.mp4' when 'video/quicktime' then '.mov' end;
  if v_ext is null or p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10737418240 then
    raise exception 'UPLOAD_REJECTED' using errcode = '22023';
  end if;
  v_parts := ceil(p_size_bytes::numeric / v_part_size)::integer;
  v_prefix := 'org/' || v_session.organization_id || '/scans/' || v_session.id || '/' || v_id;

  insert into public.media_uploads (id, organization_id, scan_session_id, object_path, original_filename,
                                    mime_type, size_bytes, part_size_bytes, part_count, created_by)
  values (v_id, v_session.organization_id, v_session.id, v_prefix || v_ext,
          left(btrim(p_filename), 255), lower(p_mime), p_size_bytes, v_part_size, v_parts,
          (select auth.uid()))
  returning * into v_row;

  insert into public.media_upload_parts (media_upload_id, part_number, organization_id, object_path, size_bytes)
  select v_id, n, v_session.organization_id,
         v_prefix || '/part-' || lpad(n::text, 5, '0') || v_ext,
         least(v_part_size::bigint, p_size_bytes - (n - 1)::bigint * v_part_size)::integer
  from generate_series(1, v_parts) as n;

  update public.scan_sessions set status = 'uploading' where id = v_session.id and status = 'draft';
  return v_row;
end;
$$;

-- ---------- Completing a part: only after the object exists with the exact size -----------
create function public.complete_media_upload_part(p_upload uuid, p_part integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.media_uploads;
  v_part public.media_upload_parts;
  v_size bigint;
  v_remaining integer;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_upload from public.media_uploads mu where mu.id = p_upload for update;
  if v_upload.id is null or v_upload.created_by is distinct from (select auth.uid())
     or not coalesce(private.can_access_scan_session(v_upload.scan_session_id, 'scan.create'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_part from public.media_upload_parts p
  where p.media_upload_id = p_upload and p.part_number = p_part;
  if v_part.media_upload_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_part.status = 'pending' then
    select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o where o.bucket_id = 'raw-footage' and o.name = v_part.object_path;
    if v_size is null or v_size <> v_part.size_bytes then
      raise exception 'PART_INCOMPLETE' using errcode = '55000';
    end if;
    update public.media_upload_parts set status = 'uploaded', uploaded_at = now()
    where media_upload_id = p_upload and part_number = p_part;
  end if;

  select count(*) into v_remaining from public.media_upload_parts p
  where p.media_upload_id = p_upload and p.status = 'pending';
  if v_remaining = 0 and v_upload.status = 'pending' then
    update public.media_uploads set status = 'uploaded' where id = p_upload;
    -- The session is uploaded once none of its uploads is still pending.
    update public.scan_sessions s set status = 'uploaded'
    where s.id = v_upload.scan_session_id and s.status = 'uploading'
      and not exists (select 1 from public.media_uploads mu
                      where mu.scan_session_id = s.id and mu.status = 'pending');
  end if;
  return v_remaining;
end;
$$;

revoke execute on function public.complete_media_upload_part(uuid, integer) from public, anon;
grant execute on function public.complete_media_upload_part(uuid, integer) to authenticated;

-- ---------- Storage policies: parts only ---------------------------------------------------
create or replace function private.can_upload_raw_footage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_upload_parts p
    join public.media_uploads mu on mu.id = p.media_upload_id
    where p.object_path = p_name
      and p.status = 'pending'
      and mu.bucket = 'raw-footage'
      and mu.status = 'pending'
      and mu.created_by = (select auth.uid())
      and private.can_access_scan_session(mu.scan_session_id, 'scan.create')
  );
$$;

create or replace function private.can_read_raw_footage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_upload_parts p
    join public.media_uploads mu on mu.id = p.media_upload_id
    where p.object_path = p_name
      and p.status <> 'deleted'
      and mu.bucket = 'raw-footage'
      and mu.status <> 'deleted'
      and private.can_access_scan_session(mu.scan_session_id, 'scan.read')
  );
$$;
