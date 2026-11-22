/**
 * Nookscanner 3D viewer (ADR-006): Spark Gaussian-splat renderer on three.js behind a small
 * interface, so the apps never depend on Spark directly and the renderer can be swapped.
 * Loads one scene (SOG/SPZ/PLY/splat) with level-of-detail under a per-device budget
 * (budget.ts), reports download progress and time to first frame, and measures frame rate so
 * performance can be recorded per device (docs/3D_QUALITY_BAR.md section 6).
 */
import { SparkControls, SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import * as THREE from 'three';
import { chooseBudget, readCapabilities, type ViewerBudget, type ViewerTier } from './budget.ts';
import type { Mat4 } from './alignment.ts';
import { QualityGovernor, qualitySteps, type QualityStep } from './governor.ts';
import { flightDuration, samplePath, type Waypoint } from './navigation.ts';
import { constrainPosition, validBounds, type SceneBounds, type Vec3 } from './constraints.ts';

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  url: string;
  /**
   * Level of detail (default true). Editors that pick points turn it off: Spark raycasts only
   * against the LoD subset currently drawn, which can be empty while it streams.
   */
  lod?: boolean;
  /** Force a tier (tests, settings); default: chosen from the device. */
  tier?: ViewerTier;
  /** Alignment matrix of the scene version (alignment.ts); bounds and poses are then metres. */
  alignment?: Mat4 | undefined;
  /** Initial camera pose in scene coordinates (metres). */
  camera?: { position: Vec3; target: Vec3 };
  /** Apartment box from the scene alignment; the camera never leaves it or goes under the floor. */
  bounds?: SceneBounds;
  onProgress?: (fraction: number) => void;
  onFirstFrame?: (ms: number) => void;
  onError?: (error: Error) => void;
  /** Adaptive quality (governor.ts, default true): lowers resolution/splats below 30 fps. */
  adaptive?: boolean;
  /** Called when the governor lowers quality. */
  onQualityChange?: (level: number, step: QualityStep) => void;
  /** Even the lowest quality is far too slow: offer the list instead (fallback). */
  onTooSlow?: () => void;
}

export interface ViewerStats {
  tier: ViewerTier;
  budget: ViewerBudget;
  loadMs: number | null;
  firstFrameMs: number | null;
  /** Frames per second averaged over the last second (null until measured). */
  fps: number | null;
  splats: number | null;
  /** Governor level (0 = the device's starting budget). */
  qualityLevel: number;
}

export interface Viewer {
  readonly stats: ViewerStats;
  /** Moves the camera to look at a point from a position (used by rooms and search later). */
  lookAt(position: Vec3, target: Vec3): void;
  /** Back to the starting view. */
  reset(): void;
  /**
   * Flies the camera along waypoints (navigation.ts flightPath), 600-1200 ms, or cuts when
   * `reducedMotion`. Resolves when the camera arrives; a new flight or a drag replaces it.
   */
  flyTo(path: Waypoint[], options?: { reducedMotion?: boolean }): Promise<void>;
  /**
   * Point on the scene under a screen position (client pixels), in SCENE coordinates (before
   * alignment), or null when nothing is hit. Used by the alignment and hotspot tools; slow on
   * millions of splats, so call it on taps, never every frame (ADR-006).
   */
  pick(clientX: number, clientY: number): Vec3 | null;
  /** Applies (or clears) the alignment matrix from the scene version (alignment.ts). */
  setAlignment(matrix: Mat4 | null): void;
  /** The screen's "up" direction expressed in scene coordinates (orients the floor plane). */
  sceneUp(): Vec3;
  /** Current camera position and a point 1 m ahead, in world (aligned) coordinates. */
  getView(): { position: Vec3; target: Vec3 };
  /**
   * Screen position (CSS pixels from the canvas's top-left) of a WORLD point, for hotspot markers;
   * `visible` is false behind the camera or outside the view.
   */
  project(point: Vec3): { x: number; y: number; visible: boolean };
  resize(): void;
  dispose(): void;
}

