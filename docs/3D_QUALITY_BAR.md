# 3D Quality Bar and Capture Protocol

Status: requirement set by the user (2026-11-19). The 3D result must be the best achievable, not merely acceptable. This document defines how "best" is measured. Numeric targets below are **initial targets to be calibrated on the first real apartment**; record the calibrated values and evidence in `3D_TECHNOLOGY.md` and `PROJECT_MASTER.md`. Do not treat a target as met without measured results.

## 1. Principles
1. Quality is measured, not asserted. Every reconstruction gets a recorded quality report.
2. Garbage in, garbage out: capture quality is enforced at capture time (Nookscanner Capture) and at upload validation.
3. The manager must review and approve the scene before publishing (product rule 8).
4. A scene that looks great but runs badly on an ordinary phone fails. Quality and performance are both gates.
5. Pipeline choice (own COLMAP/GLOMAP + gsplat on Modal vs. commercial services) is decided by a blind-style visual comparison on the same apartment, then by cost. Not by cost first.

## 1b. Not one phone, not one user (binding)
The iPhone 16 Pro Max is only the **pilot** device. Nookscanner is for many property managers using many devices, so:
- Do not tune quality only for one phone. Define **device tiers** (for example: recent iPhone Pro, older/standard iPhone, high-end Android, mid-range Android, existing uploaded video from any camera or drone-style gimbal) and record the minimum supported capture specs (resolution, fps, sensor/stabilisation expectations) per tier.
- Quality gates (section 3) must adapt by tier and by video metadata, and must give clear guidance if a device or video is below the minimum. Never silently accept footage that cannot reconstruct well.
- Method B (uploading an existing video from any source) must be treated as first-class: validate resolution, bitrate, codec (including HEVC and phone-specific formats), rotation metadata, variable frame rate and duration, and explain what is wrong.
- Test capture and reconstruction with footage from at least: the pilot iPhone, one older iPhone, and one Android phone, and record how quality differs. Where Android native capture is deferred (it is listed as a future improvement), upload of Android-recorded video must still work and be measured.
- Apartments differ: small studios, large multi-bedroom, dark rooms, open plan, glass walls. Calibrate gates on varied layouts, not one apartment.
- Guest side: viewer performance is tested across device tiers (section 6), not on the pilot phone only.
- Nothing may be hardcoded to one device model, one apartment or one organisation.
- Tier table (Stage 5.3): T1 Pro phone, T2 Standard phone, T3 Basic phone, T4 Minimum, T5 Uploaded video; defined by reported camera capabilities in `packages/shared/src/device-tiers.json` and documented with the capture profiles in [`3D_TECHNOLOGY.md`](3D_TECHNOLOGY.md#device-tiers-and-capture-profiles-stage-53).

## 2. Capture protocol (written for the pilot iPhone 16 Pro Max; adapt per device tier per section 1b)
- Light: daylight plus all room lights on; close blinds if direct sun blows out windows; avoid mixed flicker light. No moving people or pets.
- Camera: back main camera, highest practical resolution (4K), 30 fps unless testing shows 60 fps helps; lock exposure and focus (AE/AF lock) and white balance per room where the API allows; avoid digital zoom; keep the lens clean.
- Movement: slow, steady walking pace; smooth turns, no whip pans; keep the phone at chest height (about 1.4 m), then add a second lower/higher pass in each room; minimise rotation without translation.
- Coverage: walk every room along a loop, capture each wall, corner, appliance and the floor; get at least a few seconds of every appliance from 2 angles.
- Connectivity: walk slowly through every doorway in both directions and keep part of the previous room in view as you cross, so rooms share overlapping views.
- Clutter: open doors fully, remove loose items, avoid mirrors and glass as the only view when possible (they reconstruct poorly).
- Finish: end by returning to the entrance (loop closure).
- Record per-capture metadata: device, resolution, fps, lens, exposure mode, date, apartment layout.

## 3. Capture and upload quality gates (automatic, before reconstruction)
Measure and report: blur (Laplacian variance per frame), exposure/clipping, motion speed, frame count and coverage per room, overlap between consecutive keyframes, camera-pose registration rate after SfM. Initial targets (calibrate): fewer than 5% of kept frames flagged blurry; no room with registration failure; doorway transitions registered. If a gate fails, tell the manager what to re-capture, specifically.

## 4. Reconstruction quality report (per scene)
Compute on held-out frames (about 10% of frames never used for training) comparing renders to the real frames:
- PSNR, SSIM, LPIPS (record all three).
- SfM registered-camera ratio and reprojection error.
- Per-room and whole-apartment numbers, plus a seam/doorway check (rooms aligned within a stated tolerance).
- Floaters/artefact review: a manager-facing checklist (floaters, holes, smeared walls, mirror ghosting, blown windows).
Targets: set from the first real apartment's best result; thereafter a new scene must be within a stated margin of that baseline or it is flagged "needs re-capture". Always show the report to the manager next to the preview.

## 5. Pipeline comparison (Phase 6, required)
Run the same real apartment through each candidate (own pipeline with different settings; Varjo Teleport or other commercial service if access is available; any other credible option found). Record: visual quality score above, side-by-side screenshots and fly-throughs, room continuity, processing time, cost per apartment (verified vs estimate), export format and licence. Choose the winner on quality first, then cost and licence. Record as an ADR.

## 6. Viewer performance budgets (targets, calibrate on real devices)
- Time to first meaningful 3D view on a mid-range phone on 4G: record and set a target; progressive/LOD loading so something usable appears quickly.
- Smooth interaction: aim for a stable frame rate on mid-range iPhone and Android; record real measurements per device.
- Total guest download size and memory use recorded per scene; fallback list view must always work if 3D fails.
- Test on a real iPhone, a mid-range Android, a tablet and desktop, plus throttled network.

## 7. Acceptance for "3D quality" in the roadmap
A scene can be published only if: capture gates passed (or manager explicitly overrode with a recorded warning), quality report generated and stored, manager reviewed and approved, rooms connected and navigable, hotspot positions verified, and performance measured on at least one real iPhone and one Android browser. Evidence is recorded in `PROJECT_MASTER.md`.

## 8. Cheap early validation (do this first)
As soon as the pipeline skeleton exists, run one real apartment video through it end to end (even before the polished UI) so quality problems are discovered early. The user will supply real footage; if none is available yet, record "Blocked on user: real apartment footage" and continue with other stages.
