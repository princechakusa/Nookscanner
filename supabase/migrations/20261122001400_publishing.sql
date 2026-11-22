-- =====================================================================================
-- Nookscanner Stage 8.5: publishing (PRODUCT_REQUIREMENTS PB-01..03, quality bar 7, ADR-022).
-- publish_check lists what blocks publishing; publish_apartment builds the guest snapshot IN
-- the database from verified content only and stores it as a new immutable published version;
-- unpublish_apartment revokes guest access at once (the guest function serves only apartments
-- whose status is 'published'). The 3D file stays in the private scene-drafts bucket; the
-- snapshot keeps its path and the guest function (9.1) signs short-lived links.
-- =====================================================================================

create table public.published_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  version integer not null check (version >= 1),
  scene_version_id uuid not null references public.scene_versions (id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (apartment_id, version)
);
create index published_versions_latest_idx on public.published_versions (apartment_id, version desc);
create index published_versions_organization_idx on public.published_versions (organization_id);
create index published_versions_scene_idx on public.published_versions (scene_version_id);
create index published_versions_published_by_idx on public.published_versions (published_by);
create trigger published_versions_audit after insert or update or delete on public.published_versions
  for each row execute function public.audit_trigger();

alter table public.published_versions enable row level security;
create policy published_versions_select on public.published_versions for select to authenticated
  using (private.can_access_apartment(apartment_id, 'apartment.read'));
revoke all on public.published_versions from anon, authenticated;
grant select on public.published_versions to authenticated;
grant all on public.published_versions to service_role;

-- ---------- what blocks publishing (PB-01 + quality bar 7) ----------------------------------
-- Returns [{ "code": "...", "id": "<room or appliance>" }, ...]; empty = publishable.
create function private.publish_problems(p_apartment uuid, p_scene uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scene public.scene_versions;
  v_locale public.locale_code;
  v_entrance uuid;
  v_out jsonb := '[]'::jsonb;
begin
  select * into v_scene from public.scene_versions s where s.id = p_scene and s.apartment_id = p_apartment;
  if v_scene.id is null or v_scene.status not in ('approved', 'published') then
    return jsonb_build_array(jsonb_build_object('code', 'SCENE_NOT_APPROVED'));
  end if;
  if v_scene.alignment is null or v_scene.bounds is null then
    v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'SCENE_NOT_ALIGNED'));
  end if;
  if v_scene.scene_path is null then
    v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'SCENE_FILE_MISSING'));
  end if;
  if not exists (select 1 from public.rooms r where r.apartment_id = p_apartment) then
    return v_out || jsonb_build_array(jsonb_build_object('code', 'NO_ROOMS'));
  end if;
  select coalesce(p.default_locale, 'en') into v_locale
  from public.apartments a join public.properties p on p.id = a.property_id where a.id = p_apartment;

  -- Rooms: viewpoint in this scene, reachable from the entrance (or first room) via doorways.
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'ROOM_WITHOUT_VIEWPOINT', 'id', r.id) order by r.sort_order)
    from public.rooms r
    where r.apartment_id = p_apartment
      and not exists (select 1 from public.scene_room_views v where v.scene_version_id = p_scene and v.room_id = r.id)
  ), '[]'::jsonb);
  select r.id into v_entrance from public.rooms r where r.apartment_id = p_apartment
  order by (r.room_type = 'entrance') desc, r.sort_order, r.name_en limit 1;
  v_out := v_out || coalesce((
    with recursive reach(room) as (
      select v_entrance
      union
      select case when d.room_a = reach.room then d.room_b else d.room_a end
      from reach join public.scene_doorways d
        on d.scene_version_id = p_scene and (d.room_a = reach.room or d.room_b = reach.room)
    )
    select jsonb_agg(jsonb_build_object('code', 'ROOM_UNREACHABLE', 'id', r.id) order by r.sort_order)
    from public.rooms r
    where r.apartment_id = p_apartment and r.id not in (select room from reach)
  ), '[]'::jsonb);

  -- Hotspots: verified pin, and verified instructions in the default language (latest version).
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'HOTSPOT_UNVERIFIED', 'id', h.appliance_id))
    from public.hotspots h
    where h.scene_version_id = p_scene and h.verification_status <> 'verified'
  ), '[]'::jsonb);
  -- English is always required (the guest payload needs English text), plus the default language.
  v_out := v_out || coalesce((
    select jsonb_agg(jsonb_build_object('code', 'INSTRUCTION_UNVERIFIED', 'id', h.appliance_id, 'locale', l.locale))
    from public.hotspots h
    cross join (select distinct unnest(array['en'::public.locale_code, v_locale]) as locale) l
    where h.scene_version_id = p_scene and not exists (
      select 1 from public.instructions i
      join lateral (
        select v.verification_status from public.instruction_versions v
        where v.instruction_id = i.id and v.locale = l.locale
        order by v.version desc limit 1
      ) latest on true
      where i.appliance_id = h.appliance_id and latest.verification_status = 'verified')
  ), '[]'::jsonb);
  return v_out;
