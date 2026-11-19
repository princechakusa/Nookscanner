# Nookscanner: Security Architecture

Version 1.0 (2026-11-19). Threats and mitigations are analysed in [`THREAT_MODEL.md`](THREAT_MODEL.md); test plan in [`TESTING_STRATEGY.md`](TESTING_STRATEGY.md) section 5. Security applies to **every stage** (stage gate in [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md)).

## 1. Security boundaries

1. **Database (RLS)** is the primary authorization boundary. Every public table has RLS enabled; policies use security-definer helpers with `search_path = ''`.
2. **Edge Functions** are the only path for anonymous guests and for the worker; they run with the service role server-side.
3. **Worker** is isolated: it receives signed URLs and an HMAC secret, never the service-role key (it calls back through `job-callback`).
4. **Clients** (dashboard, guest, capture) are untrusted. They hold only the public anon key and a user session.

## 2. Authentication

| Requirement | Implementation | Phase |
|---|---|---|
| Registration | Supabase Auth email/password; password min 10 chars with lower+upper+digit (config.toml, mirrored in `packages/shared` auth schemas, enforced again by Auth); no account enumeration; leaked-password protection on the hosted project (plan-dependent, KI-019) | 2 (implemented; hosted settings pending) |
| Email verification | Required (`enable_confirmations = true`); confirmation link handled like recovery (token hash + POST); single use | 2 (implemented) |
| Login / logout | Supabase Auth via Next.js server actions (built-in Origin check against CSRF); `@supabase/ssr` session cookies (SameSite=Lax, Secure in production; **not httpOnly** by library default, so XSS is mitigated by the nonce CSP, KI-018); logout revokes the refresh token; the proxy verifies every request with the Auth server (`getUser`) so revoked sessions are rejected | 2 (implemented) |
| Password reset / recovery | Recovery email with a token-hash link to `/auth/confirm` (works on any device); the token is used only on a POST (button), so mail scanners cannot consume it; same response whether or not the account exists; reset link expiry 1 h | 2 (implemented) |
| Sessions | JWT expiry 1 h, refresh token rotation + reuse detection (Supabase settings) | 2 |
| MFA | TOTP optional for members, required for owners/admins before production | 11 |
| Bot protection | Supabase Auth rate limits (implemented); CAPTCHA on signup/reset in staging/production (KI-019) | 2/11 |
| Nookscanner app | session stored in iOS Keychain via expo-secure-store | 5 |

## 3. Authorization

- Roles and permissions: see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) section 4.4 (single source of truth `role_permissions`, mirrored in `packages/shared/src/permissions.ts` with a test asserting both match).
- Organization-level and property-level permissions via `has_org_permission` / `can_access_property`.
- Platform administrators: `profiles.is_platform_admin` (settable only by migration/service role); tenant data access only through audited, time-limited `support_access_grants`.
- Guests: no table access; only the published snapshot through `guest-experience` with an unguessable token.
- UI hides actions the user cannot perform, but **the database enforces**.

## 4. Database security

- RLS on all tables (automated test fails if any `public` table lacks RLS).
- `anon` has no privileges on public tables; `authenticated` gets only needed privileges; sensitive columns (e.g. `profiles.is_platform_admin`) protected with column privileges/triggers.
- Multi-row invariants inside RPC functions (transactions), e.g. `create_organization`, last-owner protection trigger.
- Cross-tenant references prevented by `enforce_parent_org` triggers.
- Migrations reviewed; no manual changes in hosted dashboards (drift check with `supabase db diff` in CI once available).
- Tenant isolation tests: two organizations, users with each role, assert no cross-read/write (implemented: `supabase/tests/rls.test.ts`).

## 5. API security

- AuthN on every non-guest endpoint; AuthZ in DB; Zod validation on all Edge Function inputs; body size limits; rate limiting (see API spec section 5); uniform 404 for guest lookups; error codes without internal detail; idempotency keys for job dispatch.
- Webhooks/callbacks: HMAC-SHA256 + timestamp window + constant-time comparison + replay protection (idempotency).

## 6. Application security

| Topic | Control |
|---|---|
| XSS | React escaping; no `dangerouslySetInnerHTML` except sanitized Markdown (rehype-sanitize allowlist); strict CSP (no inline scripts except nonce'd Next.js) |
| SQL injection | PostgREST/parameterized RPC only; no dynamic SQL in functions except `format()` with `%I/%L` |
| CSRF | Dashboard server actions: Next.js Origin check + SameSite=Lax cookies; Supabase REST uses Bearer tokens (not cookies) |
| SSRF | No server fetches user-supplied URLs; `manual_url` stored but never fetched server-side; worker downloads only from our signed storage URLs (host allowlist) |
| Headers | CSP, HSTS (2 years, preload after launch), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera only where needed), frame-ancestors none (dashboard) |
| Dependencies | `npm audit` + GitHub Dependabot; `pip-audit` for worker; lockfiles committed |
| Secrets | Never in repo (`.env*` gitignored, `.env.example` only placeholders); Vercel/Supabase/Modal secret stores; CI check that no `SERVICE_ROLE` value or `sb_secret_` appears in client bundles; `packages/shared` env schema rejects service keys in `NEXT_PUBLIC_*`/`VITE_*` vars |
| Environment separation | Separate Supabase projects/keys/buckets/HMAC secrets per environment |

