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

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  url: string;
  /** Force a tier (tests, settings); default: chosen from the device. */
  tier?: ViewerTier;
  /** Initial camera pose in scene coordinates (metres). */
  camera?: { position: [number, number, number]; target: [number, number, number] };
  onProgress?: (fraction: number) => void;
  onFirstFrame?: (ms: number) => void;
  onError?: (error: Error) => void;
}

export interface ViewerStats {
  tier: ViewerTier;
  budget: ViewerBudget;
  loadMs: number | null;
  firstFrameMs: number | null;
  /** Frames per second averaged over the last second (null until measured). */
  fps: number | null;
  splats: number | null;
}

export interface Viewer {
  readonly stats: ViewerStats;
  /** Moves the camera to look at a point from a position (used by rooms and search later). */
  lookAt(position: [number, number, number], target: [number, number, number]): void;
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
    enableLod: true,
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
  };

  const mesh = new SplatMesh({
    url: o.url,
    lod: true,
    onProgress: (e: ProgressEvent) => {
      if (e.lengthComputable && e.total > 0) o.onProgress?.(Math.min(1, e.loaded / e.total));
    },
  });
  // Most splat captures are Y-down (OpenCV); flip to three.js Y-up.
  mesh.quaternion.set(1, 0, 0, 0);
  scene.add(mesh);

  const controls = new SparkControls({ canvas: o.canvas });

  const lookAt = (position: [number, number, number], target: [number, number, number]) => {
    rig.position.set(...position);
    rig.lookAt(new THREE.Vector3(...target));
  };
  lookAt(o.camera?.position ?? [0, 0, 0], o.camera?.target ?? [0, 0, -1]);

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

  let frames = 0;
  let windowStart = performance.now();
  let disposed = false;
  renderer.setAnimationLoop(() => {
    if (disposed) return;
    controls.update(rig, camera);
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
    }
  });

  return {
    stats,
    lookAt,
    resize,
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      mesh.dispose();
      spark.dispose();
      renderer.dispose();
    },
  };
}
