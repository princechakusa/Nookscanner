-- =====================================================================================
-- Nookscanner Stage 8.3: instructions, versions and media (DATABASE_SCHEMA 4.21-4.23, ADR-021).
-- One instruction per appliance (model-level instructions are allowed by the schema for the
-- library later). Versions are APPEND-ONLY per language: every save inserts the next version,
-- unverified; nothing can be edited afterwards except verification by the platform/RPC (8.4).
-- Text is stored as written; it is rendered as a safe Markdown subset to elements, never as HTML
-- (packages/shared markdown.ts). Media files live in the private instruction-media bucket under
-- org/<org>/apartments/<apartment>/instructions/<instruction>/... (storage RLS from 2.3).
-- =====================================================================================

create type public.media_kind as enum ('image', 'video');

create table public.instructions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  appliance_id uuid unique references public.appliances (id) on delete cascade,
  appliance_model_id uuid references public.appliance_models (id) on delete cascade,
  -- Denormalised for RLS and storage paths (from the appliance).
  apartment_id uuid references public.apartments (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((appliance_id is null) <> (appliance_model_id is null)),
  check (appliance_id is null or (organization_id is not null and apartment_id is not null))
);
create index instructions_organization_idx on public.instructions (organization_id);
create index instructions_apartment_idx on public.instructions (apartment_id);
create index instructions_model_idx on public.instructions (appliance_model_id);

create table public.instruction_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  instruction_id uuid not null references public.instructions (id) on delete cascade,
  locale public.locale_code not null,
  version integer not null check (version >= 1),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- [{ "text": "..." }] (1-30 steps, each <= 1000 characters)
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 30),
  -- [{ "problem": "...", "solution": "..." }] (<= 20)
  troubleshooting jsonb not null default '[]'::jsonb
    check (jsonb_typeof(troubleshooting) = 'array' and jsonb_array_length(troubleshooting) <= 20),
  body_md text check (body_md is null or char_length(body_md) <= 5000),
  verification_status public.verification_status not null default 'unverified',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (instruction_id, locale, version)
);
create index instruction_versions_organization_idx on public.instruction_versions (organization_id);
create index instruction_versions_latest_idx on public.instruction_versions (instruction_id, locale, version desc);
create index instruction_versions_created_by_idx on public.instruction_versions (created_by);
create index instruction_versions_verified_by_idx on public.instruction_versions (verified_by);

create table public.instruction_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  instruction_id uuid not null references public.instructions (id) on delete cascade,
  kind public.media_kind not null,
  object_path text not null unique check (char_length(object_path) <= 512),
  -- null = shown in both languages
  locale public.locale_code,
  caption_en text check (caption_en is null or char_length(caption_en) <= 200),
  caption_ar text check (caption_ar is null or char_length(caption_ar) <= 200),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  duration_ms integer check (duration_ms is null or duration_ms between 1 and 3600000),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index instruction_media_instruction_idx on public.instruction_media (instruction_id, sort_order);
create index instruction_media_organization_idx on public.instruction_media (organization_id);
create index instruction_media_created_by_idx on public.instruction_media (created_by);

create trigger instructions_set_updated_at before update on public.instructions
  for each row execute function public.set_updated_at();
create trigger instructions_audit after insert or update or delete on public.instructions
  for each row execute function public.audit_trigger();
create trigger instruction_versions_audit after insert or update or delete on public.instruction_versions
  for each row execute function public.audit_trigger();
create trigger instruction_media_audit after insert or update or delete on public.instruction_media
  for each row execute function public.audit_trigger();

-- ---------- integrity triggers --------------------------------------------------------------
-- Instruction: organization and apartment come from the appliance; never re-parented.
create function private.check_instruction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appliance public.appliances;
begin
  if tg_op = 'UPDATE' and (new.appliance_id is distinct from old.appliance_id
      or new.appliance_model_id is distinct from old.appliance_model_id
      or new.organization_id is distinct from old.organization_id
      or new.apartment_id is distinct from old.apartment_id) then
    raise exception 'IMMUTABLE_COLUMN' using errcode = '42501';
  end if;
  if new.appliance_id is not null then
    select * into v_appliance from public.appliances a where a.id = new.appliance_id;
    if v_appliance.id is null then
      raise exception 'parent row not found' using errcode = '23503';
    end if;
    new.organization_id := v_appliance.organization_id;
    new.apartment_id := v_appliance.apartment_id;
  end if;
  return new;
