# Nookscanner: Changelog

All notable changes. Newest first. Each stage entry lists implemented items, tests and results (real outputs only).

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
