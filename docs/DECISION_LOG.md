# Nookscanner: Decision Log (ADRs)

Format per decision (Part 5.5): selected, reason, alternatives, advantages, limitations, pricing, licensing, security, integration, migration. Pricing marked **VERIFIED (date, source)** or **ESTIMATE**. New decisions are appended; superseded ones are marked, never deleted.

| ADR | Title | Status | Date |
|---|---|---|---|
| ADR-000 | Brand name Nookscanner | Accepted (user choice; legal checks pending) | 2026-11-19 |
| ADR-001 | TypeScript monorepo with npm workspaces | Accepted | 2026-11-19 |
| ADR-002 | Supabase as primary backend | Accepted | 2026-11-19 |
| ADR-003 | Next.js dashboard + Vite guest SPA | Accepted | 2026-11-19 |
| ADR-004 | Self-hosted gsplat reconstruction on Modal, Teleport benchmark | Accepted (validate in Phase 6 bake-off) | 2026-11-19 |
| ADR-005 | Expo + VisionCamera Nookscanner app, iOS first | Accepted | 2026-11-19 |
| ADR-006 | Spark (three.js) web renderer | Accepted | 2026-11-19 |
| ADR-007 | SOG delivery format, PLY archival | Accepted | 2026-11-19 |
| ADR-008 | Hosting: Vercel + Supabase + Modal; R2 later | Accepted | 2026-11-19 |
| ADR-009 | Resumable TUS uploads direct to Storage | Accepted | 2026-11-19 |
| ADR-010 | Testing toolchain incl. PGlite for RLS tests | Accepted | 2026-11-19 |
| ADR-011 | Role model: fixed roles + role_permissions table + property scoping | Accepted | 2026-11-19 |
| ADR-012 | Guest access via unguessable QR token through an Edge Function, no direct table access | Accepted | 2026-11-19 |
| ADR-013 | Same DB test suites on PGlite and on the real local Supabase stack (instead of a pgTAP port) | Accepted | 2026-11-20 |
| ADR-014 | 3D quality bar is binding; device tiers; measured evidence gates 3D stages | Accepted (user requirement) | 2026-11-20 |
| ADR-015 | Styling: design-token CSS variables + `packages/ui`, no Tailwind | Accepted | 2026-11-20 |

---