end;
$$;
create trigger instructions_check before insert or update on public.instructions
  for each row execute function private.check_instruction();

-- Version: next number per language, organization from the instruction, unverified, author =
-- caller; steps and troubleshooting shapes checked; rows are immutable (append-only).
create function private.check_instruction_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
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
create trigger instruction_versions_check before insert or update on public.instruction_versions
  for each row execute function private.check_instruction_version();

-- Media: organization from the instruction; the object must sit under the instruction's own
-- folder in its apartment (so storage RLS and the row agree).
create function private.check_instruction_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ins public.instructions;
begin
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
create trigger instruction_media_check before insert or update on public.instruction_media
  for each row execute function private.check_instruction_media();

revoke execute on function private.check_instruction(), private.check_instruction_version(),
  private.check_instruction_media() from public, anon, authenticated;

-- ---------- RLS -----------------------------------------------------------------------------
alter table public.instructions enable row level security;
alter table public.instruction_versions enable row level security;
alter table public.instruction_media enable row level security;

-- Model-level instructions (library) are not exposed to clients yet; appliance ones follow the
-- apartment.
create policy instructions_select on public.instructions for select to authenticated
  using (apartment_id is not null and private.can_access_apartment(apartment_id, 'apartment.read'));
create policy instructions_insert on public.instructions for insert to authenticated
  with check (appliance_id is not null and exists (
    select 1 from public.appliances a
    where a.id = appliance_id and private.can_access_apartment(a.apartment_id, 'instruction.write')));
create policy instructions_delete on public.instructions for delete to authenticated
  using (apartment_id is not null and private.can_access_apartment(apartment_id, 'instruction.write'));

create policy instruction_versions_select on public.instruction_versions for select to authenticated
  using (exists (select 1 from public.instructions i where i.id = instruction_id
                 and i.apartment_id is not null and private.can_access_apartment(i.apartment_id, 'apartment.read')));
create policy instruction_versions_insert on public.instruction_versions for insert to authenticated
  with check (exists (select 1 from public.instructions i where i.id = instruction_id
                      and i.apartment_id is not null and private.can_access_apartment(i.apartment_id, 'instruction.write')));

create policy instruction_media_select on public.instruction_media for select to authenticated
  using (exists (select 1 from public.instructions i where i.id = instruction_id
                 and i.apartment_id is not null and private.can_access_apartment(i.apartment_id, 'apartment.read')));
create policy instruction_media_insert on public.instruction_media for insert to authenticated
  with check (exists (select 1 from public.instructions i where i.id = instruction_id
                      and i.apartment_id is not null and private.can_access_apartment(i.apartment_id, 'instruction.write')));
create policy instruction_media_update on public.instruction_media for update to authenticated
  using (exists (select 1 from public.instructions i where i.id = instruction_id
                 and private.can_access_apartment(i.apartment_id, 'instruction.write')))
  with check (exists (select 1 from public.instructions i where i.id = instruction_id
                      and private.can_access_apartment(i.apartment_id, 'instruction.write')));
create policy instruction_media_delete on public.instruction_media for delete to authenticated
  using (exists (select 1 from public.instructions i where i.id = instruction_id
                 and private.can_access_apartment(i.apartment_id, 'instruction.write')));

revoke all on public.instructions, public.instruction_versions, public.instruction_media from anon, authenticated;
grant select, insert, delete on public.instructions to authenticated;
grant select, insert on public.instruction_versions to authenticated;
grant select, insert, update, delete on public.instruction_media to authenticated;
grant all on public.instructions, public.instruction_versions, public.instruction_media to service_role;

-- Removing a media file (Stage 2.3 created select/insert/update only).
create policy nookscanner_instruction_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'instruction-media' and private.can_access_storage_apartment(name, 'instruction.write'));