end;
$$;

create function public.publish_check(p_apartment uuid, p_scene uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not coalesce(private.can_access_apartment(p_apartment, 'apartment.publish'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.publish_problems(p_apartment, p_scene);
end;
$$;

-- ---------- the guest snapshot (verified content only) --------------------------------------
-- Shape follows packages/shared guest.ts guestExperienceSchema; scene.path (not a URL) and
-- scene.hotspots are resolved/used by the guest function (9.1/9.2). For each language the
-- LATEST VERIFIED version is used, so later unverified edits never reach guests.
create function private.guest_snapshot(p_apartment uuid, p_scene uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with apt as (
    select a.id, a.name, p.name as property_name, p.support_phone, p.support_whatsapp, p.support_email
    from public.apartments a join public.properties p on p.id = a.property_id
    where a.id = p_apartment
  ),
  verified as (
    select distinct on (i.appliance_id, v.locale) i.appliance_id, v.locale, v.title, v.steps, v.troubleshooting
    from public.instructions i
    join public.instruction_versions v on v.instruction_id = i.id
    where i.apartment_id = p_apartment and v.verification_status = 'verified'
    order by i.appliance_id, v.locale, v.version desc
  ),
  appl as (
    select ap.*, c.key as category_key, c.aliases_en, c.aliases_ar,
           en.steps as steps_en, ar.steps as steps_ar,
           en.troubleshooting as trouble_en, ar.troubleshooting as trouble_ar
    from public.appliances ap
    join public.appliance_categories c on c.id = ap.category_id
    join verified en on en.appliance_id = ap.id and en.locale = 'en'
    left join verified ar on ar.appliance_id = ap.id and ar.locale = 'ar'
    where ap.apartment_id = p_apartment
  ),
  sv as (
    select s.* from public.scene_versions s where s.id = p_scene
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'apartment', jsonb_build_object(
      'name', jsonb_build_object('en', apt.name),
      'property', jsonb_build_object('en', apt.property_name)),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'type', r.room_type,
        'name', jsonb_strip_nulls(jsonb_build_object('en', r.name_en, 'ar', r.name_ar)))
        order by r.sort_order, r.name_en)
      from public.rooms r where r.apartment_id = p_apartment), '[]'::jsonb),
    'appliances', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', a.id, 'roomId', a.room_id, 'category', a.category_key,
        'name', jsonb_build_object('en', a.name_en, 'ar', a.name_ar),
        'aliases', jsonb_build_object('en', to_jsonb(a.aliases_en), 'ar', to_jsonb(a.aliases_ar)),
        'brand', a.brand, 'model', a.model_number, 'verified', true,
        -- Arabic text per step only when both versions have the same steps (KI-032).
        'steps', (
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('text', jsonb_build_object(
            'en', e.value ->> 'text',
            'ar', case when jsonb_array_length(coalesce(a.steps_ar, '[]')) = jsonb_array_length(a.steps_en)
                       then a.steps_ar -> (e.ordinality::int - 1) ->> 'text' end))) order by e.ordinality)
          from jsonb_array_elements(a.steps_en) with ordinality e),
        'troubleshooting', coalesce((
          select jsonb_agg(jsonb_build_object(
            'problem', jsonb_strip_nulls(jsonb_build_object('en', t.value ->> 'problem',
              'ar', case when jsonb_array_length(coalesce(a.trouble_ar, '[]')) = jsonb_array_length(a.trouble_en)
                         then a.trouble_ar -> (t.ordinality::int - 1) ->> 'problem' end)),
            'solution', jsonb_strip_nulls(jsonb_build_object('en', t.value ->> 'solution',
              'ar', case when jsonb_array_length(coalesce(a.trouble_ar, '[]')) = jsonb_array_length(a.trouble_en)
                         then a.trouble_ar -> (t.ordinality::int - 1) ->> 'solution' end))) order by t.ordinality)
          from jsonb_array_elements(a.trouble_en) with ordinality t), '[]'::jsonb)
      )) order by a.name_en)
      from appl a), '[]'::jsonb),
    'support', jsonb_strip_nulls(jsonb_build_object(
      'phone', apt.support_phone, 'whatsapp', apt.support_whatsapp, 'email', apt.support_email)),
    'scene', jsonb_build_object(
      'path', sv.scene_path,
      'sizeBytes', coalesce((
        select (f ->> 'sizeBytes')::bigint
        from public.processing_results pr, jsonb_array_elements(coalesce(pr.report -> 'files', '[]')) f
        where pr.processing_job_id = sv.processing_job_id and f ->> 'storagePath' = sv.scene_path limit 1), 1),
      'bounds', sv.bounds,
      'alignment', sv.alignment -> 'matrix',
      'start', sv.start_view,
      'viewpoints', coalesce((
        select jsonb_agg(jsonb_build_object('roomId', v.room_id, 'position', to_jsonb(v.position), 'target', to_jsonb(v.target)))
        from public.scene_room_views v where v.scene_version_id = sv.id), '[]'::jsonb),
      'doorways', coalesce((
        select jsonb_agg(jsonb_build_object('a', d.room_a, 'b', d.room_b, 'position', to_jsonb(d.position)))
        from public.scene_doorways d where d.scene_version_id = sv.id), '[]'::jsonb),
      'hotspots', coalesce((
        select jsonb_agg(jsonb_build_object('applianceId', h.appliance_id, 'position', to_jsonb(h.position)))
        from public.hotspots h where h.scene_version_id = sv.id), '[]'::jsonb))
  ))
  from apt, sv;
