# Nookscanner: Known Issues and Open Items

Updated 2026-11-20. Severity: Critical / High / Medium / Low. Close an item only with evidence.

| ID | Severity | Area | Issue | Mitigation / next step | Owner | Status |
|---|---|---|---|---|---|---|
| KI-002 | Low | Testing | Full authenticated RLS suites run on PGlite and the real local stack (73/73), but on the hosted project only read-only catalog checks and anonymous API probes run (30/30): creating test users there needs the service-role key or working confirmation emails | After KI-017 (site URL, templates, SMTP), run the dashboard auth E2E against hosted staging with a dedicated test inbox; never use the service-role key from this machine | User + dev | Open |
| KI-004 | Medium | Legal | COLMAP third-party dependency licences (Ceres, PoseLib, SiftGPU, VLFeat) not yet reviewed | Review when building the worker container (Phase 6.1) | Dev | Open |
| KI-005 | Medium | Vendor | Varjo Teleport pricing inconsistent across sources; not verified | Confirm on sign-up before the bake-off; user approval of spend | User | Open |
| KI-006 | Low | Brand | No logo; wordmark placeholder only | Professional logo design (user decision) | User | Open |
| KI-007 | High (before launch) | Legal | Brand "Nookscanner" (nookscanner.com) and app name "Nookscanner" (nookscanner.com): domains NOT purchased, trademarks NOT searched/cleared, no accounts | Official trademark search (USPTO/EUIPO/WIPO, classes 9/42/43) via counsel; buy domains if desired | User | Open |
| KI-009 | Low | Tooling | TypeScript pinned to 6.0.x because typescript-eslint 8.73 supports `<6.1.0`; TypeScript 7 not adopted | Re-evaluate when typescript-eslint supports TS 7 | Dev | Open |
| KI-011 | Medium | Infra | Supabase Free plan caps uploads at 50 MB and has no backups; real walkthrough videos need Pro | Upgrade the `nookscanner` project to Pro before Phase 5 uploads (user decision, cost) | User | Open |
| KI-012 | Low | Mobile | Nookscanner app is a skeleton; dependencies not installed or built | Phase 5 | Dev | Open |
| KI-013 | Low | Vendor | Vercel Hobby commercial-use terms not verified this session | Verify or use Pro before commercial launch | User | Open |
| KI-014 | Medium | 3D quality | No real footage from any device yet; quality-bar targets (3D_QUALITY_BAR.md) are uncalibrated, and the other-device test (roadmap 6.4) needs an Android and an older-iPhone walkthrough | User supplies pilot iPhone footage plus one Android and one older-iPhone video | User | Open |
| KI-015 | Low | Storage | Supabase Free caps any single upload at 50 MB; the `raw-footage` bucket deliberately inherits the project limit, so real walkthroughs cannot upload until Pro (see KI-011) | Upgrade to Pro, then set the project upload limit (the 10 GiB pilot cap is enforced in `media_uploads`) | User | Open |
| KI-016 | Low | Tooling | Local stack uses ports 56520-56583 (other projects' stacks occupy 543xx). Local `.env.local` files must point to `http://127.0.0.1:56521` when testing against the local stack | Documented in `.env.example` and DEPLOYMENT | Dev | Open (by design) |
| KI-017 | Medium | Auth | Hosted project still uses default email templates and site URL; our links need the templates in `supabase/templates` and site URL = the dashboard host | With the hosted migration: set site URL/redirects and paste both templates (or `supabase config push`), configure custom SMTP before real users | User + dev | Open |
| KI-018 | Low | Security | `@supabase/ssr` session cookies are readable by JavaScript (library default, needed by the browser client) | Strict nonce CSP (no inline scripts), no user HTML rendering; revisit httpOnly-only server sessions if the browser client is not needed | Dev | Accepted (mitigated) |
| KI-019 | Medium | Security | CAPTCHA and leaked-password protection not enabled (hosted settings; leaked-password protection is plan-dependent) | Enable on staging/production before real users (Phase 11 at the latest) | User + dev | Open |
| KI-020 | Low | Performance | Proxy calls the Auth server (`getUser`) on every dashboard request (~1 round trip) | Acceptable for the dashboard; revisit with JWT revocation checks if latency matters | Dev | Accepted |
| KI-021 | Low | Performance | Guest initial JS grew to 100.7 kB gzip (from 70 kB) because the payload schema brings zod; budget is 150 kB | Switch the guest to `zod/mini` if the 3D loader or Phase 9 pushes it near the budget | Dev | Open (within budget) |
| KI-022 | High (blocks 4.1) | Auth / E2E | In `tests/e2e-stack/org.spec.ts` the 2nd and 3rd people (stranger, invitee) sign up and confirm successfully (GoTrue `/verify` 200, the redirected `/app` renders signed in), but their next navigation is signed out: the browser never sends a session cookie (no `/user` call reaches GoTrue for them; Playwright's cookie list shows only `sb-127-auth-token-*-code-verifier` cookies, even for users whose session works). Reproduces with separate browser contexts too, and with a 2-user sign-out/sign-up spec (intermittently). auth.spec and shell.spec (one person each) pass. Ruled out: container clock skew, rate limits, refresh-token reuse, leftover PKCE cookies (sign-out now clears all `sb-*` cookies anyway). Started after a Docker Desktop restart on 2026-11-20 | Next session: inspect the Set-Cookie headers of the confirm server-action response (Playwright trace network tab), check `@supabase/ssr` cookie chunking/size and `secure`/`sameSite` options under `next start` on http://localhost, and compare with the passing auth.spec flow; then remove `test.fixme` | Dev | Open |

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
| KI-008 (closed) | Dashboard CSP used `'unsafe-inline'` for scripts | Per-request nonce CSP from `src/proxy.ts` with `'strict-dynamic'`; E2E asserts no `unsafe-inline` in `script-src` (styles keep it) | 2026-11-20 |
| R-010 | Redirect loop: revoked session with an unexpired JWT cookie passed the proxy's local check (`getClaims`) but failed the page's server check (`getUser`) | Proxy now uses `getUser` (found by the stack E2E on mobile WebKit) | 2026-11-20 |
| R-011 | E2E `getByRole('alert')` matched Next.js's route announcer too | Tests target the form error element | 2026-11-20 |
| R-012 | Phase 2 security review findings F1-F5 (membership without consent, mutable `created_by`/`public_id`, cross-session checkpoint uploads, unlimited upload registrations) | Migration `20261120000300_security_hardening.sql` + `security-review.test.ts` | 2026-11-20 |
| KI-003 (closed) | Migrations not applied to the hosted project | All 5 applied 2026-11-20 with user approval; `migration list --remote` matches local | 2026-11-20 |
| R-013 | Hosted advisor (newer than the local image) flagged 20 SECURITY DEFINER functions callable as REST RPCs, incl. internal helpers usable as oracles (`shares_org_with`, `storage_path_apartment`) | Migration `20261120000400_private_helpers.sql` moves 14 helpers to the non-exposed `private` schema; 7 intended RPCs remain (accepted); tests assert the exact API surface | 2026-11-20 |
| R-014 | Mobile dashboard drawer was only moved off-screen when closed, so its links stayed in the tab order and accessibility tree | Closed drawer gets `visibility: hidden`; E2E asserts the nav is hidden until opened | 2026-11-20 |
| R-015 | Dashboard build failed: `packages/ui` hooks imported into server components | `'use client'` on the component module | 2026-11-20 |
| R-016 | Guest search input pointed `aria-controls` at a results region that did not exist yet (axe aria-valid-attr-value) | Attribute set only while results are shown | 2026-11-20 |
| R-017 | Screenshot review: Demo badge truncated on 393 px; Arabic tanween rendered offset in WebKit | Badge outside the ellipsized name; copy reworded | 2026-11-20 |
| R-018 | Server components passed column render functions to a `'use client'` DataTable (Next.js error) | `packages/ui` split into server-safe `components.tsx` and hook-based `client.tsx` | 2026-11-20 |
| R-019 | Ambiguous "Role" labels on the settings page (invite form + every member row) | Member controls labelled per person ("Role for {name}") | 2026-11-20 |
