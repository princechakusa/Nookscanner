-- =====================================================================================
-- Nookscanner foundation migration
-- Spec: docs/DATABASE_SCHEMA.md (tables marked M), docs/SECURITY.md, ADR-011.
-- Creates: enums, utility triggers, permission model, tenancy tables (organizations,
-- members, properties, apartments, rooms), audit log, helper functions, RLS policies,
-- and the create_organization RPC.
-- Conventions: every SECURITY DEFINER function sets search_path = '' and uses fully
-- qualified names (threat T20). RLS is enabled on every table. anon gets no privileges.
-- =====================================================================================

-- ---------- Enum types ---------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'manager', 'editor', 'viewer');
create type public.member_scope as enum ('organization', 'properties');
create type public.apartment_status as enum ('draft', 'capturing', 'processing', 'review', 'published', 'archived');
create type public.room_type as enum (
  'entrance', 'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'hallway',
  'balcony', 'laundry', 'office', 'storage', 'other'
);
create type public.locale_code as enum ('en', 'ar');

-- ---------- Utility trigger functions -------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Prevents moving a row to another tenant after creation.
create function public.prevent_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------- Profiles -----------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  locale public.locale_code not null default 'en',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Only privileged database roles may change the platform-admin flag (threat T05).
create function public.protect_platform_admin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'is_platform_admin can only be changed by the platform' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_admin_flag before update on public.profiles
  for each row execute function public.protect_platform_admin_flag();

-- Create a profile automatically for each new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(nullif(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Permission model (ADR-011) ------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z]+\.[a-z]+$'),
  level text not null check (level in ('organization', 'property')),
  description text not null
);

