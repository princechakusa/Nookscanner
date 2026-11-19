# Nooktour: Product Requirements

Status: Approved baseline v1.0 (2026-11-19). Source mandate: [`MASTER_PROMPT.md`](MASTER_PROMPT.md). Master index: [`../PROJECT_MASTER.md`](../PROJECT_MASTER.md).

Nooktour (working description: *3D Apartment Guest Assistant*) is a cloud platform that turns a real apartment into a photorealistic, connected 3D environment where guests find and learn to operate appliances by scanning a QR code in the apartment.

## 1. Product principles (non-negotiable, from Part 16)

| # | Rule | Requirement IDs that enforce it |
|---|---|---|
| P1 | The 3D apartment is the main product experience | GX-01..GX-08 |
| P2 | The 3D environment represents the actual apartment (photographic reconstruction, not a floor plan) | RC-01, RC-05 |
| P3 | The apartment is connected across rooms | RC-03, VW-03 |
| P4 | Guests interact with actual appliance locations | HS-01..HS-06 |
| P5 | Search is a shortcut, not a replacement | GX-05 |
| P6 | Both direct scanning and video upload are supported | CP-01, UP-01 |
| P7 | Guided room checkpoints are part of capture | CP-03 |
| P8 | Manager reviews generated content before publishing | RV-01..RV-04, PB-01 |
| P9 | Appliance info is model-specific where possible | AP-02, IN-03 |
| P10 | Guest experience works in a mobile browser | GX-01, NFR-PERF-* |
| P11 | Manager dashboard is secure | SEC-* |
| P12 | Backend and production infrastructure are cloud-based | NFR-OPS-01 |
| P13 | Security is built into every stage | Roadmap stage gates |
| P14 | Documentation stays current | Roadmap stage gates |
| P15 | Every stage is tested before moving forward | [`TESTING_STRATEGY.md`](TESTING_STRATEGY.md) |

## 2. User roles

| Role | Who | Access |
|---|---|---|
| Platform administrator | Nooktour staff | Platform administration, global appliance library, abuse handling. Never browses tenant media without an audited support grant. |
| Organization owner | Property management company owner | Everything in the organization, including members, deletion and (future) billing |
| Organization admin | Operations lead | Members, properties, apartments, publishing |
| Manager | Property manager | Properties/apartments assigned, capture, review, hotspots, publishing |
| Editor | Content assistant | Appliances, hotspots, instructions (cannot publish or delete apartments) |
| Viewer | Owner/investor, auditor | Read-only, analytics |
| Guest | Person staying in the apartment | Anonymous, read-only access to one published apartment through its QR token |

Members can be scoped to the whole organization or to specific properties (see [`SECURITY.md`](SECURITY.md) section 3 for the permission matrix).

## 3. User journeys

### J1. Manager onboarding
Register (email + password, email verification) -> create organization -> create first property -> add first apartment -> invite colleagues (optional).

### J2. Direct guided capture (Method A)
Select apartment -> Start New Scan -> layout questionnaire (number of bedrooms, bathrooms, balconies, etc.) -> generated checkpoint plan (entrance, living, kitchen, bedrooms, bathrooms, hallways, other, final coverage) -> camera opens -> for each checkpoint: on-screen instruction, live quality feedback (blur, light, speed), mark checkpoint complete -> transition guidance ("walk slowly through the doorway keeping the frame of the door visible") -> pause/resume -> review recording -> upload (resumable, background) -> processing.

### J3. Existing video upload (Method B)
Select apartment -> Upload Video -> choose file(s) -> client-side validation (format, size, duration, resolution) -> resumable upload with progress -> server validation (container probe, duration, frame quality sample) -> suitability report -> submit for reconstruction, or request additional footage.

### J4. Processing and review
Monitor job progress (queued, extracting frames, estimating camera poses, training, optimizing, packaging) in real time -> receive notification -> preview the 3D apartment -> check room continuity using the room checklist -> approve, or reject with reason and re-capture missing areas.

### J5. Rooms and hotspots
Define rooms on the reconstructed scene (name, type, viewpoint, floor region) -> place hotspots by tapping on the actual object in 3D -> link each hotspot to an appliance record (category, brand, model, room) -> attach instructions (EN/AR), images, short videos, troubleshooting -> mark instructions verified.

### J6. Publish and QR
Preview guest experience -> publish (only verified content and an approved scene can be published) -> QR code generated (print-ready PNG/SVG/PDF) -> rotate or revoke QR when needed -> update content when equipment changes (republish creates a new version).

