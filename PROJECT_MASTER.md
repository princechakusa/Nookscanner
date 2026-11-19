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

**Where development stopped (2026-11-20):** Phases 0 and 1 complete (CI green on GitHub). Phase 2 complete on the **local** Supabase stack: 2.2 schema, 2.3 storage, 2.4 dashboard auth, 2.5 real-stack DB tests, 2.6 security review (5 findings fixed, no Critical/High open). Only 2.1's hosted part remains (`db push` + hosted Auth settings need the user's go-ahead). **Next stage: Phase 3.1 (design tokens consumed in both apps), then 3.2-3.4 (core components, dashboard shell, guest shell using the mockups in `docs/design/`).** The binding 3D quality bar (`docs/3D_QUALITY_BAR.md`, ADR-014) is wired into Phases 5, 6, 7 and 12.

**Implemented**
- Full documentation set (this file + 18 docs incl. the 3D quality bar).
- Monorepo tooling, env separation (`.env.example` public values; git-ignored `.env.local` in `apps/dashboard` and `apps/guest` containing only the hosted project's public URL and publishable key).
- Shared packages, design tokens, dashboard and guest skeletons, Nookscanner skeleton (not installed), worker contract package.
- Migrations: `20261119000100_foundation.sql`, `20261120000100_invitations_qr_capture.sql`, `20261120000200_storage.sql`, `20261120000300_security_hardening.sql`. Applied on PGlite and on the local Supabase stack (Postgres 17.12); **not applied to the hosted project**.
- Dual-target DB tests (PGlite + local stack) incl. Storage API tests; CI jobs `verify` and `database-stack` (the latter also runs the auth E2E).
- Dashboard auth: sign-up, email confirmation, sign-in/out, password reset, `/app` landing; proxy with session refresh, route guard and per-request nonce CSP; email templates in `supabase/templates`.
- Local Supabase stack config validated with CLI 3.2.0 on ports 565xx.

**Tests performed (real results, 2026-11-20, local Windows 11, Node 24.15.0, Python 3.12.10, Docker Desktop, Supabase CLI 3.2.0)**
| Command | Result |
|---|---|
| `npm run lint` / `format:check` / `typecheck` | pass |
| `npm test` | all workspaces pass (shared 49, design-tokens 19, dashboard 19, guest 7, database on PGlite 66 + 5 stack-only skipped) |
| `npm run test:e2e:stack` (dashboard auth on the local stack) | 12 passed (desktop Chromium + iPhone 15 WebKit) |
| `npm run test:e2e` (guest) | 6 passed |
| `npm run test:db:stack` (real local Supabase) | 71 passed, 0 failed (after `db reset`) |
| `supabase db advisors` (security) / `db lint` | 0 security findings / no errors |
| `supabase db lint --level warning` (local) | no schema errors |
| `npm run build` | dashboard + guest built; guest initial JS 70.18 kB gzip |
| `npm run check:secrets` | 17 files, no privileged keys |
| `npm run test:worker` | 14 passed |
| GitHub CI (previous push) | green: runs 44578429531, 44579511164 |

Failures found and fixed: R-005..R-012 in [`KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

**Not tested / not done:** anything on the hosted Supabase project (nothing migrated there); the new CI job `database-stack` on GitHub (runs on the next push); auth on the hosted project (templates/site URL not set, KI-017); CAPTCHA/leaked-password protection (KI-019); no 3D work yet, so **no 3D quality evidence exists**.

**Git:** `main` tracks `origin/main`. This session's work is committed locally (one commit per stage); **not pushed** (push needs the user's approval).

### Blocked on user (exact actions)
1. **Approve pushing** the new local commits to `origin/main` (`git push`), so CI (including the new `database-stack` job) runs on GitHub.
2. **Apply migrations to the hosted project:** from the repo root run `npx supabase@3.2.0 db push --dry-run`, check it lists the 3 migrations, then `npx supabase@3.2.0 db push` (or tell me to run it). Then in the hosted dashboard set the site URL, paste the two email templates from `supabase/templates`, and mirror the Auth settings (DEPLOYMENT section 1); custom SMTP before real users.
3. **Optional:** enable branch protection on `main` in GitHub (require CI).
4. **Before Phase 5:** upgrade the Supabase project to Pro (uploads over 50 MB, backups; KI-011/KI-015); enroll in the Apple Developer Program for Nookscanner Capture device builds.
5. **Real footage (3D quality bar):** a walkthrough of the pilot apartment from the iPhone 16 Pro Max, **plus real footage from other phones: one Android walkthrough and one older-iPhone walkthrough** (roadmap 6.4); ideally more apartment layouts later (studio, multi-bedroom, dark rooms, glass). Do not commit footage; share via a private location.
6. **Before Phase 6:** create a Modal account/token with a spend limit; optionally request Varjo Teleport developer access.
7. **Brand/legal:** decide on buying nookscanner.com and on an official trademark search.

## 25. Session log
| Date | Session summary |
|---|---|
| 2026-11-19 | Phase 0 research and full documentation; Phase 1 foundation implemented and tested; Nookscanner name adopted; Supabase project and GitHub repo details received; remote added; foundation staged, not committed (no git identity configured). Commit message to use: `chore: Phase 0 docs and Phase 1 foundation (monorepo, apps, DB tenancy + RLS, tests)` |
| 2026-11-20 | Found that the user had set the git identity, committed, pushed (CI green) and linked the Supabase project; Phase 1 closed. Docker available: local Supabase stack started (own 565xx ports). Stage 2.2 schema + RPCs, 2.3 storage buckets/policies, 2.5 dual-target DB tests (64/64 on real local Supabase). Adopted the binding 3D quality bar (ADR-014) and the other-device stage 6.4. |
| 2026-11-20 (cont.) | Stage 2.4: dashboard auth flows with nonce CSP and proxy guard; 12/12 stack E2E; fixed a redirect loop on revoked sessions (R-010); KI-008 closed. |
| 2026-11-20 (cont.) | Stage 2.6 security review: advisors clean, 5 logic findings fixed (migration 0300), 71/71 on the real stack; Phase 2 complete locally. |