create table public.role_permissions (
  role public.org_role not null,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

insert into public.permissions (key, level, description) values
  ('org.read', 'organization', 'View organization'),
  ('org.update', 'organization', 'Edit organization settings'),
  ('org.delete', 'organization', 'Delete organization'),
  ('member.read', 'organization', 'View members'),
  ('member.manage', 'organization', 'Invite, change and remove members'),
  ('audit.read', 'organization', 'View audit log'),
  ('property.create', 'organization', 'Create properties'),
  ('property.read', 'property', 'View properties'),
  ('property.update', 'property', 'Edit properties'),
  ('property.delete', 'property', 'Delete properties'),
  ('apartment.read', 'property', 'View apartments'),
  ('apartment.create', 'property', 'Create apartments'),
  ('apartment.update', 'property', 'Edit apartments'),
  ('apartment.delete', 'property', 'Delete apartments'),
  ('apartment.publish', 'property', 'Publish and unpublish apartments'),
  ('room.write', 'property', 'Create and edit rooms'),
  ('scan.read', 'property', 'View scans and processing'),
  ('scan.create', 'property', 'Capture and upload scans'),
  ('scan.review', 'property', 'Approve or reject reconstructions'),
  ('appliance.write', 'property', 'Manage appliances'),
  ('hotspot.write', 'property', 'Manage hotspots'),
  ('instruction.write', 'property', 'Write instructions'),
  ('instruction.verify', 'property', 'Verify instructions'),
  ('qr.manage', 'property', 'Manage QR codes'),
  ('analytics.read', 'property', 'View analytics');

-- viewer: read; editor: + content; manager: + operations; admin: + administration; owner: + delete org.
insert into public.role_permissions (role, permission)
select r.role::public.org_role, p.key
from (values ('owner'), ('admin'), ('manager'), ('editor'), ('viewer')) as r(role)
join public.permissions p on (
  p.key in ('org.read', 'member.read', 'property.read', 'apartment.read', 'scan.read', 'analytics.read')
  or (r.role in ('owner', 'admin', 'manager', 'editor')
      and p.key in ('room.write', 'appliance.write', 'hotspot.write', 'instruction.write'))
  or (r.role in ('owner', 'admin', 'manager')
      and p.key in ('property.update', 'apartment.create', 'apartment.update', 'apartment.publish',
                    'scan.create', 'scan.review', 'instruction.verify', 'qr.manage'))
  or (r.role in ('owner', 'admin')
      and p.key in ('org.update', 'member.manage', 'audit.read', 'property.create',
                    'property.delete', 'apartment.delete'))
  or (r.role = 'owner' and p.key = 'org.delete')
);

-- ---------- Organizations and membership -----------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  default_locale public.locale_code not null default 'en',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null,
  scope public.member_scope not null default 'organization',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_members_scoped_roles
    check (scope = 'organization' or role in ('manager', 'editor', 'viewer'))
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();

-- ---------- Properties ----------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address_line1 text check (address_line1 is null or char_length(address_line1) <= 200),
  address_line2 text check (address_line2 is null or char_length(address_line2) <= 200),
  city text check (city is null or char_length(city) <= 100),
  country_code char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  default_locale public.locale_code not null default 'en',
  support_phone text check (support_phone is null or support_phone ~ '^\+?[0-9 ()-]{6,24}$'),
  support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_whatsapp text check (support_whatsapp is null or support_whatsapp ~ '^\+?[0-9]{6,20}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_organization_id_idx on public.properties (organization_id);

create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();
create trigger properties_prevent_org_change before update on public.properties
  for each row execute function public.prevent_org_change();

create table public.property_members (
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

create index property_members_user_id_idx on public.property_members (user_id);
create index property_members_organization_id_idx on public.property_members (organization_id);

-- ---------- Apartments and rooms -------------------------------------------------------
create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit_number text check (unit_number is null or char_length(unit_number) <= 40),
  floor text check (floor is null or char_length(floor) <= 20),
  status public.apartment_status not null default 'draft',
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  public_id text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index apartments_organization_id_idx on public.apartments (organization_id);
create index apartments_property_id_idx on public.apartments (property_id);

create trigger apartments_set_updated_at before update on public.apartments
  for each row execute function public.set_updated_at();
create trigger apartments_prevent_org_change before update on public.apartments
  for each row execute function public.prevent_org_change();

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  name_en text not null check (char_length(btrim(name_en)) between 1 and 80),
  name_ar text check (name_ar is null or char_length(name_ar) <= 80),
  room_type public.room_type not null,
  sort_order integer not null default 0,
  floor_polygon jsonb check (floor_polygon is null or jsonb_typeof(floor_polygon) = 'array'),
  viewpoints jsonb not null default '[]'::jsonb check (jsonb_typeof(viewpoints) = 'array'),
  connections uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apartment_id, name_en)
);

create index rooms_organization_id_idx on public.rooms (organization_id);
create index rooms_apartment_id_idx on public.rooms (apartment_id);

create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();
create trigger rooms_prevent_org_change before update on public.rooms
  for each row execute function public.prevent_org_change();

-- ---------- Parent/tenant consistency triggers (threat T03) -----------------------------
-- Sets organization_id from the parent row when omitted and rejects mismatches, so a child
-- row can never reference another tenant's parent.
create function public.enforce_parent_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_org uuid;
begin
  if tg_table_name = 'apartments' or tg_table_name = 'property_members' then
    select p.organization_id into v_parent_org from public.properties p where p.id = new.property_id;
  elsif tg_table_name = 'rooms' then
    select a.organization_id into v_parent_org from public.apartments a where a.id = new.apartment_id;
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
  end if;
  return new;
end;
$$;

create trigger apartments_enforce_parent_org before insert or update of property_id, organization_id
  on public.apartments for each row execute function public.enforce_parent_org();
create trigger rooms_enforce_parent_org before insert or update of apartment_id, organization_id
  on public.rooms for each row execute function public.enforce_parent_org();
create trigger property_members_enforce_parent_org before insert or update
  on public.property_members for each row execute function public.enforce_parent_org();

-- Publishing is only possible through the publish RPC (Phase 8), which sets
-- nookscanner.publishing = 'on' for its transaction.
create function public.guard_publication_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.status = 'published' or (tg_op = 'UPDATE' and old.status = 'published'))
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and coalesce(current_setting('nookscanner.publishing', true), '') <> 'on'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'publication status can only change through publish_apartment' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger apartments_guard_publication before insert or update of status on public.apartments
  for each row execute function public.guard_publication_status();

