# Nookscanner: Changelog

All notable changes. Newest first. Each stage entry lists implemented items, tests and results (real outputs only).

## 2026-11-20: Phase 3 stages 3.1-3.3 (tokens, components, dashboard shell)

### Added
- `packages/ui`: Button, TextField, SelectField, Modal (native dialog), toasts, StatusPill, DataTable (stacks below md), Empty/Error/Skeleton/Spinner; token-only CSS; 6 tests with axe.
- Self-hosted Inter (variable) and IBM Plex Sans Arabic in both apps; font tokens updated.
- Dashboard shell: collapsible sidebar, org switcher (validated httpOnly preference cookie), breadcrumbs, mobile drawer, skip link; section pages for Apartments, Properties, Scans, Appliances, Analytics, Settings.
- `tests/e2e-stack/shell.spec.ts` with `@axe-core/playwright` (WCAG 2.2 AA tags); shared `tests/e2e-stack/helpers.ts`.
- DESIGN_SYSTEM section 9: screen designs from the user's mockups and for the four screens without mockups; ADR-015.

### Test results (local)
- Unit: shared 49, design-tokens 19, ui 6, dashboard 23, guest 7, database 68 (+5 stack-only). Stack E2E 16/16 (desktop Chromium + iPhone 15 WebKit, axe clean). Guest E2E 6/6. Lint, format, typecheck, build, secret scan (19 files): pass.

### Fixed
R-014 (drawer accessibility), R-015.

## 2026-11-20: Hosted rollout of the database (user-approved)

- `db push --remote`: 5 migrations applied to `nfcnckwjrwpofkrzribd`. New migration `20261120000400_private_helpers.sql` after the hosted advisor flagged API-callable helpers (R-013).
- `scripts/hosted-smoke.mjs` (`npm run test:hosted:smoke`): 30/30 anonymous read-only checks on hosted. Hosted read-only catalog checks: 15 tables with RLS, 0 anon grants, 0 unpinned definer functions. DB suites: PGlite 68 (+5 skipped), local stack 73/73.
- Commits pushed to `origin/main` incl. `docs/design` mockups.

## 2026-11-20: Stage 2.6 backend security review (Phase 2 complete locally)

### Changed
- Migration `20261120000300_security_hardening.sql`: memberships only through RPCs, column-restricted UPDATE grants, checkpoint-upload ownership trigger, 20 uploads per scan session, 11 FK indexes.
- `supabase/tests/security-review.test.ts` (7 tests); membership fixtures seeded as the platform.

### Test results (local)
- DB on PGlite: 66 passed (+5 stack-only skipped). DB on the real local stack: 71 passed.
- Supabase security advisors: 0 findings; `db lint`: no errors. `npm run test:e2e:stack`: 12 passed. lint/format: pass.

## 2026-11-20: Stage 2.4 dashboard auth flows

### Added
- Dashboard: sign-up, email confirmation (`/auth/confirm`, token used on POST only), sign-in, sign-out, forgot/reset password, signed-in landing page `/app`; Next.js 16 `src/proxy.ts` (session refresh, route guard, per-request nonce CSP).
- `packages/shared/src/auth.ts`: password policy, input schemas, open-redirect guard `safeNextPath`, non-enumerating `mapAuthError` (25 unit tests).
- Supabase email templates (`supabase/templates`) and local auth rate limit for E2E.
- `tests/e2e-stack/auth.spec.ts` (Mailpit-driven) and `npm run test:e2e:stack`; CI stack job runs it.

### Test results (local)
- `npm run test:e2e:stack`: 12 passed (desktop Chromium + iPhone 15 WebKit).
- `npm test`: shared 49, design-tokens 19, dashboard 19, guest 7, database 59 (+5 stack-only skipped): all pass. `npm run test:db:stack`: 64 passed. `npm run test:e2e` (guest): 6 passed.
- lint, format, typecheck, build (all dashboard routes dynamic + proxy), secret scan (17 files): pass.

### Fixed during the stage
R-010 (redirect loop on revoked sessions), R-011; KI-008 closed.

## 2026-11-20: Phase 1 closed; Phase 2 stages 2.2, 2.3, 2.5 (local real stack); 3D quality bar adopted

