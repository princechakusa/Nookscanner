/**
 * Reconstruction quality report assessment (docs/3D_QUALITY_BAR.md sections 3, 4 and 7).
 * TARGETS ARE INITIAL AND UNCALIBRATED: the quality bar sets real targets from the first real
 * apartment's best result. They are shown as guidance; the manager decides, and the decision and
 * checklist are stored (review_processing_result).
 */
import { z } from 'zod';

export const QUALITY_TARGETS = {
  /** Share of input frames whose camera was placed by SfM (quality bar s3/s4; pipeline gate 0.8). */
  registeredRatio: { pass: 0.9, warn: 0.8 },
  /** Mean reprojection error in pixels (lower is better). */
  reprojectionErrorPx: { pass: 1.0, warn: 1.5 },
  /** Held-out PSNR in dB (higher is better). Typical well-captured interiors: 25-30 dB. */
  psnr: { pass: 25, warn: 22 },
  /** Held-out SSIM (higher is better). */
  ssim: { pass: 0.85, warn: 0.75 },
  /** Held-out LPIPS (lower is better). */
  lpips: { pass: 0.25, warn: 0.35 },
} as const;
export const TARGETS_CALIBRATED = false;

export const ARTEFACT_CHECKS = [
  'floaters',
  'holes',
  'smeared_walls',
  'mirror_ghosting',
  'blown_windows',
  'doorway_seams',
  'missing_rooms',
  'personal_items',
] as const;
export type ArtefactCheck = (typeof ARTEFACT_CHECKS)[number];

export const ARTEFACT_LABELS: Record<ArtefactCheck, string> = {
  floaters: 'Floating blobs in the air',
  holes: 'Holes or missing surfaces',
  smeared_walls: 'Smeared or blurry walls',
  mirror_ghosting: 'Ghost images in mirrors or glass',
  blown_windows: 'Windows burned out to white',
  doorway_seams: 'Rooms do not line up at doorways',
  missing_rooms: 'A room is missing or unreachable',
  personal_items: 'Personal items that should not be shown',
};

const num = z.number().finite().nullable().optional();
export const qualityReportSchema = z
  .object({
    sfm: z
      .object({
        registered_ratio: num,
        registered_images: num,
        input_images: num,
        mean_reprojection_error_px: num,
      })
      .partial()
      .optional(),
    heldout: z
      .object({ frames: num, psnr: num, ssim: num, lpips: num, gaussians: num })
      .partial()
      .optional(),
    package: z
      .object({
        sog_bytes: num,
        stream_bytes: num,
        within_first_lod_budget: z.boolean().optional(),
        within_total_budget: z.boolean().optional(),
      })
      .partial()
      .optional(),
    flags: z.array(z.string()).optional(),
  })
  .loose();
export type QualityReport = z.infer<typeof qualityReportSchema>;

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'missing';
export interface QualityItem {
  key: 'registeredRatio' | 'reprojectionErrorPx' | 'psnr' | 'ssim' | 'lpips';
  label: string;
  value: number | null;
  display: string;
  target: string;
  status: CheckStatus;
}

const higher = (v: number, t: { pass: number; warn: number }): CheckStatus =>
  v >= t.pass ? 'pass' : v >= t.warn ? 'warn' : 'fail';
const lower = (v: number, t: { pass: number; warn: number }): CheckStatus =>
  v <= t.pass ? 'pass' : v <= t.warn ? 'warn' : 'fail';

/** Turns a stored report into display rows with a status per metric, plus an overall status. */
export function assessReport(raw: unknown): {
  items: QualityItem[];
  overall: CheckStatus;
  flags: string[];
  frames: { heldout: number | null; registered: number | null; input: number | null };
} {
  const parsed = qualityReportSchema.safeParse(raw);
  const r: QualityReport = parsed.success ? parsed.data : {};
  const v = (x: number | null | undefined) => (typeof x === 'number' ? x : null);
  const T = QUALITY_TARGETS;
  const rows: Array<
    Omit<QualityItem, 'status' | 'display'> & {
      status: (n: number) => CheckStatus;
      fmt: (n: number) => string;
    }
  > = [
    {
      key: 'registeredRatio',
      label: 'Cameras placed',
      value: v(r.sfm?.registered_ratio),
      target: `≥ ${T.registeredRatio.pass * 100}%`,
      status: (n) => higher(n, T.registeredRatio),
      fmt: (n) => `${(n * 100).toFixed(1)}%`,
    },
    {
      key: 'reprojectionErrorPx',
      label: 'Reprojection error',
      value: v(r.sfm?.mean_reprojection_error_px),
      target: `≤ ${T.reprojectionErrorPx.pass} px`,
      status: (n) => lower(n, T.reprojectionErrorPx),
      fmt: (n) => `${n.toFixed(2)} px`,
    },
    {
      key: 'psnr',
      label: 'Sharpness vs real photos (PSNR)',
      value: v(r.heldout?.psnr),
      target: `≥ ${T.psnr.pass} dB`,
      status: (n) => higher(n, T.psnr),
      fmt: (n) => `${n.toFixed(2)} dB`,
    },
    {
      key: 'ssim',
      label: 'Structure match (SSIM)',
      value: v(r.heldout?.ssim),
      target: `≥ ${T.ssim.pass}`,
      status: (n) => higher(n, T.ssim),
      fmt: (n) => n.toFixed(3),
    },
    {
      key: 'lpips',
      label: 'Perceived difference (LPIPS)',
      value: v(r.heldout?.lpips),
      target: `≤ ${T.lpips.pass}`,
      status: (n) => lower(n, T.lpips),
      fmt: (n) => n.toFixed(3),
    },
  ];
  const items: QualityItem[] = rows.map(({ status, fmt, ...row }) => ({
    ...row,
    status: row.value === null ? 'missing' : status(row.value),
    display: row.value === null ? 'Not measured' : fmt(row.value),
  }));
  const order: CheckStatus[] = ['fail', 'missing', 'warn', 'pass'];
  const overall = order.find((s) => items.some((i) => i.status === s)) ?? 'pass';
  return {
    items,
    overall,
    flags: r.flags ?? [],
    frames: {
      heldout: v(r.heldout?.frames),
      registered: v(r.sfm?.registered_images),
      input: v(r.sfm?.input_images),
    },
  };
}

export const reviewSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    checklist: z.partialRecord(z.enum(ARTEFACT_CHECKS), z.boolean()),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((r) => r.decision === 'approved' || (r.notes ?? '').length > 0, {
    message: 'NOTES_REQUIRED',
    path: ['notes'],
  });
