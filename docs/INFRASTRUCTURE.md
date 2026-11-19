# Nookscanner: Cloud Infrastructure

Version 1.0 (2026-11-19). Prices verified 2026-11-19 unless labelled ESTIMATE. **No accounts have been created; nothing has been purchased.** Required user actions are listed in section 6.

## 1. Services

| Function | Service | Plan for pilot | Notes |
|---|---|---|---|
| Database, Auth, RLS, Realtime, Queues | Supabase | **Pro** ($25/month base, VERIFIED) for staging-with-real-video and production; Free acceptable for early dev without video (50 MB upload cap, pauses after 1 week) | One project per environment |
| Object storage (raw, drafts, masters, published) | Supabase Storage | included 100 GB on Pro, then $0.0213/GB | Buckets in DATABASE_SCHEMA section 5 |
| CDN for published assets | Supabase Storage CDN (public bucket, content-hashed paths) | included egress 250 GB/month on Pro, then $0.09/GB | Switch to Cloudflare R2 (free egress, $0.015/GB-month) when guest egress approaches the allowance |
| Dashboard hosting | Vercel | Hobby for development; Pro ($20/developer seat/month) before commercial use | Next.js |
| Guest app hosting | Vercel (static) | same | Could move to Cloudflare Pages |
| GPU reconstruction | Modal | Starter ($0 base + compute, $30/month free credits) | Python worker, L40S/A100 |
| Benchmark reconstruction | Varjo Teleport Developer plan | Only during Phase 6 bake-off, with user approval | Pricing to confirm at sign-up |
| Background jobs | Supabase Queues (pgmq) + pg_cron + pg_net | included | |
| Email | Supabase Auth SMTP via transactional provider (Resend or Postmark, choose in Phase 2) | free tiers for pilot volume (to verify) | Custom SMTP required for production deliverability |
| Error monitoring | Sentry | Developer (free) tier for pilot (to verify) | Phase 10 |
| Uptime | Better Stack / UptimeRobot free tier (to verify) | | Phase 13 |
| Source control + CI | GitHub (private repo) + GitHub Actions | free tier | Repo not created yet |
| Mobile builds | Expo EAS (optional) + Apple Developer Program | Apple fee required for TestFlight (user action) | Phase 5 |

## 2. Environments and configuration

- Variables are listed in `/.env.example` (placeholders only). Real values live in: Vercel project env (dashboard/guest), Supabase function secrets, Modal secrets, GitHub Actions secrets.
- Naming: public client variables prefixed `NEXT_PUBLIC_` (dashboard) or `VITE_` (guest) may contain **only** the Supabase URL and the publishable/anon key. `packages/shared/src/env.ts` refuses to load a public env that contains a service-role or secret key.
- Each environment: separate Supabase project, separate Modal app (`nookscanner-reconstruction-<env>`), separate HMAC secret, separate buckets.

## 3. Network and data flow

- All traffic HTTPS. Worker egress restricted to Supabase project host(s).
- Region: choose a Supabase region close to the pilot apartments (user to confirm pilot country; Middle East pilots typically use an EU or Middle East region; check Supabase region list at project creation).

## 4. Backups and recovery

- Supabase Pro daily backups, 7-day retention (VERIFIED). Consider PITR add-on for production (price to verify at that time).
- Storage: published assets reproducible from PLY masters; PLY masters and raw footage are not covered by DB backups. **ESTIMATE**: replicate `scene-masters` to R2 weekly in production.
- Recovery objectives (production targets): RPO 24 h (DB), RTO 4 h.

## 5. Cost estimates

All **ESTIMATES** unless marked verified; they assume pilot scale (1-13 apartments).

| Item | Basis | Monthly |
|---|---|---|
| Supabase Pro (1 production project) | VERIFIED $25 base | $25 |
| Supabase staging project | If on Pro: another project compute charge applies (verify current compute pricing); can stay Free if no large uploads | $0-$25+ (ESTIMATE) |
| Storage | 13 apartments x (~5 GB raw for 90 days + ~1 GB PLY + ~0.2 GB published) ~ 80 GB | within 100 GB included |
| Guest egress | 13 apartments x 300 guest sessions x 40 MB ~ 156 GB | within 250 GB included |
| Modal GPU | 13 reconstructions x $2-$6 + re-runs (x2) | $50-$160 one-off during pilot; ~$0-$30 steady (free credits $30/month) |
| Vercel | Hobby $0 during development; Pro $20/seat at launch | $0-$20 |
| Sentry / uptime / email | free tiers (to verify) | $0 |
| Apple Developer Program | annual fee (user to verify current price) | - |
| **Pilot total (ESTIMATE)** | | **~$25-$70/month + ~$50-$160 one-off reconstruction** |

Domain nookscanner.com: not purchased; registrar price to be checked by the user.

## 6. User actions required (exact steps)

1. **Supabase:** DONE by the user: project `nookscanner`, ref `nfcnckwjrwpofkrzribd`, URL `https://nfcnckwjrwpofkrzribd.supabase.co`, publishable key wired into `.env.local`. Remaining: `supabase login`, `supabase link`, authorize `db push` (exact commands in [`DEPLOYMENT.md`](DEPLOYMENT.md) section 1); upgrade to Pro before uploading real video (> 50 MB); create a separate production project later. Secret keys and the DB password stay in secret managers only, never in chat or the repo.
2. **GitHub:** DONE by the user: https://github.com/princechakusa/Nookscanner (remote `origin` added locally). Remaining: approve the first push; check the repo is private; enable Dependabot.
3. **Vercel:** create a team/project linked to the GitHub repo for `apps/dashboard` and `apps/guest`.
4. **Modal:** create an account, create a token (`modal token new`) on the development machine; set a monthly spend limit.
5. **Apple Developer Program:** enroll (needed to install the Nookscanner app on the iPhone 16 Pro Max via TestFlight/dev builds).
6. **Docker Desktop:** start it on the development machine so `npx supabase start` can run the full local stack (it is installed, version 29.7.2, but the daemon was not running).
7. **Optional (Phase 6 bake-off):** Varjo Teleport developer access request; approve spend.
8. **Brand/legal:** purchase nookscanner.com if desired; trademark search/filing via counsel; privacy policy and terms.
