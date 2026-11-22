# Nookscanner: Deployment

Version 1.1 (2026-11-20). **Database migrations are applied to the hosted project (user-approved, 2026-11-20); nothing else is deployed.** No command below that changes a hosted service is run without the user's authorization.

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
5. After approval: `npx supabase@3.2.0 db push` (applies `20261119000100_foundation.sql`, `20261120000100_invitations_qr_capture.sql`, `20261120000200_storage.sql`; all three verified on the local stack 2026-11-20).
   Status 2026-11-20: all 5 migrations applied with user approval (`db push --remote`, CLI 3.2.0; dry run first). Note: CLI 3.x targets the **local** stack unless `--remote` is passed. Verification: `supabase db lint --remote` no errors; `supabase db advisors --remote`: 7 WARN for the intended RPCs only (accepted), 0 other security findings; read-only catalog checks via `supabase db query --remote --read-only` (15 tables, all RLS, 0 anon grants, 0 unpinned definer functions, 5 buckets, 1 public, 6 storage policies); `npm run test:hosted:smoke` 30/30.
6. Verify in Studio: tables in `public` show RLS enabled; then run `npx supabase@3.2.0 db lint`.

Email templates: copy `supabase/templates/confirmation.html` and `recovery.html` into Authentication > Email Templates (subjects as in `config.toml`), and set the site URL to the dashboard host (links are `{{ .SiteURL }}/auth/confirm?token_hash=...`). Auth settings to mirror in the hosted dashboard (Authentication > Settings): email confirmations on, minimum password length 10 with letters+digits, refresh token rotation on, site URL and redirect URLs for the dashboard host, custom SMTP before real users.

## 1b. Local Supabase stack
`npx supabase@3.2.0 start` from the repo root. Ports are in the 565xx range (API `http://127.0.0.1:56521`, DB 56522, Studio 56523, Mailpit 56524) so the stack runs next to other projects' stacks. `npx supabase@3.2.0 db reset` re-applies migrations and seed (local only). DB tests on the stack: `npm run test:db:stack`.

## 2. Frontends (Phase 3/13)
- Vercel project `nookscanner-dashboard` (root `apps/dashboard`, build `npm run build -w @nookscanner/dashboard`) and `nookscanner-guest` (root `apps/guest`, output `apps/guest/dist`, SPA rewrite `/a/* -> /index.html`).
- Environment variables per environment from `.env.example` (public ones only in Vercel).

## 3. Edge Functions (Phase 2+)
`npx supabase functions deploy <name>`; secrets via `npx supabase secrets set NAME=value` (run by the user or CI with a scoped access token).

Reconstruction (Stages 6.2 and 6.8; full guide incl. Modal and the own-PC worker: [`GPU_WORKER.md`](GPU_WORKER.md)), run by the user from the repo root:
1. Create two random secrets of at least 32 characters (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` twice). Never paste them into chat or commit them.
2. `npx supabase@3.2.0 secrets set WORKER_HMAC_SECRET=<secret1> DISPATCH_SECRET=<secret2> WORKER_URL=<https Modal endpoint>` (the same `WORKER_HMAC_SECRET` goes into the Modal secret `nookscanner-<env>`).
3. `npx supabase@3.2.0 functions deploy job-callback --no-verify-jwt`, `npx supabase@3.2.0 functions deploy dispatch-processing --no-verify-jwt` and `npx supabase@3.2.0 functions deploy claim-job --no-verify-jwt` (pull mode for an own GPU PC, ADR-018) (both authenticate with HMAC / bearer secret; `config.toml` also sets `verify_jwt = false`).
4. Schedule the dispatcher every minute (Supabase Cron, Integrations > Cron): HTTP POST to `https://nfcnckwjrwpofkrzribd.supabase.co/functions/v1/dispatch-processing` with header `Authorization: Bearer <secret2>`.
Hosted status 2026-11-22: steps 1-3 done (five functions incl. `guest-experience` and `guest-instruction`, all `--no-verify-jwt`; `GUEST_ORIGIN` unset until the guest app has a domain). Step 4 as SQL (bearer read from Vault, never stored in the job): `select cron.schedule('nookscanner-dispatch', '* * * * *', $$select net.http_post(url := 'https://nfcnckwjrwpofkrzribd.supabase.co/functions/v1/dispatch-processing', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nookscanner_dispatch_secret'), 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 10000)$$);` (created 2026-11-22 with the user's go-ahead: job id 1; first run returned 200 with an empty queue).
Local test: `npx supabase@3.2.0 functions serve --env-file <file with the three variables>`; unsigned callbacks return 401, the dispatcher with the right bearer returns `{"requeued":0,"dispatched":[],"failed":[]}` on an empty queue (verified 2026-11-20).

## 4. Reconstruction worker (Phase 6)
`modal deploy services/reconstruction/modal_app.py --env <env>`; secrets in Modal (`nookscanner-<env>` secret with HMAC secret and Supabase function URL).

## 5. Release procedure (production, Phase 13)
1. CI green on `main`. 2. Migrations dry-run against production. 3. Backup confirmed (latest daily backup timestamp recorded). 4. `db push`. 5. Deploy functions. 6. Deploy worker. 7. Promote Vercel deployments. 8. Smoke tests (guest QR on iOS + Android, dashboard login). 9. Record in CHANGELOG.

Rollback: Vercel instant rollback; database changes are forward-only (write a reverting migration); worker redeploy previous image tag.
