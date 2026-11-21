import { describe, expect, it } from 'vitest';
import {
  AlignmentError,
  applyMatrix,
  boundsFromCrop,
  computeAlignment,
  floorPlane,
  measure,
} from './alignment.ts';
import type { Vec3 } from './constraints.ts';

/** A synthetic "reconstruction": the real room scaled by 0.37, rotated and shifted arbitrarily. */
const s = 0.37;
const angle = 0.6; // radians about the Z axis (floor tilted), then shifted
function toScene(p: Vec3): Vec3 {
  const [x, y, z] = [p[0] * s, p[1] * s, p[2] * s];
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  return [c * x - n * y + 1.2, n * x + c * y - 0.7, z + 3.1];
}

// Real room facts: floor at y = 0, a door 0.80 m wide between x = 1.00 and x = 1.80 at z = -2.
const floorReal: [Vec3, Vec3, Vec3] = [
  [0, 0, 0],
  [3, 0, 0],
  [0, 0, -4],
];
const doorA: Vec3 = [1.0, 1.0, -2];
const doorB: Vec3 = [1.8, 1.0, -2];

describe('alignment (roadmap 7.3)', () => {
  const floor = floorReal.map(toScene) as [Vec3, Vec3, Vec3];
  const sceneUp = (() => {
    const o = toScene([0, 0, 0]);
    const u = toScene([0, 1, 0]);
    return [u[0] - o[0], u[1] - o[1], u[2] - o[2]] as Vec3;
  })();
  const al = computeAlignment(
    floor,
    { a: toScene(doorA), b: toScene(doorB), metres: 0.8 },
    sceneUp,
  );

  it('recovers metric scale from one known distance', () => {
    expect(al.scale).toBeCloseTo(1 / s, 6);
  });

  it('puts the floor level at y = 0 and keeps heights', () => {
    for (const p of floorReal) expect(applyMatrix(al.matrix, toScene(p))[1]).toBeCloseTo(0, 6);
    expect(applyMatrix(al.matrix, toScene([2, 2.4, -1]))[1]).toBeCloseTo(2.4, 6);
  });

  it('measures another door within 3% (acceptance criterion)', () => {
    // A second door, 0.90 m wide, elsewhere in the room.
    const d = measure(al, toScene([0.2, 1.1, -3.5]), toScene([0.2, 1.1, -2.6]));
    expect(Math.abs(d - 0.9) / 0.9).toBeLessThan(0.03);
  });

  it('orients the floor normal towards the viewer', () => {
    const { normal } = floorPlane(floor, sceneUp);
    expect(
      normal[0] * sceneUp[0] + normal[1] * sceneUp[1] + normal[2] * sceneUp[2],
    ).toBeGreaterThan(0);
  });

  it('rejects collinear floor points and silly distances', () => {
    expect(() =>
      floorPlane([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ]),
    ).toThrow(AlignmentError);
    expect(() => computeAlignment(floor, { a: [0, 0, 0], b: [0, 0, 0], metres: 0.8 })).toThrow(
      'KNOWN_DISTANCE_INVALID',
    );
    expect(() => computeAlignment(floor, { a: [0, 0, 0], b: [1, 0, 0], metres: 0 })).toThrow(
      'KNOWN_DISTANCE_INVALID',
    );
  });

  it('turns a crop box into camera bounds with the floor at 0', () => {
    expect(boundsFromCrop([4, 2.7, 3], [-2, -0.3, -5])).toEqual({
      min: [-2, 0, -5],
      max: [4, 2.7, 3],
    });
  });
});