## 7. File security

- Allowed upload types: `video/mp4`, `video/quicktime` (extensions .mp4, .mov); checked client-side (`packages/shared/src/uploads.ts`), at registration (DB constraint), and server-side by probing the container (ffprobe in worker) - content sniffing, not just extension.
- Size limits: pilot 10 GB/file, 30 min; enforced at registration and by Storage bucket `file_size_limit`.
- Private buckets; signed URLs (short expiry: 1 h for review media, 6 h for worker downloads).
- Upload authorization by storage RLS on path prefix `org/<org_id>/`.
- Safe processing: worker runs in an isolated container, no network egress except storage and callback hosts, ffmpeg/ffprobe with resource limits, no shell interpolation of filenames.
- Instruction media: images re-encoded (strips EXIF/GPS); videos transcoded.
- Retention (see Privacy).

## 8. Privacy

- Interior recordings are the organization's data; Nookscanner processes them only to provide the service.
- Raw footage deleted 90 days after scene approval (configurable per org; pg_cron job + storage delete), PLY master kept while the apartment exists.
- Managers are reminded during capture to remove personal items/documents and avoid filming people; guests are never filmed.
- Published scenes are visible to anyone with the QR link: managers must confirm before publishing (checkbox: "This scan shows no personal information").
- Guest data minimization: no accounts, no names, no precise location, no stored IP (only salted hash in rate-limit memory, not persisted), coarse device class only.
- Deletion: org deletion cascades DB rows; storage purge job deletes objects; audit logs retained 1 year then deleted.
- Audit: security-relevant changes recorded in `audit_logs`.
- Legal (user action): privacy policy, terms, DPA for customers, and GDPR/UAE PDPL/Saudi PDPL applicability review by counsel before launch (pilot region to be confirmed by user).

## 9. Current security status (2026-11-20)

Phase 2 additions: invitation/QR/upload RPCs with server-generated tokens (no tokens in audit logs), path-bound storage RLS, dashboard auth flows with per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no inline scripts in production), open-redirect guard, non-enumerating auth responses. All tested on the real local Supabase stack.

### Previous status (2026-11-19)

Implemented in foundation: RLS + helpers + tenancy tables + audit triggers + last-owner protection + parent-org enforcement + env validation that blocks service keys in public vars. Tested: see `PROJECT_MASTER.md` section 24. Not yet implemented: everything marked Phase 2+ above. No known unmitigated vulnerabilities in implemented code; open items in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).

## 10. Phase 2 backend security review (Stage 2.6, 2026-11-20)

Scope: all 15 public tables, their RLS policies and grants, 20+ SECURITY DEFINER functions and RPCs, storage policies, dashboard auth. Method: Supabase security advisors (`supabase db advisors`, local stack), `supabase db lint`, manual review of every policy against the permission matrix (DATABASE_SCHEMA 4.4) and the threat model, and regression tests for every finding on PGlite and the real local stack.

| ID | Finding | Severity | Fix | Evidence |
|---|---|---|---|---|
| F1 | Admins could insert any user id into their organization without consent, then read that user's profile through the org-mates policy | Medium | Direct membership inserts removed; memberships only via `create_organization` and `accept_invitation` (email-bound) | `security-review.test.ts` F1 |
| F2 | `organizations.created_by` updatable by org admins | Low | Column-restricted UPDATE grant | F2/F3 tests |
| F3 | `apartments.public_id` (used in asset paths) and `properties`/`apartments` `organization_id` updatable at privilege level (trigger blocked org moves, not `public_id`) | Low | Column-restricted UPDATE grants | F2/F3 tests, rls.test T01 |
| F4 | A checkpoint could reference an upload of another session or organization | Medium | Trigger `check_checkpoint_upload` | F4 tests (same org, other org) |
| F5 | Unlimited upload registrations per scan session (storage exhaustion) | Medium | Max 20 per session, session row locked during registration | F5 test |

Supabase security advisors: **0 findings** before and after. Performance advisors: 11 unindexed foreign keys fixed with indexes; remaining INFO items are "unused index" on an empty database.

**Result: no open Critical or High findings in implemented code.** Open items with mitigations: KI-017 (hosted email templates/site URL), KI-018 (JS-readable session cookies, mitigated by nonce CSP), KI-019 (CAPTCHA and leaked-password protection on hosted projects), KI-002/KI-003 (nothing verified on the hosted project yet). Reviewed again at the end of every phase and in Phase 11 (ASVS L2, authorized penetration test on staging).

