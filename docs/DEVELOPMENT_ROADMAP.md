# Nookscanner: Development Roadmap

Version 1.0 (2026-11-19). Workflow for every stage: **PROJECT -> PHASE -> STAGE -> IMPLEMENT -> TEST -> AUDIT -> APPROVE -> DOCUMENT -> NEXT STAGE** (MASTER_PROMPT Part 13).

**Universal stage gate** (applies to every stage in addition to its own criteria): lint + typecheck + all tests pass in CI; new tables have RLS + isolation tests; security implications reviewed and threat model updated; docs updated (PROJECT_MASTER status, this roadmap, CHANGELOG, KNOWN_ISSUES, affected specs); evidence recorded with real outputs.

Status legend: `DONE`, `IN PROGRESS`, `BLOCKED (user)`, `TODO`.

## Phase 0: Discovery and technical research - DONE (2026-11-19)
| Stage | Tasks | Acceptance criteria | Status |
|---|---|---|---|
| 0.1 Product understanding | PRD, journeys, modules, FR/NFR | PRODUCT_REQUIREMENTS.md complete, all 26 modules mapped | DONE |
| 0.2 Technology research | 3DGS options, capture, viewers, Supabase, frontend/mobile, cloud | 3D_TECHNOLOGY.md + TECH_STACK.md with sources and verification dates; no invented prices | DONE |
| 0.3 Recommendations | ADRs | DECISION_LOG ADR-000..012 | DONE |

