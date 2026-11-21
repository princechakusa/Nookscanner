/**
 * Adaptive quality (roadmap 7.5, NFR-PERF-05: >= 30 fps median on iPhone 12 / Pixel 6 class).
 * The starting budget comes from what the device reports (budget.ts); this governor corrects it
 * from what the device actually achieves with this scene: when the median frame rate stays below
 * the target it lowers the render resolution first (the biggest lever on phones), then the splat
 * count. It only steps down (no oscillation). When even the lowest step is far too slow it reports
 * "too slow", and the guest is offered the appliance list instead (fallback, quality bar 6).
 * Pure and unit-tested; the viewer feeds it one fps sample per second.
 */
import type { ViewerBudget } from './budget.ts';

export interface QualityStep {
  pixelRatio: number;
  lodSplatCount: number;
}

export interface GovernorOptions {
  /** Median fps to hold (NFR-PERF-05). */
  targetFps?: number;
  /** Below this median on the lowest step, 3D is too slow to be useful. */
  unusableFps?: number;
  /** Samples (seconds) in the median window. */
  window?: number;
  /** Samples to wait after a change before judging again (the new setting must settle). */
  settle?: number;
}

export type GovernorDecision =
  { kind: 'keep' } | { kind: 'step'; step: QualityStep; level: number } | { kind: 'too-slow' };

/** Quality ladder from the device's budget down to a floor every WebGL2 device should manage. */
export function qualitySteps(
  budget: Pick<ViewerBudget, 'pixelRatio' | 'lodSplatCount'>,
): QualityStep[] {
  const steps: QualityStep[] = [
    { pixelRatio: budget.pixelRatio, lodSplatCount: budget.lodSplatCount },
  ];
  const push = (s: QualityStep) => {
    const last = steps[steps.length - 1]!;
    if (s.pixelRatio < last.pixelRatio - 1e-9 || s.lodSplatCount < last.lodSplatCount)
      steps.push(s);
  };
  let { pixelRatio, lodSplatCount } = budget;
  // Resolution first, down to 1x, then splats, then sub-native resolution as a last resort.
  while (pixelRatio > 1) {
    pixelRatio = Math.max(1, Math.round(pixelRatio * 0.75 * 100) / 100);
    push({ pixelRatio, lodSplatCount });
  }
  for (const count of [1_000_000, 600_000, 350_000]) {
    if (count < lodSplatCount) {
      lodSplatCount = count;
      push({ pixelRatio, lodSplatCount });
    }
  }
  push({ pixelRatio: 0.75, lodSplatCount });
  return steps;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export class QualityGovernor {
  readonly steps: QualityStep[];
  private level = 0;
  private samples: number[] = [];
  private wait: number;
  private done = false;
  private readonly o: Required<GovernorOptions>;

  constructor(steps: QualityStep[], options: GovernorOptions = {}) {
    this.steps = steps;
    this.o = { targetFps: 30, unusableFps: 15, window: 5, settle: 3, ...options };
    this.wait = this.o.settle;
  }

  get current(): QualityStep {
    return this.steps[this.level]!;
  }

  get currentLevel(): number {
    return this.level;
  }

  /** Feeds one fps sample (frames in the last second while visible and idle-or-moving). */
  sample(fps: number): GovernorDecision {
    if (this.done || !Number.isFinite(fps)) return { kind: 'keep' };
    if (this.wait > 0) {
      this.wait -= 1;
      return { kind: 'keep' };
    }
    this.samples.push(fps);
    if (this.samples.length > this.o.window) this.samples.shift();
    if (this.samples.length < this.o.window) return { kind: 'keep' };
    const m = median(this.samples);
    if (m >= this.o.targetFps) return { kind: 'keep' };
    if (this.level < this.steps.length - 1) {
      this.level += 1;
      this.samples = [];
      this.wait = this.o.settle;
      return { kind: 'step', step: this.current, level: this.level };
    }
    if (m < this.o.unusableFps) {
      this.done = true;
      return { kind: 'too-slow' };
    }
    return { kind: 'keep' };
  }
}
