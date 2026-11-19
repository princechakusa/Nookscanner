# Nookscanner: System Architecture

Version 1.0 (2026-11-19). Related: [`TECH_STACK.md`](TECH_STACK.md), [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md), [`API_SPECIFICATION.md`](API_SPECIFICATION.md), [`SECURITY.md`](SECURITY.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md), [`3D_TECHNOLOGY.md`](3D_TECHNOLOGY.md).

## 1. Context

```
 Property manager                        Guest (phone browser)
   |  dashboard (web)                       |  scans QR
   |  Nookscanner (iPhone)                  v
   v                                   +-----------------+      CDN (published SOG assets,
+----------------------+               |  Guest SPA      |----> instruction media)
| Manager Dashboard    |               |  (Vite, static) |
| Next.js on Vercel    |               +--------+--------+
+----------+-----------+                        | HTTPS (token)
           | supabase-js (user JWT)             v
           |                          +---------------------+
+----------v-----------+  TUS upload  | Edge Function        |
| Nookscanner (Expo)   |------------->| guest-experience     |
+----------+-----------+   (JWT)      | guest-events         |
           |                          +----------+----------+
           v                                     |
+--------------------------------------------------------------------+
| SUPABASE                                                           |
|  Auth | Postgres (RLS, RPC, pgmq queues, pg_cron) | Storage | Realtime |
|  Edge Functions: dispatch-processing, job-callback, guest-*, qr-*    |
+-----------------------------+--------------------------------------+
                              | signed dispatch (HMAC)    ^ signed callbacks (HMAC)
                              v                           |
                   +-----------------------------------------+
                   | Reconstruction worker (Python, Modal GPU)|
                   | ffmpeg -> COLMAP/GLOMAP -> gsplat ->     |
                   | cleanup -> SplatTransform (SOG/SPZ)      |
                   +-----------------------------------------+
```

## 2. Components and responsibilities

| Component | Location | Responsibility | Trust level |
|---|---|---|---|
| Manager dashboard | `apps/dashboard` | Auth UI, org/property/apartment management, uploads, review, hotspot editor, instructions, publishing, QR, analytics | Untrusted client; server parts trusted with user session only |
| Guest app | `apps/guest` | QR entry, 3D experience, search, instructions, support, EN/AR | Untrusted, anonymous |
| Nookscanner Capture (mobile app) | `apps/nookscanner` | Guided capture, quality feedback, resumable upload | Untrusted client, user session |
| Shared packages | `packages/shared`, `packages/design-tokens`, `packages/viewer` (Phase 7) | Types, Zod schemas, permission matrix, upload rules, tokens, renderer wrapper | Library |
| Database | `supabase/migrations` | Source of truth, RLS, business invariants (triggers, constraints) | Trusted boundary |
| Edge Functions | `supabase/functions` | Guest API, processing dispatch, worker callbacks, QR rendering, rate limiting | Trusted (service role, server-side only) |
| Reconstruction worker | `services/reconstruction` | GPU processing pipeline, provider adapters | Trusted, isolated, least privilege |
| Infrastructure | `infra/` | Environment definitions, Modal app config, CDN/R2 config (later) | - |

Avoid microservices: one database, one function set, one worker service.

## 3. Repository structure

```
nookscanner/
  PROJECT_MASTER.md          Source of truth and current status
  README.md                  Quick start
  package.json               npm workspaces root, shared scripts
  apps/
    dashboard/               Next.js manager dashboard
    guest/                   Vite guest SPA
    nookscanner/             Nookscanner Nookscanner app (Expo) (outside root install until Phase 5)
  packages/
    shared/                  Domain types, Zod schemas, permissions, upload rules
    design-tokens/           Colours, type, spacing tokens -> TS + CSS variables
  services/
    reconstruction/          Python worker: job contract, providers, pipeline
  supabase/
    config.toml              Local Supabase config
    migrations/              Ordered SQL migrations (only way to change schema)
    functions/               Edge Functions (Deno)
    seed.sql                 Local development seed (no real data)
    tests/                   Database tests (PGlite runner + pgTAP later)
  infra/                     Environment and deployment configuration (created in Phase 6/13)
  scripts/                   CI helpers (client-bundle secret scan)
  tests/e2e/                 Playwright end-to-end tests
  docs/                      All supporting documentation
  .github/workflows/         CI
```