## Phase 1: Architecture and foundation - IN PROGRESS
| Stage | Tasks | Acceptance criteria | Status |
|---|---|---|---|
| 1.1 Documentation set | PROJECT_MASTER + 17 docs | All files exist, cross-linked, consistent | DONE |
| 1.2 Repository + tooling | git init, npm workspaces, TS strict, ESLint, Prettier, EditorConfig, .gitignore, .env.example | `npm ci`, `npm run lint`, `npm run typecheck` pass | DONE (see PROJECT_MASTER 24) |
| 1.3 App skeletons | dashboard (Next.js), guest (Vite), capture (Expo skeleton, not installed), shared packages, worker package | dashboard + guest build; guest component test passes | DONE |
| 1.4 DB foundation | first migration, Supabase config, PGlite test harness | migration applies; RLS/isolation tests pass | DONE |
| 1.5 Test infrastructure + CI | Vitest, PGlite, pytest/unittest, Playwright config, GitHub Actions workflow | `npm test` passes locally; workflow file valid YAML | DONE (CI not yet run on GitHub: no remote) |
| 1.6 Remote + CI activation | push to GitHub, CI green, branch protection | CI run green on GitHub | BLOCKED (user go-ahead to push to https://github.com/princechakusa/Nookscanner; remote `origin` added; files staged; commit needs a git author identity set by the user) |

## Phase 2: Backend and database
| Stage | Tasks | Acceptance criteria |
|---|---|---|
| 2.1 Supabase projects | link staging project, apply migrations, configure Auth (confirmations, password policy, redirect URLs, SMTP) | `supabase db push` succeeds on staging; auth emails delivered |
| 2.2 Full schema | migrations for remaining tables (DATABASE_SCHEMA D items needed before Phase 5: invitations, qr_codes, scan_sessions, scan_checkpoints, media_uploads) | migrations apply on PGlite and real Supabase; docs updated |
| 2.3 Storage | buckets + storage RLS policies | upload tests: own org allowed, other org denied, anon denied |
| 2.4 Auth flows | signup, verify, login, reset, logout in dashboard | E2E auth tests pass on staging |
| 2.5 pgTAP on real stack | port RLS tests to pgTAP, run with `supabase test db` | all pass in CI with Docker |
| 2.6 Backend tests + audit | security review of policies | no Critical/High open |

## Phase 3: Design system and frontend foundation
| 3.1 Tokens -> Tailwind theme + CSS vars in both apps | tokens consumed; contrast test passes |
| 3.2 Core components (button, input, select, modal, toast, table, empty/error/loading) | component tests + a11y (axe) pass |
| 3.3 Dashboard shell (sidebar, org switcher, auth guard) | Playwright: unauthenticated redirect, shell renders |
| 3.4 Guest shell (EN/AR, RTL, loading, fallback list) | Playwright mobile emulation EN + AR screenshots reviewed |

## Phase 4: Property management
| 4.1 Organizations + invitations | create org, invite, accept, roles; isolation tests |
| 4.2 Properties + apartments CRUD (with layout questionnaire) | E2E CRUD; property-scoped member sees only assigned |
| 4.3 Rooms (pre-scan list from questionnaire) | rooms created; ordering |
| 4.4 QR foundation (`qr_codes`, token generation, rotate/revoke) | token entropy test; revoke test |

## Phase 5: Capture and uploads
| 5.1 Upload registration + TUS upload in dashboard | resume after network drop (E2E with throttling); other-org path denied |
| 5.2 Server validation (ffprobe in worker "validate" job) | report for good/bad sample videos |
| 5.3 Nookscanner: auth, apartment select, checkpoint plan, VisionCamera recording, pause/resume/review | runs on iPhone 16 Pro Max (dev build); manual test script passed |
| 5.4 On-device quality feedback (blur, exposure, speed) | thresholds tuned on sample footage; unit tests for metrics |
| 5.5 Background resumable upload from app | upload survives app backgrounding |

## Phase 6: 3D reconstruction
| 6.1 Worker container (ffmpeg, COLMAP/GLOMAP, gsplat, SplatTransform) on Modal | processes public sample dataset end to end |
| 6.2 Dispatch + callbacks + queue + retries | HMAC tests; idempotency; retry on transient failure |
| 6.3 Bake-off on pilot apartment: self-hosted vs Teleport | metrics + side-by-side review; decision recorded (ADR update) |
| 6.4 Quality validation (registered frames >= 90%, held-out PSNR recorded, room checklist) | manager review UI shows metrics |
| 6.5 Asset packaging (SOG + LoD, SPZ, preview) | first-LoD <= 10 MB, total <= 60 MB for pilot apartment |

## Phase 7: Interactive 3D viewer
| 7.1 `packages/viewer` wrapper over Spark (load, LoD, budget) | loads pilot SOG on iPhone + mid Android at >= 30 fps |
| 7.2 Camera controls + constraints | E2E controls; no floor clipping |
| 7.3 Alignment tools (floor, scale, crop) | measured door width within 3% |
| 7.4 Rooms + viewpoints + transitions | navigation tests pass |
| 7.5 Performance tuning | NFR-PERF-03/05 met on test devices |

## Phase 8: Appliance hotspots
| 8.1 Categories + model library + appliances | CRUD + isolation tests |
| 8.2 Hotspot placement (raycast), move, delete | round-trip coordinate test within 10 cm |
| 8.3 Instructions + versions + media (EN/AR) | sanitized Markdown test (XSS) |
| 8.4 Verification workflow | edits create unverified versions |
| 8.5 Publishing (snapshot, rules PB-01..03) | publish blocked when rules unmet |

## Phase 9: Guest application
| 9.1 `guest-experience` + `guest-instruction` Edge Functions | uniform 404; rate limit; schema tests |
| 9.2 Guest 3D exploration + hotspots + highlight | E2E on mobile emulation; device check |
| 9.3 Search (EN/AR aliases) + navigate + highlight | "AC" distinguishes rooms |
| 9.4 Instructions, videos, troubleshooting, support | E2E |
| 9.5 Fallback list mode | WebGL disabled test |

## Phase 10: Analytics and administration
| 10.1 Event ingestion (`guest-events`) | validation + rate limits |
| 10.2 Manager analytics views | aggregates correct on seeded data |
| 10.3 Notifications | processing notifications delivered |
| 10.4 Platform admin + support grants | grant expiry + audit tests |
| 10.5 Monitoring (Sentry, logs) | errors visible in Sentry staging |

## Phase 11: Security and QA
Security audit (ASVS L2), ZAP scans, penetration test (authorized), performance + load tests (k6), accessibility audit (axe + manual), device matrix, backup/restore drill. Acceptance: no open Critical/High; budgets met; restore drill succeeded.

## Phase 12: Real apartment pilot
Scan one apartment, validate visual quality and room connections, place real hotspots, guest testing on iOS/Android, measure load performance, collect feedback, fix. Acceptance: full Part 15 workflow passes with real footage; documented evidence.

## Phase 13: Production deployment
Production config, backup verification, infra deploy, monitoring, logging, error reporting, deployment docs, production readiness audit (PROJECT_MASTER section 20). Acceptance: checklist 100%.

## Phase 14: Scaling and improvements
Remaining 12 apartments, scanning/reconstruction improvements, Android capture, more languages, integrations (PMS), assisted detection, subscriptions, R2 CDN, scale infra from real usage.
