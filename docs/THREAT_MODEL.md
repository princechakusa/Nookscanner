# Nooktour: Threat Model

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
| T10 | I | Leaked signed URL to raw footage | High | Short expiry; private bucket; paths not guessable; no logging of URLs | Designed |
| T11 | E | Malicious video exploits ffmpeg in worker | High | Isolated container, no secrets beyond HMAC, egress allowlist, resource limits, pinned patched ffmpeg | Designed |
| T12 | D | Upload abuse (huge files, storage exhaustion) | Medium | Registration limits, bucket size limits, per-org quotas, rate limits | Designed (Phase 5) |
| T13 | T | Stored XSS through instruction Markdown | High | Sanitized rendering allowlist, CSP | Designed (Phase 8) |
| T14 | R | Manager denies publishing incorrect content | Low | Audit logs for publish/edit | Partially (audit trigger exists) |
| T15 | I | Personal information visible in published scan | High | Capture guidance, pre-publish confirmation, crop/blur tool (Later) | Designed |
| T16 | S | Account takeover via credential stuffing | High | Supabase rate limits, CAPTCHA, leaked password protection, MFA for admins | Designed (Phase 2/11) |
| T17 | D | Guest-events flooding analytics | Medium | Per-session rate limit, batch size limits, schema validation | Designed |
| T18 | I | Platform admin browsing tenant data without consent | Medium | Support grants with expiry + audit | Designed (Phase 10) |
| T19 | T | Audit log tampering | High | No client write policies; update/delete revoked | Mitigated in foundation |
| T20 | E | Security-definer function hijacked via search_path | High | `set search_path = ''` and fully qualified names in all definer functions | Mitigated in foundation |
| T21 | I | Supply-chain compromise of npm/pip dependency | High | Lockfiles, audit, Dependabot, minimal deps, pinned versions | Partially (lockfile) |

## 4. Residual risks accepted for the pilot

- Published scenes are accessible to anyone who has the QR URL (by design; QR rotation available).
- Shim-based RLS tests are not identical to hosted Supabase (KI-002) until run against a real stack.