## ADR-000: Brand name Nookscanner
- **Selected:** "Nookscanner", preferred domain nookscanner.com (user's choice after four naming rounds, see [`BRAND_IDENTITY.md`](BRAND_IDENTITY.md)).
- **Status of legal/commercial checks:** domain **not purchased**; trademark **not cleared or filed**; **no** social or app store accounts exist. RDAP showed the .com unregistered on 2026-11-19; that does not prove it is buyable at standard price.
- **Capture app name:** "Nookscanner" (user's choice, 2026-11-19) for the mobile capture app and scanning feature; nookscanner.com reported unregistered but **not purchased**, **no trademark check** done. Code: `apps/nookscanner`, bundle id placeholder `com.nookscanner.capture`.
- **Security/migration:** brand string centralized in `packages/design-tokens` (`brand.name`) and app metadata so a rename is a small change.

## ADR-001: TypeScript monorepo with npm workspaces
- **Selected:** one Git repository, npm workspaces, TypeScript strict, ESLint flat config + Prettier.
- **Reason:** shared types and validation between dashboard, guest app, Nookscanner app and edge functions; single CI; no extra global tooling to install (npm ships with Node).
- **Alternatives:** pnpm workspaces (faster, stricter; would require a global install), Turborepo/Nx (add later if build times grow), polyrepo (type drift).
- **Advantages:** simple, reproducible, one lockfile. **Limitations:** npm hoisting can conflict with React Native; the Expo app is therefore kept *outside* the root workspace install until Phase 5 (it consumes `packages/shared` via a path dependency).
- **Pricing/licensing:** free, MIT/Apache tools. TypeScript pinned to `~6.0.3` because typescript-eslint 8.73.0 declares `typescript >=4.8.4 <6.1.0` (VERIFIED `npm view`, 2026-11-19).
- **Security:** lockfile committed; `npm audit` in CI. **Migration:** switching to pnpm is mechanical.

## ADR-002: Supabase as the primary backend
- **Selected:** Supabase (Postgres, Auth, RLS, Storage, Realtime, Edge Functions, Queues, CLI migrations).
- **Reason:** covers auth, multi-tenant RLS, storage with policy-based access, realtime job progress and migrations in one managed service; Postgres is portable.
- **Alternatives:** Firebase (NoSQL, weaker relational modelling and tenancy rules), AWS (Cognito + RDS + S3 + Lambda; more control, much more ops), self-hosted Postgres + custom API (more code and ops).
- **Advantages:** RLS at the database is the strongest tenant-isolation boundary; managed backups; generous MAU limits.
- **Limitations:** Edge Functions are short-lived (2 s CPU, 150/400 s wall clock): **not** for video/3D processing. Free tier pauses after 1 week inactivity, 50 MB upload cap, no backups -> Pro required for pilot uploads.
- **Pricing (VERIFIED 2026-11-19, https://supabase.com/pricing):** Free $0; Pro from $25/month per organization with quotas listed in [`TECH_STACK.md`](TECH_STACK.md).
- **Licensing:** Supabase platform is open source (Apache-2.0/MIT components); hosted service under Supabase ToS.
- **Security:** service-role key only on servers/worker secrets; anon key in clients with RLS; all tables RLS-enabled by migration.
- **Integration:** `@supabase/supabase-js`, `@supabase/ssr` in Next.js, Supabase CLI for migrations.
- **Migration:** plain Postgres schema + SQL migrations; Storage is S3-compatible; Auth users exportable.

## ADR-003: Next.js 16 dashboard, Vite React guest SPA
- **Selected:** dashboard = Next.js 16 App Router + React 19; guest = Vite 8 + React 19 static SPA.
- **Reason:** dashboard needs secure server-side sessions and privileged server actions; guest needs the smallest, CDN-cacheable bundle with no server on the hot path.
- **Alternatives:** single Next.js app for both (couples guest performance to dashboard), SvelteKit/Remix (viable; smaller team familiarity), native apps for guests (violates "no install").
- **Limitations:** two frontend build setups. **Pricing:** open source (MIT). **Security:** guest app never holds credentials beyond the public anon key and a QR token. **Migration:** both are standard React; components live in shared packages.

## ADR-004: Reconstruction: self-hosted COLMAP/GLOMAP + gsplat on Modal; Varjo Teleport as benchmark
- **Selected:** Python worker (ffmpeg -> COLMAP/GLOMAP poses -> gsplat training -> cleanup -> SplatTransform) on Modal serverless GPUs, behind a `ReconstructionProvider` interface. A `TeleportProvider` adapter is built for the Phase 6 bake-off.
- **Reason:** commercially permissive licenses (gsplat Apache-2.0, COLMAP BSD), full control of quality and privacy, no per-scan vendor fee, outputs in open formats.
- **Alternatives:** Varjo Teleport API (managed, interior-capable, webhooks; pricing unverified/inconsistent), KIRI Engine API (video max 1080p and 3 min: too short for a connected apartment; $500 minimum recharge), Polycam API (Enterprise only; no splat export listed), Luma (capture app not actively developed), original INRIA code (**non-commercial license, prohibited**).
- **Advantages:** quality tunable for interiors; data never leaves our cloud accounts. **Limitations:** we own GPU ops and failure handling; requires tuning on real footage.
- **Pricing:** Modal (VERIFIED 2026-11-19, https://modal.com/pricing): L40S $0.000542/s, A100 80 GB $0.000694/s; Starter $30/month free credits. **ESTIMATE** $2-$6 compute per apartment reconstruction (to be measured).
- **Licensing:** see [`3D_TECHNOLOGY.md`](3D_TECHNOLOGY.md) section 3.1; COLMAP third-party dependency licences to be reviewed before production (KNOWN_ISSUES KI-004).
- **Security:** worker receives short-lived signed URLs; job callbacks HMAC-signed; worker secrets stored in Modal secrets; no tenant data in logs.
- **Integration:** Edge Function `dispatch-processing` -> Modal web endpoint; worker reports progress to `job-callback` Edge Function.
- **Migration:** provider interface allows switching to Teleport, AWS VAMS pipeline, or another GPU cloud (RunPod, AWS Batch) without changing the app.

## ADR-005: Nookscanner app: Expo SDK 58 + react-native-vision-camera 5, iOS first
- **Selected:** Expo (dev client) + VisionCamera 5 (maintained line), iOS first for the iPhone 16 Pro Max pilot.
- **Reason:** guided UI and upload logic shared in TypeScript; VisionCamera gives format control and frame processors for on-device blur/exposure metrics; Android later from the same code.
- **Alternatives:** native Swift (best ARKit/LiDAR access; separate codebase), browser capture (unreliable control and background upload).
- **Limitations:** custom dev builds required (Apple Developer account needed for device builds and TestFlight). Native module may be needed for ARKit pose logging.
- **Pricing:** Expo/VisionCamera open source (MIT). Apple Developer Program fee applies (user action, not purchased). EAS Build optional.
- **Security:** auth via Supabase session in secure storage (expo-secure-store); recordings stored in app sandbox until upload verified.
- **Migration:** native module or full Swift app if ARKit integration becomes central.

## ADR-006: Web renderer: Spark 2.x on three.js
- **Selected:** `@sparkjsdev/spark` (MIT, v2.4.0, peer three >=0.180.0).
- **Reason:** LoD + streaming for phones, loads SOG/SPZ/PLY, `SplatMesh.raycast` for hotspot placement, integrates with three.js for markers, transitions and UI.
- **Alternatives:** PlayCanvas engine + SuperSplat viewer (MIT, SOG native, streamed LoD; strong fallback), three.js native `GaussianSplat` (r186; no LoD yet), Babylon.js.
- **Limitations:** raycasting on millions of splats is slow (tap-only, not per frame); rapid release cadence -> pin versions and wrap behind `packages/viewer` interface.
- **Pricing/licensing:** free, MIT. **Security:** loads only same-origin/CDN assets with CSP `connect-src` allowlist. **Migration:** PlayCanvas adapter behind the same interface.

## ADR-007: SOG for delivery, SPZ secondary, PLY archival
- **Selected:** SOG (v3) with LoD generated by SplatTransform; SPZ as secondary; PLY kept privately as master.
- **Reason:** SOG is ~15-20x smaller than PLY (PlayCanvas spec), WebP-based, supported by Spark and PlayCanvas.
- **Limitations:** lossy; format still evolving (v3) -> keep PLY master to regenerate. **Licensing:** open format, MIT tooling.

## ADR-008: Hosting
- **Selected:** Vercel (dashboard + guest static), Supabase (backend), Modal (GPU), Supabase Storage CDN for published assets; Cloudflare R2 when guest egress exceeds the Supabase Pro allowance (250 GB/month).
- **Pricing (VERIFIED 2026-11-19):** Vercel Hobby free with limits, Pro developer seat $20/user/month (https://vercel.com/docs/plans/hobby); R2 $0.015/GB-month, free egress (https://developers.cloudflare.com/r2/pricing/). Whether Vercel Hobby terms allow commercial use was **not verified** this session: use Pro before commercial launch unless verified.
- **Alternatives:** Cloudflare Pages + Workers, Netlify, AWS Amplify, Fly.io.
- **Migration:** all apps are standard builds; no vendor-specific runtime APIs used in application code.

## ADR-009: Resumable TUS uploads direct to Supabase Storage
- **Selected:** clients upload video directly to a private bucket via TUS (6 MB chunks) with the user's JWT; path `org/<org_id>/scans/<scan_session_id>/<upload_id>.<ext>`; storage RLS checks org membership + permission.
- **Reason:** large files, unreliable mobile networks, progress events, no app server in the data path.
- **Limitations:** upload URLs expire after 24 h; Pro plan needed for files > 50 MB.

## ADR-010: Testing toolchain
- **Selected:** Vitest (unit/integration), **PGlite** (real Postgres compiled to WASM, in-process) to apply every migration and test RLS/tenant isolation without Docker, pgTAP via `supabase test db` once Docker/Supabase CLI are available, Playwright for E2E, pytest for the worker.
- **Reason:** Docker daemon was not running on the development machine (verified 2026-11-19); PGlite lets RLS tests run anywhere including CI. PGlite does not include Supabase's `auth` schema, so tests load a minimal, documented shim (`supabase/tests/support/supabase-shim.sql`) reproducing `auth.uid()`, `auth.users` and the `anon`/`authenticated`/`service_role` roles.
- **Limitation:** shim is not the real Supabase; the same tests must also pass on a real local Supabase stack before Phase 2 is closed (KNOWN_ISSUES KI-002).

## ADR-011: Role model
- **Selected:** fixed role enum `owner > admin > manager > editor > viewer`, a `role_permissions` table mapping roles to permission keys (single source of truth, mirrored and tested in `packages/shared`), and optional property scoping via `organization_members.scope = 'properties'` + `property_members`.
- **Reason:** simple for non-technical managers, auditable, enforceable in SQL helper functions used by RLS.
- **Alternatives:** fully custom roles per org (complex UI, later), ABAC.

## ADR-012: Guest access through QR token and Edge Function
- **Selected:** each QR encodes `https://<guest-host>/a/<token>` where `token` is a 128-bit random URL-safe string. The guest app calls the `guest-experience` Edge Function, which resolves the token (service role, server-side), checks the apartment is published and the QR active, and returns only published, guest-safe data plus CDN asset URLs. `anon` has **no** direct SELECT on tenant tables.
- **Reason:** no enumeration of apartments, revocable/rotatable QR, minimal data exposure, rate limiting at one choke point.
- **Alternatives:** RLS policies for `anon` on published rows (larger attack surface, harder rate limiting).

## ADR-013: Dual-target database tests (PGlite + real local Supabase stack)
- **Selected:** one set of Vitest suites (`supabase/tests/*.test.ts`) with a harness that targets either PGlite + the documented shim (default, fast, no Docker) or the real local Supabase stack (`npm run test:db:stack`, `DB_TEST_TARGET=stack`). Stack-only suites (Storage API through Auth + PostgREST + Storage) are skipped on PGlite. CI runs both (job `database-stack` starts the stack in Docker and also runs `supabase db lint --fail-on warning`).
- **Reason:** the roadmap planned to port the RLS tests to pgTAP. Keeping one suite avoids two copies drifting apart, keeps tests in TypeScript next to the shared permission matrix, and the real-stack run already exposed one shim difference (real Storage forbids direct SQL deletes on `storage.objects`).
- **Alternatives:** pgTAP via `supabase test db` (standard, but a second test language and duplicated scenarios); stack only (slower and needs Docker on every machine).
- **Limitations:** suites must be idempotent on a persistent database (run-unique slugs and emails via `runId`); stack runs are sequential. Hosted-project verification still needs `db push` (KI-003).
- **Security:** stack tests read the local stack's development keys from `supabase status` in memory; nothing is written to disk or committed. Local stack ports 565xx so it never collides with other projects' stacks.

## ADR-014: 3D quality bar is binding; device tiers
- **Selected:** [`3D_QUALITY_BAR.md`](3D_QUALITY_BAR.md) (user requirement, 2026-11-19/20) governs Phases 5, 6, 7 and 12. No 3D stage is marked DONE without the measured evidence it requires. Device tiers T1 recent iPhone Pro (pilot), T2 older/standard iPhone, T3 high-end Android, T4 mid-range Android, T5 existing video from any source (Method B). Capture profiles, gate thresholds and viewer budgets are data selected from device capabilities and video metadata, never constants for one phone, apartment or organisation.
- **Roadmap changes:** Phase 5 gains device tiers/capture profiles and full Method B validation (codec incl. HEVC, rotation, VFR, bitrate); Phase 6 gains a stored quality report (PSNR/SSIM/LPIPS, SfM registration, per-room and doorway checks), an **other-device footage stage (6.4)** before the pipeline is finalised (one Android and one older iPhone video, compared with the pilot iPhone and used to adjust gates), the bake-off (quality first, then cost), and baseline calibration on varied layouts; Phase 7 measures performance per tier on real devices; Phase 12 acceptance requires quality-bar section 7 for every publishable scene.
- **Reason:** the product is for many managers with many phones; tuning only for the pilot iPhone would fail in the field. Quality must be the best achievable and is therefore measured, not asserted.
- **Limitations:** needs real footage from several devices and layouts (user-supplied); until then, targets are initial and stages that need them stay open (Blocked-on-user list).
- **Alternatives considered:** pilot-device-only tuning (rejected: violates section 1b); fixed global thresholds (rejected: different sensors and codecs need different gates).

## ADR-015: Styling with design-token CSS variables and a shared `packages/ui`, no Tailwind
- **Selected:** components in `packages/ui` (React, `'use client'`), styled with plain CSS that uses only the generated `--nt-*` custom properties and logical properties; apps import `tokens.css` + `ui.css`. Fonts self-hosted via Fontsource (pinned 5.3.0).
- **Reason:** tokens already exist as CSS variables (single source of truth in TypeScript, contrast-tested); one stylesheet works unchanged in Next.js and Vite; no build plugin in two different bundlers; no class-name generation to keep in sync with CSP; RTL handled by logical properties; the guest bundle stays small (guest CSS 9.6 kB gzip incl. font-face rules).
- **Alternatives:** Tailwind CSS 4 (fast authoring, but a second token pipeline and plugin config in both bundlers), CSS-in-JS (runtime cost, CSP friction), component libraries such as Radix/shadcn (good accessibility primitives; can be added per component later if needed).
- **Limitations:** hand-written CSS needs discipline (lint for raw colours is a possible future check); no utility classes.
- **Supply chain:** new dev dependencies pinned to releases at least two weeks old (axe-core 4.14.0, @axe-core/playwright 4.14.0, @testing-library/user-event 14.6.8).
