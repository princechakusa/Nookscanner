# Nookscanner: Project Master

**Permanent source of truth.** Read this first in every session, then the linked documents. Mandate: [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md). Last updated: **2026-11-20**.

## Brand and legal status

| Item | Value | Status |
|---|---|---|
| Product brand | **Nookscanner** (working description: 3D Apartment Guest Assistant) | Chosen by the user |
| Preferred domain | nookscanner.com | Showed as unregistered (RDAP, 2026-11-19). **NOT purchased** |
| Capture app / scanning feature | **Nookscanner Capture** (code folder `apps/nookscanner`) | Chosen by the user |
| Trademarks | Nookscanner | **NOT cleared, NOT filed**; no trademark check done for Nookscanner |
| Accounts | No social, app store or domain accounts created by us. The user created a Supabase project (`nookscanner`) and a GitHub repo (`princechakusa/Nookscanner`) | See section 24 |

Brand research: [`docs/BRAND_IDENTITY.md`](docs/BRAND_IDENTITY.md). Decision: ADR-000 in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md).

## Document map

| Topic | Document |
|---|---|
| Requirements, roles, journeys, modules | [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) |
| Architecture, repo layout, workflows | [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md) |
| Technology stack and research sources | [`docs/TECH_STACK.md`](docs/TECH_STACK.md), [`docs/3D_TECHNOLOGY.md`](docs/3D_TECHNOLOGY.md) |
| Design references (concept mockups) and screen designs | [`docs/design/`](docs/design/), [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) section 9 |
| **App Store and Google Play compliance** (rules mapped to the app, gaps, submission log) | [`docs/APP_STORE_COMPLIANCE.md`](docs/APP_STORE_COMPLIANCE.md) |
| 3D processing setup (Modal + own GPU PC) | [`docs/GPU_WORKER.md`](docs/GPU_WORKER.md) |
| **3D quality bar (binding)**: device tiers, capture protocol, quality gates, quality report, viewer budgets | [`docs/3D_QUALITY_BAR.md`](docs/3D_QUALITY_BAR.md) (ADR-014) |
| Decisions (ADRs) | [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md) |
| Database | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) |
| APIs | [`docs/API_SPECIFICATION.md`](docs/API_SPECIFICATION.md) |
| Security, threats | [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) |
| Design system | [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) |
| Cloud, costs | [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) |
| Testing | [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) |
| Roadmap and stage criteria | [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md) |
| Deploy / operate | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| History / issues | [`docs/CHANGELOG.md`](docs/CHANGELOG.md), [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) |

Rule: detail lives in the supporting document; this file summarizes and links. If they ever disagree, fix the discrepancy in the same commit.

## 1. Product vision
A cloud platform where a property manager scans a real apartment (with Nookscanner or by uploading an existing walkthrough video), Nookscanner reconstructs it as a **photorealistic, connected 3D apartment** (3D Gaussian Splatting), the manager pins appliances at their real positions with verified, model-specific instructions, and guests scan a QR code to explore the apartment in their phone browser (no app, no account), tap or search for an appliance (e.g. "AC" -> living room vs. bedroom 1) and learn how to use it. The 3D apartment is the product; search and the list fallback support it. Pilot: 13 apartments, starting with one, captured on an iPhone 16 Pro Max.

## 2. Product requirements
Functional (AC, PR, CP, UP, RC, RV, PB, HS, AP, IN, GX, SR, SU, AN, NT, AD) and non-functional (performance, reliability, security, privacy, accessibility, i18n) requirements with IDs: [`PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md). The 15 product rules of MASTER_PROMPT Part 16 are mapped to requirement IDs there (section 1).

## 3. User roles
Platform administrator; organization owner, admin, manager, editor, viewer (optionally scoped to specific properties); anonymous guest. Permission matrix: [`DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) section 4.4 (implemented in the database and mirrored in `packages/shared`).