### J7. Guest
Scan QR -> browser opens published experience (no install, no login) -> language auto-detected (EN/AR, switchable) -> 3D apartment loads progressively with a loading indicator; useful appliance list available immediately -> explore rooms (tap room chips or walk) -> tap hotspot -> instructions, video, troubleshooting -> or search "AC" -> results distinguish "Living room AC", "Bedroom 1 AC" -> select -> camera flies to the room and highlights the object -> contact support (WhatsApp/phone/email as configured).

### J8. Analytics
Manager views per-apartment usage: sessions, most viewed appliances, top searches (including searches with no result), support contacts, 3D load success rate.

### J9. Platform administration
Platform admin manages the global appliance category list and global appliance model library, views processing queue health, and handles abuse reports. Access to tenant content requires a time-limited, audited support grant from the organization.

## 4. Modules

All 26 modules from Part 9, with responsibilities and dependencies. Detailed APIs in [`API_SPECIFICATION.md`](API_SPECIFICATION.md); tables in [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md); tests in [`TESTING_STRATEGY.md`](TESTING_STRATEGY.md); phase in [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md).

| # | Module | Responsibility | Depends on | Key tables | Min. permission | Phase |
|---|---|---|---|---|---|---|
| M1 | Authentication and accounts | Register, login, verify email, reset password, sessions, logout, recovery | Supabase Auth | `profiles` | - | 2 |
| M2 | Organization management | Create org, members, invitations, roles | M1 | `organizations`, `organization_members`, `organization_invitations`, `role_permissions` | owner/admin | 2, 4 |
| M3 | Property management | CRUD properties, support contacts | M2 | `properties`, `property_members` | manager | 4 |
| M4 | Apartment management | CRUD apartments, status lifecycle | M3 | `apartments` | manager | 4 |
| M5 | Guided 3D scanning | Checkpoint plan, camera, quality feedback, pause/resume | M4, M7 | `scan_sessions`, `scan_checkpoints` | manager | 5 |
| M6 | Existing video uploads | File pick, resumable upload | M4, M7 | `media_uploads` | manager | 5 |
| M7 | Upload validation | Client and server checks, suitability report | Storage | `media_uploads.validation_report` | system | 5 |
| M8 | Cloud reconstruction | Provider adapters, GPU worker, outputs | M7 | `processing_jobs`, `processing_results` | system | 6 |
| M9 | Processing management | Queue, retries, status, progress, cancel | M8 | `processing_jobs` | manager | 6 |
| M10 | 3D asset storage | Store SOG/SPZ/PLY, previews, versions, CDN | M8 | `scene_versions`, `scene_assets` | system | 6 |
| M11 | Interactive 3D viewer | Render splats, controls, LoD, fallbacks | M10 | - | public/guest | 7 |
| M12 | Room navigation | Rooms, viewpoints, transitions | M11 | `rooms` | editor | 7 |
| M13 | Detection and hotspot placement | Manual placement (MVP); assisted detection later | M11, M12 | `hotspots` | editor | 8 |
| M14 | Appliance management | Appliances per room, category, brand, model | M4 | `appliances`, `appliance_categories`, `appliance_models` | editor | 8 |
| M15 | Instruction library | Instructions, versions, media, EN/AR | M14 | `instructions`, `instruction_versions`, `instruction_media` | editor | 8 |
| M16 | Instruction verification | Verify/flag instructions, status tracking | M15 | `instruction_versions.verification_status` | manager | 8 |
| M17 | Guest QR access | QR token, generation, rotation, revocation | M4, publishing | `qr_codes` | manager | 4 (foundation), 9 |
| M18 | Guest application | Mobile web experience | M11, M12, M13, M15, M17 | `guest_sessions` | guest | 9 |
| M19 | Appliance search | Search across appliances/aliases, locale aware | M14 | `appliances`, `appliance_categories.aliases` | guest | 9 |
| M20 | Guest support | Contact channels, support interactions log | M3 | `support_interactions` | guest | 9 |
| M21 | Multilingual content | EN + AR, RTL, locale fallback | M15, M18 | `*_ar` columns, `instruction_versions.locale` | - | 3, 9 |
| M22 | Analytics | Event ingestion and reporting | M18 | `analytics_events` | viewer | 10 |
| M23 | Platform administration | Global library, queue health, support grants | M1 | `profiles.is_platform_admin`, `support_access_grants` | platform admin | 10 |
| M24 | Notifications | In-app and email notifications | M2 | `notifications` | member | 6, 10 |
| M25 | Security and audit logging | Audit trail, rate limits, headers, scanning | all | `audit_logs` | owner/admin read | 1 onward |
| M26 | Production operations | Deploy, monitor, backup, incident response | all | - | - | 13 |

