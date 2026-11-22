# Nookscanner: Database Schema

Version 1.1 (2026-11-20). Postgres on Supabase. **All schema changes are made through migrations in `supabase/migrations/`; undocumented changes are forbidden.** When a migration changes the schema, this document is updated in the same commit.

Implementation status per table is in the last column of the overview (`M` = migrated and tested, `D` = designed, migration scheduled).

## 1. Conventions

- Primary keys: `id uuid default gen_random_uuid()` (bigint identity for high-volume append tables).
- Every tenant-owned table has `organization_id uuid not null` referencing `organizations(id) on delete cascade`, indexed. For child tables it is copied from the parent and **validated by trigger** (`enforce_parent_org`) so a row can never point at another tenant's parent.
- Timestamps: `created_at timestamptz not null default now()`, `updated_at` maintained by trigger `set_updated_at`.
- Soft delete only where restoring matters (`archived_at` on properties/apartments); otherwise hard delete with audit log.
- Bilingual short labels: `name_en text not null`, `name_ar text`.
- Enums are Postgres enum types (listed in section 3).
- RLS is **enabled on every table in `public`**; a CI test asserts it. `anon` has no table privileges; guests use Edge Functions (ADR-012).
- Helper functions (`security definer`, `set search_path = ''`, stable): `is_org_member(org)`, `org_role_of(org)`, `has_org_permission(org, perm)`, `has_property_permission(org, property, perm)` (works from the row's own columns; used by `properties` policies because a just-inserted row is not visible to lookups during `INSERT ... RETURNING`), `can_access_property(property, perm)`, `can_access_apartment(apartment, perm)`, `shares_org_with(user)`, `is_platform_admin()`.

## 2. Overview

| # | Table | Purpose | Status |
|---|---|---|---|
| 1 | `profiles` | One row per auth user: display name, locale, platform-admin flag | M |
| 2 | `organizations` | Tenants (property management companies) | M |
| 3 | `organization_members` | User membership + role + scope | M |
| 4 | `role_permissions` | Role -> permission key mapping (seeded, read-only to users) | M |
| 5 | `property_members` | Property scoping for members with `scope='properties'` | M |
| 6 | `organization_invitations` | Pending email invitations | M |
| 7 | `properties` | Buildings/sites | M |
| 8 | `apartments` | Units within a property | M |
| 9 | `rooms` | Rooms within an apartment + scene-space geometry | M |
| 10 | `scan_sessions` | One capture attempt (guided or upload) | M |
| 11 | `scan_checkpoints` | Guided checkpoints within a session | M |
| 12 | `media_uploads` | Uploaded videos/files and their validation | M |
| 13 | `processing_jobs` | Reconstruction jobs | D (Phase 6) |
| 14 | `processing_results` | Metrics + review outcome per job | D (Phase 6) |
| 15 | `scene_versions` | A reconstructed scene of an apartment + alignment | D (Phase 6) |
| 16 | `scene_assets` | Files belonging to a scene version (SOG, SPZ, PLY, previews) | D (Phase 6) |
| 17 | `appliance_categories` | AC, TV, washer... with EN/AR names and search aliases | D (Phase 8) |
| 18 | `appliance_models` | Brand + model library (global or org-specific) | D (Phase 8) |
| 19 | `appliances` | A physical appliance in a room of an apartment | D (Phase 8) |
| 20 | `hotspots` | 3D anchor of an appliance in a scene version | D (Phase 8) |
| 21 | `instructions` | Instruction record for an appliance or model | D (Phase 8) |
| 22 | `instruction_versions` | Versioned, per-locale instruction content + verification | D (Phase 8) |
| 23 | `instruction_media` | Images/videos for instructions | D (Phase 8) |
| 24 | `published_versions` | Immutable guest snapshot per publication | D (Phase 8/9) |
| 25 | `qr_codes` | Guest access tokens per apartment | M |
| 26 | `guest_sessions` | Anonymous guest visits | D (Phase 9) |
| 27 | `analytics_events` | Guest and system events | D (Phase 9/10) |
| 28 | `support_interactions` | Guest support contacts | D (Phase 9) |
| 29 | `notifications` | In-app notifications for members | D (Phase 6) |
| 30 | `support_access_grants` | Time-limited, audited platform support access | D (Phase 10) |
| 31 | `audit_logs` | Append-only audit trail | M |

```
organizations 1--* organization_members *--1 profiles(auth.users)
organizations 1--* properties 1--* apartments 1--* rooms
apartments 1--* scan_sessions 1--* scan_checkpoints
scan_sessions 1--* media_uploads ; scan_sessions 1--* processing_jobs 1--0..1 processing_results
apartments 1--* scene_versions 1--* scene_assets ; processing_results 1--0..1 scene_versions
rooms 1--* appliances *--0..1 appliance_models *--1 appliance_categories
scene_versions 1--* hotspots *--1 appliances
appliances / appliance_models 1--* instructions 1--* instruction_versions ; instructions 1--* instruction_media
apartments 1--* published_versions ; apartments 1--* qr_codes
apartments 1--* guest_sessions 1--* analytics_events ; guest_sessions 1--* support_interactions
```

## 3. Enum types

| Type | Values |
|---|---|
| `org_role` | owner, admin, manager, editor, viewer |
| `member_scope` | organization, properties |
| `apartment_status` | draft, capturing, processing, review, published, archived |
| `room_type` | entrance, living, kitchen, dining, bedroom, bathroom, hallway, balcony, laundry, office, storage, other |
| `capture_method` | guided_capture, video_upload |
| `scan_status` | draft, recording, uploading, uploaded, submitted, processing, succeeded, failed, cancelled |
| `upload_status` | pending, uploaded, validating, validated, rejected, deleted |
| `job_status` | queued, dispatched, running, succeeded, failed, cancelled |
| `review_status` | pending_review, approved, rejected |
| `scene_status` | draft, approved, published, superseded, rejected |
| `asset_kind` | splat_sog, splat_spz, splat_ply, lod_bundle, preview_image, thumbnail |
| `verification_status` | unverified, verified, needs_update |
| `publication_status` | draft, published, hidden |
| `media_kind` | image, video |
| `locale_code` | en, ar |
| `qr_status` | active, revoked |
| `support_channel` | whatsapp, phone, email, form |

## 4. Tables

Column notation: `name type [constraints]`. FK = foreign key. All tables also have `created_at`/`updated_at` unless noted.

### 4.1 `profiles` (M)
Purpose: application profile for each `auth.users` row (created by trigger on signup).
- `id uuid PK FK auth.users(id) on delete cascade`, `full_name text check (length <= 120)`, `locale locale_code default 'en'`, `is_platform_admin boolean not null default false`.
- RLS: select own row, or rows of users sharing an organization (for member lists); update own row except `is_platform_admin` (column privilege revoked; only service role / migration can set it).

### 4.2 `organizations` (M)
Purpose: tenant.
- `id uuid PK`, `name text not null (1..120)`, `slug text not null unique (^[a-z0-9-]{3,48}$)`, `default_locale locale_code default 'en'`, `created_by uuid FK auth.users`.
- Indexes: unique `slug`.
- RLS: select if member; update needs `org.update`; delete needs `org.delete`; insert only via RPC `create_organization(name, slug)` which inserts the org and an `owner` membership atomically (direct insert denied).

### 4.3 `organization_members` (M)
Purpose: membership, role, scope.
- PK `(organization_id, user_id)`; `organization_id FK organizations`, `user_id FK auth.users on delete cascade`, `role org_role not null`, `scope member_scope not null default 'organization'`, `invited_by uuid`.
- Constraint: `scope = 'properties'` only for roles manager/editor/viewer.
- Invariant (trigger): an organization always keeps at least one `owner` (AC-05).
- Indexes: `user_id`.
- RLS: select if member of org; update/delete need `member.manage`; a non-owner cannot grant or modify `owner` role (trigger). **No client inserts** (since `20261120000300`): rows are created only by `create_organization` and `accept_invitation`.

### 4.4 `role_permissions` (M)
Purpose: role -> permission mapping (ADR-011). PK `(role, permission)`. Seeded by migration; readable by authenticated; no writes from clients.

| Permission | owner | admin | manager | editor | viewer | Scope |
|---|---|---|---|---|---|---|
| org.read | x | x | x | x | x | org |
| org.update | x | x | | | | org |
| org.delete | x | | | | | org |
| member.read | x | x | x | x | x | org |
| member.manage | x | x | | | | org |
| audit.read | x | x | | | | org |
| property.read | x | x | x | x | x | property |
| property.create | x | x | | | | org |
| property.update | x | x | x | | | property |
| property.delete | x | x | | | | property |
| apartment.read | x | x | x | x | x | property |
| apartment.create | x | x | x | | | property |
| apartment.update | x | x | x | | | property |
| apartment.delete | x | x | | | | property |
| apartment.publish | x | x | x | | | property |
| room.write | x | x | x | x | | property |
| scan.read | x | x | x | x | x | property |
| scan.create | x | x | x | | | property |
| scan.review | x | x | x | | | property |
| appliance.write | x | x | x | x | | property |
| hotspot.write | x | x | x | x | | property |
| instruction.write | x | x | x | x | | property |
| instruction.verify | x | x | x | | | property |
| qr.manage | x | x | x | | | property |
| analytics.read | x | x | x | x | x | property |

"property" scope: for `scope='properties'` members the permission holds only on properties listed in `property_members`.

### 4.5 `property_members` (M)
PK `(property_id, user_id)`; `organization_id`, `property_id FK properties on delete cascade`, `user_id FK auth.users on delete cascade`. Trigger checks org consistency and that the user is a member of the org. RLS: select if `member.read`; write needs `member.manage`.

### 4.6 `organization_invitations` (M)
`id`, `organization_id`, `email citext`, `role org_role`, `scope member_scope`, `property_ids uuid[]`, `token_hash text unique` (SHA-256 of a random token; the token itself is only emailed), `expires_at` (7 days), `accepted_at`, `invited_by`. RLS: `member.manage`. Acceptance via RPC that verifies hash, expiry and email match.
- **As implemented (migration `20261120000100`):** `email text` stored lower-cased with a format check (no `citext` extension, so PGlite and Supabase behave identically); `role` can never be `owner` (ownership transfer is a separate owner-only action); `scope='properties'` iff `property_ids` is non-empty; extra columns `accepted_by`, `revoked_at`; one open invitation per (org, email). RPCs: `create_invitation(org, email, role, scope, property_ids)` returns the plaintext token once (only `token_hash` = SHA-256 hex is stored); `accept_invitation(token)` returns a uniform `NOT_FOUND` for unknown/used/revoked/expired tokens and `FORBIDDEN` when the signed-in email differs; `revoke_invitation(id)`. No direct client writes.

### 4.7 `properties` (M)
- `id`, `organization_id`, `name text (1..120)`, `address_line1/2 text`, `city text`, `country_code char(2)`, `timezone text not null default 'UTC'`, `default_locale locale_code`, `support_phone text`, `support_email text`, `support_whatsapp text`, `archived_at timestamptz`.
- Indexes: `organization_id`.
- RLS: select `property.read` (scoped); insert `property.create`; update `property.update` (scoped); delete `property.delete` (scoped).

### 4.8 `apartments` (M)
- `id`, `organization_id`, `property_id FK properties on delete cascade`, `name text (1..120)`, `unit_number text`, `floor text`, `status apartment_status default 'draft'`, `layout jsonb not null default '{}'` (questionnaire answers: bedrooms, bathrooms...), `public_id text unique` (short random id used in asset paths; not a secret), `published_version_id uuid` (FK published_versions, added Phase 8), `archived_at`.
- Indexes: `organization_id`, `property_id`, unique `public_id`.
- RLS: via `can_access_property(property_id, perm)` with `apartment.*` permissions. `status = 'published'` only via `publish_apartment` RPC (trigger blocks direct change to/from published by clients).

### 4.9 `rooms` (M)
- `id`, `organization_id`, `apartment_id FK apartments on delete cascade`, `name_en text not null`, `name_ar text`, `room_type room_type not null`, `sort_order int default 0`, `floor_polygon jsonb` (array of [x,z] in metres, scene space), `height_range numrange`, `viewpoints jsonb not null default '[]'` (array of {position:[x,y,z], target:[x,y,z]}), `connections uuid[] default '{}'` (adjacent room ids), unique `(apartment_id, name_en)`.
- RLS: read `apartment.read`; write `room.write` (scoped through apartment's property).

### 4.10 `scan_sessions` (M)
`id`, `organization_id`, `apartment_id`, `method capture_method`, `status scan_status`, `checkpoint_plan jsonb`, `device_info jsonb` (model, OS, app version; no location), `created_by`, `submitted_at`, `notes`. Index `(apartment_id, created_at desc)`. RLS read `scan.read`, write `scan.create`.
- **As implemented:** `device_info` rejects location keys (`location`, `latitude`, `longitude`, `gps`); `created_by` must equal the caller; members may only set capture states (`draft`..`submitted`, `cancelled`), processing states are platform-only; `apartment_id`, `method`, `created_by` immutable; delete only while `draft`/`cancelled`.

### 4.11 `scan_checkpoints` (M)
`id`, `organization_id`, `scan_session_id`, `sequence int`, `label_en`, `label_ar`, `room_type`, `room_id uuid null`, `media_upload_id uuid null`, `start_ms int`, `end_ms int`, `quality jsonb` (blur/exposure/speed summary), `status text check in ('pending','recorded','skipped')`. Unique `(scan_session_id, sequence)`. **As implemented:** `room_id` must belong to the scanned apartment (trigger).

### 4.12 `media_uploads` (M)
`id`, `organization_id`, `scan_session_id`, `bucket text`, `object_path text unique`, `original_filename text (<=255)`, `mime_type text check in allowed list`, `size_bytes bigint check > 0 and <= plan max`, `sha256 text`, `duration_ms int`, `width int`, `height int`, `fps numeric`, `codec text`, `status upload_status`, `validation_report jsonb`, `retain_until timestamptz`, `created_by`. Index `(scan_session_id)`, `(status)`.
- **As implemented:** created only by `register_media_upload(session, filename, mime, size)`, which checks `scan.create`, allows `video/mp4` and `video/quicktime`, size 1 B..10 GiB, builds `object_path = org/<org>/scans/<session>/<upload>.<ext>` server-side and moves the session to `uploading`. Members can only read; status/metadata are written by the platform (validation worker, Phase 5). `object_path`, `bucket`, `scan_session_id`, `created_by` immutable.

### 4.13 `processing_jobs` (D)
`id`, `organization_id`, `scan_session_id`, `provider text check in ('self_hosted_gsplat','varjo_teleport')`, `status job_status`, `attempt int default 1`, `idempotency_key text unique`, `provider_job_id text`, `stage text`, `progress numeric(5,2) check 0..100`, `error_code text`, `error_message text` (sanitized), `parameters jsonb`, `queued_at`, `started_at`, `finished_at`, `cost_estimate_usd numeric(10,4)`. Index `(status, queued_at)`. Writes only by service role (callbacks); members read with `scan.read`; cancel via RPC.

### 4.14 `processing_results` (D)
`id`, `organization_id`, `processing_job_id unique`, `metrics jsonb` (gaussian count, PSNR/SSIM on held-out frames, registered frame ratio, training time), `review_status review_status`, `reviewed_by`, `reviewed_at`, `review_notes`, `continuity_checklist jsonb`.

### 4.15 `scene_versions` (D, migration `20261121000800`, Stage 7.3)
`id`, `organization_id`, `apartment_id`, `processing_job_id unique`, `version int` (unique per apartment), `status scene_status` (`draft`, `approved`, `published`, `superseded`, `rejected`), `scene_path` (first-load file in `scene-drafts`, from the job report), `alignment jsonb` (`{matrix: 16 numbers column-major, scale > 0}`), `bounds jsonb` (`{min, max}` aligned metres, 1-100 m wide, at least 1 m in every axis), `start_view jsonb` (`{position, target}`), `aligned_by`, `aligned_at`, `published_at`. Created by `review_processing_result` on approval (next version number per apartment). RLS: select with `scan.read` on the apartment; no direct writes; `save_scene_alignment(scene, alignment, bounds, start)` (SECURITY DEFINER, `scan.review`, draft/approved only, validated in SQL) sets status `approved`. Audited.

### 4.15a `scene_room_views` and `scene_doorways` (migration `20261121000900`, Stage 7.4, ADR-020)
`scene_room_views`: `scene_version_id`, `room_id`, `position double precision[3]`, `target double precision[3]`, unique per scene and room. `scene_doorways`: `scene_version_id`, `room_a < room_b`, `position double precision[3]` (floor point), unique per pair. Aligned metres. RLS: select with `scan.read` on the scene's apartment; written only by `save_scene_navigation(scene, views, doorways)` (SECURITY DEFINER, `scan.review`, replaces the set atomically, requires an aligned scene, rooms of the same apartment, points inside the outline + 0.5 m). Audited. `rooms.viewpoints` / `rooms.connections` are not used (geometry changes with every reconstruction).

### 4.16 `scene_assets` (D)
`id`, `organization_id`, `scene_version_id`, `kind asset_kind`, `bucket`, `object_path unique`, `size_bytes`, `sha256`, `lod_level int null`, `content_type`. Public URL derived only for published copies.

### 4.17 `appliance_categories` (D, migration `20261121001000`, Stage 8.1: 22 seeded categories, `sort_order`; users read only)
`id`, `key text unique` (e.g. `air_conditioner`), `name_en`, `name_ar`, `aliases_en text[]`, `aliases_ar text[]`, `icon text`. Global (platform-admin managed); readable by authenticated.

### 4.18 `appliance_models` (D, Stage 8.1: org rows written by org-scoped `appliance.write`; global rows by the platform only; `manual_url` https only)
`id`, `organization_id uuid null` (null = global library), `category_id`, `brand text`, `model_number text`, `display_name`, `manual_url text` (validated https), unique `(coalesce(organization_id, '0000...'), lower(brand), lower(model_number))`. RLS: global rows readable by all authenticated; org rows by members; global writes platform admin only.

### 4.19 `appliances` (D, Stage 8.1: parent-org trigger from the apartment; `check_appliance_links` trigger: room in the same apartment, model global or own; RLS like rooms with `appliance.write`)
`id`, `organization_id`, `apartment_id`, `room_id`, `category_id`, `appliance_model_id null`, `name_en`, `name_ar`, `brand`, `model_number`, `notes`. Index `(apartment_id)`, `(room_id)`. Trigger: room belongs to same apartment.

### 4.20 `hotspots` (D, migration `20261122001100`, Stage 8.2: aligned metres; `check_hotspot` trigger derives organization/apartment from the scene, requires an aligned draft/approved version and a point inside the outline + 0.5 m, resets verification on insert and on any move or client change; `verified_by/verified_at` set only by the platform (8.4 RPC); RLS `hotspot.write`, read with `apartment.read`. `room_id`, `reference_image_path` and `publication_status` are not stored: the room comes from the appliance, publication from the scene snapshot in 8.5)
`id`, `organization_id`, `apartment_id`, `scene_version_id`, `room_id`, `appliance_id`, `position double precision[3]`, `normal double precision[3]`, `camera_pose jsonb`, `reference_image_path text`, `verification_status verification_status`, `publication_status publication_status`, `created_by`. Check array lengths = 3. Unique `(scene_version_id, appliance_id)`.

### 4.21 `instructions` (D, migration `20261122001200`, Stage 8.3: one per appliance (`appliance_id unique`); `apartment_id` derived for RLS; model-level rows reserved for the library, not exposed to clients yet; ADR-021)
`id`, `organization_id null` (null for global model instructions), `appliance_id null`, `appliance_model_id null`, check exactly one of the two is set, `title_en`, `current_version_en uuid`, `current_version_ar uuid`.

### 4.22 `instruction_versions` (D, Stage 8.3: append-only; trigger assigns the next version per language, forces unverified, author = caller, checks step/troubleshooting shapes; no update/delete grants, updates only for verification via a definer flag in 8.4)
`id`, `organization_id`, `instruction_id`, `locale locale_code`, `version int`, `title text`, `steps jsonb` (array of {text, media_id?}), `troubleshooting jsonb` (array of {problem, solution}), `body_md text` (sanitized on render), `verification_status`, `verified_by`, `verified_at`, `created_by`. Unique `(instruction_id, locale, version)`. Immutable after verification (trigger).

### 4.23 `instruction_media` (D, Stage 8.3: `kind image|video`, `object_path` must be `org/<org>/apartments/<apt>/instructions/<instruction>/<name>.<jpg|jpeg|png|webp|mp4|mov>` matching the kind; <= 50 MB; storage delete policy added)
`id`, `organization_id`, `instruction_id`, `kind media_kind`, `bucket`, `object_path`, `locale null`, `caption_en`, `caption_ar`, `duration_ms`, `size_bytes`, `sort_order`, `transcode_status`.

### 4.24 `published_versions` (D)
`id`, `organization_id`, `apartment_id`, `version int`, `scene_version_id`, `snapshot jsonb` (guest payload), `published_by`, `published_at`. Insert only via `publish_apartment` RPC. Immutable.

### 4.25 `qr_codes` (M)
`id`, `organization_id`, `apartment_id`, `token text unique` (>= 128-bit random, base64url), `label`, `status qr_status`, `created_by`, `revoked_at`, `revoked_by`. RLS: `qr.manage`; guests never query directly (Edge Function).
- **As implemented:** tokens are 32 random bytes (from two `gen_random_uuid()` CSPRNG values, 244 random bits) base64url (43 chars), generated only inside `create_qr_code(apartment, label)`; clients cannot insert or change tokens or status (only `label` is updatable); `revoke_qr_code(id)` is one-way (rotate = revoke + create). Tokens are stripped from `audit_logs`.

### 4.26 `guest_sessions` (D)
`id`, `organization_id`, `apartment_id`, `qr_code_id`, `started_at`, `last_seen_at`, `locale`, `device_class text` (mobile/tablet/desktop), `browser_family text`, `webgl2 boolean`. **No IP, no full user agent, no name.** Insert via Edge Function only. Retention 13 months.

### 4.27 `analytics_events` (D)
`id bigint identity PK`, `organization_id`, `apartment_id`, `guest_session_id null`, `event_type text check in (...)`, `room_id`, `appliance_id`, `hotspot_id`, `search_query text (<=100, lower-cased)`, `result_count int`, `load_ms int`, `occurred_at`. Index `(apartment_id, occurred_at)`, `(organization_id, event_type, occurred_at)`. Partition by month when > 10M rows. RLS read `analytics.read`.

### 4.28 `support_interactions` (D)
`id`, `organization_id`, `apartment_id`, `guest_session_id`, `channel support_channel`, `appliance_id null`, `message text null (<=1000)`, `created_at`. RLS read `analytics.read`.

### 4.29 `notifications` (D)
`id`, `organization_id`, `user_id`, `type text`, `title`, `body`, `link_path text` (relative path only), `read_at`. RLS: own rows only.

### 4.30 `support_access_grants` (D)
`id`, `organization_id`, `granted_by`, `platform_admin_id`, `reason`, `expires_at` (<= 72 h), `revoked_at`. Platform admin reads tenant data only through functions that check an active grant; every use audited.

### 4.31 `audit_logs` (M)
- `id bigint identity PK`, `organization_id uuid null`, `actor_user_id uuid null`, `action text not null` (`insert`/`update`/`delete`/custom e.g. `apartment.publish`), `entity_type text not null`, `entity_id text`, `old_data jsonb`, `new_data jsonb`, `created_at`. No `updated_at`.
- Written by `audit_trigger()` (security definer) on: organizations, organization_members, property_members, properties, apartments, rooms (and later: qr_codes, published_versions, hotspots, instruction_versions).
- RLS: select with `audit.read`; **no** insert/update/delete policies for any client role (append-only; update/delete revoked).

## 5. Storage buckets (Phase 2 storage stage / Phase 5)

| Bucket | Public | Contents | Policy |
|---|---|---|---|
| `raw-footage` | No | Uploaded videos | path `org/<org_id>/...`; insert needs `scan.create` on the org (and property); read `scan.read`; delete service role; retention 90 days after approval |
| `scene-masters` | No | PLY masters | service role only |
| `scene-drafts` | No | Draft SOG/SPZ/previews | read `scan.read` via signed URLs |
| `instruction-media` | No | Draft images/videos | read/write `instruction.write` |
| `published-assets` | Yes | Content-hashed published SOG, previews, instruction media | write service role only (publish RPC/Edge Function) |

**As implemented (migration `20261120000200_storage.sql`):** all five buckets created. `raw-footage`: insert only when a `pending` `media_uploads` row with the same `object_path` was registered by the same user who still holds `scan.create`; read with `scan.read` on the session; MIME allowlist `video/mp4`, `video/quicktime`; no per-bucket size limit (project limit applies, KI-015). `scene-drafts`: read `scan.read` via path `org/<org>/apartments/<apartment>/...` (org in path must match the apartment's org). `instruction-media`: read `apartment.read`, insert/update `instruction.write`, same path rule, 100 MB, image/video allowlist. Malformed paths, `..` and `//` are rejected. No member deletes anywhere. Helper functions: `storage_path_apartment`, `can_upload_raw_footage`, `can_read_raw_footage`, `can_access_storage_apartment`.

## 6. Migration list

| File | Content | Status |
|---|---|---|
| `20261119000100_foundation.sql` | extensions, enums (foundation subset), utility triggers, profiles, organizations, members, role_permissions, property_members, properties, apartments, rooms, audit_logs, helper functions, RLS, `create_organization` RPC | Applied on PGlite and the local Supabase stack; not on the hosted project |
| `20261120000100_invitations_qr_capture.sql` | enums capture_method, scan_status, upload_status, qr_status; `generate_token`; organization_invitations, qr_codes, scan_sessions, scan_checkpoints, media_uploads; extended `enforce_parent_org` and `audit_trigger` (strips `token`/`token_hash`); invitation, QR and upload-registration RPCs; RLS | Applied on PGlite and the local Supabase stack; not on the hosted project |
| `20261120000200_storage.sql` | five buckets, storage path helpers, `storage.objects` policies | Applied on PGlite (shim) and the local Supabase stack; not on the hosted project |
| `20261120000300_security_hardening.sql` | Stage 2.6 findings: no direct membership inserts, column-restricted UPDATE grants on organizations/properties/apartments, checkpoint-upload trigger, 20 uploads per session, FK indexes | Applied: PGlite, local stack, hosted |
| `20261120000400_private_helpers.sql` | 14 internal helpers moved to schema `private` (not API-exposed); callers rewritten (generated by `supabase/scripts/gen-private-helpers.mjs`) | Applied: PGlite, local stack, hosted |

All migrations above are applied to the hosted project `nfcnckwjrwpofkrzribd` (2026-11-20). Helper functions referenced in this document as `public.<helper>` now live in `private.<helper>`.
