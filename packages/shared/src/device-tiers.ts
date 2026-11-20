/**
 * Device tiers and capture profiles (Stage 5.3, docs/3D_QUALITY_BAR.md section 1b). The data lives
 * in `device-tiers.json`, shared with the Python worker's validation gates. A tier is chosen from
 * the capabilities a device reports (camera formats, codecs, stabilisation), never from its model
 * name, so new and unknown phones are handled the same way as known ones.
 */
import { z } from 'zod';
import raw from './device-tiers.json' with { type: 'json' };

const tierSchema = z.object({
  id: z.enum(['T1', 'T2', 'T3', 'T4', 'T5']),
  name: z.string().min(1),
  examples: z.string(),
  requires: z
    .object({
      minShortSide: z.number().int().positive(),
      minFps: z.number().positive(),
      hevc: z.boolean(),
      stabilization: z.boolean(),
    })
    .optional(),
  capture: z
    .object({ shortSide: z.number().int().positive(), fps: z.number().positive() })
    .optional(),
  uploadOnly: z.boolean().optional(),
  recommendedShortSide: z.number().int().positive(),
});

const tableSchema = z.object({
  version: z.literal(1),
  note: z.string(),
  hardMinimum: z.object({ shortSide: z.number().int().positive(), fps: z.number().positive() }),
  tiers: z.array(tierSchema).length(5),
});

/** Parsed once at import: a malformed table fails loudly in tests and builds. */
export const DEVICE_TIERS = tableSchema.parse(raw);
export type DeviceTier = z.infer<typeof tierSchema>;
export type TierId = DeviceTier['id'];

/** What the capture app can read from the camera API (VisionCamera formats) and the OS. */
export interface DeviceCapabilities {
  /** Video formats the back main camera offers: frame size and maximum fps at that size. */
  videoFormats: ReadonlyArray<{ width: number; height: number; maxFps: number }>;
  supportsHevc?: boolean;
  /** Optical or standard video stabilisation is available on the back camera. */
  supportsStabilization?: boolean;
}

const shortSide = (f: { width: number; height: number }) => Math.min(f.width, f.height);

/**
 * Highest capture tier the device meets, or `null` when it is below the hard minimum (the app then
 * explains why and offers video upload instead). Missing capabilities count as absent, so an
 * unknown device is placed conservatively, never refused for lacking a model entry.
 */
export function selectCaptureTier(caps: DeviceCapabilities | null | undefined): DeviceTier | null {
  const formats = (caps?.videoFormats ?? []).filter(
    (f) =>
      Number.isFinite(f.width) &&
      Number.isFinite(f.height) &&
      Number.isFinite(f.maxFps) &&
      f.maxFps > 0,
  );
  for (const tier of DEVICE_TIERS.tiers) {
    const req = tier.requires;
    if (!req || tier.uploadOnly) continue;
    const format = formats.some((f) => shortSide(f) >= req.minShortSide && f.maxFps >= req.minFps);
    if (!format) continue;
    if (req.hevc && !caps?.supportsHevc) continue;
    if (req.stabilization && !caps?.supportsStabilization) continue;
    return tier;
  }
  return null;
}

export interface CaptureProfile {
  tier: TierId;
  width: number;
  height: number;
  fps: number;
  codec: 'hevc' | 'h264';
  /** SDR: HDR tone mapping differs per phone and makes rooms inconsistent between captures. */
  hdr: false;
  /** Standard stabilisation only; "cinematic"/extended modes crop and warp the geometry. */
  stabilization: 'standard' | 'off';
  lockExposureFocusWhiteBalance: true;
  orientation: 'landscape';
}

/**
 * Concrete recording settings for a device: the largest offered format within the tier's capture
 * size (landscape), at the tier's fps or the closest the device offers above the hard minimum.
 */
export function captureProfile(caps: DeviceCapabilities): CaptureProfile | null {
  const tier = selectCaptureTier(caps);
  if (!tier?.capture) return null;
  const target = tier.capture;
  const candidates = caps.videoFormats
    .filter(
      (f) => shortSide(f) <= target.shortSide && shortSide(f) >= DEVICE_TIERS.hardMinimum.shortSide,
    )
    .filter((f) => f.maxFps >= DEVICE_TIERS.hardMinimum.fps)
    .sort((a, b) => shortSide(b) - shortSide(a) || b.maxFps - a.maxFps);
  const best = candidates[0];
  if (!best) return null;
  const long = Math.max(best.width, best.height);
  return {
    tier: tier.id,
    width: long,
    height: shortSide(best),
    fps: Math.min(target.fps, best.maxFps),
    codec: caps.supportsHevc ? 'hevc' : 'h264',
    hdr: false,
    stabilization: caps.supportsStabilization ? 'standard' : 'off',
    lockExposureFocusWhiteBalance: true,
    orientation: 'landscape',
  };
}

/** Tier for validating an uploaded file: the capture tier when known, otherwise T5. */
export function uploadTier(captureTier: TierId | null | undefined): DeviceTier {
  const found = DEVICE_TIERS.tiers.find((t) => t.id === captureTier);
  return found ?? DEVICE_TIERS.tiers.find((t) => t.id === 'T5')!;
}
