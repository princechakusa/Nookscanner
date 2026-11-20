# Nookscanner: Development Roadmap

Version 1.1 (2026-11-20). 3D work is governed by the binding [`3D_QUALITY_BAR.md`](3D_QUALITY_BAR.md) (ADR-014), including section 1b: many managers, many devices; nothing hardcoded to one phone, apartment or organisation. Workflow for every stage: **PROJECT -> PHASE -> STAGE -> IMPLEMENT -> TEST -> AUDIT -> APPROVE -> DOCUMENT -> NEXT STAGE** (MASTER_PROMPT Part 13).

**Universal stage gate** (applies to every stage in addition to its own criteria): lint + typecheck + all tests pass in CI; new tables have RLS + isolation tests; security implications reviewed and threat model updated; docs updated (PROJECT_MASTER status, this roadmap, CHANGELOG, KNOWN_ISSUES, affected specs); evidence recorded with real outputs.

**3D quality gate** (applies to every stage in Phases 5, 6, 7 and 12, from [`3D_QUALITY_BAR.md`](3D_QUALITY_BAR.md)): a 3D stage is never marked DONE without the measured evidence the quality bar requires (capture-gate measurements, per-scene quality report with PSNR/SSIM/LPIPS on held-out frames and SfM registration, per-room and doorway checks, viewer performance per device tier). Targets are initial and must be calibrated on real footage; calibrated values go into `3D_TECHNOLOGY.md` and `PROJECT_MASTER.md`. Device tiers (section 1b): T1 recent iPhone Pro (pilot iPhone 16 Pro Max), T2 older/standard iPhone, T3 high-end Android, T4 mid-range Android, T5 existing video from any camera, gimbal or drone (Method B).

Status legend: `DONE`, `IN PROGRESS`, `BLOCKED (user)`, `TODO`.

## Phase 0: Discovery and technical research - DONE (2026-11-19)
| Stage | Tasks | Acceptance criteria | Status |
|---|---|---|---|
| 0.1 Product understanding | PRD, journeys, modules, FR/NFR | PRODUCT_REQUIREMENTS.md complete, all 26 modules mapped | DONE |
| 0.2 Technology research | 3DGS options, capture, viewers, Supabase, frontend/mobile, cloud | 3D_TECHNOLOGY.md + TECH_STACK.md with sources and verification dates; no invented prices | DONE |
| 0.3 Recommendations | ADRs | DECISION_LOG ADR-000..012 | DONE |

## Phase 1: Architecture and foundation - DONE (2026-11-20)
| Stage | Tasks | Acceptance criteria | Status |
|---|---|---|---|
| 1.1 Documentation set | PROJECT_MASTER + 17 docs | All files exist, cross-linked, consistent | DONE |
| 1.2 Repository + tooling | git init, npm workspaces, TS strict, ESLint, Prettier, EditorConfig, .gitignore, .env.example | `npm ci`, `npm run lint`, `npm run typecheck` pass | DONE (see PROJECT_MASTER 24) |
| 1.3 App skeletons | dashboard (Next.js), guest (Vite), capture (Expo skeleton, not installed), shared packages, worker package | dashboard + guest build; guest component test passes | DONE |
| 1.4 DB foundation | first migration, Supabase config, PGlite test harness | migration applies; RLS/isolation tests pass | DONE |
| 1.5 Test infrastructure + CI | Vitest, PGlite, pytest/unittest, Playwright config, GitHub Actions workflow | `npm test` passes locally; workflow file valid YAML | DONE |
| 1.6 Remote + CI activation | push to GitHub, CI green, branch protection | CI run green on GitHub | DONE: pushed by the user; CI runs 44578429531 and 44579511164 green (2026-11-19). Branch protection is an optional user action on GitHub (Blocked-on-user list) |