## 4. Key workflows

### 4.1 Capture/upload to reconstruction
1. Client creates `scan_session` (RPC `create_scan_session`, permission `scan.create`).
2. Client creates `media_uploads` row (status `pending`) and uploads via TUS to `raw-footage/org/<org>/scans/<session>/<upload>.<ext>`. Storage RLS validates membership and that the path's org matches.
3. Client calls `complete_upload(upload_id)`; DB checks object exists and size matches -> status `uploaded`.
4. Manager submits session (`submit_scan_session`) -> row in `processing_jobs` (`queued`) + message on pgmq queue `reconstruction` (idempotency key = session id + attempt).
5. `dispatch-processing` Edge Function (triggered by pg_net/cron poll) reads queue, creates short-lived signed download URLs (e.g. 6 h) and signed upload targets, POSTs HMAC-signed job to Modal endpoint.
6. Worker runs stages, POSTs HMAC-signed progress callbacks to `job-callback` (updates `processing_jobs.stage/progress`) -> Realtime pushes to dashboard.
7. On success worker uploads PLY (private `scene-masters`), SOG/SPZ + previews (private `scene-drafts`), reports metrics -> `processing_results` + `scene_versions(status=draft)` + `scene_assets`; notification created.
8. Manager reviews; on approval, aligns and crops; on publish, assets are copied to public `published-assets/<apartment_public_id>/<content-hash>/...` (immutable cache).
9. Failure: transient errors retried (max 2, exponential backoff); permanent errors mapped to user-facing codes (`POSE_ESTIMATION_FAILED`, `INSUFFICIENT_COVERAGE`, `VIDEO_TOO_DARK`, ...).

### 4.2 Publishing
`publish_apartment(apartment_id)` RPC (permission `apartment.publish`) validates PB-01 rules in one transaction, snapshots a `published_versions` record (JSON snapshot of rooms, hotspots, appliance info and verified instruction versions + asset URLs), sets `apartments.status = 'published'` and `published_version_id`, writes audit log. Guests read only snapshots, so editing drafts never leaks to guests.

### 4.3 Guest request
`GET guest-experience?token=...` -> rate limit (per IP hash + token) -> lookup `qr_codes` (active) -> apartment published -> return snapshot JSON (cache 60 s at CDN, ETag) -> guest app renders list immediately, streams 3D. Events batched to `guest-events` (sendBeacon), validated and rate limited.

## 5. Environments

| Env | Purpose | Supabase | Hosting | Data |
|---|---|---|---|---|
| local | Development | Supabase CLI local stack (Docker) or PGlite for tests | localhost | synthetic seed only |
| staging | Integration, security and load testing | separate Supabase project | Vercel preview/staging | synthetic + pilot copies with consent |
| production | Real customers | separate Supabase project (Pro) | Vercel production | real |

Each environment has its own keys, buckets, Modal app and HMAC secrets. See [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) and `.env.example`.

## 6. Cross-cutting

- **Tenancy:** every tenant row carries `organization_id`; RLS via helper functions (`has_org_permission`, `can_access_property`). Child rows carry `organization_id` redundantly (validated by trigger against parent) so policies are cheap and uniform.
- **Auditing:** triggers write `audit_logs` for security-relevant tables; append-only.
- **i18n:** content columns `*_en`/`*_ar` for short labels; long content in `instruction_versions` per locale.
- **Errors:** stable error codes (`packages/shared/src/errors.ts`), user messages localized, no internal details to clients.
