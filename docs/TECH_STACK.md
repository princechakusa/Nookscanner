# Nookscanner: Technology Stack

Verified: **2026-11-19** (npm registry versions read with `npm view` on that date; prices from the vendor pages linked). Each major choice has a full decision record in [`DECISION_LOG.md`](DECISION_LOG.md). 3D research detail: [`3D_TECHNOLOGY.md`](3D_TECHNOLOGY.md).

## 1. Summary

| Layer | Selected | Version policy | ADR |
|---|---|---|---|
| Language | TypeScript (strict) for web/mobile/edge; Python 3.12 for the GPU reconstruction worker | TypeScript pinned to `~6.0.3` (typescript-eslint 8.73 peer range is `<6.1.0`; TypeScript 7.0.2 exists but tooling support is not yet confirmed) | ADR-001 |
| Monorepo | npm workspaces (Node 24 LTS line, npm 11) | no extra global tool needed; Turborepo can be added if build times grow | ADR-001 |
| Backend platform | **Supabase** (Postgres, Auth, RLS, Storage, Realtime, Edge Functions, Queues/pgmq, migrations via CLI) | `@supabase/supabase-js` 2.119.x, `@supabase/ssr` 0.12.x, Supabase CLI 3.2.x | ADR-002 |
| Manager dashboard | **Next.js 16 (App Router) + React 19** + Tailwind CSS 4 + design tokens | next 16.4.x, react 19.x | ADR-003 |
| Guest web app | **Vite 8 + React 19 SPA** (static, CDN-hosted), lazy-loaded 3D chunk | vite 8.3.x | ADR-003 |
| Mobile capture app (Nookscanner) | **Expo SDK 58 + React Native + react-native-vision-camera 5** (iOS first) | expo 58.0.x | ADR-005 |
| 3D reconstruction | **Self-hosted COLMAP/GLOMAP + gsplat** on **Modal** serverless GPUs; Varjo Teleport as benchmark adapter | gsplat 1.5.x | ADR-004 |
| 3D format | **SOG** (guest), SPZ (secondary), PLY (archival) via SplatTransform 3.x | `@playcanvas/splat-transform` 3.12.x | ADR-007 |
| Web 3D renderer | **Spark 2.x on three.js** | `@sparkjsdev/spark` 2.4.x, three 0.187.x | ADR-006 |
| Validation | Zod 4 (TS), dataclasses/pydantic-free stdlib (Python worker) | zod 4.6.x | ADR-001 |
| Uploads | TUS resumable uploads to Supabase Storage (6 MB chunks) | tus-js-client 4.3.x | ADR-009 |
| Hosting | Vercel (dashboard + guest static), Supabase (backend), Modal (GPU), Supabase Storage CDN for published assets (move to Cloudflare R2 at scale) | - | ADR-008 |
| Testing | Vitest 5 (unit/integration), PGlite (in-process Postgres for migration + RLS tests), pgTAP via `supabase test db` (when Docker available), Playwright (E2E), pytest (worker) | vitest 5.1.x, @playwright/test 1.65.x, @electric-sql/pglite 0.5.x | ADR-010 |
| Lint/format | ESLint 10 flat config + typescript-eslint 8, Prettier 3 | - | ADR-001 |
| CI | GitHub Actions (prepared, not yet connected to a remote) | - | ADR-010 |
| Observability | Sentry (errors, all apps) + Supabase logs + Modal logs; uptime checks | added in Phase 10/13 | ADR-008 |

## 2. Supabase suitability (Part 5.1)

