# Nooktour: API Specification

Version 1.0 (2026-11-19). Status column: `I` implemented, `P` planned (phase).

## 1. API surfaces

| Surface | Used by | Auth | Transport |
|---|---|---|---|
| PostgREST (`/rest/v1`) on tables | dashboard, Nookscanner app | user JWT (`authenticated`), RLS | HTTPS JSON |
| Postgres RPC (`/rest/v1/rpc/<fn>`) | dashboard, Nookscanner app | user JWT, permission checks inside function | HTTPS JSON |
| Storage (`/storage/v1`, TUS `/upload/resumable`) | dashboard, Nookscanner app, worker | user JWT + storage RLS; worker uses signed URLs | HTTPS |
| Realtime | dashboard | user JWT, RLS on changes | WebSocket |
| Edge Functions (`/functions/v1/<name>`) | guest app, worker, dashboard | per function (below) | HTTPS JSON |
| Next.js route handlers / server actions | dashboard browser | session cookie (httpOnly), CSRF-protected (Origin check + same-site cookies) | HTTPS |
| Worker endpoint (Modal) | `dispatch-processing` only | HMAC-SHA256 signature + timestamp | HTTPS JSON |

General rules: all inputs validated with Zod (TS) or SQL constraints; request body limit 1 MB except uploads; errors returned as `{ "error": { "code": "STABLE_CODE", "message": "localized safe text" } }` with no stack traces; rate limits per section 5.

## 2. RPC functions

| Function | Permission | Purpose | Status |
|---|---|---|---|
| `create_organization(p_name text, p_slug text) returns uuid` | authenticated, verified email (checked in dashboard; DB check added with Auth in Phase 2) | Creates org + owner membership atomically | I |
| `has_org_permission(p_org uuid, p_permission text) returns boolean` | authenticated (own context) | Used by RLS and UI to show/hide actions | I |
| `can_access_property(p_property uuid, p_permission text) returns boolean` | authenticated | Property-scoped permission check | I |
| `invite_member(org, email, role, scope, property_ids)` | member.manage | Creates invitation, sends email via Edge Function | P4 |
| `accept_invitation(token)` | authenticated | Joins org | P4 |
| `create_scan_session(apartment_id, method, checkpoint_plan)` | scan.create | Starts capture | P5 |
| `register_upload(scan_session_id, filename, mime, size)` -> `{upload_id, object_path}` | scan.create | Pre-registers upload, enforces limits | P5 |
| `complete_upload(upload_id)` | scan.create | Marks uploaded after object verification | P5 |
| `submit_scan_session(scan_session_id)` | scan.create | Queues reconstruction | P6 |
| `cancel_processing_job(job_id)` | scan.create | Cancels | P6 |
| `review_scene(scene_version_id, decision, notes, checklist)` | scan.review | Approve/reject | P6 |
| `publish_apartment(apartment_id)` | apartment.publish | Validates and snapshots, sets published | P8 |
| `unpublish_apartment(apartment_id)` | apartment.publish | Revokes guest access | P8 |
| `rotate_qr_code(apartment_id)` / `revoke_qr_code(qr_id)` | qr.manage | QR lifecycle | P4/P9 |
| `verify_instruction_version(id)` | instruction.verify | Sets verified | P8 |
| `apartment_analytics(apartment_id, from, to)` | analytics.read | Aggregates | P10 |

## 3. Table access (PostgREST)

Direct CRUD on tenant tables is allowed where RLS fully expresses the rule (properties, apartments (except status changes to/from `published`), rooms, appliances, hotspots, instructions, instruction_versions drafts). Everything with multi-row invariants goes through RPC. Clients always filter by `organization_id`; RLS enforces it regardless.

## 4. Edge Functions

### `guest-experience` (P9) - public
- `GET /functions/v1/guest-experience?token=<qr_token>&locale=en|ar`
- Validation: token matches `^[A-Za-z0-9_-]{22,64}$`; locale enum.
- Logic: rate limit; resolve active QR; apartment published; return latest `published_versions.snapshot` filtered to locale with fallback to default locale.
- Response 200: `{ apartment: {name, propertyName, supportChannels}, scene: {format:"sog", url, lodUrls[], alignment, bounds}, rooms: [...], appliances: [{id, roomId, categoryKey, name, brand, model, hotspot:{position, normal, cameraPose}, instructionSummary}], searchIndex: [...], version, publishedAt }`
- Errors: 404 `EXPERIENCE_NOT_FOUND` (same response for unknown, revoked, or unpublished, to prevent enumeration), 429 `RATE_LIMITED`.
- Cache: `Cache-Control: public, max-age=60, stale-while-revalidate=300`, ETag = published version id.

### `guest-instruction` (P9) - public
`GET ?token&applianceId&locale` -> full verified instruction (steps, troubleshooting, media URLs). Same validation/404 rules.

### `guest-events` (P9) - public, write-only
`POST` batch of <= 50 events, body <= 32 KB, Zod-validated event schema, session id issued by `guest-experience` (signed, opaque). Search queries truncated to 100 chars. Returns 204. Rate limited.

### `dispatch-processing` (P6) - internal
Invoked by pg_cron/pg_net with a shared secret header; reads pgmq `reconstruction` queue; signs URLs; calls the worker with HMAC. Never callable by clients (verify secret, reject otherwise).

### `job-callback` (P6) - worker only
`POST` `{ jobId, attempt, event: "progress"|"succeeded"|"failed", stage, progress, metrics?, outputs?, errorCode? }`, headers `X-Nooktour-Timestamp`, `X-Nooktour-Signature: v1=<hex hmac_sha256(secret, timestamp + "." + body)>`; reject if |now - timestamp| > 300 s or signature mismatch (constant-time compare); idempotent per `(jobId, attempt, event, stage)`.

### `qr-render` (P9) - authenticated
`GET ?qrId&format=png|svg|pdf` -> print-ready QR (checks `qr.manage`).

## 5. Rate limits (initial)

| Endpoint | Limit |
|---|---|
| guest-experience | 60 req/min per IP hash, 600 req/min per token |
| guest-events | 30 req/min per session |
| Auth (Supabase) | Supabase built-in limits + CAPTCHA (hCaptcha/Turnstile) on signup/reset in production |
| RPC heavy (publish, submit) | 10/min per user |

## 6. Worker job contract (implemented as types in `packages/shared/src/processing.ts` and `services/reconstruction/nooktour_reconstruction/contract.py`)

```json
{
  "contractVersion": 1,
  "jobId": "uuid",
  "attempt": 1,
  "organizationId": "uuid",
  "apartmentId": "uuid",
  "provider": "self_hosted_gsplat",
  "inputs": [{ "uploadId": "uuid", "downloadUrl": "https://... (signed, expires)", "sha256": "hex", "sizeBytes": 123 }],
  "outputs": { "uploadUrls": { "ply": "...", "sog": "...", "spz": "...", "preview": "..." } },
  "callbackUrl": "https://<project>.supabase.co/functions/v1/job-callback",
  "parameters": { "maxGaussians": 3000000, "trainingSteps": 30000, "frameSampleFps": 2 }
}
```
