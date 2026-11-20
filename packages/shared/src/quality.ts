/**
 * On-device capture quality metrics (Stage 5.5, docs/3D_QUALITY_BAR.md section 3): blur, exposure,
 * motion speed and doorway overlap, computed on small grayscale frames (luma plane downsampled to
 * `analysisWidth`) so thresholds compare across devices. Pure functions; the capture app feeds them
 * from a frame output, and they are unit-tested on synthetic frames here.
 */
import type { QualityThresholds } from './device-tiers.ts';

export interface GrayFrame {
  width: number;
  height: number;
  /** Row-major luma, 0..255, length width * height. */
  data: Uint8Array | Uint8ClampedArray;
}

/** Box-filter downsample to `targetWidth` (keeps the aspect ratio). */
export function downsample(frame: GrayFrame, targetWidth: number): GrayFrame {
  if (frame.width <= targetWidth) return frame;
  const scale = frame.width / targetWidth;
  const width = targetWidth;
  const height = Math.max(1, Math.round(frame.height / scale));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.min(frame.height, Math.floor((y + 1) * scale));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(frame.width, Math.floor((x + 1) * scale));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * frame.width;
        for (let xx = x0; xx < x1; xx += 1) {
          sum += frame.data[row + xx]!;
          n += 1;
        }
      }
      out[y * width + x] = n ? Math.round(sum / n) : 0;
    }
  }
  return { width, height, data: out };
}

/** Variance of the 4-neighbour Laplacian: low values mean a blurry frame. */
export function laplacianVariance(f: GrayFrame): number {
  const { width: w, height: h, data: d } = f;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const v = d[i - w]! + d[i + w]! + d[i - 1]! + d[i + 1]! - 4 * d[i]!;
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export interface ExposureStats {
  meanLuma: number;
  /** Fraction of pixels at or above 250 (blown highlights, e.g. windows). */
  clippedHigh: number;
  /** Fraction of pixels at or below 5 (crushed shadows). */
  clippedLow: number;
}

export function exposureStats(f: GrayFrame): ExposureStats {
  const n = f.data.length || 1;
  let sum = 0;
  let hi = 0;
  let lo = 0;
  for (const v of f.data) {
    sum += v;
    if (v >= 250) hi += 1;
    else if (v <= 5) lo += 1;
  }
  return { meanLuma: sum / n, clippedHigh: hi / n, clippedLow: lo / n };
}

/** Mean absolute difference between consecutive analysis frames: a proxy for walking speed. */
export function meanAbsDiff(a: GrayFrame, b: GrayFrame): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 1) sum += Math.abs(a.data[i]! - b.data[i]!);
  return sum / (a.data.length || 1);
}

/**
 * Normalised cross-correlation (-1..1) between two keyframes: how much of the previous room is
 * still in view while crossing a doorway. Uniform frames (no texture) give 0.
 */
export function overlap(a: GrayFrame, b: GrayFrame): number {
  if (a.width !== b.width || a.height !== b.height || !a.data.length) return 0;
  const n = a.data.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += a.data[i]!;
    mb += b.data[i]!;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a.data[i]! - ma;
    const db = b.data[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va && vb ? cov / Math.sqrt(va * vb) : 0;
}

export type QualityIssue = 'TOO_BLURRY' | 'TOO_DARK' | 'TOO_BRIGHT' | 'MOVING_TOO_FAST';

export interface FrameQuality {
  sharpness: number;
  exposure: ExposureStats;
  motion: number | null;
  issues: QualityIssue[];
}

/** Metrics and issues for one analysis frame (and the previous one, for motion). */
export function frameQuality(
  frame: GrayFrame,
  previous: GrayFrame | null,
  t: QualityThresholds,
): FrameQuality {
  const f = downsample(frame, t.analysisWidth);
  const p = previous ? downsample(previous, t.analysisWidth) : null;
  const sharpness = laplacianVariance(f);
  const exposure = exposureStats(f);
  const motion = p ? meanAbsDiff(p, f) : null;
  const issues: QualityIssue[] = [];
  if (exposure.meanLuma < t.minMeanLuma) issues.push('TOO_DARK');
  else if (exposure.meanLuma > t.maxMeanLuma || exposure.clippedHigh > t.maxClippedFraction)
    issues.push('TOO_BRIGHT');
  // A dark frame is also soft; report the cause, not both.
  if (sharpness < t.minLaplacianVariance && !issues.includes('TOO_DARK')) issues.push('TOO_BLURRY');
  if (motion !== null && motion > t.maxMeanAbsDiff) issues.push('MOVING_TOO_FAST');
  return { sharpness, exposure, motion, issues };
}

export const QUALITY_HINTS: Record<QualityIssue, string> = {
  TOO_BLURRY: 'Image is blurry: slow down and hold the phone steady.',
  TOO_DARK: 'Too dark: switch on the room lights or open the blinds.',
  TOO_BRIGHT: 'Too bright: avoid pointing at windows or sunlight.',
  MOVING_TOO_FAST: 'Moving too fast: walk and turn more slowly.',
};

/**
 * Rolling window with hysteresis so hints do not flicker: an issue is shown once it appears in at
 * least `triggerFraction` of the last `windowFrames` analysed frames. Also keeps per-capture totals
 * for the review screen and the stored quality summary.
 */
export class QualityMonitor {
  private window: QualityIssue[][] = [];
  private totals: Record<QualityIssue, number> = {
    TOO_BLURRY: 0,
    TOO_DARK: 0,
    TOO_BRIGHT: 0,
    MOVING_TOO_FAST: 0,
  };
  private frames = 0;

  constructor(private readonly t: QualityThresholds) {}

  push(issues: QualityIssue[]): QualityIssue[] {
    this.frames += 1;
    for (const i of issues) this.totals[i] += 1;
    this.window.push(issues);
    if (this.window.length > this.t.windowFrames) this.window.shift();
    return this.active();
  }

  active(): QualityIssue[] {
    if (this.window.length < Math.ceil(this.t.windowFrames / 2)) return [];
    const need = this.t.triggerFraction * this.window.length;
    return (Object.keys(this.totals) as QualityIssue[]).filter(
      (k) => this.window.filter((w) => w.includes(k)).length >= need,
    );
  }

  /** Fraction of analysed frames with each issue (e.g. blurry frames, target below 5 %). */
  summary(): { frames: number } & Record<QualityIssue, number> {
    const n = this.frames || 1;
    return {
      frames: this.frames,
      TOO_BLURRY: this.totals.TOO_BLURRY / n,
      TOO_DARK: this.totals.TOO_DARK / n,
      TOO_BRIGHT: this.totals.TOO_BRIGHT / n,
      MOVING_TOO_FAST: this.totals.MOVING_TOO_FAST / n,
    };
  }
}
