/**
 * Camera limits (DESIGN_SYSTEM section 7, roadmap 7.2): the camera stays inside the apartment's
 * bounding box with a margin, never below the floor plus a minimum eye height and never above the
 * ceiling. Bounds come from the scene's alignment (7.3: floor plane, scale, crop box); without
 * bounds the camera is not limited. Pure and unit-tested.
 */
export type Vec3 = [number, number, number];

export interface SceneBounds {
  /** Axis-aligned box in scene coordinates (metres, Y up after alignment). */
  min: Vec3;
  max: Vec3;
}

export interface CameraLimits {
  /** Keep this far (m) from every wall of the box. */
  margin: number;
  /** Lowest eye height above the floor (min.y), so the camera never dips under the floor. */
  minEyeHeight: number;
  /** Highest eye height above the floor (below the ceiling). */
  maxEyeHeight: number;
}

export const DEFAULT_LIMITS: CameraLimits = { margin: 0.15, minEyeHeight: 0.4, maxEyeHeight: 2.2 };

const clamp = (v: number, lo: number, hi: number) =>
  lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));

/** Returns the nearest allowed camera position (unchanged when already inside). */
export function constrainPosition(
  p: Vec3,
  bounds: SceneBounds | undefined,
  limits: CameraLimits = DEFAULT_LIMITS,
): Vec3 {
  if (!bounds) return p;
  const { min, max } = bounds;
  const floor = min[1];
  const ceiling = Math.min(max[1] - limits.margin, floor + limits.maxEyeHeight);
  return [
    clamp(p[0], min[0] + limits.margin, max[0] - limits.margin),
    clamp(p[1], floor + limits.minEyeHeight, ceiling),
    clamp(p[2], min[2] + limits.margin, max[2] - limits.margin),
  ];
}

/** True when the box is usable (finite, non-degenerate, at least 1 m wide in X and Z). */
export function validBounds(b: SceneBounds | undefined): b is SceneBounds {
  if (!b) return false;
  const all = [...b.min, ...b.max];
  return (
    all.every(Number.isFinite) &&
    b.max[0] - b.min[0] >= 1 &&
    b.max[2] - b.min[2] >= 1 &&
    b.max[1] - b.min[1] >= 1
  );
}