### Added
- Migration `20261120000100_invitations_qr_capture.sql`: organization_invitations, qr_codes, scan_sessions, scan_checkpoints, media_uploads; RPCs `create_invitation`, `accept_invitation`, `revoke_invitation`, `create_qr_code`, `revoke_qr_code`, `register_media_upload`; server-side token generation; secrets stripped from the audit log.
- Migration `20261120000200_storage.sql`: buckets raw-footage, scene-masters, scene-drafts, instruction-media, published-assets with path-bound storage RLS.
- Dual-target DB test harness (ADR-013): `npm run test:db` (PGlite) and `npm run test:db:stack` (real local Supabase); new suites `capture.test.ts` (24 tests) and `storage-api.test.ts` (5 tests through Auth + PostgREST + Storage API); CI job `database-stack`.
- `docs/3D_QUALITY_BAR.md` adopted as binding (ADR-014); roadmap Phases 5, 6, 7, 12 rewritten with quality gates, device tiers and the other-device footage stage 6.4.

### Changed
- `supabase/config.toml` validated with Supabase CLI 3.2.0 (`[local_smtp]`, `auth.email.enabled`); local ports moved to 565xx.

### Test results (local, Windows 11, Node 24.15.0, Docker Desktop, Supabase CLI 3.2.0, Postgres image 17.12.0.000)
- `npm run lint`, `npm run format:check`, `npm run typecheck`: pass.
- `npm test`: all workspaces pass; database on PGlite 59 passed + 5 stack-only skipped.
- `npm run test:db:stack`: 64 passed, 0 failed (run twice to confirm repeatability).
- `supabase db lint --level warning` (local): no schema errors.
- `npm run build`: pass (guest initial JS 70.18 kB gzip). `npm run check:secrets`: no privileged keys. `npm run test:worker`: 14 passed.

### Fixed during the stage
R-005..R-009 in `KNOWN_ISSUES.md`.

## 2026-11-19: Phase 0 complete; Phase 1 foundation (stages 1.1-1.5)

### Added
- Documentation set: `PROJECT_MASTER.md` and all 17 supporting docs in `docs/` (product requirements, architecture, tech stack with sourced research, ADR-000..012, database schema, API spec, security, threat model, design system, 3D technology, infrastructure, testing strategy, roadmap, deployment, operations, known issues).
- Brand recorded: Nookscanner (main brand) and Nookscanner (capture app); no domains purchased, no trademark clearance.
- Monorepo: npm workspaces, TypeScript 6.0 strict, ESLint 10 flat config, Prettier, EditorConfig, `.gitattributes`, `.env.example` (public values only), git-ignored `.env.local` files for dashboard/guest with the hosted project's public URL and publishable key.
- `packages/shared`: permission matrix, upload validation, public-env validation (rejects privileged keys), error codes, HMAC signing (Web Crypto), worker job contract.
- `packages/design-tokens`: tokens, generated CSS variables, WCAG contrast checker.
- `apps/dashboard` (Next.js 16.4.6): foundation page, security headers, Supabase SSR/browser client factories (not yet used).
- `apps/guest` (Vite 8 + React 19): QR token routing, EN/AR with RTL, scan-prompt and loading states.
- `apps/nookscanner`: Expo skeleton (not installed).
- `services/reconstruction`: Python job contract, HMAC signing, provider interface (self-hosted gsplat, Varjo Teleport stubs).
- `supabase/`: `config.toml` (project_id `nookscanner`), migration `20261119000100_foundation.sql` (permissions, tenancy tables, helpers, triggers, audit log, RLS, `create_organization`), seed, PGlite test harness + Supabase shim.
- Tests: Vitest suites, PGlite RLS/tenant-isolation suite, Python unittest suite, Playwright guest smoke tests; `scripts/check-client-secrets.mjs`; GitHub Actions workflow.

### Test results (local, Windows 11, Node 24.15.0, Python 3.12.10)
- `npm run lint`: pass. `npm run format:check`: pass. `npm run typecheck`: pass (5 workspaces).
- `npm test`: 89 tests passed (shared 24, design-tokens 19, dashboard 4, guest 7, database 35); 0 failed.
- `npm run test:worker`: 14 passed.
- `npm run build`: dashboard and guest build; guest initial JS 70.17 kB gzip.
- `npm run check:secrets`: 14 files scanned, no privileged keys.
- `npm run test:e2e`: 6 passed (Pixel 7 Chromium + iPhone 15 WebKit emulation).
- `npm audit`: 0 vulnerabilities at install time.

### Fixed during the stage
See `KNOWN_ISSUES.md` resolved R-001..R-004.