## 4. Application modules
All 26 modules (M1-M26) with responsibilities, dependencies, tables, permissions and phase: [`PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) section 4.

## 5. Feature inventory
| Area | MVP (pilot) | Later |
|---|---|---|
| Accounts/orgs | email auth, verification, reset, orgs, invites, roles, property scoping | OAuth, MFA enforcement for all, billing |
| Properties/apartments | CRUD, layout questionnaire, rooms, status lifecycle | bulk import, PMS integration |
| Capture (Nookscanner) | guided checkpoints, blur/light/speed feedback, pause/resume/review, resumable upload | coverage map, Android, ARKit pose priors |
| Upload | MP4/MOV, TUS resumable, server validation report | multi-file merge UI |
| Reconstruction | self-hosted gsplat on Modal, Teleport bake-off, metrics, retries | assisted cleanup, auto room segmentation |
| Review/publish | preview, continuity checklist, align/scale/crop, snapshot publish, QR | blur tool for personal items |
| Hotspots/instructions | manual raycast placement, appliances, model library, EN/AR instructions, media, verification | assisted detection, shared model library marketplace |
| Guest | 3D viewer with LoD, rooms, hotspots, highlight, search, instructions, video, troubleshooting, support, EN/AR, fallback list | offline cache, more languages |
| Analytics/admin | events, manager analytics, notifications, platform admin, support grants | exports, benchmarking |

## 6. System architecture
Clients (Next.js dashboard, Vite guest SPA, Expo Nookscanner) -> Supabase (Postgres + RLS, Auth, Storage, Realtime, Queues, Edge Functions) -> HMAC-signed dispatch to a Python GPU worker on Modal -> SOG/SPZ assets on CDN. Guests only reach Edge Functions with an unguessable QR token. Details, repo layout and workflows: [`SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md).

**Repository directories:** `apps/dashboard` (manager web), `apps/guest` (guest web), `apps/nookscanner` (capture app, skeleton), `packages/shared` (types, validation, permissions, signing), `packages/design-tokens` (tokens + CSS), `services/reconstruction` (Python worker), `supabase/` (config, migrations, seed, DB tests), `tests/e2e` (Playwright), `scripts/` (CI helpers), `infra/` (to be created in Phase 6/13 for Modal/CDN config), `docs/`, `.github/workflows`.

**Coding standards:** TypeScript strict (`noUncheckedIndexedAccess`), ESLint flat config (no `any`, type-only imports, `eqeqeq`, `dangerouslySetInnerHTML` forbidden), Prettier (single quotes, 100 cols), Zod validation at every boundary, stable error codes, SQL: lowercase keywords, `security definer` functions must `set search_path = ''`, every table RLS-enabled, schema changes only via timestamped migrations with a docs update, tests with every change, no secrets in the repo (public values only in `.env.example`), conventional, small commits.

## 7. Technology stack
TypeScript 6.0 / Node 24, npm workspaces; Supabase; Next.js 16 + React 19 (dashboard); Vite 8 + React 19 (guest); Expo SDK 58 + VisionCamera 5 (Nookscanner); COLMAP/GLOMAP + gsplat on Modal (reconstruction); Spark 2.x on three.js (viewer); SOG/SPZ/PLY; Vitest, PGlite, Playwright, unittest/pytest. Versions and sources: [`TECH_STACK.md`](docs/TECH_STACK.md).

## 8. Technology decisions
ADR-000 brand, 001 monorepo, 002 Supabase, 003 Next.js + Vite, 004 reconstruction, 005 Nookscanner stack, 006 Spark, 007 SOG, 008 hosting, 009 TUS uploads, 010 testing/PGlite, 011 role model, 012 guest token access: [`DECISION_LOG.md`](docs/DECISION_LOG.md).

