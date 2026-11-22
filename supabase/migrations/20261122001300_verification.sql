-- =====================================================================================
-- Nookscanner Stage 8.4: verification workflow (PRODUCT_REQUIREMENTS M16, quality bar 7).
-- Edits already create unverified rows (instruction versions are append-only, migration 1200;
-- a hotspot move resets verification, 1100). Verifying is a deliberate act by someone with
-- instruction.verify (owner, admin, manager): definer RPCs set a transaction-local flag that the
-- integrity triggers accept for the verification columns only. Only the LATEST version of a
-- language can be verified (an older one is superseded).
-- =====================================================================================

-- Latest body from migration 20261122001100 plus the verification branch.
create or replace function private.check_hotspot()
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
  elsif coalesce(current_setting('nookscanner.verifying', true), '') = 'on'
        and new.position is not distinct from old.position
        and new.appliance_id is not distinct from old.appliance_id then
    -- verify_hotspot (definer) sets the verification columns; nothing else may change.
    null;
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

create function public.verify_instruction_version(p_version uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.instruction_versions;
  v_apartment uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_version from public.instruction_versions v where v.id = p_version for update;
  select i.apartment_id into v_apartment from public.instructions i where i.id = v_version.instruction_id;
  if v_version.id is null or v_apartment is null
     or not coalesce(private.can_access_apartment(v_apartment, 'instruction.verify'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.instruction_versions v
             where v.instruction_id = v_version.instruction_id and v.locale = v_version.locale
               and v.version > v_version.version) then
    raise exception 'SUPERSEDED' using errcode = '55000';
  end if;
  perform set_config('nookscanner.verifying', 'on', true);
  update public.instruction_versions
  set verification_status = 'verified', verified_by = (select auth.uid()), verified_at = now()
  where id = p_version;
  perform set_config('nookscanner.verifying', '', true);
end;
$$;

create function public.verify_hotspot(p_hotspot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hotspot public.hotspots;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_hotspot from public.hotspots h where h.id = p_hotspot for update;
  if v_hotspot.id is null or not coalesce(private.can_access_apartment(v_hotspot.apartment_id, 'instruction.verify'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform set_config('nookscanner.verifying', 'on', true);
  update public.hotspots
  set verification_status = 'verified', verified_by = (select auth.uid()), verified_at = now()
  where id = p_hotspot;
  perform set_config('nookscanner.verifying', '', true);
end;
$$;

revoke execute on function public.verify_instruction_version(uuid), public.verify_hotspot(uuid) from public, anon;
grant execute on function public.verify_instruction_version(uuid), public.verify_hotspot(uuid) to authenticated;
