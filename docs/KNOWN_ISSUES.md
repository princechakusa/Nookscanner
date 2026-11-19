# Nooktour: Known Issues and Open Items

Updated 2026-11-19. Severity: Critical / High / Medium / Low. Close an item only with evidence.

| ID | Severity | Area | Issue | Mitigation / next step | Owner | Status |
|---|---|---|---|---|---|---|
| KI-001 | Medium | Tooling | Docker daemon not running on the dev machine, so the full local Supabase stack (`npx supabase start`) and pgTAP tests could not run | Start Docker Desktop; run `npx supabase start` then `npx supabase test db` (Phase 2.5) | User + dev | Open |
| KI-002 | Medium | Testing | RLS tests run on PGlite with a test-only shim of Supabase `auth` (`supabase/tests/support/supabase-shim.sql`), not on real Supabase | Re-run the same scenarios as pgTAP against the local stack and the hosted staging project before closing Phase 2 | Dev | Open |
| KI-003 | Medium | Infra | Foundation migration has not been applied to the hosted project `nooktour` (ref nfcnckwjrwpofkrzribd) | User runs `supabase login` + `supabase link`, then authorizes `supabase db push` | User | Open |
| KI-004 | Medium | Legal | COLMAP third-party dependency licences (Ceres, PoseLib, SiftGPU, VLFeat) not yet reviewed | Review when building the worker container (Phase 6.1) | Dev | Open |
| KI-005 | Medium | Vendor | Varjo Teleport pricing inconsistent across sources; not verified | Confirm on sign-up before the bake-off; user approval of spend | User | Open |
| KI-006 | Low | Brand | No logo; wordmark placeholder only | Professional logo design (user decision) | User | Open |
| KI-007 | High (before launch) | Legal | Brand "Nooktour" (nooktour.com) and app name "Nookscanner" (nookscanner.com): domains NOT purchased, trademarks NOT searched/cleared, no accounts | Official trademark search (USPTO/EUIPO/WIPO, classes 9/42/43) via counsel; buy domains if desired | User | Open |
| KI-008 | Low | Security | Dashboard CSP uses `'unsafe-inline'` for scripts/styles (Next.js hydration) | Move to nonce-based CSP via middleware when auth pages land (Phase 2/3) | Dev | Open |
| KI-009 | Low | Tooling | TypeScript pinned to 6.0.x because typescript-eslint 8.73 supports `<6.1.0`; TypeScript 7 not adopted | Re-evaluate when typescript-eslint supports TS 7 | Dev | Open |
| KI-010 | Low | CI | GitHub Actions workflow written but never executed (nothing committed or pushed yet: no git author identity configured on the machine) | User sets `git config --global user.name/user.email`, commits staged files, approves push to `origin`; confirm green run | User + dev | Open |
| KI-011 | Medium | Infra | Supabase Free plan caps uploads at 50 MB and has no backups; real walkthrough videos need Pro | Upgrade the `nooktour` project to Pro before Phase 5 uploads (user decision, cost) | User | Open |
| KI-012 | Low | Mobile | Nookscanner app is a skeleton; dependencies not installed or built | Phase 5 | Dev | Open |
| KI-013 | Low | Vendor | Vercel Hobby commercial-use terms not verified this session | Verify or use Pro before commercial launch | User | Open |

## Resolved

| ID | Issue | Resolution | Date |
|---|---|---|---|
| R-001 | Property inserts with `RETURNING` failed RLS: the select policy looked up the not-yet-visible row | Added `has_property_permission(org, property, perm)` using the row's own columns for `properties` policies | 2026-11-19 |
| R-002 | Trigger `enforce_parent_org` referenced `new.user_id` for tables without that column (PL/pgSQL does not short-circuit) | Nested the property_members-only check | 2026-11-19 |
| R-003 | Prettier reformatted generated `tokens.css`, breaking the sync test | Excluded the generated file from Prettier; regenerated | 2026-11-19 |
| R-004 | Playwright web server timed out (Vite preview bound to IPv6 localhost) | `vite preview --host 127.0.0.1` | 2026-11-19 |
