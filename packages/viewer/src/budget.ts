/**
 * Rendering budget per guest device (docs/3D_QUALITY_BAR.md section 1b and 6): chosen from what
 * the browser reports about the device, never from one phone model. Pure and unit-tested; the
 * numbers are initial and are calibrated with measurements on real devices (Phase 7.5).
 */

export interface DeviceCapabilities {
  /** navigator.deviceMemory in GB (Chromium only; undefined on Safari/Firefox). */
  deviceMemoryGb?: number | undefined;
  /** navigator.hardwareConcurrency. */
  cores?: number | undefined;
  /** Touch-first phone/tablet (from the user agent / pointer media query). */
  mobile: boolean;
  /** WebGL2 MAX_TEXTURE_SIZE. */
  maxTextureSize?: number | undefined;
  /** window.devicePixelRatio. */
  devicePixelRatio: number;
  /** navigator.connection.saveData. */
  saveData?: boolean | undefined;
}

export type ViewerTier = 'low' | 'mid' | 'high';

export interface ViewerBudget {
  tier: ViewerTier;
  /** Target number of splats drawn per frame (Spark lodSplatCount). */
  lodSplatCount: number;
  /** Render resolution cap (pixel ratio), the biggest lever for fill rate on phones. */
  pixelRatio: number;
  /** Minimum on-screen splat size in pixels (Spark targetPixels-like quality knob). */
  minSplatPixels: number;
}

export const BUDGETS: Record<
  ViewerTier,
  Omit<ViewerBudget, 'pixelRatio' | 'tier'> & { maxPixelRatio: number }
> = {
  low: { lodSplatCount: 500_000, maxPixelRatio: 1, minSplatPixels: 2 },
  mid: { lodSplatCount: 1_000_000, maxPixelRatio: 1.5, minSplatPixels: 1.5 },
  high: { lodSplatCount: 2_500_000, maxPixelRatio: 2, minSplatPixels: 1 },
};

/** Classifies the device. Unknown values fall back to the safer (lower) tier, never higher. */
export function viewerTier(c: DeviceCapabilities): ViewerTier {
  const memory = c.deviceMemoryGb;
  const cores = c.cores ?? 4;
  const tex = c.maxTextureSize ?? 4096;
  if (c.saveData) return 'low';
  if ((memory !== undefined && memory <= 2) || cores <= 2 || tex < 4096) return 'low';
  if (!c.mobile) {
    return (memory === undefined || memory >= 8) && cores >= 8 && tex >= 8192 ? 'high' : 'mid';
  }
  // Phones: iOS reports no deviceMemory; recent iPhones have >= 6 cores and 16k textures.
  if ((memory === undefined || memory >= 6) && cores >= 6 && tex >= 16384) return 'mid';
  return memory !== undefined && memory < 4 ? 'low' : 'mid';
}

export function chooseBudget(c: DeviceCapabilities, override?: ViewerTier): ViewerBudget {
  const tier = override ?? viewerTier(c);
  const b = BUDGETS[tier];
  return {
    tier,
    lodSplatCount: b.lodSplatCount,
    minSplatPixels: b.minSplatPixels,
    pixelRatio: Math.max(1, Math.min(c.devicePixelRatio || 1, b.maxPixelRatio)),
  };
}

/** Reads capabilities in a browser (guarded so it also runs in tests and old browsers). */
export function readCapabilities(gl?: WebGL2RenderingContext | null): DeviceCapabilities {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const ua = nav.userAgent ?? '';
  const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false;
  return {
    deviceMemoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    mobile: coarse || /Android|iPhone|iPad|Mobile/i.test(ua),
    maxTextureSize: gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : undefined,
    devicePixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    saveData: nav.connection?.saveData,
  };
}
