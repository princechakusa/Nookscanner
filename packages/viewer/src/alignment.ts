/**
 * Scene alignment (roadmap 7.3, DESIGN_SYSTEM 7 "Align floor, Set scale, Crop"):
 * a reconstruction comes out in arbitrary units and orientation. The manager taps three points on
 * the floor (floor plane -> rotation so the floor is level at y = 0), measures one known distance
 * such as a door width (-> metres), and sets a crop box (-> camera bounds, viewer constraints).
 * Pure math with plain arrays, unit-tested; the result is stored with the scene version and
 * applied by the viewer as one 4x4 matrix.
 */
import type { SceneBounds, Vec3 } from './constraints.ts';

export type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]; // column-major, like three.js Matrix4.elements

export interface Alignment {
  /** Scene -> world: scale, then rotate (floor normal to +Y), then translate (floor to y = 0). */
  matrix: Mat4;
  /** Metres per scene unit. */
  scale: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export class AlignmentError extends Error {}

/**
 * Plane through three floor points: unit normal oriented towards `up` (the current camera "up"
 * in scene space, so the floor faces the viewer) and the offset d with n·p = d.
 */
export function floorPlane(
  points: [Vec3, Vec3, Vec3],
  up: Vec3 = [0, 1, 0],
): { normal: Vec3; d: number } {
  const [a, b, c] = points;
  const n = cross(sub(b, a), sub(c, a));
  const area = len(n) / 2;
  const span = Math.max(len(sub(b, a)), len(sub(c, a)), len(sub(c, b)));
  // Points (almost) on one line cannot define a floor: ask for three points spread out.
  if (!Number.isFinite(area) || span === 0 || area < 0.01 * span * span) {
    throw new AlignmentError('FLOOR_POINTS_COLLINEAR');
  }
  let normal = norm(n);
  if (dot(normal, up) < 0) normal = [-normal[0], -normal[1], -normal[2]];
  return { normal, d: dot(normal, a) };
}

/** Rotation matrix (3x3, row-major) turning unit vector `from` onto +Y (Rodrigues). */
function rotationToUp(from: Vec3): number[] {
  const to: Vec3 = [0, 1, 0];
  const c = dot(from, to);
  if (c > 1 - 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (c < -1 + 1e-9) return [1, 0, 0, 0, -1, 0, 0, 0, -1]; // 180 degrees about X
  const v = cross(from, to);
  const s = len(v);
  const k = norm(v);
  const t = 1 - c;
  const [x, y, z] = k;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/**
 * Builds the alignment: floor level at y = 0 and metric scale from one known distance between
 * two scene points (e.g. the two sides of a door, measured with a tape: 0.80 m).
 */
export function computeAlignment(
  floor: [Vec3, Vec3, Vec3],
  known: { a: Vec3; b: Vec3; metres: number },
  up: Vec3 = [0, 1, 0],
): Alignment {
  const sceneDistance = len(sub(known.a, known.b));
  if (!(known.metres > 0.05 && known.metres < 50) || !(sceneDistance > 0)) {
    throw new AlignmentError('KNOWN_DISTANCE_INVALID');
  }
  const scale = known.metres / sceneDistance;
  const { normal, d } = floorPlane(floor, up);
  const r = rotationToUp(normal);
  // world = R * (s * p) + t, with the floor (n·p = d) mapped to y = 0  =>  t = (0, -s*d, 0).
  const ty = -scale * d;
  const m = (row: number, col: number) => scale * r[row * 3 + col]!;
  return {
    scale,
    matrix: [
      m(0, 0),
      m(1, 0),
      m(2, 0),
      0,
      m(0, 1),
      m(1, 1),
      m(2, 1),
      0,
      m(0, 2),
      m(1, 2),
      m(2, 2),
      0,
      0,
      ty,
      0,
      1,
    ],
  };
}

/** Applies a column-major 4x4 matrix to a point. */
export function applyMatrix(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Distance in metres between two scene points after alignment (for checking a measurement). */
export function measure(alignment: Alignment, a: Vec3, b: Vec3): number {
  return len(sub(applyMatrix(alignment.matrix, a), applyMatrix(alignment.matrix, b)));
}

/** Crop box in aligned (world) coordinates -> camera bounds, floor at y = 0. */
export function boundsFromCrop(min: Vec3, max: Vec3): SceneBounds {
  return {
    min: [Math.min(min[0], max[0]), 0, Math.min(min[2], max[2])],
    max: [Math.max(min[0], max[0]), Math.max(min[1], max[1], 2.0), Math.max(min[2], max[2])],
  };
}