## 9. Database architecture
31 tables designed (tenancy, scans, processing, scenes, appliances, hotspots, instructions, publishing, QR, guests, analytics, support, notifications, audit). Implemented (3 migrations): `profiles`, `permissions`, `role_permissions`, `organizations`, `organization_members`, `property_members`, `properties`, `apartments`, `rooms`, `audit_logs`, `organization_invitations`, `qr_codes`, `scan_sessions`, `scan_checkpoints`, `media_uploads` + helpers, triggers, RLS, RPCs; 5 storage buckets with path-bound policies. [`DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md).

## 10. API architecture
PostgREST + RPC (RLS-enforced), Storage/TUS, Realtime, Edge Functions (`guest-experience`, `guest-instruction`, `guest-events`, `dispatch-processing`, `job-callback`, `qr-render`), worker contract v1 with HMAC. [`API_SPECIFICATION.md`](docs/API_SPECIFICATION.md).

## 11. Security architecture
RLS as primary boundary; Edge Functions as the only guest/worker path; least privilege; audit log; HMAC callbacks; private storage + signed URLs; CSP and security headers; secret-in-bundle checks; privacy and retention rules. [`SECURITY.md`](docs/SECURITY.md), [`THREAT_MODEL.md`](docs/THREAT_MODEL.md) (31 threats; T01-T05, T19, T20, T22, T23, T25-T27, T29-T31 mitigated and tested).

## 12. Design system
Warm hospitality palette (Lagoon `#1F5662` primary, Brass `#C8893B` accent, warm canvas `#F7F5F1`, dark viewer `#0E1116`), Inter + IBM Plex Sans Arabic, spacing/radius/elevation scales, components, guest viewer patterns, 3D controls, WCAG 2.2 AA (contrast pairs tested). [`DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## 13. 3D capture and reconstruction architecture
Guided continuous walkthrough (doorway overlap, loop closure) -> frames -> COLMAP/GLOMAP poses -> gsplat (Apache-2.0; INRIA code prohibited, non-commercial) -> cleanup -> SplatTransform -> SOG with LoD -> Spark viewer; one coordinate frame per apartment; rooms as floor polygons + viewpoints; hotspots anchored in scene space; Phase 6 bake-off against Varjo Teleport. [`3D_TECHNOLOGY.md`](docs/3D_TECHNOLOGY.md).

**Quality bar (binding, ADR-014):** [`3D_QUALITY_BAR.md`](docs/3D_QUALITY_BAR.md). 3D quality must be the best achievable and is measured, not asserted. It works for many managers and many devices (tiers T1 recent iPhone Pro / pilot, T2 older iPhone, T3 high-end Android, T4 mid-range Android, T5 any existing video); nothing is hardcoded to one phone, apartment or organisation. No 3D stage is DONE without the measured evidence the quality bar requires.

## 14. Cloud infrastructure
Supabase (DB/Auth/Storage/Queues/Functions), Vercel (web), Modal (GPU), Supabase CDN then Cloudflare R2, Sentry, GitHub Actions; separate local/staging/production. [`INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md).

## 15. Cost estimates
Verified unit prices (2026-11-19): Supabase Pro from $25/month; Modal L40S $0.000542/s, A100-80GB $0.000694/s, $30/month free credits; R2 $0.015/GB-month with free egress; Vercel Pro $20/developer seat/month. **ESTIMATES:** $2-$6 GPU per apartment reconstruction; pilot run-rate ~$25-$70/month plus ~$50-$160 one-off reconstruction spend. Apple Developer fee and domain prices to be checked by the user. Full table: [`INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) section 5.

## 16. Development roadmap
Phases 0-14 with stages: [`DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md). Phases 0 and 1 done; Phase 2 in progress (2.2, 2.3, 2.5 done on the local real stack; 2.1 hosted part blocked on the user; 2.4 next). Phases 5, 6, 7 and 12 carry the quality-bar gates, including the other-device footage stage 6.4.

## 17. Stage acceptance criteria
Universal stage gate + per-stage criteria in the roadmap, plus the 3D quality gate for Phases 5, 6, 7 and 12. A stage is complete only when its tests pass, security is reviewed, and docs are updated with real evidence.

## 18. Testing strategy
Unit (Vitest), DB/RLS (same suites on PGlite and on the real local Supabase stack, ADR-013), worker (unittest), component (Testing Library), E2E (Playwright, mobile Chromium + WebKit), 3D/performance/load/security/device testing in later phases. [`TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md).

## 19. Deployment strategy
Migrations via Supabase CLI after user authorization; Vercel for web; Modal for worker; release and rollback procedure. [`DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 20. Production readiness requirements
All of: Part 15 end-to-end workflow passes with real footage; no open Critical/High security findings (pen test done on staging); RLS tests pass on real Supabase; MFA for owners/admins; CSP nonce-based; backups verified by restore drill; monitoring and alerting live; performance budgets (NFR-PERF) met on real iOS/Android devices; privacy policy/terms/DPA published; trademark and domain decisions made; runbooks complete; production Supabase project on Pro with separate keys.

## 21. Known limitations
Video does not guarantee reconstruction quality (featureless walls, mirrors, glass, fast motion); first-LoD/size budgets unproven until pilot; Nookscanner iOS-only at first; EN/AR only; DB suites verified on the local Supabase stack but not yet on the hosted project; no real footage yet, so 3D targets are uncalibrated. [`KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

## 22. Outstanding risks
| Risk | Impact | Mitigation |
|---|---|---|
| Reconstruction quality on real apartments below expectations | High | Capture guidance, bake-off with managed provider, re-capture flow |
| Large splats too heavy for low-end phones | High | LoD/streaming, per-tier splat budgets, fallback list |
| Quality tuned only for the pilot iPhone fails on other managers' phones | High | Device tiers + other-device footage stage 6.4 + capability-based profiles (ADR-014) |
| Fast-moving 3DGS ecosystem (library churn) | Medium | Provider and renderer abstractions, keep PLY master |
| Privacy of interior footage | High | Private buckets, retention, pre-publish confirmation |
| Vendor pricing changes (Supabase, Modal, Teleport) | Medium | Portable architecture, cost tracking per job |
| Brand/trademark conflict (Nookscanner) | Medium | Official search via counsel before launch |
| Single developer + AI continuity | Medium | This document + stage discipline |

## 23. Future improvements
Assisted appliance detection, Android Nookscanner, ARKit/LiDAR pose priors, offline guest cache, more languages, PMS/booking integrations, subscriptions, R2 CDN, custom domains per organization, scene diffing when equipment changes.

## 24. Current project status

**Latest (2026-11-22):** **Phase 8 DONE** (8.1 appliances, 8.2 hotspots, 8.3 instructions EN/AR with safe Markdown ADR-021, 8.4 verification, 8.5 publishing ADR-022; migrations 1000-1400 applied to hosted). Modal GPU image builds and its 65 worker tests pass inside it; deploy finishing (python symlink layer). Dashboard dev server for the user's Expo Go test runs on http://localhost:3001; Expo at exp://192.168.1.240:8081. Next: Phase 9 (guest Edge Functions, 3D hotspots, search, fallback).

**Earlier (2026-11-21):** Phase 7 IN PROGRESS: 7.2 DONE, **7.3 alignment IMPLEMENTED** (migration 0800; real-apartment 3% door check needs footage + GPU), **7.4 rooms/viewpoints/transitions DONE** (migration 0900, ADR-020). Modal: account logged in on this PC, `WORKER_HMAC_SECRET` set in Supabase and as Modal secret `nookscanner-staging` (same value, never shown); first `modal deploy` (GPU image build) in progress. **7.5 IMPLEMENTED** (adaptive quality governor + list fallback; real-device matrix Blocked on user 9). Capture app has an Expo Go test mode (CAPTURE_TEST_SCRIPT section 0). Next: finish 6.8 (deploy, public sample end to end), then Phase 8 (appliance hotspots).

**Where development stopped (2026-11-20):** Phases 0 and 1 complete (CI green on GitHub). Phase 2 complete on the **local** Supabase stack: 2.2 schema, 2.3 storage, 2.4 dashboard auth, 2.5 real-stack DB tests, 2.6 security review (5 findings fixed, no Critical/High open). All 5 migrations are applied to the hosted project (user-approved) and verified (lint clean, advisors accepted, anon smoke 30/30); only hosted Auth dashboard settings remain (Blocked on user 1). Phase 3 DONE. **Phase 4 DONE.** **Phase 5 IN PROGRESS: 5.1 DONE** (chunked resumable upload, migration 0500 applied locally and hosted), **5.2 DONE for format validation** (worker `validate.py`; real-footage reports wait for Blocked on user 4), **5.3 DONE** (capability-based device tiers + capture profiles as shared data), **5.4 IMPLEMENTED, device runs blocked on user** (Blocked on user 8). **5.5 IMPLEMENTED** (live quality tips; calibration needs real footage, Blocked on user 4). App Store screenshots: Artifact https://claude.ai/artifact/TV34jHEDoJWUix5VVEyjHq (7 frames, 1320 x 2868). **5.6 IMPLEMENTED** (background resumable upload from the app; device check Blocked on user 8). **Phase 6 IN PROGRESS: 6.1 pipeline implemented and CPU-tested** (GPU container and sample-dataset run Blocked on user 5). **Next: 6.2** dispatch + callbacks + queue + retries, with job contract v2 (parts per input, streamed LOD outputs).

**Resume here (new session):**
1. Start Docker Desktop, then `npx supabase@3.2.0 start` (local stack on ports 565xx).
2. 2026-11-21: 7.3 implemented, 7.4 DONE; migrations 0800 + 0900 (apply hosted with dry run first). Modal logged in + secrets set; run `python -m modal deploy services/reconstruction/modal_app.py` (PYTHONIOENCODING=utf-8 on Windows) if the deploy has not finished. Phase 6.2 DONE (KI-026: hosted function deploy needs the user). 6.3 and 7.1 IMPLEMENTED, not DONE (need a real measured scene from our pipeline and real-device numbers). 6.8 compute targets IN PROGRESS (code + tests done; Docker image build verification and the user's Modal account pending; docs/GPU_WORKER.md). Next: 6.7 packaging checks, then 7.2-7.5 (controls, alignment, rooms/viewpoints, per-tier tuning), Phases 8-11 incl. 10.6 account deletion (docs/APP_STORE_COMPLIANCE.md). Viewer measurement: `npx playwright test -c playwright.perf.config.ts` with the local scene in `apps/guest/public/dev-scenes/` (KI-029: local only).
3. Stack E2E: `node scripts/e2e-stack.mjs` (use `at('/path')` from `tests/e2e-stack/helpers.ts` for URL assertions).
4. Keep following the loop in `docs/AUTONOMOUS_LOOP_PROMPT.md`; pushing to `origin/main` and applying migrations to the hosted project (dry run first) are user-approved. The binding 3D quality bar (`docs/3D_QUALITY_BAR.md`, ADR-014) is wired into Phases 5, 6, 7 and 12.

**Implemented**
- Full documentation set (this file + 18 docs incl. the 3D quality bar).
- Monorepo tooling, env separation (`.env.example` public values; git-ignored `.env.local` in `apps/dashboard` and `apps/guest` containing only the hosted project's public URL and publishable key).
- Shared packages, design tokens, dashboard and guest skeletons, Nookscanner skeleton (not installed), worker contract package.
- Migrations: `20261119000100_foundation.sql`, `20261120000100_invitations_qr_capture.sql`, `20261120000200_storage.sql`, `20261120000300_security_hardening.sql`, `20261120000400_private_helpers.sql`, `20261120000500_chunked_uploads.sql` (all 6 applied to the hosted project). Applied on PGlite, the local Supabase stack (Postgres 17.12) **and the hosted project** (2026-11-20).
- Dual-target DB tests (PGlite + local stack) incl. Storage API tests; CI jobs `verify` and `database-stack` (the latter also runs the auth E2E).
- Dashboard auth: sign-up, email confirmation, sign-in/out, password reset, `/app` landing; proxy with session refresh, route guard and per-request nonce CSP; email templates in `supabase/templates`.
- Local Supabase stack config validated with CLI 3.2.0 on ports 565xx.

**Tests performed (real results, 2026-11-20, local Windows 11, Node 24.15.0, Python 3.12.10, Docker Desktop, Supabase CLI 3.2.0)**
| Command | Result |
|---|---|
| `npm run lint` / `format:check` / `typecheck` | pass |
| `npm test` (2026-11-21) | all workspaces pass (shared 169, design-tokens 19, ui 6, viewer 31, dashboard 29, guest 17, database on PGlite 98 + 6 stack-only skipped) |
| `npm run test:e2e:stack` (dashboard auth + shell + axe + invitations on the local stack) | 28 passed, 0 skipped, 3.2 min (auth, invitations, properties + scoping, rooms, QR codes, chunked upload with network drop + resume, shell; both projects) |
| `npm run test:e2e` (guest, Pixel 7 + iPhone 15 emulation, EN/AR, axe) | 12 passed |
| `npm run test:db:stack` (real local Supabase, 2026-11-21) | 104 passed, 0 failed |
| Hosted project: `db lint --remote`, `db advisors --remote`, read-only catalog query, `npm run test:hosted:smoke` | no errors; 7 WARN = intended RPCs (accepted); 15/15 tables with RLS, 0 anon grants; smoke 30/30 |
| `supabase db advisors` (security) / `db lint` | 0 security findings / no errors |
| `supabase db lint --level warning` (local) | no schema errors |
| `npm run build` | dashboard + guest built; guest initial JS 70.18 kB gzip |
| `npm run check:secrets` | 20 files, no privileged keys |
| `npm run test:worker` | 53 passed (incl. ffmpeg tier samples, CPU end-to-end pipeline with real SplatTransform) |
| GitHub CI (previous push) | green: runs 44578429531, 44579511164 |

Failures found and fixed: R-005..R-023; open issues in [`KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

**Not tested / not done:** authenticated flows on the hosted project (needs Blocked-on-user 1); auth on the hosted project (templates/site URL not set, KI-017); CAPTCHA/leaked-password protection (KI-019); no 3D work yet, so **no 3D quality evidence exists**.

**Git:** `main` tracks `origin/main`; pushing is approved by the user (2026-11-20) and done after every stage.

### Blocked on user (exact actions)

Decision 2026-11-20 (user): **stay on the Supabase Free plan** (no Pro). Uploads must therefore work within the Free per-file limit (50 MB): Phase 5 must split large videos into parts of at most 50 MB that the worker reassembles (ADR-016). The user has the accounts and items below and will provide them when asked.

**Expo: linked.** Capture app is the Expo project `@princechakusa/nookscanner` (ID 696c9a99-ebbb-4d16-810d-6e1bd5cbdef6); EAS auth uses the user's `EXPO_TOKEN` environment variable (never commit or print it); `apps/nookscanner/eas.json` has development/preview/production profiles. VisionCamera 5 has no Expo config plugin, so camera permission strings live in `app.json` `ios.infoPlist`.

**Apple iOS build credentials: READY (2026-11-20).** Team N5DSK22C62 (Individual); bundle id `com.nookscanner.capture` registered; existing distribution certificate reused (valid to 2027-07-26); ad hoc provisioning for 3 registered iPhones (two A18-class incl. the pilot, one A15-class usable as the older-iPhone test device). EAS confirms: all credentials ready to build `@princechakusa/nookscanner`. **Apple Developer Program: the user HAS an account (2026-11-20).** When Phase 5.4 needs it, ask the user to run `npx eas-cli login` (and Apple sign-in prompts) themselves in the terminal; never ask for the Apple password in chat.
1. **Custom e-mail (SMTP) provider: now also needed for 6-digit sign-in codes and phone-friendly confirmation/reset codes** (2026-11-22: Supabase Free refuses email-template changes with the default sender). Free options: Brevo (300 emails/day, verify one sender address) or Resend (3,000/month, needs a domain you own, item 6). Create the account, then enter host/port/user/password under Supabase dashboard > Authentication > Emails > SMTP Settings (never in chat); tell the agent, who then pushes the code templates (`supabase/templates`, magic_link/confirmation/recovery) and turns on 'Email me a sign-in code' in the app. Until then: invitations by copied link; app sign-up confirms via the email link; password reset works on the computer.
2. **Hosted Auth settings** (Supabase dashboard, project `nfcnckwjrwpofkrzribd`): set Site URL to the dashboard host (until it is deployed: `http://localhost:3000`) and add `/auth/confirm` to redirect URLs; paste `supabase/templates/confirmation.html` and `recovery.html` into Authentication > Email Templates; configure custom SMTP; enable CAPTCHA and leaked-password protection (KI-017, KI-019). Then hosted sign-up/confirm/reset can be tested end to end.
3. **Optional:** branch protection on `main` (require CI). Also check whether GitHub Pages should be enabled on this repository: "pages build and deployment" runs on every push.
4. **Real footage (3D quality bar):** pilot apartment walkthrough from the iPhone 16 Pro Max, plus **real footage from other phones**: one Android walkthrough and one older-iPhone walkthrough (roadmap 6.4); more layouts later. Share privately; never commit footage.
5. **3D processing (ADR-018): account + login + secret DONE 2026-11-21** (deploy and sample run by the agent). Still yours: confirm the Modal spend limit (free credit + USD 30) in Settings > Usage and billing. Original instructions: create a free Modal account (modal.com), set the workspace **spend limit to the free monthly credit + USD 30** (user accepts up to USD 30/month; the bill can never exceed it), then run `modal token new` in a terminal (it opens the browser; never paste tokens in chat). Later, optionally: a PC with an NVIDIA RTX GPU (12 GB+ VRAM) can run the worker instead; it only needs to be on while processing.
6. **Brand/legal:** decide on buying nookscanner.com and on an official trademark search.
11. **Cloudflare: DONE 2026-11-22 (ADR-024).** Logged in (browser login; the old `CLOUDFLARE_API_TOKEN` variable on this PC is invalid and ignored, KI-034). Guest app live at https://nookscanner-guest.pages.dev (`npm run deploy:guest`), `GUEST_ORIGIN` and QR base URL set; private R2 bucket `nookscanner-raw-footage` created; upload integration = roadmap 5.7 (no user action needed). Earlier note: checked: the saved wrangler login has EXPIRED and the `CLOUDFLARE_API_TOKEN` environment variable on this PC is rejected (expired or missing permissions). Run `$env:CLOUDFLARE_API_TOKEN = $null; npx wrangler login` in a VS Code terminal (browser approval, no token in chat); the agent then uses the browser login and ignores the old variable, then choose: (a) host the guest app on Cloudflare Pages (gives guest QR links a public address and `GUEST_ORIGIN`; recommended first), (b) R2 for raw footage (item 7; Cloudflare asks for a payment method on file even for the free tier).
7. **Video storage beyond the Free plan's 1 GB total (decide before real pilot uploads, not blocking 5.1 locally):** one walkthrough is 0.5-5 GB, so hosted raw footage cannot live in Supabase Storage. Options, both without buying anything: (a) Cloudflare R2 free tier (10 GB storage, free egress; Cloudflare asks for a payment method on file to enable R2) - create the bucket yourself and set its keys with `npx supabase secrets set R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...` (never paste them in chat); or (b) keep Supabase only and accept that each upload is deleted as soon as the worker has copied it (needs Modal, item 5), with uploads limited to under ~900 MB.
12. **Switch hosted raw-footage uploads to R2 (Stage 5.7):** Worker, secrets and clients are live; after one successful short upload from the app, the agent runs `update private.platform_settings set value = 'r2' where key = 'raw_footage_backend'` on hosted (say "switch uploads to R2"). Needed before walkthroughs larger than ~900 MB.
10. **DONE 2026-11-22 (user-approved): processing pipeline live on hosted.** Cron job `nookscanner-dispatch` (id 1, every minute) created; first run 200 `{"requeued":0,"dispatched":[],"failed":[]}`. Functions DEPLOYED 2026-11-22 with your approval (job-callback, dispatch-processing, claim-job, guest-experience, guest-instruction; secrets WORKER_URL + DISPATCH_SECRET set, the dispatch bearer also stored in Vault as `nookscanner_dispatch_secret`; pg_cron + pg_net enabled by migration 1600). Hosted checks: bad guest token -> uniform 404 with our CORS header, POST -> 405, unsigned callback/dispatch/claim -> 401. Still needed: approval to create the once-a-minute cron job (SQL in docs/DEPLOYMENT.md section 3, reads the bearer from Vault), or create it yourself in the dashboard (Integrations > Cron). Original item: **Deploy the Edge Functions to the hosted project (one approval):** `dispatch-processing`, `job-callback`, `claim-job`, `guest-experience`, `guest-instruction`, plus secrets `WORKER_URL` (Modal submit URL, docs/GPU_WORKER.md), `DISPATCH_SECRET` (generated) and `GUEST_ORIGIN`, and the dispatcher schedule. Say "deploy the functions" and the agent runs it (docs/DEPLOYMENT.md section 3); until then Modal processing and guest QR links work only locally. Then one walkthrough video (item 4) runs end to end on Modal.
9. **Guest 3D on real devices (Stage 7.1/7.5 acceptance):** once the pilot apartment is processed, open its guest link on your iPhone 16 Pro Max, the older iPhone and an Android phone (and a tablet if you have one); the page records load time, first frame, fps and quality level. Until then nothing is needed.
8. **Capture app on real iPhones (Stage 5.4 acceptance):** follow `docs/CAPTURE_TEST_SCRIPT.md` section 1 (`cd apps/nookscanner`, `npx eas-cli device:create` for each test iPhone, `npx eas-cli build --profile development --platform ios`, install, `npx expo start --dev-client`), run the steps on the pilot iPhone 16 Pro Max and one older/non-Pro iPhone, and send back the results table. Uses your free EAS build quota; nothing is bought.

## 25. Session log
| Date | Session summary |
|---|---|
| 2026-11-19 | Phase 0 research and full documentation; Phase 1 foundation implemented and tested; Nookscanner name adopted; Supabase project and GitHub repo details received; remote added; foundation staged, not committed (no git identity configured). Commit message to use: `chore: Phase 0 docs and Phase 1 foundation (monorepo, apps, DB tenancy + RLS, tests)` |
| 2026-11-20 | Found that the user had set the git identity, committed, pushed (CI green) and linked the Supabase project; Phase 1 closed. Docker available: local Supabase stack started (own 565xx ports). Stage 2.2 schema + RPCs, 2.3 storage buckets/policies, 2.5 dual-target DB tests (64/64 on real local Supabase). Adopted the binding 3D quality bar (ADR-014) and the other-device stage 6.4. |
| 2026-11-20 (cont.) | Stage 2.4: dashboard auth flows with nonce CSP and proxy guard; 12/12 stack E2E; fixed a redirect loop on revoked sessions (R-010); KI-008 closed. |
| 2026-11-20 (cont.) | Stage 2.6 security review: advisors clean, 5 logic findings fixed (migration 0300), 71/71 on the real stack; Phase 2 complete locally. |
| 2026-11-20 (cont.) | User approved push + hosted migrations: pushed; 5 migrations applied to hosted; hosted advisor finding fixed (helpers to `private`); hosted smoke 30/30. |
| 2026-11-20 (cont.) | Phase 3.1-3.3: tokens/fonts, `packages/ui`, dashboard shell; screen designs for all 7 screens recorded; stack E2E 16/16 with axe. |
| 2026-11-20 (cont.) | Stage 3.4 guest shell per mockups; Phase 3 complete. |
| 2026-11-20 (cont.) | Stage 4.1 implemented; invitation E2E blocked by KI-022 (marked fixme). Session stopped at the user's request for a fresh chat; resume steps in section 24. |
| 2026-11-20 (cont.) | Autonomous loop resumed. KI-022 root cause: loose `/\/app$/` matched the confirm URL, aborting the confirm POST; fixed, fixme removed, 18/18 stack E2E. Stage 4.1 DONE. |
| 2026-11-20 (cont.) | Stage 4.2 properties + apartments CRUD with layout questionnaire; fixed form input loss (R-021) and leaked test contexts (R-022); stack E2E 20/20. |
| 2026-11-20 (cont.) | Stage 4.3 rooms (create from layout, custom, rename, reorder, delete, top-up); stack E2E 22/22; DB stack 74/74. |
| 2026-11-20 (cont.) | Stage 4.4 guest QR codes; Phase 4 complete. Found the local WebKit slowness cause (trace recording, R-023); stack E2E 24/24 in 2 min. |
| 2026-11-20 (cont.) | Stage 5.1 chunked resumable upload (ADR-017); migration 0500 applied to hosted (dry run first; lint clean, smoke 30/30); stack E2E 28/28. |
| 2026-11-20 (cont.) | Stage 5.2 upload validation in the worker (ffprobe gates, tier sample reports, CI ffmpeg); real-footage reports pending. |
| 2026-11-20 (cont.) | Stage 5.3 capability-based device tiers + capture profiles (shared JSON, TS + Python). |
| 2026-11-20 (cont.) | Stage 5.4 capture app implemented (typecheck + iOS bundle + CI job); device test script written; device runs blocked on user 8. |
| 2026-11-20 (cont.) | Paused 11:24-11:52 at the user's request (no EAS/app builds). 7 App Store screenshots designed (Artifact); capture app moved to brand tokens and polished to match; Stage 5.5 live quality tips (shared metrics 11 tests, frame output wiring). |
| 2026-11-20 (cont.) | Stage 5.6 background resumable app upload (shared queue + native background tasks); fixed a CI lint error from 5.5. |
| 2026-11-20 (cont.) | Stage 6.1 reconstruction pipeline implemented and CPU-tested end to end (worker 53); GPU run blocked on Modal. |
| 2026-11-21 | Stages 7.3 (alignment, implemented) and 7.4 (rooms, viewpoints, transitions, DONE): migrations 0800/0900, real-scene E2E; fixed scene reload on save, doorway/viewpoint heights. Modal logged in, worker secret set in Supabase + Modal; first deploy building. |
