-- =====================================================================================
-- Nookscanner Stage 10.6 fix: deleting a user must not be blocked by integrity triggers.
-- Found by account-deletion.test.ts: auth.users FKs (on delete set null) update created_by /
-- verified_by / ... to null, and protect_immutable_columns, check_hotspot,
-- check_instruction_version and check_instruction_media refused or reverted that. Each now lets
-- through an update whose only change is user references becoming null, when it comes from a
-- cascade (pg_trigger_depth() > 1). Bodies are the latest definitions plus that guard.
-- =====================================================================================

create function private.only_user_refs_cleared(p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- Nothing else changed ...
    (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p_old) e(k, v) where k !~ '_by$')
      = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p_new) e(k, v) where k !~ '_by$')
    -- ... and every *_by column kept its value or became null; at least one became null.
    and not exists (
      select 1 from jsonb_each(p_new) n(k, v)
      where n.k ~ '_by$' and n.v <> 'null'::jsonb and n.v is distinct from p_old -> n.k)
    and exists (
      select 1 from jsonb_each(p_new) n(k, v)
      where n.k ~ '_by$' and n.v = 'null'::jsonb and (p_old -> n.k) <> 'null'::jsonb);
$$;
revoke execute on function private.only_user_refs_cleared(jsonb, jsonb) from public, anon;
-- protect_immutable_columns runs with the caller's rights (not a definer): signed-in users must be
-- able to call this pure comparison helper (private schema, not exposed through the API).
grant execute on function private.only_user_refs_cleared(jsonb, jsonb) to authenticated, service_role;

-- Latest body of public.protect_immutable_columns plus the account-deletion guard.
create or replace function public.protect_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Account deletion (10.6): auth.users FKs set *_by columns to null through an internal RI
  -- trigger (depth > 1). Let exactly that through; client edits (depth 1) are still checked.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and private.only_user_refs_cleared(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
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

-- Latest body of private.check_hotspot plus the account-deletion guard.
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
  -- Account deletion (10.6): auth.users FKs set *_by columns to null through an internal RI
  -- trigger (depth > 1). Let exactly that through; client edits (depth 1) are still checked.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and private.only_user_refs_cleared(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
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

-- Latest body of private.check_instruction_version plus the account-deletion guard.
create or replace function private.check_instruction_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Account deletion (10.6): auth.users FKs set *_by columns to null through an internal RI
  -- trigger (depth > 1). Let exactly that through; client edits (depth 1) are still checked.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and private.only_user_refs_cleared(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- Only verification may change, and only through a definer function (8.4) that sets this flag.
    if coalesce(current_setting('nookscanner.verifying', true), '') <> 'on'
       or (to_jsonb(new) - 'verification_status' - 'verified_by' - 'verified_at')
          is distinct from (to_jsonb(old) - 'verification_status' - 'verified_by' - 'verified_at') then
      raise exception 'IMMUTABLE_VERSION' using errcode = '42501';
    end if;
    return new;
  end if;
  select i.organization_id into v_org from public.instructions i where i.id = new.instruction_id;
  new.organization_id := v_org;
  select coalesce(max(v.version), 0) + 1 into new.version
  from public.instruction_versions v
  where v.instruction_id = new.instruction_id and v.locale = new.locale;
  new.verification_status := 'unverified';
  new.verified_by := null;
  new.verified_at := null;
  new.created_by := (select auth.uid());
  new.created_at := now();
  if exists (
       select 1 from jsonb_array_elements(new.steps) s
       where jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s -> 'text') is distinct from 'string'
          or char_length(btrim(s ->> 'text')) not between 1 and 1000)
     or exists (
       select 1 from jsonb_array_elements(new.troubleshooting) t
       where jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'problem') is distinct from 'string'
          or jsonb_typeof(t -> 'solution') is distinct from 'string'
          or char_length(btrim(t ->> 'problem')) not between 1 and 300
          or char_length(btrim(t ->> 'solution')) not between 1 and 1000) then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Latest body of private.check_instruction_media plus the account-deletion guard.
create or replace function private.check_instruction_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ins public.instructions;
begin
  -- Account deletion (10.6): auth.users FKs set *_by columns to null through an internal RI
  -- trigger (depth > 1). Let exactly that through; client edits (depth 1) are still checked.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and private.only_user_refs_cleared(to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.object_path <> old.object_path or new.instruction_id <> old.instruction_id
                           or new.organization_id <> old.organization_id or new.kind <> old.kind) then
    raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
  end if;
  select * into v_ins from public.instructions i where i.id = new.instruction_id;
  if v_ins.id is null or v_ins.apartment_id is null then
    raise exception 'parent row not found' using errcode = '23503';
  end if;
  new.organization_id := v_ins.organization_id;
  if new.object_path !~ ('^org/' || v_ins.organization_id || '/apartments/' || v_ins.apartment_id
                         || '/instructions/' || v_ins.id || '/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp|mp4|mov)$') then
    raise exception 'object path not allowed' using errcode = '42501';
  end if;
  if (new.kind = 'image') <> (new.object_path ~ '\.(jpg|jpeg|png|webp)$') then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
