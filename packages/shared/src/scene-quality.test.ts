import { describe, expect, it } from 'vitest';
import { assessReport, reviewSchema, TARGETS_CALIBRATED } from './scene-quality.ts';

const good = {
  sfm: {
    registered_ratio: 0.97,
    registered_images: 291,
    input_images: 300,
    mean_reprojection_error_px: 0.62,
  },
  heldout: { frames: 30, psnr: 27.4, ssim: 0.9, lpips: 0.18, gaussians: 2_100_000 },
  flags: [],
};

describe('assessReport', () => {
  it('passes a good report and formats values', () => {
    const a = assessReport(good);
    expect(a.overall).toBe('pass');
    expect(a.items.map((i) => [i.key, i.status, i.display])).toEqual([
      ['registeredRatio', 'pass', '97.0%'],
      ['reprojectionErrorPx', 'pass', '0.62 px'],
      ['psnr', 'pass', '27.40 dB'],
      ['ssim', 'pass', '0.900'],
      ['lpips', 'pass', '0.180'],
    ]);
    expect(a.frames).toEqual({ heldout: 30, registered: 291, input: 300 });
  });

  it('grades warn/fail by direction (higher vs lower is better)', () => {
    const a = assessReport({
      sfm: { registered_ratio: 0.85, mean_reprojection_error_px: 2.4 },
      heldout: { psnr: 23, ssim: 0.6, lpips: 0.3 },
      flags: ['LOW_CAMERA_REGISTRATION'],
    });
    const s = Object.fromEntries(a.items.map((i) => [i.key, i.status]));
    expect(s).toEqual({
      registeredRatio: 'warn',
      reprojectionErrorPx: 'fail',
      psnr: 'warn',
      ssim: 'fail',
      lpips: 'warn',
    });
    expect(a.overall).toBe('fail');
    expect(a.flags).toEqual(['LOW_CAMERA_REGISTRATION']);
  });

  it('marks missing metrics as not measured instead of passing them', () => {
    const a = assessReport({ heldout: { psnr: 28 } });
    expect(a.items.find((i) => i.key === 'ssim')).toMatchObject({
      status: 'missing',
      display: 'Not measured',
    });
    expect(a.overall).toBe('missing');
    expect(assessReport('garbage').overall).toBe('missing');
  });

  it('states that targets are not calibrated yet', () => {
    expect(TARGETS_CALIBRATED).toBe(false);
  });
});

describe('reviewSchema', () => {
  it('requires notes when rejecting and only known checklist keys', () => {
    expect(
      reviewSchema.safeParse({ decision: 'rejected', checklist: {} }).error?.issues[0]?.message,
    ).toBe('NOTES_REQUIRED');
    expect(
      reviewSchema.safeParse({ decision: 'approved', checklist: { floaters: true } }).success,
    ).toBe(true);
    expect(
      reviewSchema.safeParse({ decision: 'approved', checklist: { hacked: true } }).success,
    ).toBe(false);
  });
});