## Phase 2: Backend and database - DONE (2026-11-20); hosted Auth settings BLOCKED (user)
| Stage | Tasks | Acceptance criteria | Status |
|---|---|---|---|
| 2.1 Supabase projects | link staging project, apply migrations, configure Auth (confirmations, password policy, redirect URLs, SMTP) | `supabase db push` succeeds on staging; auth emails delivered | PARTIAL: all 5 migrations applied to the hosted project (user-approved); hosted lint clean, advisors accepted, anon smoke 30/30. Remaining: site URL, email templates, SMTP, CAPTCHA, leaked-password protection in the hosted dashboard: BLOCKED (user); then auth emails can be verified |
| 2.2 Full schema | migrations for remaining tables (DATABASE_SCHEMA D items needed before Phase 5: invitations, qr_codes, scan_sessions, scan_checkpoints, media_uploads) | migrations apply on PGlite and real Supabase; docs updated | DONE (local real stack + PGlite; hosted pending 2.1) |
| 2.3 Storage | buckets + storage RLS policies | upload tests: own org allowed, other org denied, anon denied | DONE (Storage API tests on the local real stack; hosted pending 2.1) |
| 2.4 Auth flows | signup, verify, login, reset, logout in dashboard | E2E auth tests pass on staging (local stack until hosted is migrated) | DONE on the local stack (12/12 E2E: signup, email confirm, sign in/out, reset, open-redirect and enumeration checks); hosted run pending 2.1 |
| 2.5 DB tests on real stack | run the RLS suites on real Supabase (ADR-013: the same Vitest suites on PGlite and on the local stack, instead of a pgTAP port) | all pass in CI with Docker | DONE locally (64/64); CI job `database-stack` added, first green GitHub run pending the next push |
| 2.6 Backend tests + audit | security review of policies | no Critical/High open | DONE: 5 findings (3 Medium, 2 Low) fixed and regression-tested; Supabase security advisors 0 findings; no Critical/High open (SECURITY.md section 10) |

## Phase 3: Design system and frontend foundation - DONE (2026-11-20)
| Stage | Acceptance criteria | Status |
|---|---|---|
| 3.1 Tokens -> CSS vars in both apps + self-hosted fonts (ADR-015: no Tailwind) | tokens consumed; contrast test passes | DONE (design-tokens 19 tests incl. contrast) |
| 3.2 Core components (button, input, select, modal, toast, table, empty/error/loading) in `packages/ui` | component tests + a11y (axe) pass | DONE (6 tests, axe clean) |
| 3.3 Dashboard shell (sidebar, org switcher, auth guard) | Playwright: unauthenticated redirect, shell renders | DONE (stack E2E 16/16 incl. axe WCAG 2.2 AA on desktop + iPhone WebKit) |
| 3.4 Guest shell (EN/AR, RTL, loading, fallback list) per mockups 01/02/04 | Playwright mobile emulation EN + AR screenshots reviewed | DONE: 12 screenshots (Pixel 7 + iPhone 15; EN/AR home, search, sheet, no-WebGL fallback) reviewed against the mockups; 2 issues fixed (truncated Demo badge, Arabic tanween glyph offset); guest E2E 12/12 with axe; guest unit 14 |

## Phase 4: Property management - DONE
| Stage | Acceptance criteria | Status |
|---|---|---|
| 4.1 Organizations + invitations (DB tables + RPCs done in 2.2; this stage adds UI + invitation email) | create org, invite, accept, roles; isolation tests | DONE 2026-11-20: UI (create org, members + role change/remove, invite with one-time copy link, revoke, `/invite/[token]` accept page); DB isolation tests pass; invitation E2E passes on desktop Chromium and mobile WebKit (KI-022 was a test race, R-020); invitation e-mail delivery waits for SMTP (Blocked on user 1), admins copy the link meanwhile |
| 4.2 Properties + apartments CRUD (with layout questionnaire) | E2E CRUD; property-scoped member sees only assigned | DONE 2026-11-20: properties list/create/edit/delete, apartments list/create/edit/delete with layout questionnaire (bedrooms, bathrooms, balconies, hallways, kitchen kind, extras) and planned-room preview; shared schemas mirror DB checks (shared tests 73); `properties.spec.ts` E2E (CRUD, validation keeps input, axe, property-scoped manager sees/creates only in the assigned property, other property 404) passes on desktop Chromium + mobile WebKit; DB RLS tests for scoping already in `rls.test.ts` |
| 4.3 Rooms (pre-scan list from questionnaire) | rooms created; ordering | DONE 2026-11-20: rooms created from the layout plan (EN + AR names, walking order), custom rooms, rename, delete, move up/down (whole list renumbered in one upsert statement), layout changes add only missing rooms; shared tests 76; DB test for the reorder upsert (editor allowed; viewer and other org denied) on PGlite and the real stack (74/74); `rooms.spec.ts` E2E with axe on desktop Chromium + mobile WebKit |
| 4.4 QR foundation (`qr_codes` + RPCs done in 2.2; this stage adds UI + QR rendering) | token entropy test; revoke test | DONE 2026-11-20: token entropy (43-char base64url, unique, never in audit logs) and revoke tests from 2.2 still pass; apartment page "Guest QR codes" (create with label, preview, guest link, SVG/PNG download, revoke with confirmation, revoked list); server-side rendering with `qrcode` 1.5.4 (EC level M, 4-module quiet zone, 1024 px PNG) - unit test decodes the PNG back to the exact URL (jsQR); image route is RLS-checked (other org/revoked -> 404, signed-out -> login), `no-store`, sandboxed no-script CSP; `qr.spec.ts` E2E incl. PNG decode on desktop Chromium + mobile WebKit. PDF export and rotation flow: Phase 9 |