-- ---------- Authorization helpers ------------------------------------------------------
create function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create function public.org_role_of(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org and m.user_id = (select auth.uid());
$$;

-- True when the caller holds p_permission organization-wide. Property-level permissions are
-- only granted here to members whose scope is the whole organization.
create function public.has_org_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp on rp.role = m.role and rp.permission = p_permission
    join public.permissions p on p.key = rp.permission
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and (m.scope = 'organization' or p.level = 'organization')
  );
$$;

-- Property-scoped check from the row's own columns. Used by policies on public.properties,
-- because a just-inserted row is not yet visible to lookups inside the policy (INSERT ... RETURNING).
create function public.has_property_permission(p_org uuid, p_property uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp on rp.role = m.role and rp.permission = p_permission
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and (
        m.scope = 'organization'
        or exists (
          select 1 from public.property_members pm
          where pm.property_id = p_property and pm.user_id = m.user_id
        )
      )
  );
$$;

create function public.can_access_property(p_property uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.has_property_permission(pr.organization_id, pr.id, p_permission)
     from public.properties pr where pr.id = p_property),
    false
  );
$$;

create function public.can_access_apartment(p_apartment uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_property(a.property_id, p_permission)
  from public.apartments a
  where a.id = p_apartment;
$$;

create function public.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- ---------- Membership invariants (threats T02, T04) -----------------------------------
create function public.protect_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_actor uuid := (select auth.uid());
  v_actor_role public.org_role;
begin
  -- Key columns are immutable.
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.user_id <> old.user_id) then
    raise exception 'membership keys cannot be changed' using errcode = '42501';
  end if;

  -- Organization itself is being deleted (cascade): nothing to protect.
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations o where o.id = v_org) then
    return old;
  end if;

  -- Only owners may grant, change or remove the owner role. Exception: the very first
  -- membership of a new organization (created by create_organization).
  if v_actor is not null
     and ((tg_op in ('INSERT', 'UPDATE') and new.role = 'owner')
          or (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner')) then
    select m.role into v_actor_role from public.organization_members m
    where m.organization_id = v_org and m.user_id = v_actor;
    if v_actor_role is distinct from 'owner'
       and not (tg_op = 'INSERT' and not exists (
         select 1 from public.organization_members m where m.organization_id = v_org)) then
      raise exception 'OWNER_ROLE_REQUIRED' using errcode = '42501';
    end if;
  end if;

  -- An organization must always keep at least one owner.
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organization_members_protect before insert or update or delete
  on public.organization_members for each row execute function public.protect_membership();

-- ---------- Audit log (append-only, threat T19) ----------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_org uuid;
  v_entity text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  else
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  end if;

  v_entity := coalesce(
    v_new ->> 'id', v_old ->> 'id',
    concat_ws(':', coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id', v_new ->> 'property_id', v_old ->> 'property_id'),
                   coalesce(v_new ->> 'user_id', v_old ->> 'user_id'))
  );

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, old_data, new_data)
  values (v_org, (select auth.uid()), lower(tg_op), tg_table_name, v_entity, v_old, v_new);

  return coalesce(new, old);
end;
$$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.audit_trigger();
create trigger organization_members_audit after insert or update or delete on public.organization_members
  for each row execute function public.audit_trigger();
create trigger property_members_audit after insert or update or delete on public.property_members
  for each row execute function public.audit_trigger();
create trigger properties_audit after insert or update or delete on public.properties
  for each row execute function public.audit_trigger();
create trigger apartments_audit after insert or update or delete on public.apartments
  for each row execute function public.audit_trigger();
create trigger rooms_audit after insert or update or delete on public.rooms
  for each row execute function public.audit_trigger();

-- ---------- RPC: create organization ---------------------------------------------------
create function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role, scope)
  values (v_org, v_user, 'owner', 'organization');

  return v_org;
end;
$$;

