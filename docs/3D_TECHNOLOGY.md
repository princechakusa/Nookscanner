# Nookscanner: 3D Capture, Reconstruction and Viewing

> **Binding quality bar:** [`3D_QUALITY_BAR.md`](3D_QUALITY_BAR.md) (ADR-014). It defines device tiers, capture protocol, capture/upload gates, the per-scene quality report and viewer budgets. Calibrated values and measured evidence are recorded here and in `PROJECT_MASTER.md`. None yet: no real footage received (KI-014).

Research date: **2026-11-19**. All sources were fetched or searched on that date unless stated. Prices quoted are what the source said on that date; anything computed by us is labelled **ESTIMATE**. Decisions are recorded in [`DECISION_LOG.md`](DECISION_LOG.md) (ADR-004 to ADR-008).

## 1. The problem in one paragraph

We need a *photographic* digital copy of a real apartment (not a simplified room model), reconstructed from phone video, in **one connected coordinate frame** so guests can move from room to room, that streams fast enough to run on ordinary phones in a browser, with appliances anchored at their true 3D positions. Video alone does not guarantee a good result: reconstruction quality depends on coverage, overlap between rooms, motion blur, lighting, reflective/featureless surfaces (white walls, mirrors, windows) and camera pose estimation.

## 2. Reconstruction approaches compared

| Approach | Visual realism | Indoor multi-room | Web delivery | Verdict |
|---|---|---|---|---|
| **3D Gaussian Splatting (3DGS)** | Photographic, view-dependent effects | Good when the walkthrough is one continuous trajectory with overlap at doorways | Mature open web renderers (Spark, PlayCanvas, three.js r186), compressed formats (SOG, SPZ) | **Selected** |
| Photogrammetry (textured mesh) | Good on textured surfaces; poor on white walls, glass, reflective appliances, thin objects | Good geometry | Easy (glTF) | Secondary: used later only for collision/floor mesh if needed |
| NeRF (implicit radiance fields) | Photographic | Good | Real-time web rendering impractical (needs baking) | Rejected for delivery; 3DGS supersedes it for real-time |
| Room-plan / CAD models (e.g. LiDAR room outlines) | Not photographic | Excellent topology | Easy | Rejected as product output (violates rule P2); possible helper for room boundaries later |
| 360-photo tours (Matterport-style panoramas) | Photographic at fixed points only | Connected by jumps | Easy | Rejected as primary (not free movement); acceptable as degraded fallback idea only |