## Phase 5: Capture and uploads - IN PROGRESS
Quality bar sections 1b, 2 and 3 apply. Capture settings and gate thresholds are data (per device tier and per video metadata), never constants tied to one phone.
| Stage | Acceptance criteria | Status |
|---|---|---|
| 5.1 Upload registration + TUS upload in dashboard | resume after network drop (E2E with throttling); other-org path denied; MP4/MOV from any device accepted for validation (Method B is first-class) | DONE 2026-11-20: videos uploaded as parts of at most 45 MiB (ADR-016) with TUS to Supabase Storage; migration `20261120000500` (parts table, server-built part paths, size-checked `complete_media_upload_part`, bucket cap 45 MiB) applied locally and to the hosted project (lint clean, advisors = 8 intended RPCs, smoke 30/30); E2E on desktop Chromium + mobile WebKit: upload survives aborted requests and 4 s offline, interrupted upload resumes after reload without re-sending finished parts, wrong file refused; other-org/anon/unregistered paths denied (DB + Storage API tests, real stack 77/77); MP4/MOV accepted, MIME from the extension when the browser reports none (Method B) |
| 5.2 Server validation (ffprobe in worker "validate" job) | validates resolution, bitrate, codec (H.264, HEVC incl. iPhone HDR/Dolby Vision, Android variants), rotation metadata, variable frame rate and duration; every failure gives a specific, manager-readable reason and re-capture guidance; reports recorded for sample videos from at least tiers T1, T2, T3 or T4, and T5 | DONE for format validation 2026-11-20: `validate.py` (pure `assess` over ffprobe JSON + part reassembly with size/hash checks + CLI); worker tests 35 incl. real ffmpeg-made samples emulating T1-T5 (4K HEVC PQ, rotation matrix, VFR, low-bitrate 720p, MPEG-4 25 fps) and Dolby Vision/HLG via probe data; reports in `3D_TECHNOLOGY.md`. **Open:** reports for real phone footage (Blocked on user 4); writing results to `media_uploads` comes with job dispatch (6.2) |
| 5.3 Device tiers + capture profiles | tier table with minimum capture specs (resolution, fps, stabilisation) recorded in `3D_QUALITY_BAR.md` / `3D_TECHNOLOGY.md`; capture profile chosen from the device's reported capabilities, not its model name; unit tests for tier selection including unknown devices | DONE 2026-11-20: tier table as data (`device-tiers.json`, T1-T5 + hard minimum) documented in `3D_TECHNOLOGY.md` and referenced from the quality bar; `selectCaptureTier`/`captureProfile` choose from reported formats, HEVC and stabilisation only; 19 unit tests incl. unknown devices, empty/garbage capability lists and portrait-listed formats; worker `gates_for_tier` reads the same file (cross-language test). Calibration on real devices pending (Blocked on user 4) |
| 5.4 Nookscanner: auth, apartment select, checkpoint plan, VisionCamera recording, pause/resume/review | runs on the pilot iPhone (dev build) **and** at least one other iPhone tier; manual test script passed; capture metadata (device, resolution, fps, lens, exposure mode) recorded per capture | IMPLEMENTED 2026-11-20, device verification BLOCKED ON USER: app screens (sign-in with Keychain-stored session, apartment list, plan from rooms with doorway/loop steps, VisionCamera 5 recording with tier-based profile, per-room AE/AF/WB lock, pause/resume, review with too-short-room warnings, checkpoints + capture metadata saved, no location); shared capture logic 8 tests (shared 117); app typecheck + iOS Metro bundle pass locally and in a new CI job. Remaining for DONE: runs on the pilot iPhone and another iPhone tier with `docs/CAPTURE_TEST_SCRIPT.md` passed (Blocked on user 8) |
| 5.5 On-device quality feedback (blur, exposure, speed, doorway overlap) | quality-bar section 3 metrics computed; per-tier thresholds calibrated on real sample footage from several devices (measured values recorded); unit tests for metrics | IMPLEMENTED 2026-11-20, calibration BLOCKED ON USER: quality-bar section 3 metrics in `packages/shared/src/quality.ts` (Laplacian-variance blur, mean luma and clipping, frame-difference speed, NCC doorway overlap) on frames downsampled to 320 px so thresholds compare across devices; thresholds are data in `device-tiers.json` with per-tier overrides; `QualityMonitor` hysteresis (no flicker) and per-room summaries; 11 unit tests on synthetic frames (shared 129). Capture app: VisionCamera frame output (YUV, ~2 samples/s, luma only) feeds live tips (light, speed, blur) and stores per-room quality in `scan_checkpoints.quality`; typecheck + iOS bundle pass. Open: thresholds calibrated on real footage from several devices (Blocked on user 4), on-device run (Blocked on user 8), doorway-overlap prompt during transitions |
| 5.6 Background resumable upload from app | upload survives app backgrounding | IMPLEMENTED 2026-11-20, device verification BLOCKED ON USER: accepted recordings are kept in the documents folder, registered (retry-safe: an existing queued or pending upload is reused), cut into 45 MiB part files with file handles (4 MiB steps, never the whole video in memory) and sent with native background upload tasks (`expo-file-system`, iOS background session); each part counts only after `complete_media_upload_part` verifies its size; persisted queue survives restarts and reconciles with the database (finished parts never resent); retries back off 2 s to 5 min; uploads screen with progress and ETA; banner on the apartment list. Shared queue logic 6 tests (shared 135); app typecheck + iOS bundle (1089 modules) pass. Remaining for DONE: backgrounding and restart verified on a real iPhone (Blocked on user 8) |

