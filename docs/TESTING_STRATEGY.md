# Nookscanner: Testing Strategy

Version 1.0 (2026-11-19). **Rule: record actual results only; never fabricate evidence.** Results per stage are recorded in `PROJECT_MASTER.md` section 24 and [`CHANGELOG.md`](CHANGELOG.md).

## 1. Test layers and tools

| Layer | Tool | Location | Runs in CI | Status |
|---|---|---|---|---|
| Unit (TS) | Vitest | `packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts(x)` | yes | Implemented |
| Database migrations + RLS + tenant isolation | Vitest + PGlite (+ Supabase shim) | `supabase/tests/*.test.ts` | yes | Implemented |
| Database (real Supabase) | Same Vitest suites against the local Supabase stack (ADR-013) + Storage API tests through Auth/PostgREST/Storage + `supabase db lint` | `supabase/tests/*.test.ts` (`npm run test:db:stack`) | yes (job `database-stack`, Docker) | Implemented (64 tests) |
| Worker unit | pytest (falls back to stdlib unittest if pytest absent) | `services/reconstruction/tests` | yes | Implemented |
| Component (React) | Vitest + Testing Library + jsdom | `apps/*/src` | yes | Implemented (guest shell) |
| API / Edge Functions | Deno test + Vitest integration against local stack | `supabase/functions/*/test.ts` | yes | Planned Phase 2/9 |
| E2E | Playwright (Chromium, WebKit, mobile emulation) | `tests/e2e` | yes | Implemented: 3 guest-shell smoke tests x 2 device projects |
| 3D tests | Playwright + canvas readiness + hotspot projection unit tests + golden screenshots on reference scene | `packages/viewer`, `tests/e2e` | partly | Phase 7 |
| Performance | Lighthouse CI (guest), custom FPS/memory probe in viewer, WebPageTest on 4G profiles | `tests/perf` | nightly | Phase 7/11 |
| Load | k6 against staging guest endpoints | `tests/load` | manual | Phase 11 |
| Security | npm audit, pip-audit, secret scanning (gitleaks), bundle secret grep, OWASP ZAP baseline on staging, authorized penetration test | CI + staging | yes / manual | Phase 1 (audit), 11 |
| Device compatibility | BrowserStack or physical devices: iPhone (Safari), Android (Chrome), iPad, desktop | manual matrix | no | Phase 11/12 |

## 2. What must be covered

### Database security (Part 14)
For every tenant table: (a) member of org A can read/write A per role; (b) cannot read/write B; (c) role boundaries (viewer cannot write, editor cannot publish, etc.); (d) property-scoped members only see their properties; (e) anon cannot read anything; (f) invariants (last owner, parent-org, platform-admin flag); (g) RLS enabled on all tables (catalog query).

### API security
Authz on each RPC/Edge Function; Zod rejects malformed input; body limits; rate limits return 429; uniform 404 for guest lookups; HMAC failures rejected (bad signature, stale timestamp, replay).

### Uploads
Type/size validation (client + DB), interrupted upload resumes, retry after token refresh, unauthorized path rejected, other-org path rejected.

### 3D
Governed by [`3D_QUALITY_BAR.md`](3D_QUALITY_BAR.md) (ADR-014): measured evidence per device tier (T1-T5) is required before any 3D stage is DONE.
Reconstruction quality metrics (PSNR/SSIM on held-out frames, registered-frame ratio >= 90%), room continuity checklist, hotspot coordinate round-trip (world -> screen -> world), object selection (raycast hit within 10 cm of placed point on reference scene), room navigation (camera reaches viewpoint), asset loading (LoD first frame time), mobile performance (fps, memory).

### Device/performance
Budgets in [`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md) NFR-PERF-*, on iPhone (Safari), Android mid-range (Chrome), iPad, desktop; network throttled to "Fast 4G" and "Slow 4G".

## 3. Test data

Synthetic only (seed files). Real apartment footage only in staging/production with the property owner's consent; never committed to Git.

## 4. CI pipeline (`.github/workflows/ci.yml`)

Job `verify`: `npm ci` -> lint -> format -> typecheck -> unit + DB (PGlite) tests -> build -> secret scan -> worker tests -> npm audit (high+) -> Playwright. Job `database-stack`: `supabase start` (Docker) -> `supabase db lint --fail-on warning` -> DB suites + Storage API tests on the real stack.

## 5. Security testing plan

| When | Activity |
|---|---|
| Every PR | lint, typecheck, unit, RLS tests, npm audit, secret scan |
| End of each phase | threat model review, new isolation tests for new tables |
| Phase 11 | OWASP ASVS L2 checklist review, ZAP baseline + authenticated scan on staging, dependency review, external penetration test (authorized, staging only), load test |
| Before production | Production readiness audit (PROJECT_MASTER section 20) |