-- ---------- Row Level Security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.properties enable row level security;
alter table public.property_members enable row level security;
alter table public.apartments enable row level security;
alter table public.rooms enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- permission catalog (read-only reference data)
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- organizations (insert only through create_organization)
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_permission(id, 'org.update'))
  with check (public.has_org_permission(id, 'org.update'));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.has_org_permission(id, 'org.delete'));

-- organization_members
create policy members_select on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));
create policy members_insert on public.organization_members for insert to authenticated
  with check (public.has_org_permission(organization_id, 'member.manage'));
create policy members_update on public.organization_members for update to authenticated
  using (public.has_org_permission(organization_id, 'member.manage'))
  with check (public.has_org_permission(organization_id, 'member.manage'));
create policy members_delete on public.organization_members for delete to authenticated
  using (public.has_org_permission(organization_id, 'member.manage') or user_id = (select auth.uid()));

-- properties
create policy properties_select on public.properties for select to authenticated
  using (public.has_property_permission(organization_id, id, 'property.read'));
create policy properties_insert on public.properties for insert to authenticated
  with check (public.has_org_permission(organization_id, 'property.create'));
create policy properties_update on public.properties for update to authenticated
  using (public.has_property_permission(organization_id, id, 'property.update'))
  with check (public.has_property_permission(organization_id, id, 'property.update'));
create policy properties_delete on public.properties for delete to authenticated
  using (public.has_property_permission(organization_id, id, 'property.delete'));

-- property_members
create policy property_members_select on public.property_members for select to authenticated
  using (public.has_org_permission(organization_id, 'member.read'));
create policy property_members_insert on public.property_members for insert to authenticated
  with check (public.has_org_permission(organization_id, 'member.manage'));
create policy property_members_delete on public.property_members for delete to authenticated
  using (public.has_org_permission(organization_id, 'member.manage'));

-- apartments
create policy apartments_select on public.apartments for select to authenticated
  using (public.can_access_property(property_id, 'apartment.read'));
create policy apartments_insert on public.apartments for insert to authenticated
  with check (public.can_access_property(property_id, 'apartment.create'));
create policy apartments_update on public.apartments for update to authenticated
  using (public.can_access_property(property_id, 'apartment.update'))
  with check (public.can_access_property(property_id, 'apartment.update'));
create policy apartments_delete on public.apartments for delete to authenticated
  using (public.can_access_property(property_id, 'apartment.delete'));

-- rooms
create policy rooms_select on public.rooms for select to authenticated
  using (public.can_access_apartment(apartment_id, 'apartment.read'));
create policy rooms_insert on public.rooms for insert to authenticated
  with check (public.can_access_apartment(apartment_id, 'room.write'));
create policy rooms_update on public.rooms for update to authenticated
  using (public.can_access_apartment(apartment_id, 'room.write'))
  with check (public.can_access_apartment(apartment_id, 'room.write'));
create policy rooms_delete on public.rooms for delete to authenticated
  using (public.can_access_apartment(apartment_id, 'room.write'));

-- audit_logs (read-only for owners/admins; no write policies)
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (organization_id is not null and public.has_org_permission(organization_id, 'audit.read'));

-- ---------- Privileges (least privilege; anon has nothing) -------------------------------
revoke all on table
  public.profiles, public.permissions, public.role_permissions, public.organizations,
  public.organization_members, public.properties, public.property_members,
  public.apartments, public.rooms, public.audit_logs
from anon, authenticated;

grant select on public.permissions, public.role_permissions, public.audit_logs to authenticated;
grant select, update (full_name, locale) on public.profiles to authenticated;
grant select, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, delete on public.property_members to authenticated;
grant select, insert, update, delete on public.apartments to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_organization(text, text),
  public.is_org_member(uuid),
  public.org_role_of(uuid),
  public.has_org_permission(uuid, text),
  public.has_property_permission(uuid, uuid, text),
  public.can_access_property(uuid, text),
  public.can_access_apartment(uuid, text),
  public.shares_org_with(uuid),
  public.is_platform_admin()
to authenticated;