## Phase 6: 3D reconstruction - IN PROGRESS
Quality bar sections 4, 5 and 8 apply. A stage that produces a scene is DONE only with a stored quality report (measured numbers, not estimates).
| Stage | Acceptance criteria | Status |
|---|---|---|
| 6.1 Worker container (ffmpeg, COLMAP/GLOMAP, gsplat, SplatTransform) on Modal | processes a public sample dataset end to end; then (section 8) one real apartment video end to end as early as possible | PIPELINE IMPLEMENTED 2026-11-20, GPU run BLOCKED ON USER: `frames.py` (ffmpeg keyframes, blurdetect sharpness per window, rejected windows and coverage gaps reported, gsplat-compatible held-out split), `commands.py` (COLMAP 4 feature extraction, sequential matching, GLOMAP `global_mapper` or incremental, TXT export; gsplat MCMC with held-out eval and PLY; SplatTransform SOG + streamed LODs; option names checked against current docs), `sfm_stats` from COLMAP text models, `packaging.py` (real SplatTransform 3.12.0 run: SOG + LOD stream, size budgets), `pipeline.py` (stage order, resume markers, measured `report.json`). Worker tests 53 incl. a CPU end-to-end run (real validation, frames and packaging; COLMAP/gsplat stand-ins) and resume after a training failure. Remaining for DONE: GPU container on Modal and a public sample dataset end to end (Blocked on user 5), then real footage (Blocked on user 4) |
| 6.2 Dispatch + callbacks + queue + retries | HMAC tests; idempotency; retry on transient failure | DONE 2026-11-20: migration 0600 (`processing_jobs`, `processing_results`, submit/cancel RPCs, private claim/apply/requeue functions; applied locally and hosted), contract v2 (TS + Python, shared fixture), Edge Functions `dispatch-processing` + `job-callback` (logic in `supabase/functions/_shared/jobs.ts`, verified under the local Edge runtime), worker `runner.py` (download/verify/join parts, provider, signed upload URLs, SHA-256, classified failures). Tests: DB 91/91 on the real stack, 7 function tests, 9 runner tests incl. a real signed HTTP round trip. Deploying the functions and the GPU endpoint to hosted needs the user (secrets + Modal) |
| 6.3 Quality report | per scene: PSNR, SSIM, LPIPS on ~10% held-out frames; SfM registered-camera ratio and reprojection error; per-room and whole-apartment numbers; doorway/seam alignment within a stated tolerance; artefact checklist; stored and shown to the manager next to the preview | TODO |
| 6.4 Other-device footage test (before the pipeline is finalised) | one walkthrough from an Android phone (T3/T4) and one from an older iPhone (T2), each through the full pipeline; quality report per video compared with the pilot iPhone (T1); differences recorded; capture/upload gates and per-tier thresholds adjusted from the measurements. If the user has not supplied this footage, "real footage from other phones" goes on the Blocked-on-user list and other stages continue; the pipeline is not marked final until this stage passes | TODO |
| 6.5 Pipeline bake-off on the pilot apartment (section 5): own pipeline settings vs Teleport / other credible options | blind-style visual comparison, metrics, fly-throughs, room continuity, processing time, verified cost, licence; winner chosen on quality first; ADR recorded | TODO |
| 6.6 Baseline + calibration | first real apartment's best result sets the baseline; targets calibrated on varied layouts (studio, multi-bedroom, dark rooms, open plan, glass) as footage becomes available; new scenes outside the margin flagged "needs re-capture" | TODO |
| 6.7 Asset packaging (SOG + LoD, SPZ, preview) | first LoD <= 10 MB, total <= 60 MB for the pilot apartment (initial budget; calibrate per section 6) | TODO |

