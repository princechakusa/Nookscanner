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
| ADR-016 | Stay on Supabase Free: chunked uploads under the 50 MB per-file limit | Accepted (user decision) | 2026-11-20 |
| ADR-017 | Upload client: tus-js-client per part, sequential parts, database-verified part completion | Accepted | 2026-11-20 |
| ADR-018 | 3D compute at $0: Modal free monthly credit with a hard spend limit now; own NVIDIA PC worker (pull mode) later | Accepted (user decision) | 2026-11-20 |

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

## ADR-016: Stay on Supabase Free; chunked uploads under 50 MB per object
- **Decision (user, 2026-11-20):** no Supabase Pro. The project stays on the Free plan.
- **Consequence:** Free caps every stored object at 50 MB and has no automatic backups. Walkthrough videos (often 0.5-5 GB) are uploaded as ordered parts of at most 45 MB each (`media_uploads` gains part number/count in Phase 5.1), each part a separate TUS upload to its own registered path; the worker downloads and concatenates parts before validation. Backups: scheduled logical dumps (`supabase db dump`) stored outside Supabase (Phase 13), restore drill still required.
- **Other Free limits to design for:** 1 GB storage, 5 GB egress/month, project pauses after 1 week of inactivity. Large scene assets for guests may need Cloudflare R2 (free egress) earlier than planned.
- **Supersedes:** the "upgrade to Pro before Phase 5" steps in KI-011, KI-015 and INFRASTRUCTURE.md.

## ADR-017: Upload client and part completion (Stage 5.1)
- **Decision:** the dashboard uploads each 45 MiB part with `tus-js-client` 4.3.1 (MIT) to Supabase's resumable endpoint (6 MiB chunks, as Storage requires), one part at a time. A part counts only after `complete_media_upload_part` finds the stored object with exactly the registered size; the last part marks the upload (and, when nothing else is pending, the scan session) `uploaded`.
- **Why:** sequential parts keep memory and battery use low on phones and make resume simple (finished parts are skipped by database state; the current part resumes from its TUS offset via a per-part fingerprint). Database verification means a client cannot claim a part it did not deliver.
- **Retry rule:** tus-js-client's default refuses to retry while the browser reports itself offline, which is the common phone case; we retry network errors, 5xx, 423 and 429, and when retries run out while offline the part continues on the `online` event.
- **Alternatives:** Uppy (heavier UI framework for one component); parallel parts (faster on fibre, worse on mobile data, more complex resume); signed upload URLs per part (no resumability within a part).
- **Security:** Storage accepts only pending part paths registered by the same user with `scan.create`; the bucket caps objects at 45 MiB; parts are readable with `scan.read` only. `complete_media_upload_part` is a SECURITY DEFINER RPC (8th intended advisor WARN) that checks `auth.uid()`, the uploader and the permission itself.

## ADR-018: 3D compute at no cost: Modal free credit now, own NVIDIA PC later
- **Context (user, 2026-11-20):** the user does not want to pay for GPU processing. The user's PC has Intel Iris Xe graphics (no NVIDIA GPU, so it cannot run COLMAP/gsplat training).
- **Selected:** (1) **Modal** with its free monthly credit (USD 30/month on the Starter plan, verified 2026-11-19 in INFRASTRUCTURE.md) and a **hard workspace spend limit equal to the free credit**, so the bill stays USD 0; when the credit is used up, jobs wait in the queue (Stage 6.2 back-off) until the next month. At the ESTIMATE of USD 2-6 per apartment this covers roughly 5-15 apartments per month. (2) The same worker also runs on **the user's own PC with an NVIDIA GPU** in **pull mode**: it asks the platform for work while it is switched on (signed request to an Edge Function), so it needs no public address and does not have to be always on. Minimum for a PC: NVIDIA RTX with 12 GB VRAM (16-24 GB for large apartments), 32 GB RAM, Windows + WSL2 or Linux with CUDA.
- **Budget update (user, 2026-11-20):** the user accepts paying up to USD 30/month for GPU processing. Set the Modal spend limit to the free credit plus USD 30 (roughly 10-30 apartments/month at the estimate); the bill can never exceed USD 30. The PC worker (pull mode) is still built so the user's own NVIDIA PC can take over later.
- **Rejected for now:** on-device 3D training inside the capture app (months of native Metal work, lower quality, room-scale limits, only recent high-end iPhones: conflicts with quality bar 1b); paid per-scan services (cost). An "upload a ready-made 3D file" fallback was offered and not chosen.
- **Consequences:** Stage 6.8 adds the Modal app and the PC pull worker; the dispatcher must not burn retries while the credit is exhausted (GPU_UNAVAILABLE stays transient with back-off); cost per job is recorded so monthly usage is visible.

