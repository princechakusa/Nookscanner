-- =====================================================================================
-- Nookscanner Stage 7.4: rooms, viewpoints and doorways per scene version (ADR-020).
-- Room geometry lives with the scene version, not the room: every new reconstruction has its own
-- coordinates. rooms.viewpoints / rooms.connections (foundation) stay unused for that reason.
-- Positions are aligned metres (7.3); writes only through save_scene_navigation, which replaces
-- the whole set atomically and checks every room belongs to the scene's apartment.
-- =====================================================================================

create table public.scene_room_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scene_version_id uuid not null references public.scene_versions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  position double precision[] not null check (array_length(position, 1) = 3),
  target double precision[] not null check (array_length(target, 1) = 3),
  created_at timestamptz not null default now(),
  unique (scene_version_id, room_id)
);
create index scene_room_views_room_idx on public.scene_room_views (room_id);
create index scene_room_views_organization_idx on public.scene_room_views (organization_id);

create table public.scene_doorways (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scene_version_id uuid not null references public.scene_versions (id) on delete cascade,
  room_a uuid not null references public.rooms (id) on delete cascade,
  room_b uuid not null references public.rooms (id) on delete cascade,
  position double precision[] not null check (array_length(position, 1) = 3),
  created_at timestamptz not null default now(),
  -- One doorway record per unordered pair (stored with room_a < room_b).
  check (room_a < room_b),
  unique (scene_version_id, room_a, room_b)
);
create index scene_doorways_room_a_idx on public.scene_doorways (room_a);
create index scene_doorways_room_b_idx on public.scene_doorways (room_b);
create index scene_doorways_organization_idx on public.scene_doorways (organization_id);

create trigger scene_room_views_audit after insert or update or delete on public.scene_room_views
  for each row execute function public.audit_trigger();
create trigger scene_doorways_audit after insert or update or delete on public.scene_doorways
  for each row execute function public.audit_trigger();

alter table public.scene_room_views enable row level security;
alter table public.scene_doorways enable row level security;
create policy scene_room_views_select on public.scene_room_views for select to authenticated
  using (exists (
    select 1 from public.scene_versions s
    where s.id = scene_version_id and private.can_access_apartment(s.apartment_id, 'scan.read')
  ));
create policy scene_doorways_select on public.scene_doorways for select to authenticated
  using (exists (
    select 1 from public.scene_versions s
    where s.id = scene_version_id and private.can_access_apartment(s.apartment_id, 'scan.read')
  ));
revoke all on public.scene_room_views, public.scene_doorways from anon, authenticated;
grant select on public.scene_room_views, public.scene_doorways to authenticated;
grant all on public.scene_room_views, public.scene_doorways to service_role;

-- Point inside the scene's bounds (with 0.5 m slack for doorways on the outline).
create function private.vec3_in_bounds(v jsonb, b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.is_vec3(v)
    and (v ->> 0)::numeric between (b -> 'min' ->> 0)::numeric - 0.5 and (b -> 'max' ->> 0)::numeric + 0.5
    and (v ->> 1)::numeric between (b -> 'min' ->> 1)::numeric - 0.5 and (b -> 'max' ->> 1)::numeric + 0.5
    and (v ->> 2)::numeric between (b -> 'min' ->> 2)::numeric - 0.5 and (b -> 'max' ->> 2)::numeric + 0.5;
$$;

create function private.vec3_array(v jsonb)
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select array[(v ->> 0)::double precision, (v ->> 1)::double precision, (v ->> 2)::double precision];
$$;

-- ---------- save navigation: [{room, position, target}], [{a, b, position}] ----------------
create function public.save_scene_navigation(p_scene uuid, p_views jsonb, p_doorways jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scene public.scene_versions;
  v jsonb;
  v_a uuid;
  v_b uuid;
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
  -- Viewpoints are metres in the aligned scene: align first.
  if v_scene.alignment is null or v_scene.bounds is null then
    raise exception 'NOT_ALIGNED' using errcode = '55000';
  end if;
  if jsonb_typeof(p_views) is distinct from 'array' or jsonb_typeof(p_doorways) is distinct from 'array'
     or jsonb_array_length(p_views) > 40 or jsonb_array_length(p_doorways) > 80 then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  delete from public.scene_room_views where scene_version_id = p_scene;
  delete from public.scene_doorways where scene_version_id = p_scene;

  for v in select * from jsonb_array_elements(p_views) loop
    if jsonb_typeof(v -> 'room') is distinct from 'string'
       or not private.vec3_in_bounds(v -> 'position', v_scene.bounds)
       or not private.is_vec3(v -> 'target')
       or not exists (select 1 from public.rooms r
                      where r.id::text = v ->> 'room' and r.apartment_id = v_scene.apartment_id) then
      raise exception 'VALIDATION_FAILED' using errcode = '22023';
    end if;
    insert into public.scene_room_views (organization_id, scene_version_id, room_id, position, target)
    values (v_scene.organization_id, p_scene, (v ->> 'room')::uuid,
            private.vec3_array(v -> 'position'), private.vec3_array(v -> 'target'));
  end loop;

  for v in select * from jsonb_array_elements(p_doorways) loop
    if jsonb_typeof(v -> 'a') is distinct from 'string' or jsonb_typeof(v -> 'b') is distinct from 'string'
       or not private.vec3_in_bounds(v -> 'position', v_scene.bounds) then
      raise exception 'VALIDATION_FAILED' using errcode = '22023';
    end if;
    select least(x, y), greatest(x, y) into v_a, v_b
    from (select r1.id as x, r2.id as y
          from public.rooms r1, public.rooms r2
          where r1.id::text = v ->> 'a' and r2.id::text = v ->> 'b'
            and r1.apartment_id = v_scene.apartment_id and r2.apartment_id = v_scene.apartment_id
            and r1.id <> r2.id) pair;
    if v_a is null then
      raise exception 'VALIDATION_FAILED' using errcode = '22023';
    end if;
    insert into public.scene_doorways (organization_id, scene_version_id, room_a, room_b, position)
    values (v_scene.organization_id, p_scene, v_a, v_b, private.vec3_array(v -> 'position'));
    v_a := null;
  end loop;
exception
  when unique_violation or invalid_text_representation then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
end;
$$;

revoke execute on function public.save_scene_navigation(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_scene_navigation(uuid, jsonb, jsonb) to authenticated;
revoke execute on function private.vec3_in_bounds(jsonb, jsonb), private.vec3_array(jsonb) from public, anon;
grant execute on function private.vec3_in_bounds(jsonb, jsonb), private.vec3_array(jsonb)
  to authenticated, service_role;
