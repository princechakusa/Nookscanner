# Nookscanner

Photorealistic 3D apartment guest assistant. Property managers scan an apartment with **Nookscanner**
(or upload a walkthrough video); guests scan a QR code to explore the apartment in 3D and learn how
every appliance works.

Start with [`PROJECT_MASTER.md`](PROJECT_MASTER.md) (status, decisions, links to all docs).

## Requirements
Node 24+, npm 11+, Python 3.12+. Optional: Docker Desktop (local Supabase stack).

## Quick start
```bash
npm install
npm run generate -w @nookscanner/design-tokens   # regenerate tokens.css after token changes
npm test                 # unit + database (PGlite) tests
npm run test:worker      # reconstruction worker tests
npm run build            # dashboard + guest
npx playwright install chromium webkit && npm run test:e2e
npm run dev -w @nookscanner/dashboard   # http://localhost:3000
npm run dev -w @nookscanner/guest       # http://localhost:5173
```
Environment: copy `.env.example` values into `apps/dashboard/.env.local` and `apps/guest/.env.local`
(git-ignored). Only public values belong there. Never commit or share secret keys.

## Layout
`apps/dashboard` manager web app, `apps/guest` guest web app, `apps/nookscanner` capture app (skeleton),
`packages/shared`, `packages/design-tokens`, `services/reconstruction` (Python GPU worker),
`supabase/` (migrations, config, DB tests), `tests/e2e`, `docs/`.