## ADR-019: Scene alignment by three floor taps, one measurement and a crop box (Stage 7.3)
- **Context:** reconstructions come out of SfM in arbitrary units and orientation. Guests need a level floor at y = 0, metric scale (hotspots, camera height limits) and an apartment box (camera bounds, 7.2).
- **Selected:** the manager taps three floor points (plane fit; normal turned towards the viewer's screen "up"), the two sides of something measured with a tape (scale = metres / scene distance) and two opposite floor corners plus a ceiling height (crop box). The math is pure and unit-tested in `packages/viewer/src/alignment.ts`; the result is one column-major 4x4 matrix plus scale, bounds and an optional start view, stored on `scene_versions` through `save_scene_alignment` (SECURITY DEFINER, `scan.review`, payload validated again in SQL). The viewer applies the matrix to the splat mesh, so the stored file is never rewritten.
- **CSP:** the dashboard `script-src` gains `'wasm-unsafe-eval'` so Spark can compile its WebAssembly sorter. It allows WebAssembly compilation only; JavaScript `eval` stays forbidden (`'unsafe-eval'` absent in production, asserted by `security-headers.test.ts`). The guest app already needs the same for the viewer.
- **Rejected:** automatic floor detection from the SfM point cloud (RANSAC) as the only method: unreliable on rugs, beds and open plans, and it does not give metric scale; kept as a later assist (pre-fill the three taps). ARKit/LiDAR scale priors: iPhone Pro only (quality bar 1b).
- **Consequences:** an approved reconstruction creates a draft scene version (`review_processing_result` extended); hotspots (Phase 8) attach to aligned scene versions. Acceptance "door width within 3%" is met by the unit test on synthetic geometry; on a real apartment it needs the user's footage processed by our pipeline (Blocked on user 4/5).

## ADR-020: Room viewpoints and doorways belong to the scene version (Stage 7.4)
- **Context:** the foundation put `viewpoints` and `connections` on `rooms`, but every new reconstruction of an apartment has its own coordinates; geometry on the room would be wrong after the next scan.
- **Selected:** `scene_room_views` (one viewpoint per room per scene version) and `scene_doorways` (unordered room pairs with a floor point), written only by `save_scene_navigation`, which replaces the whole set in one transaction and checks rooms belong to the scene's apartment, points lie inside the aligned outline (+0.5 m) and the scene is aligned. `rooms.viewpoints/connections` stay unused. Viewpoints are taken from the manager's camera at standing eye height (1.5 m) and clamped into the outline like the guest camera; doorways are stored on the floor (y = 0) because splat hits scatter around the fitted floor. Room continuity (RV-02) is `checkNavigation` in `packages/viewer/src/navigation.ts`: every room has a viewpoint and is reachable from the entrance (or the first room) through doorways; the dashboard shows what is missing and Phase 8.5 publishing will require it.
- **Transitions:** the guest camera flies through the doorways on the shortest room route (BFS) at eye height, 600-1200 ms with ease-in-out, and cuts with `prefers-reduced-motion` (DESIGN_SYSTEM motion). A drag cancels a flight.
- **Rejected:** a free-form navigation graph of arbitrary waypoints (more than managers need now); storing geometry on `rooms` (breaks on re-scan).

## ADR-021: Instruction text is a Markdown subset parsed to a tree, never HTML (Stage 8.3)
- **Context:** managers type instructions that guests see on their phones (untrusted input reaching every guest of an apartment). SECURITY.md planned "sanitized Markdown (rehype-sanitize allowlist)".
- **Selected:** `packages/shared/src/markdown.ts` parses a fixed subset (paragraphs, line breaks, `-`/`1.` lists, `**bold**`, `*italic*`, `[text](url)`) into a small tree; `packages/ui/src/markdown.tsx` renders it with React elements. There is no HTML string anywhere on the path, so HTML-looking input is shown as text. Links survive only for `https:`, `tel:` and `mailto:` without whitespace or control characters, and open with `rel="noopener noreferrer nofollow"`. Tests: 13 attack strings in the parser, DOM-level checks in the renderer and the guest sheet, and a stack E2E (`instructions.spec.ts`).
- **Rejected:** Markdown-to-HTML plus a sanitizer (larger bundle, an allowlist to keep correct forever, and a single bypass reaches every guest); a rich-text editor (overkill for step lists; output is HTML again).
- **Also decided:** instruction versions are append-only per language; every save is a new unverified version (8.4 adds verification); media lives in the private `instruction-media` bucket under the instruction's folder, max 50 MB per file on the Free plan (ADR-016), shown via 10-minute signed URLs; the dashboard CSP allows images/video from the project's Storage origin only.

## ADR-022: Publishing builds the guest snapshot in the database (Stage 8.5)
- **Context:** PB-01..03 and quality bar 7: only reviewed content may reach guests, republishing creates a version, unpublishing is immediate.
- **Selected:** `publish_check` (problems list for the UI) and `publish_apartment` (definer, `apartment.publish`) evaluate the rules in SQL: approved and aligned scene with its file, rooms present, every room has a viewpoint and is reachable from the entrance through doorways (recursive CTE), every pin verified, every pinned appliance has verified instructions in English and in the property's default language. The snapshot is built by `private.guest_snapshot` from the LATEST VERIFIED version per language, so a later unverified edit never reaches guests and a manager cannot hand-craft the payload. It is stored as an immutable `published_versions` row (no client write grants); the scene becomes `published` (frozen: hotspot edits refused) and the previous published scene `superseded`. `unpublish_apartment` sets the apartment back to `review`; the guest function (9.1) serves only `published` apartments. The 3D file stays private: the snapshot keeps its storage path and 9.1 signs short-lived links (no public copy yet; R2/CDN later, Phase 14).
- **Rejected:** building the snapshot in the server action (trust boundary in app code, payload forgeable by a manager); copying the scene into the public bucket on publish (permanent public URL for interior footage, quality bar privacy rule).
- **Consequences:** an apartment's Arabic step text is included only when the verified Arabic version has the same number of steps as the English one (KI-032).
