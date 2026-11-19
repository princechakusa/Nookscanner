# Nookscanner: Deployment

Version 1.0 (2026-11-19). **Nothing has been deployed yet.** No command below that changes a hosted service is run without the user's authorization.

## 1. Hosted Supabase project

| Item | Value |
|---|---|
| Project name | `nookscanner` (created by the user) |
| Project ref | `nfcnckwjrwpofkrzribd` |
| URL | `https://nfcnckwjrwpofkrzribd.supabase.co` |
| Public key | publishable key in `.env.example` / `.env.local` (public by design) |
| Secret keys / DB password | **never** in the repo or chat; only in secret managers |
| Role | Used as **staging** until a separate production project exists |

### First-time link and migration (user runs; interactive)
From the repository root (`C:\Users\Dev Prince\Projects\nooktour`):
1. `npx supabase@3.2.0 login` (opens a browser).
2. Do **not** run `supabase init` again: `supabase/config.toml` and migrations already exist. If you do run it, answer **no** to overwriting.
3. `npx supabase@3.2.0 link --project-ref nfcnckwjrwpofkrzribd` (asks for the database password; type it in the terminal, never in chat).
4. Preview: `npx supabase@3.2.0 db push --dry-run`.
5. After approval: `npx supabase@3.2.0 db push` (applies `20261119000100_foundation.sql`).
6. Verify in Studio: tables in `public` show RLS enabled; then run `npx supabase@3.2.0 db lint`.

Auth settings to mirror in the hosted dashboard (Authentication > Settings): email confirmations on, minimum password length 10 with letters+digits, refresh token rotation on, site URL and redirect URLs for the dashboard host, custom SMTP before real users.

## 2. Frontends (Phase 3/13)
- Vercel project `nookscanner-dashboard` (root `apps/dashboard`, build `npm run build -w @nookscanner/dashboard`) and `nookscanner-guest` (root `apps/guest`, output `apps/guest/dist`, SPA rewrite `/a/* -> /index.html`).
- Environment variables per environment from `.env.example` (public ones only in Vercel).

## 3. Edge Functions (Phase 2+)
`npx supabase functions deploy <name>`; secrets via `npx supabase secrets set NAME=value` (run by the user or CI with a scoped access token).

## 4. Reconstruction worker (Phase 6)
`modal deploy services/reconstruction/modal_app.py --env <env>`; secrets in Modal (`nookscanner-<env>` secret with HMAC secret and Supabase function URL).

## 5. Release procedure (production, Phase 13)
1. CI green on `main`. 2. Migrations dry-run against production. 3. Backup confirmed (latest daily backup timestamp recorded). 4. `db push`. 5. Deploy functions. 6. Deploy worker. 7. Promote Vercel deployments. 8. Smoke tests (guest QR on iOS + Android, dashboard login). 9. Record in CHANGELOG.

Rollback: Vercel instant rollback; database changes are forward-only (write a reverting migration); worker redeploy previous image tag.
