-- =====================================================================================
-- Nookscanner Stage 8.2: hotspots (DATABASE_SCHEMA 4.20). A hotspot pins one appliance to a point
-- of one scene version, in aligned metres (7.3). Placed by tapping the real object in 3D
-- (raycast), moved or deleted by editors with hotspot.write. Moving a hotspot makes it unverified
-- again (quality bar 7: hotspot positions verified before publishing; workflow in 8.4).
-- =====================================================================================

create type public.verification_status as enum ('unverified', 'verified');

create table public.hotspots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  scene_version_id uuid not null references public.scene_versions (id) on delete cascade,
  appliance_id uuid not null references public.appliances (id) on delete cascade,
  position double precision[] not null check (array_length(position, 1) = 3),
  -- Surface normal at the tap (orients the marker); optional.
  normal double precision[] check (normal is null or array_length(normal, 1) = 3),
  -- Where the camera was when placing it (opens the hotspot from a sensible view later).
  camera_pose jsonb check (camera_pose is null or jsonb_typeof(camera_pose) = 'object'),
  verification_status public.verification_status not null default 'unverified',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scene_version_id, appliance_id)
);
create index hotspots_organization_idx on public.hotspots (organization_id);
create index hotspots_apartment_idx on public.hotspots (apartment_id);
create index hotspots_appliance_idx on public.hotspots (appliance_id);
create index hotspots_created_by_idx on public.hotspots (created_by);
create index hotspots_verified_by_idx on public.hotspots (verified_by);

create trigger hotspots_set_updated_at before update on public.hotspots
  for each row execute function public.set_updated_at();
create trigger hotspots_prevent_org_change before update on public.hotspots
  for each row execute function public.prevent_org_change();
create trigger hotspots_audit after insert or update or delete on public.hotspots
  for each row execute function public.audit_trigger();

-- Organization, apartment and scene come from the appliance and the scene version; the point
-- must lie inside the aligned scene; published or superseded versions are frozen; a move or a
-- re-link resets verification; clients cannot mark themselves verified here (8.4 adds an RPC).
create function private.check_hotspot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appliance public.appliances;
  v_scene public.scene_versions;
begin
  select * into v_appliance from public.appliances a where a.id = new.appliance_id;
  select * into v_scene from public.scene_versions s where s.id = new.scene_version_id;
  if v_appliance.id is null or v_scene.id is null or v_appliance.apartment_id <> v_scene.apartment_id then
    raise exception 'appliance and scene must belong to the same apartment' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.apartment_id <> old.apartment_id
                           or new.scene_version_id <> old.scene_version_id) then
    raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
  end if;
  new.organization_id := v_scene.organization_id;
  new.apartment_id := v_scene.apartment_id;
  if v_scene.status not in ('draft', 'approved') then
    raise exception 'scene version is frozen' using errcode = '55000';
  end if;
  if v_scene.bounds is null then
    raise exception 'scene is not aligned' using errcode = '55000';
  end if;
  if not private.vec3_in_bounds(to_jsonb(new.position), v_scene.bounds) then
    raise exception 'hotspot is outside the apartment' using errcode = '22023';
  end if;
  if new.normal is not null and sqrt(new.normal[1]^2 + new.normal[2]^2 + new.normal[3]^2) not between 0.5 and 1.5 then
    raise exception 'normal must be a unit vector' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.verified_by := null;
    new.verified_at := null;
    new.created_by := (select auth.uid());
  elsif new.position is distinct from old.position or new.appliance_id is distinct from old.appliance_id
        or new.verification_status is distinct from old.verification_status
        or new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at then
    new.verification_status := 'unverified';
    new.verified_by := null;
    new.verified_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
revoke execute on function private.check_hotspot() from public, anon, authenticated;

create trigger hotspots_check before insert or update on public.hotspots
  for each row execute function private.check_hotspot();

alter table public.hotspots enable row level security;
create policy hotspots_select on public.hotspots for select to authenticated
  using (private.can_access_apartment(apartment_id, 'apartment.read'));
-- Insert checks the appliance's apartment: apartment_id is filled by the trigger after RLS
-- with-check would see it, so the policy reads it from the appliance.
create policy hotspots_insert on public.hotspots for insert to authenticated
  with check (exists (
    select 1 from public.appliances a
    where a.id = appliance_id and private.can_access_apartment(a.apartment_id, 'hotspot.write')
  ));
create policy hotspots_update on public.hotspots for update to authenticated
  using (private.can_access_apartment(apartment_id, 'hotspot.write'))
  with check (private.can_access_apartment(apartment_id, 'hotspot.write'));
create policy hotspots_delete on public.hotspots for delete to authenticated
  using (private.can_access_apartment(apartment_id, 'hotspot.write'));

revoke all on public.hotspots from anon, authenticated;
grant select, insert, update, delete on public.hotspots to authenticated;
grant all on public.hotspots to service_role;
