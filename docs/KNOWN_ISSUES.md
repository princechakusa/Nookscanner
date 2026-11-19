# Nookscanner: Known Issues and Open Items

Updated 2026-11-20. Severity: Critical / High / Medium / Low. Close an item only with evidence.

| ID | Severity | Area | Issue | Mitigation / next step | Owner | Status |
|---|---|---|---|---|---|---|
| KI-002 | Low | Testing | DB suites now also pass on the real local Supabase stack (64/64, ADR-013), but not yet against the hosted project, and the CI `database-stack` job has not had its first GitHub run | After `db push` (KI-003), run the suites' read-only checks against hosted staging; confirm the CI job is green after the next push | Dev | Open (reduced from Medium) |
| KI-003 | Medium | Infra | No migration applied to the hosted project (ref nfcnckwjrwpofkrzribd): `migration list --remote` shows 3 local, 0 remote (2026-11-20). Project is linked | User authorizes `npx supabase@3.2.0 db push` (dry run first) | User | Open |
| KI-004 | Medium | Legal | COLMAP third-party dependency licences (Ceres, PoseLib, SiftGPU, VLFeat) not yet reviewed | Review when building the worker container (Phase 6.1) | Dev | Open |
| KI-005 | Medium | Vendor | Varjo Teleport pricing inconsistent across sources; not verified | Confirm on sign-up before the bake-off; user approval of spend | User | Open |
| KI-006 | Low | Brand | No logo; wordmark placeholder only | Professional logo design (user decision) | User | Open |
| KI-007 | High (before launch) | Legal | Brand "Nookscanner" (nookscanner.com) and app name "Nookscanner" (nookscanner.com): domains NOT purchased, trademarks NOT searched/cleared, no accounts | Official trademark search (USPTO/EUIPO/WIPO, classes 9/42/43) via counsel; buy domains if desired | User | Open |
| KI-008 | Low | Security | Dashboard CSP uses `'unsafe-inline'` for scripts/styles (Next.js hydration) | Move to nonce-based CSP via middleware when auth pages land (Phase 2/3) | Dev | Open |
| KI-009 | Low | Tooling | TypeScript pinned to 6.0.x because typescript-eslint 8.73 supports `<6.1.0`; TypeScript 7 not adopted | Re-evaluate when typescript-eslint supports TS 7 | Dev | Open |
| KI-011 | Medium | Infra | Supabase Free plan caps uploads at 50 MB and has no backups; real walkthrough videos need Pro | Upgrade the `nookscanner` project to Pro before Phase 5 uploads (user decision, cost) | User | Open |
| KI-012 | Low | Mobile | Nookscanner app is a skeleton; dependencies not installed or built | Phase 5 | Dev | Open |
| KI-013 | Low | Vendor | Vercel Hobby commercial-use terms not verified this session | Verify or use Pro before commercial launch | User | Open |
| KI-014 | Medium | 3D quality | No real footage from any device yet; quality-bar targets (3D_QUALITY_BAR.md) are uncalibrated, and the other-device test (roadmap 6.4) needs an Android and an older-iPhone walkthrough | User supplies pilot iPhone footage plus one Android and one older-iPhone video | User | Open |
| KI-015 | Low | Storage | Supabase Free caps any single upload at 50 MB; the `raw-footage` bucket deliberately inherits the project limit, so real walkthroughs cannot upload until Pro (see KI-011) | Upgrade to Pro, then set the project upload limit (the 10 GiB pilot cap is enforced in `media_uploads`) | User | Open |
| KI-016 | Low | Tooling | Local stack uses ports 56520-56583 (other projects' stacks occupy 543xx). Local `.env.local` files must point to `http://127.0.0.1:56521` when testing against the local stack | Documented in `.env.example` and DEPLOYMENT | Dev | Open (by design) |

## Resolved

| ID | Issue | Resolution | Date |
|---|---|---|---|
| R-001 | Property inserts with `RETURNING` failed RLS: the select policy looked up the not-yet-visible row | Added `has_property_permission(org, property, perm)` using the row's own columns for `properties` policies | 2026-11-19 |
| R-002 | Trigger `enforce_parent_org` referenced `new.user_id` for tables without that column (PL/pgSQL does not short-circuit) | Nested the property_members-only check | 2026-11-19 |
| R-003 | Prettier reformatted generated `tokens.css`, breaking the sync test | Excluded the generated file from Prettier; regenerated | 2026-11-19 |
| R-004 | Playwright web server timed out (Vite preview bound to IPv6 localhost) | `vite preview --host 127.0.0.1` | 2026-11-19 |
| R-005 | Supabase CLI 3.2.0 rejected `supabase/config.toml` (`[inbucket]` removed; `auth.email.enable_signup` deprecated) | `[local_smtp]`, `auth.email.enabled`; config now validated by the CLI | 2026-11-20 |
| R-006 | Local stack default ports collided with other projects' running Supabase stacks | Nookscanner local stack moved to the 565xx range | 2026-11-20 |
| R-007 | New capture tests hung on PGlite: a helper ran `db.query` while a transaction held the single connection | Lookups moved outside the transaction | 2026-11-20 |
| R-008 | Storage test assumed members' deletes on `storage.objects` return 0 rows; real Supabase raises "Direct deletion from storage tables is not allowed" | Test accepts either denial and asserts the object survives (found by the real-stack run, ADR-013) | 2026-11-20 |
| R-009 | Stack runs not repeatable (fixed slugs/emails on a persistent DB) | Run-unique `runId` suffix in the harness | 2026-11-20 |
| KI-001 (closed) | Docker not running, so no local Supabase stack | Docker Desktop running; `supabase start` succeeded; all migrations applied on Postgres 17.12 image | 2026-11-20 |
| KI-010 (closed) | CI never executed | Pushed by the user; CI green (runs 44578429531, 44579511164) | 2026-11-20 |
