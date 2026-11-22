-- =====================================================================================
-- Nookscanner Stage 9.1: guest access (ADR-023). The guest Edge Functions run with the service
-- role over a direct connection and call these private functions only:
--   guest_lookup(token)  -> latest published snapshot, or null (unknown/revoked/unpublished:
--                           the function answers the same 404 for all of them)
--   guest_rate_hit(key)  -> fixed-window counter per hashed client key (no raw IPs stored)
-- The snapshot now also freezes each appliance's media paths at publishing time.
-- =====================================================================================

create table public.guest_rate_limits (
  key text not null check (key ~ '^[a-z]+:[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.guest_rate_limits enable row level security;
revoke all on public.guest_rate_limits from anon, authenticated;
grant all on public.guest_rate_limits to service_role;

create function private.guest_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.guest_rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- Housekeeping: old windows are useless; delete a few per call.
  delete from public.guest_rate_limits
  where ctid in (select ctid from public.guest_rate_limits where window_start < now() - interval '1 hour' limit 20);
  return v_hits <= p_limit;
end;
$$;

create function private.guest_lookup(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pv.snapshot
  from public.qr_codes q
  join public.apartments a on a.id = q.apartment_id
  join lateral (
    select v.snapshot from public.published_versions v
    where v.apartment_id = a.id order by v.version desc limit 1
  ) pv on true
  where q.token = p_token and q.status = 'active' and a.status = 'published';
$$;

-- Latest body from migration 20261122001400 plus frozen media per appliance.
create or replace function private.guest_snapshot(p_apartment uuid, p_scene uuid)
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
        -- Photos/videos as of publishing (paths; the guest function signs them, 9.1).
        'media', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'kind', m.kind, 'path', m.object_path,
            'caption', case when coalesce(m.caption_en, m.caption_ar) is not null then
              jsonb_strip_nulls(jsonb_build_object('en', coalesce(m.caption_en, m.caption_ar), 'ar', m.caption_ar)) end))
            order by m.sort_order, m.created_at)
          from public.instructions i2 join public.instruction_media m on m.instruction_id = i2.id
          where i2.appliance_id = a.id), '[]'::jsonb),
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

revoke execute on function private.guest_rate_hit(text, integer, integer), private.guest_lookup(text)
  from public, anon, authenticated;
grant execute on function private.guest_rate_hit(text, integer, integer), private.guest_lookup(text)
  to service_role;