$$;

-- ---------- publish / unpublish ---------------------------------------------------------------
create function public.publish_apartment(p_apartment uuid, p_scene uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apt public.apartments;
  v_problems jsonb;
  v_version integer;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_apt from public.apartments a where a.id = p_apartment for update;
  if v_apt.id is null or not coalesce(private.can_access_apartment(p_apartment, 'apartment.publish'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  v_problems := private.publish_problems(p_apartment, p_scene);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'PUBLISH_BLOCKED' using errcode = '55000', detail = v_problems::text;
  end if;
  select coalesce(max(v.version), 0) + 1 into v_version
  from public.published_versions v where v.apartment_id = p_apartment;
  insert into public.published_versions (organization_id, apartment_id, version, scene_version_id, snapshot, published_by)
  values (v_apt.organization_id, p_apartment, v_version, p_scene, private.guest_snapshot(p_apartment, p_scene), (select auth.uid()));
  update public.scene_versions set status = 'superseded'
  where apartment_id = p_apartment and status = 'published' and id <> p_scene;
  update public.scene_versions set status = 'published', published_at = now() where id = p_scene;
  perform set_config('nookscanner.publishing', 'on', true);
  update public.apartments set status = 'published' where id = p_apartment;
  perform set_config('nookscanner.publishing', '', true);
  return v_version;
end;
$$;

create function public.unpublish_apartment(p_apartment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not coalesce(private.can_access_apartment(p_apartment, 'apartment.publish'), false) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  perform set_config('nookscanner.publishing', 'on', true);
  update public.apartments set status = 'review' where id = p_apartment and status = 'published';
  perform set_config('nookscanner.publishing', '', true);
end;
$$;

revoke execute on function private.publish_problems(uuid, uuid), private.guest_snapshot(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.guest_snapshot(uuid, uuid) to service_role;
revoke execute on function public.publish_check(uuid, uuid), public.publish_apartment(uuid, uuid),
  public.unpublish_apartment(uuid) from public, anon;
grant execute on function public.publish_check(uuid, uuid), public.publish_apartment(uuid, uuid),
  public.unpublish_apartment(uuid) to authenticated;