Basis: product requirement for photorealism and connected rooms ([`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md) RC-01..RC-05).

## 3. Gaussian Splatting reconstruction options

### 3.1 Self-hosted open-source pipeline

| Component | License (verified) | Notes | Source |
|---|---|---|---|
| Original INRIA 3DGS code (graphdeco-inria) | **Non-commercial only** ("may be used 'non-commercially', i.e., for research and/or evaluation purposes only") | **Must not be used in production** | https://github.com/graphdeco-inria/gaussian-splatting/blob/main/LICENSE.md |
| **gsplat** (nerfstudio-project) | **Apache-2.0**; latest tagged release v1.5.3 (v1.6.0 unreleased on main); requires PyTorch 2.7+, CUDA 12.8/13 builds; MCMC densification strategy available | Independent re-implementation, commercially usable | https://github.com/nerfstudio-project/gsplat |
| nerfstudio / Splatfacto | Apache-2.0 (secondary sources) | Higher-level trainer on gsplat | https://radiancefields.com/nerfstudio-1-0-and-splatfacto-released |
| **COLMAP** (with GLOMAP global mapper integrated since COLMAP 4.0) | **New BSD**; third-party dependencies separately licensed and must be checked before shipping (Ceres, PoseLib, SiftGPU, VLFeat) | Camera pose estimation (Structure-from-Motion) from extracted frames | https://colmap.readthedocs.io/en/latest/license.html |
| Brush | Apache-2.0 | WebGPU trainer (desktop/browser); useful for manual QA, not our server pipeline | https://github.com/ArthurBrussee/brush |
| **SplatTransform** (`@playcanvas/splat-transform`, npm v3.12.0 on 2026-11-19) | MIT (PlayCanvas org); verify LICENSE file at integration time | Converts PLY/SPZ/SPLAT/KSPLAT to SOG, can generate LoD/streamed outputs | https://developer.playcanvas.com/user-manual/splat-transform/ |

Pipeline: `video -> frame extraction (ffmpeg, sharpness-filtered) -> COLMAP features + matching (sequential + loop detection) -> GLOMAP/COLMAP mapping -> gsplat training (MCMC strategy) -> floater cleanup + crop -> PLY -> SplatTransform -> SOG (+ LoD) and SPZ -> upload`.

Advantages: full control of quality, privacy (interior footage never leaves our infrastructure), no per-scan vendor fee, permissive licenses, deterministic outputs.
Limitations: we own GPU ops; failure modes (pose estimation failures in featureless corridors) need engineering; first-run tuning needed.

GPU platform (serverless, pay per second), Modal, verified 2026-11-19 at https://modal.com/pricing:
- L4 $0.000222/s, L40S $0.000542/s, A100 40 GB $0.000583/s, A100 80 GB $0.000694/s, H100 $0.001097/s. Starter plan: $0 base + compute, "$30 / month free credits".
- **ESTIMATE** per apartment (2-3 bedroom, ~8-15 min of video, ~1,500-3,000 frames): pose estimation 20-60 min CPU/GPU + training 30-90 min on L40S/A100 -> roughly **$2-$6 compute per reconstruction**. To be measured in Phase 6 on pilot footage.

### 3.2 Managed reconstruction services

| Service | What was verified | Fit | Source |
|---|---|---|---|
| **Varjo Teleport** | API-first; Developer Plan gives API credentials; docs list Authentication, Upload Captures, Training Parameters, Manage Captures, Webhooks; inputs "image datasets and videos"; interior examples; PLY export on paid tiers (help centre). Pricing **inconsistent across sources**: third-party article: $1/capture + $0.01/image + $30/month; a draft pricing page: credit model, Pro €29.99/month with API. **Unverified, must be confirmed at sign-up.** | Best managed candidate for a quality benchmark | https://teleport.varjo.com/docs , https://get.teleport.varjo.com/pricing , https://radiancefields.com/teleport-adds-developer-plan-with-api-access |
| KIRI Engine API | 3DGS endpoints `/3dgs-scan/video-upload` and image upload; video **max 1920x1080 and 3 minutes**; 1 credit = $1 per call, min. recharge 500 credits ($500), API "in testing" | 3-minute limit is too short for a whole apartment in one connected capture; minimum spend $500 | https://kiriengine.app/api , http://docs.kiriengine.app/category/3dgs-scan/ |
| Polycam | Content Management API is Enterprise-only, exports listed as mesh, thumbnails, OBJ, GLTF, LAS (no splat format listed); beta | Not suitable for splat pipeline | https://learn.poly.cam/hc/en-us/articles/49623303995284-Content-Management-API |
| Luma AI 3D Capture | App no longer actively developed (secondary source); 2023 Video-to-3D API status unknown | Not suitable (vendor risk) | https://radiancefields.com/luma-ai-alternatives |
| XGRIDS LCC Cloud | Works only with XGRIDS hardware captures | Not suitable (requires hardware) | https://radiancefields.com/xgrids-launches-lcc-cloud-out-of-beta |
| AWS VAMS Gaussian splatting pipeline | Open-source AWS reference pipeline, MP4 input | Alternative self-host reference if we move to AWS | https://awslabs.github.io/visual-asset-management-system/pipelines/gaussian-splatting |

### 3.3 Decision (ADR-004)

**Primary: self-hosted COLMAP/GLOMAP + gsplat pipeline on serverless GPUs (Modal), behind a provider-adapter interface. Benchmark: Varjo Teleport via the same interface during the Phase 6 bake-off.** Final production default is chosen by measured quality on the pilot apartment (acceptance criteria in [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) Phase 6). Never use the INRIA reference implementation.

## 4. Capture

Device: iPhone 16 Pro Max (pilot). Capture guidance derived from 3DGS requirements:
- One continuous walkthrough per apartment where possible; when paused, resume at the same spot with overlap (the app shows the last frame as a ghost overlay to realign).
- Rooms connect through doorways: walk *through* the doorway slowly, keeping the door frame in view (provides shared features for pose estimation).
- Lock exposure and white balance per segment where possible, 4K at 30 fps, no stabilization crop changes, avoid fast pans (>~30 deg/s), lights on, curtains in a consistent state.
- Loop closure: final coverage pass returns to the entrance.

### Nookscanner app technology
| Option | Verified | Notes |
|---|---|---|
| **React Native + Expo SDK 58 + react-native-vision-camera v5** | npm on 2026-11-19: `expo` 58.0.26, `react-native-vision-camera` 5.2.4 (v5 is the maintained line per Margelo), `expo-camera` 58.0.14 | VisionCamera gives format selection, frame processors (for on-device blur/exposure metrics) and video recording. Requires Expo dev client (custom native build), not Expo Go. Sources: https://visioncamera4.margelo.com/docs/guides/frame-processors , https://docs.expo.dev/versions/latest/sdk/camera/ |
| Native Swift (AVFoundation + ARKit) | - | Best access to ARKit camera poses and LiDAR depth (could improve reconstruction), but separate codebase |
| Browser capture (MediaRecorder) | - | No reliable control of exposure/codec, background upload unreliable; rejected for primary capture |

Decision (ADR-005): Expo + VisionCamera for the Nookscanner app, with a native module escape hatch for ARKit pose logging if the bake-off shows pose priors materially improve reconstruction.

## 5. Web viewing

| Renderer | License | Verified facts (2026-11-19) | Fit |
|---|---|---|---|
| **Spark** (`@sparkjsdev/spark`, World Labs) | **MIT** (npm metadata) | npm v2.4.0; peer `three >=0.180.0`; WebGL2, mobile and WebXR; LoD + streaming since 2.0; loads PLY, SPLAT, KSPLAT, SPZ, **SOG**, ZIP, RAD; `SplatMesh.raycast` conforms to `THREE.Raycaster` (warned: slow on millions of splats, not per frame) | **Selected**: three.js ecosystem, raycasting for hotspot placement, LoD for phones |
| PlayCanvas engine + SuperSplat viewer | MIT | SOG native ("~15-20x smaller than an equivalent PLY"), streamed LOD, WebGPU path | Strong alternative; keep as fallback renderer (ADR-006) |
| three.js native `GaussianSplat` (r186) | MIT | Shipped 2026-09-08 in three 0.186.0; raycasting; **no LoD/streaming**, WebGPURenderer focused (secondary sources) | Revisit when LoD lands |
| Babylon.js | Apache-2.0 | Has Gaussian splat support (not re-verified in detail this session) | Not selected: smaller splat streaming ecosystem than Spark/PlayCanvas |

Sources: https://sparkjs.dev/docs/overview/ , https://sparkjs.dev/docs/splat-mesh/ , https://github.com/sparkjsdev/spark , https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/ , https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186

### Asset formats (ADR-007)
- **SOG** (Spatially Ordered Gaussians, v3): WebP textures + `meta.json`, lossy quantization, ~15-20x smaller than PLY. Primary guest delivery format, generated with SplatTransform, with LoD.
- **SPZ**: secondary compressed format (fallback for renderer swap).
- **PLY**: archival master (private bucket), never sent to guests.

## 6. Connected apartment, rooms and hotspots

- **One scene, one coordinate frame.** The whole apartment is a single reconstruction. After approval, the manager aligns the floor (up axis) and scale (tap two points of a known distance, e.g. a door width) so coordinates are in metres.
- **Rooms** are stored as: floor polygon (x,z) + height range in scene coordinates, and one or more *viewpoints* (camera position + target). Room membership of a hotspot is validated (point-in-polygon) but can be overridden.
- **Navigation**: room chips and search fly the camera along a smooth path between viewpoints; free orbit/walk controls within limits. Doorway transitions animate through the doorway midpoint (stored as `rooms.connections`).
- **Hotspots** are anchored by `position (x,y,z)`, `normal`, and a preferred `camera pose`, all in scene space; the 2D marker is projected each frame, so it stays correct on every screen size (HS-04). Occlusion test via depth from the renderer (or raycast at low frequency).
- **Placement**: manager taps the object; we raycast against the SplatMesh (Spark) once per tap. Assisted detection (Later): run an open-vocabulary detector on extracted keyframes with known camera poses, triangulate to 3D, present as suggestions for manager confirmation (rule P8).
- **Scene versions**: hotspots belong to a `scene_version`; a new reconstruction requires re-anchoring (assisted by projecting old hotspots after aligning the new scene; manager confirms).

## 7. Mobile performance plan

- Guest shell loads first without 3D (appliance list usable within 2 s).
- 3D code is a lazily loaded chunk; SOG LoD streams coarse to fine; splat budget adapts to device (`navigator.hardwareConcurrency`, `deviceMemory`, measured frame time).
- WebGL2 required for 3D; otherwise fallback list mode (GX-07).
- Assets served from CDN with long-lived immutable cache headers (content-hashed paths).
- Budgets in [`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md) NFR-PERF-*.

## 8. Risks specific to 3D (also in PROJECT_MASTER risks)

1. Pose estimation fails on featureless corridors or mirrors -> capture guidance, sequential matching with loop detection, segment-level retries, request more footage.
2. Splat size too large for low-end phones -> LoD, splat budget, prune low-opacity splats, cap training gaussian count.
3. Floaters/artifacts -> cleanup step + manager crop tool; quality gate in review.
4. Vendor/library churn (fast-moving field) -> provider adapter, keep PLY master, renderer abstraction in `packages/viewer`.
5. Privacy of interior footage -> private storage, short retention, workers use short-lived signed URLs.
