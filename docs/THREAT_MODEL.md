# Nookscanner: Threat Model

Version 1.0 (2026-11-19). Method: STRIDE per asset/boundary. Severity: Critical / High / Medium / Low. Review at the end of every phase and before production (Phase 11).

## 1. Assets

| Asset | Sensitivity |
|---|---|
| Raw interior video footage | High (private homes, possibly personal items) |
| Reconstructed scenes (draft) | High |
| Published scenes | Medium (intentionally visible to QR holders) |
| Organization data (properties, addresses, members) | High |
| Auth credentials / sessions | Critical |
| Service-role key, HMAC secrets, Modal tokens | Critical |
| Guest analytics | Low-Medium (no PII by design) |
| Audit logs | High (integrity) |

## 2. Trust boundaries

1. Browser/app <-> Supabase APIs (user JWT).
2. Guest browser <-> Edge Functions (anonymous, token).
3. Edge Functions <-> Worker (HMAC both ways).
4. Worker <-> Storage (signed URLs).
5. Platform admin <-> tenant data (support grants).

## 3. Threats and mitigations

| ID | STRIDE | Threat | Sev. | Mitigation | Status |
|---|---|---|---|---|---|
| T01 | I | Tenant A reads tenant B's apartments via REST filter tampering | Critical | RLS on every table using membership helpers; isolation tests | Mitigated in foundation (tests pass, see PROJECT_MASTER) |
| T02 | E | Member escalates own role (e.g. editor -> owner) via direct update | Critical | `member.manage` required; trigger blocks non-owners touching owner role; tests | Mitigated in foundation |
| T03 | T | Child row references another tenant's parent (e.g. room in other org's apartment) | High | `enforce_parent_org` triggers; tests | Mitigated in foundation |
| T04 | D | Last owner removed, organization orphaned | Medium | Last-owner trigger; test | Mitigated in foundation |
| T05 | E | User sets `is_platform_admin` on own profile | Critical | Column update revoked + trigger; test | Mitigated in foundation |
| T06 | I | Service-role key shipped in a client bundle | Critical | Env schema rejects secret keys in public prefixes; CI bundle grep (Phase 1 CI) | Partially (schema + test); CI grep planned |
| T07 | S | Guest enumerates apartments by guessing QR tokens | High | 128-bit tokens; uniform 404; rate limiting | Designed (Phase 9) |
| T08 | I | Revoked/unpublished apartment still visible | Medium | Edge Function checks status every request; CDN max-age 60 s | Designed |
| T09 | T | Forged worker callback marks job succeeded with attacker assets | High | HMAC + timestamp + idempotency; outputs only accepted at pre-signed paths | Designed (Phase 6); signature helper implemented and tested in worker |
| T10 | I | Leaked signed URL to raw footage | High | Short expiry; private bucket; paths not guessable; no logging of URLs | Partially: private bucket + path-bound storage RLS implemented and tested on the real stack (Stage 2.3); signed-URL expiry in Phase 5 |
| T11 | E | Malicious video exploits ffmpeg in worker | High | Isolated container, no secrets beyond HMAC, egress allowlist, resource limits, pinned patched ffmpeg | Designed |
| T12 | D | Upload abuse (huge files, storage exhaustion) | Medium | Registration limits, bucket size limits, per-org quotas, rate limits | Partially: uploads only to registered paths, size/MIME checks in DB and bucket (Stage 2.2/2.3); quotas and rate limits Phase 5 |
| T13 | T | Stored XSS through instruction Markdown | High | Sanitized rendering allowlist, CSP | Designed (Phase 8) |
| T14 | R | Manager denies publishing incorrect content | Low | Audit logs for publish/edit | Partially (audit trigger exists) |
| T15 | I | Personal information visible in published scan | High | Capture guidance, pre-publish confirmation, crop/blur tool (Later) | Designed |
| T16 | S | Account takeover via credential stuffing | High | Supabase rate limits, CAPTCHA, leaked password protection, MFA for admins | Partially: password policy + Auth rate limits + server-verified sessions (Stage 2.4); CAPTCHA/leaked-password on hosted (KI-019); MFA Phase 11 |
| T17 | D | Guest-events flooding analytics | Medium | Per-session rate limit, batch size limits, schema validation | Designed |
| T18 | I | Platform admin browsing tenant data without consent | Medium | Support grants with expiry + audit | Designed (Phase 10) |
| T19 | T | Audit log tampering | High | No client write policies; update/delete revoked | Mitigated in foundation |
| T20 | E | Security-definer function hijacked via search_path | High | `set search_path = ''` and fully qualified names in all definer functions | Mitigated in foundation |
| T21 | I | Supply-chain compromise of npm/pip dependency | High | Lockfiles, audit, Dependabot, minimal deps, pinned versions | Partially (lockfile) |
| T22 | S | Invitation token stolen from the database, logs or a forwarded email and used by someone else | High | Only SHA-256 stored; token never in audit logs; acceptance requires the signed-in email to match; 7-day expiry; single use; revocable; uniform NOT_FOUND | Mitigated (Stage 2.2, tested on PGlite + real stack) |
| T23 | T | Member uploads arbitrary files or overwrites another member's footage in the org prefix | High | Storage insert needs a pending registration by the same user; MIME allowlist; no member update/delete | Mitigated (Stage 2.3, Storage API tests) |
| T24 | I | Capture metadata leaks a home's location | Medium | `device_info` rejects location keys; capture app must not record GPS (Phase 5) | Partially (DB constraint) |
| T25 | I | Org admin adds an arbitrary user to their org without consent to read the victim's profile | Medium | Memberships only via `create_organization` / email-bound `accept_invitation` | Mitigated (Stage 2.6, F1) |
| T26 | T | Client changes immutable columns (`created_by`, `public_id`, `organization_id`) | Low | Column-restricted UPDATE grants + triggers | Mitigated (Stage 2.6, F2/F3) |
| T27 | T | Checkpoint links to another session's or tenant's upload | Medium | Trigger check | Mitigated (Stage 2.6, F4) |
| T28 | D | Mass upload registrations exhaust storage | Medium | 20 registrations per session; per-org quotas Phase 5 | Partially (Stage 2.6, F5) |
| T29 | S | Open redirect after sign-in used for phishing | Medium | `safeNextPath` allows same-origin relative paths only; E2E test | Mitigated (Stage 2.4) |
| T30 | I | Account enumeration through sign-up, sign-in or reset responses | Medium | Uniform responses; Supabase fake-success sign-up | Mitigated (Stage 2.4, E2E) |
| T31 | T | Mail scanners consume one-time confirmation/reset links | Low | Token used only on POST from `/auth/confirm` | Mitigated (Stage 2.4) |

## 4. Residual risks accepted for the pilot

- Published scenes are accessible to anyone who has the QR URL (by design; QR rotation available).
- DB suites run on the real local stack, but not yet against the hosted project (KI-002, KI-003).