## 5. Functional requirements

ID convention: area prefix + number. "MVP" = required for the pilot (Phase 12); "Later" = Phase 14.

### Accounts and organizations (AC)
- AC-01 Register with email/password; email verification required before creating an organization. MVP
- AC-02 Login, logout, password reset, session refresh, account recovery via email. MVP
- AC-03 A user can belong to several organizations and switch between them. MVP
- AC-04 Org owner/admin can invite members by email with a role and optional property scope. MVP
- AC-05 The last owner of an organization cannot be removed or demoted. MVP
- AC-06 OAuth (Google/Apple) sign-in. Later

### Properties and apartments (PR)
- PR-01 CRUD properties (name, address, timezone, default language, support contacts). MVP
- PR-02 CRUD apartments in a property (name, unit, floor, layout questionnaire). MVP
- PR-03 Apartment status lifecycle: `draft -> capturing -> processing -> review -> published -> archived`. MVP
- PR-04 Rooms: name (EN/AR), type, order, viewpoint and floor region in scene space. MVP

### Capture (CP) and upload (UP)
- CP-01 Direct capture in the Nookscanner iOS app (iPhone 16 Pro Max first; Android later). MVP
- CP-02 Layout questionnaire generates an adaptable checkpoint plan. MVP
- CP-03 Guided checkpoints: entrance, living, kitchen, each bedroom, each bathroom, hallways, others, final coverage. MVP
- CP-04 Live feedback where supported: blur (frame sharpness), exposure/lighting, movement speed, checkpoint progress. MVP (blur/light/speed); coverage map Later
- CP-05 Pause, resume, review and discard segments; recording stored locally until uploaded and server-validated. MVP
- CP-06 Transition guidance between rooms (doorway continuity). MVP
- UP-01 Upload existing walkthrough videos from device (dashboard web and Nookscanner app). MVP
- UP-02 Accept MP4/MOV (H.264/HEVC); max size and duration configured per plan (pilot: 10 GB per file, 30 min). MVP
- UP-03 Resumable chunked upload (TUS), progress, retry after interruption. MVP
- UP-04 Server-side validation report: container, codec, duration, resolution, frame rate, sampled blur score, darkness score; actionable error messages. MVP
- UP-05 Request additional footage for missing rooms; additional footage joins the same scan session. MVP

### Reconstruction (RC)
- RC-01 Produce a photographic 3D Gaussian Splatting reconstruction from captured video. MVP
- RC-02 Both capture methods feed the same pipeline (`scan_session -> processing_job`). MVP
- RC-03 The whole apartment is reconstructed as one coordinate frame (one connected scene), not per-room models. MVP
- RC-04 Pipeline stages are visible: frame extraction, pose estimation, training, cleanup, compression, packaging. MVP
- RC-05 Outputs: web-optimized splat (SOG primary, SPZ secondary), archival PLY, preview image(s), quality metrics. MVP
- RC-06 Failed jobs give an actionable reason; automatic retry for transient failures (max 2). MVP
- RC-07 Provider abstraction allows switching between self-hosted and managed reconstruction. MVP

### Review (RV) and publishing (PB)
- RV-01 Manager previews the scene in the dashboard viewer. MVP
- RV-02 Room continuity checklist (each room present, doorways connected) before approval. MVP
- RV-03 Approve / reject with reason; rejection can request more footage. MVP
- RV-04 Basic cleanup: crop bounding box and floor alignment (up axis, scale). MVP
- PB-01 Publish requires: approved scene version, at least one room, all published hotspots linked to verified instructions in the default language. MVP
- PB-02 Republish creates a new published version; guests always get the latest published version. MVP
- PB-03 Unpublish immediately revokes guest access. MVP

