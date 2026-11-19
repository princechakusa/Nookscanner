-- =====================================================================================
-- Nookscanner Stage 2.3: storage buckets and storage RLS.
-- Spec: docs/DATABASE_SCHEMA.md section 5, ADR-009; threats T06 (file access), T07 (uploads).
-- Path conventions (first segment is always 'org', second the organization id):
--   raw-footage        org/<org>/scans/<scan_session>/<upload>.<ext>   (registered rows only)
--   scene-drafts       org/<org>/apartments/<apartment>/...            (read: scan.read)
--   instruction-media  org/<org>/apartments/<apartment>/...            (read/write: instruction.write)
--   scene-masters      service role only (no policies)
--   published-assets   public read; writes service role only (no policies)
-- Deletes are platform-only everywhere (retention jobs, Phase 5/6).
-- =====================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  -- No per-bucket size limit: the project-wide limit applies (50 MB on Free, KI-011); the
  -- 10 GiB pilot cap is enforced by media_uploads.size_bytes + register_media_upload.
  ('raw-footage', 'raw-footage', false, null, array['video/mp4', 'video/quicktime']),
  ('scene-masters', 'scene-masters', false, null, null),
  ('scene-drafts', 'scene-drafts', false, null, null),
  ('instruction-media', 'instruction-media', false, 104857600,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']),
  ('published-assets', 'published-assets', true, null, null)
on conflict (id) do nothing;

-- Extracts the apartment id from 'org/<org>/apartments/<apartment>/...' and checks that the
-- path's org matches the apartment's org. Returns null for anything malformed (never raises).
create function public.storage_path_apartment(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_apartment uuid;
begin
  if cardinality(v_parts) < 5 or v_parts[1] <> 'org' or v_parts[3] <> 'apartments'
     or v_parts[2] !~ v_uuid_re or v_parts[4] !~ v_uuid_re
     or p_name like '%..%' or p_name like '%//%' then
    return null;
  end if;
  select a.id into v_apartment from public.apartments a
  where a.id = v_parts[4]::uuid and a.organization_id = v_parts[2]::uuid;
  return v_apartment;
end;
$$;

-- raw-footage upload: the object name must match a pending media_uploads row created by the
-- same user through register_media_upload, and the user must still hold scan.create.
create function public.can_upload_raw_footage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_uploads mu
    where mu.bucket = 'raw-footage'
      and mu.object_path = p_name
      and mu.status = 'pending'
      and mu.created_by = (select auth.uid())
      and public.can_access_scan_session(mu.scan_session_id, 'scan.create')
  );
$$;

create function public.can_read_raw_footage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_uploads mu
    where mu.bucket = 'raw-footage'
      and mu.object_path = p_name
      and mu.status <> 'deleted'
      and public.can_access_scan_session(mu.scan_session_id, 'scan.read')
  );
$$;

create function public.can_access_storage_apartment(p_name text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.can_access_apartment(public.storage_path_apartment(p_name), p_permission), false);
$$;

-- ---------- Policies on storage.objects -------------------------------------------------
create policy nookscanner_raw_footage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'raw-footage' and public.can_upload_raw_footage(name));
create policy nookscanner_raw_footage_select on storage.objects for select to authenticated
  using (bucket_id = 'raw-footage' and public.can_read_raw_footage(name));

create policy nookscanner_scene_drafts_select on storage.objects for select to authenticated
  using (bucket_id = 'scene-drafts' and public.can_access_storage_apartment(name, 'scan.read'));

create policy nookscanner_instruction_media_select on storage.objects for select to authenticated
  using (bucket_id = 'instruction-media' and public.can_access_storage_apartment(name, 'apartment.read'));
create policy nookscanner_instruction_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'instruction-media' and public.can_access_storage_apartment(name, 'instruction.write'));
create policy nookscanner_instruction_media_update on storage.objects for update to authenticated
  using (bucket_id = 'instruction-media' and public.can_access_storage_apartment(name, 'instruction.write'))
  with check (bucket_id = 'instruction-media' and public.can_access_storage_apartment(name, 'instruction.write'));

revoke execute on function
  public.storage_path_apartment(text),
  public.can_upload_raw_footage(text),
  public.can_read_raw_footage(text),
  public.can_access_storage_apartment(text, text)
from public, anon;
grant execute on function
  public.storage_path_apartment(text),
  public.can_upload_raw_footage(text),
  public.can_read_raw_footage(text),
  public.can_access_storage_apartment(text, text)
to authenticated;
