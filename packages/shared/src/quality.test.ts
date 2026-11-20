import { describe, expect, it } from 'vitest';
import { qualityThresholds } from './device-tiers.ts';
import {
  QualityMonitor,
  downsample,
  exposureStats,
  frameQuality,
  laplacianVariance,
  meanAbsDiff,
  overlap,
  type GrayFrame,
  type QualityIssue,
} from './quality.ts';

const W = 320;
const H = 180;

function make(fn: (x: number, y: number) => number, w = W, h = H): GrayFrame {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      data[y * w + x] = Math.max(0, Math.min(255, Math.round(fn(x, y))));
  return { width: w, height: h, data };
}

/** Textured "room": edges at several scales, mid-grey. */
const scene = (dx = 0) =>
  make(
    (x, y) =>
      128 +
      60 * Math.sign(Math.sin((x + dx) / 6)) * Math.sign(Math.sin(y / 9)) +
      20 * Math.sin((x + dx) / 23),
  );

/** Box blur of radius r (what camera shake or defocus does). */
function blur(f: GrayFrame, r: number): GrayFrame {
  return make(
    (x, y) => {
      let s = 0;
      let n = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(f.height - 1, y + r); yy += 1)
        for (let xx = Math.max(0, x - r); xx <= Math.min(f.width - 1, x + r); xx += 1) {
          s += f.data[yy * f.width + xx]!;
          n += 1;
        }
      return s / n;
    },
    f.width,
    f.height,
  );
}

const t = qualityThresholds('T1');

describe('metrics', () => {
  it('sharp frames have a much higher Laplacian variance than blurred ones', () => {
    const sharp = laplacianVariance(scene());
    const soft = laplacianVariance(blur(scene(), 4));
    expect(sharp).toBeGreaterThan(t.minLaplacianVariance * 5);
    expect(soft).toBeLessThan(t.minLaplacianVariance);
  });

  it('exposure statistics find dark, bright and clipped frames', () => {
    expect(exposureStats(make(() => 20)).meanLuma).toBe(20);
    const window = make((x) => (x < 80 ? 255 : 120));
    expect(exposureStats(window).clippedHigh).toBeCloseTo(0.25, 2);
    expect(exposureStats(make(() => 0)).clippedLow).toBe(1);
  });

  it('frame difference grows with camera movement', () => {
    const still = meanAbsDiff(scene(0), scene(1));
    const fast = meanAbsDiff(scene(0), scene(40));
    expect(still).toBeLessThan(t.maxMeanAbsDiff);
    expect(fast).toBeGreaterThan(t.maxMeanAbsDiff);
    expect(
      meanAbsDiff(
        scene(),
        make(() => 0, 10, 10),
      ),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('overlap is high for a small shift and low for a different view', () => {
    expect(overlap(scene(0), scene(2))).toBeGreaterThan(t.minDoorwayOverlap);
    const other = make((x, y) => 128 + 90 * Math.sin(x / 3 + y / 2));
    expect(overlap(scene(0), other)).toBeLessThan(t.minDoorwayOverlap);
    expect(
      overlap(
        make(() => 50),
        make(() => 50),
      ),
    ).toBe(0);
  });

  it('downsample keeps the aspect ratio and averages', () => {
    const big = make((x) => (x % 2 ? 200 : 100), 640, 360);
    const small = downsample(big, 320);
    expect([small.width, small.height]).toEqual([320, 180]);
    expect(small.data[0]).toBe(150);
    expect(downsample(small, 640)).toBe(small);
  });
});

describe('frameQuality', () => {
  it('a sharp, well-lit, steady frame has no issues', () => {
    expect(frameQuality(scene(0), scene(1), t).issues).toEqual([]);
  });

  it('reports the cause: dark (not also blurry), bright, blurry, fast', () => {
    expect(
      frameQuality(
        make(() => 15),
        null,
        t,
      ).issues,
    ).toEqual(['TOO_DARK']);
    expect(
      frameQuality(
        make((x) => (x < 100 ? 255 : 230)),
        null,
        t,
      ).issues,
    ).toContain('TOO_BRIGHT');
    expect(frameQuality(blur(scene(), 4), null, t).issues).toEqual(['TOO_BLURRY']);
    expect(frameQuality(scene(40), scene(0), t).issues).toEqual(['MOVING_TOO_FAST']);
  });

  it('analyses full-resolution frames at the analysis width (device-independent)', () => {
    const big = make(
      (x, y) => 128 + 60 * Math.sign(Math.sin(x / 12)) * Math.sign(Math.sin(y / 18)),
      1280,
      720,
    );
    expect(frameQuality(big, null, t).issues).toEqual([]);
  });

  it('per-tier thresholds come from the shared tier table', () => {
    expect(qualityThresholds('T4').minLaplacianVariance).toBeLessThan(
      qualityThresholds('T1').minLaplacianVariance,
    );
    expect(qualityThresholds(null)).toEqual(qualityThresholds('T1'));
  });
});

describe('QualityMonitor', () => {
  const feed = (m: QualityMonitor, frames: QualityIssue[][]) => frames.map((f) => m.push(f)).at(-1);

  it('shows an issue only after it persists (no flicker) and clears when it stops', () => {
    const m = new QualityMonitor(t);
    expect(feed(m, [['TOO_DARK'], [], ['TOO_DARK']])).toEqual([]);
    expect(feed(m, Array(12).fill(['TOO_DARK']))).toEqual(['TOO_DARK']);
    expect(feed(m, Array(15).fill([]))).toEqual([]);
  });

  it('summarises the share of frames with each issue', () => {
    const m = new QualityMonitor(t);
    feed(m, [['TOO_BLURRY'], [], [], []]);
    expect(m.summary()).toMatchObject({ frames: 4, TOO_BLURRY: 0.25, TOO_DARK: 0 });
  });
});
