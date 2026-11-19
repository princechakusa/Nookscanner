# Nooktour: Operations

Version 1.0 (2026-11-19). Becomes active from the pilot (Phase 12). Nothing is in production yet.

## 1. Monitoring (Phase 10/13)
| Signal | Tool | Alert |
|---|---|---|
| Frontend errors | Sentry (dashboard, guest, Nookscanner) | new issue spike |
| Edge Function errors / latency | Supabase logs + Sentry | 5xx > 2% over 10 min |
| Processing queue | `processing_jobs` status counts (admin view) | job queued > 2 h or failed rate > 20% |
| GPU spend | Modal usage + spend limit | 80% of monthly budget |
| Uptime | external monitor on guest host and `guest-experience` | 2 consecutive failures |
| Database | Supabase reports (CPU, connections, disk) | disk > 80% |

## 2. Runbooks (to be expanded as features ship)
- **Reconstruction failed:** read `processing_jobs.error_code`; `POSE_ESTIMATION_FAILED` / `INSUFFICIENT_COVERAGE` -> ask manager for more footage at the reported rooms; transient -> retry via admin action.
- **Guest reports blank 3D:** check device in analytics (`webgl2`), confirm fallback list works, check CDN asset reachability.
- **Suspected data exposure:** revoke affected QR codes / unpublish, rotate keys, review `audit_logs`, follow incident steps below.
- **Key leak:** rotate in Supabase (API keys), update secret stores, redeploy, review logs for misuse.

## 3. Incident response
Detect -> contain (unpublish/revoke/rotate) -> assess (audit logs) -> notify affected organizations as required by law/contract -> fix -> post-mortem in `docs/` and CHANGELOG.

## 4. Data retention jobs (pg_cron, Phase 5/10)
Raw footage: delete 90 days after scene approval. Guest sessions/events: 13 months. Audit logs: 1 year. Deleted organizations: storage purge within 30 days.

## 5. Backups
Supabase Pro daily backups (7 days). Quarterly restore drill into a scratch project (first drill in Phase 11).
