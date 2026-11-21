import { describe, expect, it } from 'vitest';
import { QualityGovernor, qualitySteps } from './governor.ts';

describe('qualitySteps', () => {
  it('lowers resolution to 1x first, then splats, then sub-native resolution', () => {
    expect(qualitySteps({ pixelRatio: 2, lodSplatCount: 2_500_000 })).toEqual([
      { pixelRatio: 2, lodSplatCount: 2_500_000 },
      { pixelRatio: 1.5, lodSplatCount: 2_500_000 },
      { pixelRatio: 1.13, lodSplatCount: 2_500_000 },
      { pixelRatio: 1, lodSplatCount: 2_500_000 },
      { pixelRatio: 1, lodSplatCount: 1_000_000 },
      { pixelRatio: 1, lodSplatCount: 600_000 },
      { pixelRatio: 1, lodSplatCount: 350_000 },
      { pixelRatio: 0.75, lodSplatCount: 350_000 },
    ]);
  });
  it('never steps up from a low budget and has no duplicate steps', () => {
    const steps = qualitySteps({ pixelRatio: 1, lodSplatCount: 500_000 });
    expect(steps).toEqual([
      { pixelRatio: 1, lodSplatCount: 500_000 },
      { pixelRatio: 1, lodSplatCount: 350_000 },
      { pixelRatio: 0.75, lodSplatCount: 350_000 },
    ]);
  });
});

describe('QualityGovernor', () => {
  const steps = qualitySteps({ pixelRatio: 1.5, lodSplatCount: 1_000_000 });
  const feed = (g: QualityGovernor, fps: number[]) => fps.map((f) => g.sample(f));

  it('keeps the budget when the device holds 30 fps (median, so single drops do not count)', () => {
    const g = new QualityGovernor(steps);
    const out = feed(g, [0, 0, 0, 60, 58, 12, 61, 59, 60, 57, 25, 60]);
    expect(out.every((d) => d.kind === 'keep')).toBe(true);
    expect(g.currentLevel).toBe(0);
  });

  it('steps down one level at a time and waits for the new setting to settle', () => {
    const g = new QualityGovernor(steps);
    const out = feed(g, [99, 99, 99, 20, 20, 20, 20, 20]);
    expect(out.slice(0, 7).every((d) => d.kind === 'keep')).toBe(true);
    expect(out[7]).toEqual({ kind: 'step', step: steps[1], level: 1 });
    // Settling: the next 3 samples are ignored, then 5 more are needed.
    expect(feed(g, [20, 20, 20, 20, 20, 20, 20]).every((d) => d.kind === 'keep')).toBe(true);
    expect(g.sample(20)).toMatchObject({ kind: 'step', level: 2 });
  });

  it('reports too slow only on the lowest step and only once', () => {
    const g = new QualityGovernor(steps, { settle: 0, window: 1 });
    const out = feed(g, Array(steps.length + 2).fill(5));
    const kinds = out.map((d) => d.kind);
    expect(kinds.filter((k) => k === 'step')).toHaveLength(steps.length - 1);
    expect(kinds.filter((k) => k === 'too-slow')).toHaveLength(1);
    expect(kinds[kinds.length - 1]).toBe('keep');
  });

  it('stays on the lowest step when it is slow but usable', () => {
    const g = new QualityGovernor(steps, { settle: 0, window: 1 });
    const out = feed(g, Array(steps.length + 3).fill(22));
    expect(out.some((d) => d.kind === 'too-slow')).toBe(false);
    expect(g.current).toEqual(steps[steps.length - 1]);
  });

  it('ignores missing samples', () => {
    const g = new QualityGovernor(steps, { settle: 0, window: 1 });
    expect(g.sample(Number.NaN)).toEqual({ kind: 'keep' });
  });
});