### Hotspots (HS), appliances (AP), instructions (IN)
- HS-01 Place hotspot by tapping the object in 3D (raycast against the splat). MVP
- HS-02 Hotspot fields: id, apartment, room, appliance, scene-space position and normal, preferred camera pose, reference image, verification and publication status. MVP
- HS-03 Reposition, edit, hide, delete hotspots. MVP
- HS-04 Hotspots stay anchored in scene coordinates, independent of screen size. MVP
- HS-05 Highlight effect on selection (pulse ring + camera framing). MVP
- HS-06 Assisted detection (suggest appliance hotspots); manager must confirm. Later
- AP-01 Appliance record: name (EN/AR), category, room, brand, model, optional global model link. MVP
- AP-02 Global appliance model library (platform admin curated); organizations can reuse instructions per model. MVP (basic), Later (rich library)
- IN-01 Instruction with versions per locale (EN/AR), step list, troubleshooting list. MVP
- IN-02 Media: images and short videos (max 2 min, transcoded for mobile). MVP
- IN-03 Instructions can be attached to an appliance model and overridden per apartment appliance. MVP
- IN-04 Verification: manager marks a version verified; edits create a new unverified version. MVP

### Guest (GX), search (SR), support (SU)
- GX-01 Open by QR on iOS Safari and Android Chrome, no install, no account. MVP
- GX-02 Interactive 3D apartment with touch controls, room chips, smooth transitions. MVP
- GX-03 Tap hotspot -> instruction sheet (steps, video, troubleshooting). MVP
- GX-04 EN and AR with full RTL layout; locale from browser, switchable. MVP
- GX-05 Search box always available; results show appliance + room; selecting navigates and highlights. MVP
- GX-06 Progressive loading: appliance list available within 2 s, 3D streams in with progress indicator. MVP
- GX-07 Fallback: if WebGL2 is unavailable or loading fails, show room-by-room appliance list with reference images and instructions. MVP
- GX-08 Offline-tolerant caching of instructions after first load. Later
- SR-01 Search matches name, category, aliases (EN/AR, e.g. "AC", "air conditioner", "مكيف"), brand. MVP
- SR-02 Search analytics including zero-result queries. MVP
- SU-01 Contact support via configured channels (WhatsApp link, phone, email). MVP
- SU-02 Support interaction logged without unnecessary personal data. MVP

### Analytics (AN), notifications (NT), administration (AD)
- AN-01 Events: session start, 3D loaded/failed (with load time), room view, hotspot open, search, support click. MVP
- AN-02 Manager dashboard: sessions, top appliances, top/zero-result searches, support contacts per apartment. MVP
- NT-01 Notifications for processing finished/failed and member invites (in-app + email). MVP
- AD-01 Platform admin: global categories and model library, queue health, support grants. MVP (minimal)

## 6. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-01 | Guest shell (HTML+JS+CSS) first contentful paint on 4G mid-range Android | <= 2.0 s |
| NFR-PERF-02 | Guest initial JS bundle (gzip, excluding 3D chunk) | <= 150 KB |
| NFR-PERF-03 | First visible 3D (coarse LoD) on 4G | <= 6 s; full detail <= 20 s |
| NFR-PERF-04 | Published splat asset size per apartment | target <= 60 MB total, first LoD <= 10 MB |
| NFR-PERF-05 | Rendering frame rate on iPhone 12 / Pixel 6 class | >= 30 fps median |
| NFR-PERF-06 | Reconstruction turnaround (pilot) | <= 4 h from upload to preview |
| NFR-REL-01 | Guest availability | 99.5% monthly (pilot), 99.9% (production) |
| NFR-REL-02 | Upload resumability | survives network loss and app backgrounding |
| NFR-SEC-01 | Tenant isolation | enforced by RLS on every tenant table; tested |
| NFR-SEC-02 | No privileged key in any client bundle | CI check |
| NFR-PRIV-01 | Raw interior recordings private, deleted 90 days after scene approval unless the org opts to keep | retention job |
| NFR-PRIV-02 | Guest data: no account, no name, no precise location, no full IP stored | by design |
| NFR-A11Y-01 | WCAG 2.2 AA for dashboard and guest UI (non-3D parts) | audit in Phase 11 |
| NFR-I18N-01 | EN + AR, RTL correctness | Phase 3 onward |
| NFR-OPS-01 | All production services cloud-hosted; infrastructure documented and reproducible | Phase 13 |
| NFR-MAINT-01 | TypeScript strict mode, lint, format, tests in CI | Phase 1 |
| NFR-SCALE-01 | Multi-tenant, no hardcoded building/org/apartment | always |

## 7. Out of scope for MVP (recorded, not forgotten)

Billing/subscriptions, OAuth login, Android Nookscanner app, automatic appliance detection, offline mode, PMS/booking integrations, languages beyond EN/AR, custom domains per organization. See Phase 14 in [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md).
