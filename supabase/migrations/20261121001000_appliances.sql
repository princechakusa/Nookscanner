-- =====================================================================================
-- Nookscanner Stage 8.1: appliance categories, model library and appliances
-- (DATABASE_SCHEMA 4.17-4.19). Categories are global and read-only to users (platform data);
-- the model library has global rows (platform) and organization rows; appliances belong to a room
-- of an apartment and follow the same property-scoped access as rooms.
-- =====================================================================================

create table public.appliance_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]{2,40}$'),
  name_en text not null check (char_length(name_en) between 1 and 60),
  name_ar text not null check (char_length(name_ar) between 1 and 60),
  aliases_en text[] not null default '{}' check (cardinality(aliases_en) <= 20),
  aliases_ar text[] not null default '{}' check (cardinality(aliases_ar) <= 20),
  icon text not null default 'default' check (icon ~ '^[a-z_]{2,40}$'),
  sort_order integer not null default 0
);

create table public.appliance_models (
  id uuid primary key default gen_random_uuid(),
  -- null = global library (platform-managed)
  organization_id uuid references public.organizations (id) on delete cascade,
  category_id uuid not null references public.appliance_categories (id),
  brand text not null check (char_length(btrim(brand)) between 1 and 60),
  model_number text not null check (char_length(btrim(model_number)) between 1 and 60),
  display_name text check (display_name is null or char_length(display_name) <= 120),
  manual_url text check (manual_url is null or (manual_url ~ '^https://[^\s]+$' and char_length(manual_url) <= 500)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index appliance_models_unique_idx on public.appliance_models
  (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(brand), lower(model_number));
create index appliance_models_organization_idx on public.appliance_models (organization_id);
create index appliance_models_category_idx on public.appliance_models (category_id);

create table public.appliances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  category_id uuid not null references public.appliance_categories (id),
  appliance_model_id uuid references public.appliance_models (id) on delete set null,
  name_en text not null check (char_length(btrim(name_en)) between 1 and 80),
  name_ar text check (name_ar is null or char_length(name_ar) <= 80),
  brand text check (brand is null or char_length(brand) <= 60),
  model_number text check (model_number is null or char_length(model_number) <= 60),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appliances_organization_idx on public.appliances (organization_id);
create index appliances_apartment_idx on public.appliances (apartment_id);
create index appliances_room_idx on public.appliances (room_id);
create index appliances_category_idx on public.appliances (category_id);
create index appliances_model_idx on public.appliances (appliance_model_id);

create trigger appliance_models_set_updated_at before update on public.appliance_models
  for each row execute function public.set_updated_at();
create trigger appliances_set_updated_at before update on public.appliances
  for each row execute function public.set_updated_at();
create trigger appliances_prevent_org_change before update on public.appliances
  for each row execute function public.prevent_org_change();
create trigger appliance_models_audit after insert or update or delete on public.appliance_models
  for each row execute function public.audit_trigger();
create trigger appliances_audit after insert or update or delete on public.appliances
  for each row execute function public.audit_trigger();

-- ---------- tenant consistency (threat T03): appliances follow their apartment --------------
-- Latest body (migration 20261120000100) plus 'appliances' in the apartment branch.
create or replace function public.enforce_parent_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_org uuid;
begin
  if tg_table_name in ('apartments', 'property_members') then
    select p.organization_id into v_parent_org from public.properties p where p.id = new.property_id;
  elsif tg_table_name in ('rooms', 'scan_sessions', 'qr_codes', 'appliances') then
    select a.organization_id into v_parent_org from public.apartments a where a.id = new.apartment_id;
  elsif tg_table_name in ('scan_checkpoints', 'media_uploads') then
    select s.organization_id into v_parent_org from public.scan_sessions s where s.id = new.scan_session_id;
  else
    raise exception 'enforce_parent_org not configured for %', tg_table_name;
  end if;

  if v_parent_org is null then
    raise exception 'parent row not found' using errcode = '23503';
  end if;
  if new.organization_id is null then
    new.organization_id := v_parent_org;
  elsif new.organization_id <> v_parent_org then
    raise exception 'organization mismatch with parent row' using errcode = '42501';
  end if;

  if tg_table_name = 'property_members' then
    -- Nested IF: new.user_id only exists on property_members rows.
    if not exists (
      select 1 from public.organization_members m
      where m.organization_id = new.organization_id and m.user_id = new.user_id
    ) then
      raise exception 'user is not a member of the organization' using errcode = '23503';
    end if;
  elsif tg_table_name = 'scan_checkpoints' then
    -- A checkpoint's room must belong to the scanned apartment.
    if new.room_id is not null and not exists (
      select 1 from public.rooms r join public.scan_sessions s on s.apartment_id = r.apartment_id
      where r.id = new.room_id and s.id = new.scan_session_id
    ) then
      raise exception 'room does not belong to the scanned apartment' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger appliances_enforce_parent_org before insert or update of apartment_id, organization_id
  on public.appliances for each row execute function public.enforce_parent_org();

-- The room is in the same apartment; a linked model is global or the organization's own.
create function private.check_appliance_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.rooms r where r.id = new.room_id and r.apartment_id = new.apartment_id) then
    raise exception 'room is not in this apartment' using errcode = '23503';
  end if;
  if new.appliance_model_id is not null and not exists (
    select 1 from public.appliance_models m
    where m.id = new.appliance_model_id
      and (m.organization_id is null or m.organization_id = new.organization_id)
  ) then
    raise exception 'appliance model not available to this organization' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_appliance_links() from public, anon, authenticated;

-- Runs after enforce_parent_org (trigger names fire in alphabetical order: "appliances_enforce"
-- < "appliances_links"), so organization_id is already set.
create trigger appliances_links before insert or update of room_id, apartment_id, appliance_model_id
  on public.appliances for each row execute function private.check_appliance_links();

-- ---------- RLS ---------------------------------------------------------------------------
alter table public.appliance_categories enable row level security;
alter table public.appliance_models enable row level security;
alter table public.appliances enable row level security;

create policy appliance_categories_select on public.appliance_categories for select to authenticated
  using (true);

create policy appliance_models_select on public.appliance_models for select to authenticated
  using (organization_id is null or private.is_org_member(organization_id));
create policy appliance_models_insert on public.appliance_models for insert to authenticated
  with check (organization_id is not null and private.has_org_permission(organization_id, 'appliance.write'));
create policy appliance_models_update on public.appliance_models for update to authenticated
  using (organization_id is not null and private.has_org_permission(organization_id, 'appliance.write'))
  with check (organization_id is not null and private.has_org_permission(organization_id, 'appliance.write'));
create policy appliance_models_delete on public.appliance_models for delete to authenticated
  using (organization_id is not null and private.has_org_permission(organization_id, 'appliance.write'));

create policy appliances_select on public.appliances for select to authenticated
  using (private.can_access_apartment(apartment_id, 'apartment.read'));
create policy appliances_insert on public.appliances for insert to authenticated
  with check (private.can_access_apartment(apartment_id, 'appliance.write'));
create policy appliances_update on public.appliances for update to authenticated
  using (private.can_access_apartment(apartment_id, 'appliance.write'))
  with check (private.can_access_apartment(apartment_id, 'appliance.write'));
create policy appliances_delete on public.appliances for delete to authenticated
  using (private.can_access_apartment(apartment_id, 'appliance.write'));

revoke all on public.appliance_categories, public.appliance_models, public.appliances from anon, authenticated;
grant select on public.appliance_categories to authenticated;
grant select, insert, update, delete on public.appliance_models, public.appliances to authenticated;
grant all on public.appliance_categories, public.appliance_models, public.appliances to service_role;

-- ---------- seed: global categories (EN/AR names, search aliases; Arabic pending native review)
insert into public.appliance_categories (key, name_en, name_ar, aliases_en, aliases_ar, icon, sort_order) values
  ('air_conditioner', 'Air conditioner', 'مكيّف الهواء', '{ac,"a/c",aircon,"air con",cooling,heating,split}', '{مكيف,تكييف,سبليت}', 'air_conditioner', 10),
  ('tv', 'TV', 'تلفزيون', '{television,"smart tv",screen,netflix}', '{تلفاز,شاشة}', 'tv', 20),
  ('router', 'Wi-Fi router', 'راوتر الواي فاي', '{wifi,"wi-fi",internet,modem,password}', '{واي فاي,انترنت,مودم,راوتر}', 'router', 30),
  ('oven', 'Oven', 'فرن', '{cooker,grill}', '{فرن,شواية}', 'oven', 40),
  ('hob', 'Hob', 'موقد', '{stove,cooktop,induction,gas}', '{طباخ,غاز,موقد}', 'oven', 50),
  ('microwave', 'Microwave', 'ميكروويف', '{micro}', '{مايكرويف}', 'oven', 60),
  ('refrigerator', 'Fridge', 'ثلاجة', '{refrigerator,freezer}', '{براد,فريزر}', 'default', 70),
  ('dishwasher', 'Dishwasher', 'غسالة صحون', '{"dish washer"}', '{جلاية,غسالة الصحون}', 'washer', 80),
  ('coffee_machine', 'Coffee machine', 'آلة القهوة', '{coffee,espresso,nespresso,capsules}', '{قهوة,ماكينة قهوة}', 'default', 90),
  ('kettle', 'Kettle', 'غلاية', '{"water boiler"}', '{كاتل,غلاية ماء}', 'default', 100),
  ('extractor_hood', 'Extractor hood', 'شفاط المطبخ', '{hood,extractor,"cooker hood"}', '{شفاط}', 'default', 110),
  ('washer', 'Washing machine', 'غسالة ملابس', '{washer,laundry,"washing machine"}', '{غسالة,غسيل}', 'washer', 120),
  ('dryer', 'Dryer', 'مجفف ملابس', '{"tumble dryer",drier}', '{نشافة,مجفف}', 'washer', 130),
  ('water_heater', 'Water heater', 'سخان الماء', '{boiler,"hot water",geyser}', '{سخان,ماء ساخن}', 'default', 140),
  ('thermostat', 'Thermostat', 'منظم الحرارة', '{temperature,heating}', '{ثرموستات}', 'default', 150),
  ('smart_lock', 'Door lock', 'قفل الباب', '{lock,keypad,"door code",keys}', '{قفل,رمز الباب,مفتاح}', 'default', 160),
  ('intercom', 'Intercom', 'الإنتركم', '{doorbell,"entry phone",buzzer}', '{انتركم,جرس الباب}', 'default', 170),
  ('iron', 'Iron', 'مكواة', '{ironing}', '{كوي}', 'default', 180),
  ('hair_dryer', 'Hair dryer', 'مجفف الشعر', '{hairdryer,blowdryer}', '{سشوار}', 'default', 190),
  ('vacuum', 'Vacuum cleaner', 'مكنسة كهربائية', '{vacuum,hoover}', '{مكنسة}', 'default', 200),
  ('safe', 'Safe', 'خزنة', '{"safe box",valuables}', '{خزنة}', 'default', 210),
  ('other', 'Other', 'أخرى', '{}', '{}', 'default', 990);
