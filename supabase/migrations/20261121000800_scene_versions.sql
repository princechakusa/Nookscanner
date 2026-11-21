-- =====================================================================================
-- Nookscanner Stage 7.3: scene versions with alignment (DATABASE_SCHEMA 4.15).
-- An approved reconstruction (review_processing_result, 6.3) becomes a draft scene version of the
-- apartment. Managers align it (floor, scale, crop: packages/viewer alignment.ts) before hotspots
-- (Phase 8) and publishing. Alignment and bounds are validated in the database.
-- =====================================================================================

create type public.scene_status as enum ('draft', 'approved', 'published', 'superseded', 'rejected');

create table public.scene_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  processing_job_id uuid not null unique references public.processing_jobs (id) on delete cascade,
  version integer not null check (version >= 1),
  status public.scene_status not null default 'draft',
  -- Storage path of the first-load scene file (scene-drafts bucket) from the job's report.
  scene_path text check (scene_path is null or char_length(scene_path) <= 512),
  -- { "matrix": [16 numbers, column-major], "scale": metres per scene unit }
  alignment jsonb check (alignment is null or jsonb_typeof(alignment) = 'object'),
  -- { "min": [x,y,z], "max": [x,y,z] } in aligned metres, floor at y = 0
  bounds jsonb check (bounds is null or jsonb_typeof(bounds) = 'object'),
  -- Starting view { "position": [x,y,z], "target": [x,y,z] }
  start_view jsonb check (start_view is null or jsonb_typeof(start_view) = 'object'),
  aligned_by uuid references auth.users (id) on delete set null,
  aligned_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apartment_id, version)
);

create index scene_versions_apartment_idx on public.scene_versions (apartment_id, version desc);
create index scene_versions_organization_idx on public.scene_versions (organization_id);
create index scene_versions_aligned_by_idx on public.scene_versions (aligned_by);

create trigger scene_versions_set_updated_at before update on public.scene_versions
  for each row execute function public.set_updated_at();
create trigger scene_versions_prevent_org_change before update on public.scene_versions
  for each row execute function public.prevent_org_change();
create trigger scene_versions_audit after insert or update or delete on public.scene_versions
  for each row execute function public.audit_trigger();

alter table public.scene_versions enable row level security;
create policy scene_versions_select on public.scene_versions for select to authenticated
  using (private.can_access_apartment(apartment_id, 'scan.read'));
revoke all on public.scene_versions from anon, authenticated;
grant select on public.scene_versions to authenticated;
grant all on public.scene_versions to service_role;

-- ---------- validation helpers ------------------------------------------------------------
create function private.is_vec3(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 3
    and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number');
$$;

create function private.valid_alignment(a jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(a -> 'matrix') = 'array' and jsonb_array_length(a -> 'matrix') = 16
    and not exists (select 1 from jsonb_array_elements(a -> 'matrix') e where jsonb_typeof(e) <> 'number')
    and jsonb_typeof(a -> 'scale') = 'number' and (a ->> 'scale')::numeric > 0;
$$;

create function private.valid_bounds(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.is_vec3(b -> 'min') and private.is_vec3(b -> 'max')
    and (b -> 'max' ->> 0)::numeric - (b -> 'min' ->> 0)::numeric >= 1
    and (b -> 'max' ->> 1)::numeric - (b -> 'min' ->> 1)::numeric >= 1
    and (b -> 'max' ->> 2)::numeric - (b -> 'min' ->> 2)::numeric >= 1
    -- An apartment, not a city: at most 100 m across.
    and (b -> 'max' ->> 0)::numeric - (b -> 'min' ->> 0)::numeric <= 100
    and (b -> 'max' ->> 2)::numeric - (b -> 'min' ->> 2)::numeric <= 100;
$$;

-- ---------- approval creates a draft scene version (extends 6.3 review) ---------------------
create or replace function public.review_processing_result(
  p_job uuid,
  p_decision public.review_status,
  p_checklist jsonb,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs;
  v_report jsonb;
  v_scene text;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_job from public.processing_jobs j where j.id = p_job;
  if v_job.id is null or not coalesce(private.can_access_scan_session(v_job.scan_session_id, 'scan.review'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_job.status <> 'succeeded' then
    raise exception 'NOT_READY' using errcode = '55000';
  end if;
  if p_decision not in ('approved', 'rejected') or not private.valid_checklist(coalesce(p_checklist, '{}'::jsonb)) then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'NOTES_REQUIRED' using errcode = '22023';
  end if;
  update public.processing_results
  set review_status = p_decision, checklist = coalesce(p_checklist, '{}'::jsonb),
      review_notes = nullif(left(btrim(p_notes), 2000), ''), reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where processing_job_id = p_job
  returning report into v_report;

  if p_decision = 'approved' then
    select f ->> 'storagePath' into v_scene
    from jsonb_array_elements(coalesce(v_report -> 'files', '[]'::jsonb)) f
    where f ->> 'path' = 'scene.sog'
    limit 1;
    insert into public.scene_versions (organization_id, apartment_id, processing_job_id, version, scene_path)
    values (v_job.organization_id, v_job.apartment_id, v_job.id,
            coalesce((select max(version) from public.scene_versions where apartment_id = v_job.apartment_id), 0) + 1,
            v_scene)
    on conflict (processing_job_id) do nothing;
  end if;
end;
$$;

-- ---------- save alignment (floor, scale, crop, start view) --------------------------------
create function public.save_scene_alignment(
  p_scene uuid,
  p_alignment jsonb,
  p_bounds jsonb,
  p_start jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scene public.scene_versions;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_scene from public.scene_versions s where s.id = p_scene for update;
  if v_scene.id is null or not coalesce(private.can_access_apartment(v_scene.apartment_id, 'scan.review'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_scene.status not in ('draft', 'approved') then
    raise exception 'CONFLICT' using errcode = '55000';
  end if;
  if p_alignment is null or not private.valid_alignment(p_alignment)
     or p_bounds is null or not private.valid_bounds(p_bounds)
     or (p_start is not null and not (private.is_vec3(p_start -> 'position') and private.is_vec3(p_start -> 'target'))) then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;
  update public.scene_versions
  set alignment = p_alignment, bounds = p_bounds, start_view = p_start,
      aligned_by = (select auth.uid()), aligned_at = now(), status = 'approved'
  where id = p_scene;
end;
$$;

revoke execute on function public.save_scene_alignment(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_scene_alignment(uuid, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function private.is_vec3(jsonb), private.valid_alignment(jsonb), private.valid_bounds(jsonb)
  from public, anon;
grant execute on function private.is_vec3(jsonb), private.valid_alignment(jsonb), private.valid_bounds(jsonb)
  to authenticated, service_role;