## Phase 7: Interactive 3D viewer
Quality bar sections 1b and 6 apply: performance is measured per device tier, never on the pilot phone only. Splat budgets and LoD adapt to the guest device's capabilities at runtime.
| Stage | Acceptance criteria |
|---|---|
| 7.1 `packages/viewer` wrapper over Spark (load, LoD, budget) | loads the pilot SOG; measured time to first view, fps, download size and memory recorded on a real iPhone, a mid-range Android, a tablet and desktop, plus throttled 4G |
| 7.2 Camera controls + constraints | E2E controls; no floor clipping |
| 7.3 Alignment tools (floor, scale, crop) | measured door width within 3% |
| 7.4 Rooms + viewpoints + transitions | navigation tests pass; every room reachable from the entrance |
| 7.5 Performance tuning per device tier | NFR-PERF-03/05 met on the measured device matrix; per-tier budgets recorded; fallback list view works when 3D fails or is too slow |

## Phase 8: Appliance hotspots
| 8.1 Categories + model library + appliances | CRUD + isolation tests |
| 8.2 Hotspot placement (raycast), move, delete | round-trip coordinate test within 10 cm |
| 8.3 Instructions + versions + media (EN/AR) | sanitized Markdown test (XSS) |
| 8.4 Verification workflow | edits create unverified versions |
| 8.5 Publishing (snapshot, rules PB-01..03) | publish blocked when rules unmet |

## Phase 9: Guest application
| 9.1 `guest-experience` + `guest-instruction` Edge Functions | uniform 404; rate limit; schema tests |
| 9.2 Guest 3D exploration + hotspots + highlight | E2E on mobile emulation; device check |
| 9.3 Search (EN/AR aliases) + navigate + highlight | "AC" distinguishes rooms |
| 9.4 Instructions, videos, troubleshooting, support | E2E |
| 9.5 Fallback list mode | WebGL disabled test |

## Phase 10: Analytics and administration
| 10.1 Event ingestion (`guest-events`) | validation + rate limits |
| 10.2 Manager analytics views | aggregates correct on seeded data |
| 10.3 Notifications | processing notifications delivered |
| 10.4 Platform admin + support grants | grant expiry + audit tests |
| 10.5 Monitoring (Sentry, logs) | errors visible in Sentry staging |
| 10.6 Account and data deletion (store requirement, docs/APP_STORE_COMPLIANCE.md S3/S4) | in-app deletion in Nookscanner Capture and a public web page `/account/delete`; sole owners are told to transfer or delete their organization first; personal data removed within 30 days; audit entry; E2E test passes |

## Phase 11: Security and QA
Security audit (ASVS L2), ZAP scans, penetration test (authorized), performance + load tests (k6), accessibility audit (axe + manual), device matrix, backup/restore drill. Acceptance: no open Critical/High; budgets met; restore drill succeeded.

## Phase 12: Real apartment pilot
Scan one apartment, validate visual quality and room connections, place real hotspots, guest testing on iOS/Android, measure load performance, collect feedback, fix. Acceptance: full Part 15 workflow passes with real footage; every publishable scene meets quality-bar section 7 (capture gates passed or override recorded, quality report stored, manager approval, rooms connected and navigable, hotspot positions verified, performance measured on at least one real iPhone and one Android browser); measured evidence for the pilot iPhone, one older iPhone and one Android-recorded video, across more than one apartment layout where available; documented in `PROJECT_MASTER.md`.

## Phase 13: Production deployment
Store submission follows [`APP_STORE_COMPLIANCE.md`](APP_STORE_COMPLIANCE.md) (Apple + Google): privacy policy, terms and support pages, reviewer account, privacy labels / Data safety, privacy manifest, current SDK / target API checks, real screenshots, submission log; acceptance includes every applicable item DONE.

Production config, backup verification, infra deploy, monitoring, logging, error reporting, deployment docs, production readiness audit (PROJECT_MASTER section 20). Acceptance: checklist 100%.

## Phase 14: Scaling and improvements
Remaining 12 apartments, scanning/reconstruction improvements, Android capture, more languages, integrations (PMS), assisted detection, subscriptions, R2 CDN, scale infra from real usage.