| Need | Supabase capability | Suitable? | Notes / source |
|---|---|---|---|
| PostgreSQL | Managed Postgres | Yes | https://supabase.com/pricing |
| Authentication, user management | Supabase Auth (email/password, verification, reset, OAuth later) | Yes | |
| Organizations / tenants | Not built in; we model `organizations` + memberships | Yes (our schema) | [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) |
| Row Level Security | Native Postgres RLS + `auth.uid()` | Yes, core of tenant isolation | |
| Storage | S3-compatible buckets with RLS on `storage.objects`; resumable TUS uploads (6 MB chunks, URLs expire after 24 h); CDN for all objects (public buckets get better cache hit rates) | Yes for raw footage (private) and published assets (public, content-hashed) | https://supabase.com/docs/guides/storage/uploads/resumable-uploads , https://supabase.com/docs/guides/storage/cdn/fundamentals |
| Upload size | Free: 50 MB max file; Pro: up to 500 GB | **Pro plan required** for real video uploads | https://supabase.com/pricing |
| Realtime | Postgres changes / broadcast | Yes (job progress) | |
| Edge Functions | Deno; 256 MB memory, 2 s CPU per request, wall clock 150 s (Free) / 400 s (paid) | Yes for light APIs (guest API, webhooks, signing). **No** for video/3D processing | https://supabase.com/docs/guides/functions/limits |
| Queues | Supabase Queues (pgmq), durable, SQL access, exactly-once within visibility window | Yes for job dispatch | https://supabase.com/docs/guides/queues |
| Migrations | Supabase CLI migrations in `supabase/migrations` | Yes | |
| Audit | Not built in; our `audit_logs` table + triggers | Yes (our schema) | |
| Backups | Pro: daily backups stored 7 days; Free: none | Pro required for production | https://supabase.com/pricing |

**Requires separate services:** GPU reconstruction (Modal), frame extraction/transcoding (in the GPU worker), error monitoring (Sentry), email delivery at volume (Supabase Auth SMTP via a transactional provider such as Resend/Postmark, chosen in Phase 2), CDN at large scale (R2, later).

Pricing verified 2026-11-19 (https://supabase.com/pricing): Free $0 (500 MB DB, 1 GB storage, 5 GB egress, 50,000 MAU, 50 MB max upload, paused after 1 week inactivity, no backups). Pro "from $25/month" (8 GB disk, 100 GB storage then $0.0213/GB, 250 GB egress then $0.09/GB, 100,000 MAU, 500 GB max upload, daily backups 7 days).

## 3. Frontend choices (Part 5.2)

**Manager dashboard: Next.js 16 + React 19.** Server-side session handling with `@supabase/ssr` (httpOnly cookies), server actions/route handlers for privileged operations, mature ecosystem, Vercel-native. Alternatives: Remix/React Router 7 (fine, smaller Supabase SSR examples), SvelteKit (team/ecosystem), plain Vite SPA (tokens in browser storage, weaker for security posture).

**Guest app: Vite + React SPA.** Static files on a CDN (fast, cheap, cacheable), no server runtime on the critical path, small initial bundle with the 3D renderer in a lazily loaded chunk. Data comes from one public Edge Function (`guest-experience`) keyed by QR token. Alternative: Next.js static export (heavier framework runtime for no benefit here).

**Nookscanner app: Expo + VisionCamera** (see [`3D_TECHNOLOGY.md`](3D_TECHNOLOGY.md) section 4).

**Shared code:** `packages/shared` (types, Zod schemas, permission matrix, upload rules) and `packages/design-tokens` (tokens consumed by all three apps).

## 4. Cloud infrastructure (Part 5.4)

| Need | Service | Phase |
|---|---|---|
| App hosting (dashboard) | Vercel (Next.js) | 3 / 13 |
| Guest static hosting | Vercel static (or Cloudflare Pages) | 3 / 13 |
| Backend API | Supabase PostgREST + RPC + Edge Functions | 2 |
| Database | Supabase Postgres (Pro for production) | 2 |
| Object storage | Supabase Storage (private: raw footage, PLY, instruction media drafts; public: published content-hashed assets) | 2 / 5 |
| Video uploads | TUS resumable to Supabase Storage | 5 |
| Video processing + 3D reconstruction | Modal GPU functions (Python, containerized) | 6 |
| 3D asset storage + CDN | Supabase Storage CDN; Cloudflare R2 when egress > Pro allowance (R2 egress free; $0.015/GB-month, verified https://developers.cloudflare.com/r2/pricing/) | 6 / 14 |
| Background jobs / queues | Supabase Queues (pgmq) + `processing_jobs` table; pg_cron for retention jobs | 6 |
| Notifications | `notifications` table + Realtime; email via transactional provider | 6 / 10 |
| Logging / monitoring | Supabase logs, Modal logs, Sentry, uptime monitor | 10 / 13 |
| Backups | Supabase daily backups (Pro); PITR add-on considered for production | 13 |

Full details: [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).