export async function createViewer(o: ViewerOptions): Promise<Viewer> {
  const started = performance.now();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: false, alpha: false });
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const budget = chooseBudget(readCapabilities(gl), o.tier);
  renderer.setPixelRatio(budget.pixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1116); // viewer.background token
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  const spark = new SparkRenderer({
    renderer,
    enableLod: o.lod !== false,
    lodSplatCount: budget.lodSplatCount,
  });
  scene.add(spark);

  const stats: ViewerStats = {
    tier: budget.tier,
    budget,
    loadMs: null,
    firstFrameMs: null,
    fps: null,
    splats: null,
    qualityLevel: 0,
  };

  const mesh = new SplatMesh({
    url: o.url,
    lod: o.lod !== false,
    raycastable: true,
    onProgress: (e: ProgressEvent) => {
      if (e.lengthComputable && e.total > 0) o.onProgress?.(Math.min(1, e.loaded / e.total));
    },
  });
  // Most splat captures are Y-down (OpenCV); flip to three.js Y-up.
  mesh.quaternion.set(1, 0, 0, 0);
  scene.add(mesh);
  const applyAlignment = (matrix: Mat4 | null) => {
    mesh.matrixAutoUpdate = matrix === null;
    if (matrix) {
      // Alignment replaces the default Y-down flip: it maps raw scene space to the world.
      mesh.matrix.fromArray(matrix);
      mesh.matrixWorldNeedsUpdate = true;
    } else {
      mesh.quaternion.set(1, 0, 0, 0);
      mesh.position.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.updateMatrix();
    }
  };
  if (o.alignment) applyAlignment(o.alignment);

  const controls = new SparkControls({ canvas: o.canvas });

  const bounds = validBounds(o.bounds) ? o.bounds : undefined;
  const lookAt = (position: Vec3, target: Vec3) => {
    rig.position.set(...constrainPosition(position, bounds));
    rig.lookAt(new THREE.Vector3(...target));
  };
  const start = {
    position: o.camera?.position ?? ([0, 0, 0] as Vec3),
    target: o.camera?.target ?? ([0, 0, -1] as Vec3),
  };
  lookAt(start.position, start.target);

  let flight: { path: Waypoint[]; started: number; duration: number; done: () => void } | null =
    null;
  const endFlight = () => {
    const f = flight;
    flight = null;
    f?.done();
  };
  // Looking around by hand cancels a flight in progress.
  o.canvas.addEventListener('pointerdown', endFlight);

  const resize = () => {
    const w = o.canvas.clientWidth || 1;
    const h = o.canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  try {
    await mesh.initialized;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    o.onError?.(err);
    renderer.dispose();
    throw err;
  }
  stats.loadMs = Math.round(performance.now() - started);
  o.onProgress?.(1);

  const governor =
    o.adaptive === false
      ? null
      : new QualityGovernor(
          qualitySteps({ pixelRatio: budget.pixelRatio, lodSplatCount: budget.lodSplatCount }),
        );
  let frames = 0;
  let windowStart = performance.now();
  let disposed = false;
  renderer.setAnimationLoop(() => {
    if (disposed) return;
    if (flight) {
      const t = flight.duration === 0 ? 1 : (performance.now() - flight.started) / flight.duration;
      const pose = samplePath(flight.path, Math.min(1, t));
      lookAt(pose.position, pose.target);
      if (t >= 1) endFlight();
    } else {
      controls.update(rig, camera);
    }
    if (bounds) {
      const p = constrainPosition([rig.position.x, rig.position.y, rig.position.z], bounds);
      rig.position.set(p[0], p[1], p[2]);
    }
    renderer.render(scene, camera);
    const now = performance.now();
    if (stats.firstFrameMs === null) {
      stats.firstFrameMs = Math.round(now - started);
      o.onFirstFrame?.(stats.firstFrameMs);
    }
    frames += 1;
    if (now - windowStart >= 1000) {
      stats.fps = Math.round((frames * 1000) / (now - windowStart));
      frames = 0;
      windowStart = now;
      // Hidden tabs are throttled by the browser: not a measurement of the device.
      if (governor && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const d = governor.sample(stats.fps);
        if (d.kind === 'step') {
          renderer.setPixelRatio(d.step.pixelRatio);
          spark.lodSplatCount = d.step.lodSplatCount;
          resize();
          stats.qualityLevel = d.level;
          o.onQualityChange?.(d.level, d.step);
        } else if (d.kind === 'too-slow') {
          o.onTooSlow?.();
        }
      }
    }
  });

  return {
    stats,
    lookAt,
    reset: () => {
      endFlight();
      lookAt(start.position, start.target);
    },
    flyTo(path, options) {
      endFlight();
      if (path.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        flight = {
          path,
          started: performance.now(),
          duration: flightDuration(path, options?.reducedMotion),
          done: resolve,
        };
      });
    },
    pick(clientX, clientY) {
      const rect = o.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(mesh, false);
      const hit = hits[0];
      if (!hit) return null;
      // Hit point in the mesh's local (scene) space, independent of the current alignment.
      const local = mesh.worldToLocal(hit.point.clone());
      return [local.x, local.y, local.z];
    },
    sceneUp() {
      const origin = mesh.worldToLocal(new THREE.Vector3(0, 0, 0));
      const up = mesh
        .worldToLocal(new THREE.Vector3(0, 1, 0))
        .sub(origin)
        .normalize();
      return [up.x, up.y, up.z];
    },
    getView() {
      const p = new THREE.Vector3();
      camera.getWorldPosition(p);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const t = p.clone().add(dir);
      return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
    },
    setAlignment: applyAlignment,
    project(point) {
      const v = new THREE.Vector3(point[0], point[1], point[2]).project(camera);
      const w = o.canvas.clientWidth;
      const h = o.canvas.clientHeight;
      return {
        x: ((v.x + 1) / 2) * w,
        y: ((1 - v.y) / 2) * h,
        visible: v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
      };
    },
    resize,
    dispose() {
      disposed = true;
      endFlight();
      o.canvas.removeEventListener('pointerdown', endFlight);
      renderer.setAnimationLoop(null);
      mesh.dispose();
      spark.dispose();
      renderer.dispose();
    },
  };
}
