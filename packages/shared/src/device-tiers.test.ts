import { describe, expect, it } from 'vitest';
import {
  DEVICE_TIERS,
  captureProfile,
  selectCaptureTier,
  uploadTier,
  type DeviceCapabilities,
} from './device-tiers.ts';

const fmt = (width: number, height: number, maxFps: number) => ({ width, height, maxFps });
const UHD = fmt(3840, 2160, 60);
const FHD = fmt(1920, 1080, 60);
const HD = fmt(1280, 720, 30);

describe('device tier table', () => {
  it('has five ordered tiers with stricter requirements first', () => {
    expect(DEVICE_TIERS.tiers.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
    const capture = DEVICE_TIERS.tiers.filter((t) => t.requires);
    for (let i = 1; i < capture.length; i += 1) {
      expect(capture[i]!.requires!.minShortSide).toBeLessThanOrEqual(
        capture[i - 1]!.requires!.minShortSide,
      );
    }
    expect(DEVICE_TIERS.tiers.at(-1)!.uploadOnly).toBe(true);
  });

  it('never names a device model in a rule (capabilities only)', () => {
    for (const t of DEVICE_TIERS.tiers) {
      expect(Object.keys(t.requires ?? {}).sort()).toEqual(
        t.requires ? ['hevc', 'minFps', 'minShortSide', 'stabilization'] : [],
      );
    }
  });
});

describe('selectCaptureTier', () => {
  const cases: Array<[string, DeviceCapabilities | null, string | null]> = [
    [
      '4K60, HEVC, stabilised (pro phone)',
      { videoFormats: [UHD, FHD], supportsHevc: true, supportsStabilization: true },
      'T1',
    ],
    [
      '4K30 without stabilisation',
      { videoFormats: [fmt(3840, 2160, 30)], supportsHevc: true },
      'T2',
    ],
    ['4K but no HEVC', { videoFormats: [UHD], supportsStabilization: true }, 'T2'],
    ['1080p30 only', { videoFormats: [fmt(1920, 1080, 30)] }, 'T3'],
    [
      '4K only at 24 fps falls back to 1080p30',
      { videoFormats: [fmt(3840, 2160, 24), fmt(1920, 1080, 30)] },
      'T3',
    ],
    ['720p30 only', { videoFormats: [HD] }, 'T4'],
    ['portrait-listed formats count by short side', { videoFormats: [fmt(1080, 1920, 30)] }, 'T3'],
    ['below the minimum', { videoFormats: [fmt(640, 480, 30)] }, null],
    ['720p at 15 fps', { videoFormats: [fmt(1280, 720, 15)] }, null],
    ['unknown device: no information', null, null],
    ['unknown device: empty format list', { videoFormats: [] }, null],
    ['garbage values are ignored', { videoFormats: [fmt(Number.NaN, 2160, 30), FHD] }, 'T3'],
  ];
  it.each(cases)('%s', (_label, caps, expected) => {
    expect(selectCaptureTier(caps)?.id ?? null).toBe(expected);
  });
});

describe('captureProfile', () => {
  it('pro phone records landscape 4K30 HEVC, SDR, standard stabilisation, locked exposure', () => {
    expect(
      captureProfile({ videoFormats: [FHD, UHD], supportsHevc: true, supportsStabilization: true }),
    ).toEqual({
      tier: 'T1',
      width: 3840,
      height: 2160,
      fps: 30,
      codec: 'hevc',
      hdr: false,
      stabilization: 'standard',
      lockExposureFocusWhiteBalance: true,
      orientation: 'landscape',
    });
  });

  it('basic phone records 1080p30 H.264 without stabilisation', () => {
    expect(captureProfile({ videoFormats: [fmt(1080, 1920, 30)] })).toMatchObject({
      tier: 'T3',
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      stabilization: 'off',
    });
  });

  it('caps fps at what the device offers', () => {
    expect(captureProfile({ videoFormats: [fmt(1280, 720, 25)] })?.fps).toBe(25);
  });

  it('no profile below the minimum', () => {
    expect(captureProfile({ videoFormats: [fmt(640, 480, 30)] })).toBeNull();
  });
});

describe('uploadTier', () => {
  it('uses the capture tier when known, otherwise T5', () => {
    expect(uploadTier('T1').recommendedShortSide).toBe(2160);
    expect(uploadTier(null).id).toBe('T5');
    expect(uploadTier(undefined).id).toBe('T5');
  });
});
