import { describe, expect, it } from 'vitest';
import { constrainPosition, validBounds, type SceneBounds } from './constraints.ts';

// A 6 m x 2.6 m x 8 m apartment box with the floor at y = 0.
const box: SceneBounds = { min: [-3, 0, -4], max: [3, 2.6, 4] };

describe('constrainPosition', () => {
  it('keeps a position that is already inside', () => {
    expect(constrainPosition([0, 1.5, 0], box)).toEqual([0, 1.5, 0]);
  });

  it('never lets the camera under the floor (no floor clipping)', () => {
    expect(constrainPosition([0, -2, 0], box)[1]).toBeCloseTo(0.4);
    expect(constrainPosition([0, 0.1, 0], box)[1]).toBeCloseTo(0.4);
  });

  it('stays below the ceiling and the maximum eye height', () => {
    expect(constrainPosition([0, 9, 0], box)[1]).toBeCloseTo(2.2);
    const low: SceneBounds = { min: [-3, 0, -4], max: [3, 2.0, 4] };
    expect(constrainPosition([0, 9, 0], low)[1]).toBeCloseTo(1.85);
  });

  it('keeps a margin from the walls', () => {
    const [x, , z] = constrainPosition([10, 1.5, -10], box);
    expect(x).toBeCloseTo(2.85);
    expect(z).toBeCloseTo(-3.85);
  });

  it('does nothing without bounds', () => {
    expect(constrainPosition([50, -9, 50], undefined)).toEqual([50, -9, 50]);
  });

  it('centres in a box too small for the margin instead of producing NaN', () => {
    const tiny: SceneBounds = { min: [0, 0, 0], max: [0.2, 3, 0.2] };
    const [x, , z] = constrainPosition([5, 1, 5], tiny);
    expect(x).toBeCloseTo(0.1);
    expect(z).toBeCloseTo(0.1);
  });
});

describe('validBounds', () => {
  it('rejects missing, non-finite or degenerate boxes', () => {
    expect(validBounds(box)).toBe(true);
    expect(validBounds(undefined)).toBe(false);
    expect(validBounds({ min: [0, 0, 0], max: [Number.NaN, 2, 2] })).toBe(false);
    expect(validBounds({ min: [0, 0, 0], max: [0.5, 2.5, 4] })).toBe(false);
  });
});
