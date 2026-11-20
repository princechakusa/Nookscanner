import { describe, expect, it } from 'vitest';
import { chooseBudget, viewerTier, type DeviceCapabilities } from './budget.ts';

const phone = (over: Partial<DeviceCapabilities> = {}): DeviceCapabilities => ({
  mobile: true,
  devicePixelRatio: 3,
  cores: 6,
  maxTextureSize: 16384,
  ...over,
});

describe('viewerTier (device-agnostic, quality bar 1b)', () => {
  it('recent iPhone (no deviceMemory reported) is mid', () => {
    expect(viewerTier(phone())).toBe('mid');
  });

  it('mid-range Android with 4 GB is mid; 3 GB is low; 2 GB is low', () => {
    expect(viewerTier(phone({ deviceMemoryGb: 4, cores: 8, maxTextureSize: 8192 }))).toBe('mid');
    expect(viewerTier(phone({ deviceMemoryGb: 3, cores: 8, maxTextureSize: 8192 }))).toBe('low');
    expect(viewerTier(phone({ deviceMemoryGb: 2 }))).toBe('low');
  });

  it('desktop with a strong GPU is high; a weak laptop is mid', () => {
    expect(
      viewerTier({
        mobile: false,
        devicePixelRatio: 1,
        cores: 12,
        deviceMemoryGb: 16,
        maxTextureSize: 16384,
      }),
    ).toBe('high');
    expect(
      viewerTier({
        mobile: false,
        devicePixelRatio: 2,
        cores: 4,
        deviceMemoryGb: 8,
        maxTextureSize: 16384,
      }),
    ).toBe('mid');
  });

  it('data saver, tiny textures or 2 cores always pick low', () => {
    expect(viewerTier(phone({ saveData: true }))).toBe('low');
    expect(viewerTier(phone({ maxTextureSize: 2048 }))).toBe('low');
    expect(viewerTier({ mobile: false, devicePixelRatio: 1, cores: 2 })).toBe('low');
  });

  it('unknown capabilities never pick high', () => {
    expect(viewerTier({ mobile: false, devicePixelRatio: 1 })).not.toBe('high');
  });
});

describe('chooseBudget', () => {
  it('caps the pixel ratio by tier', () => {
    expect(chooseBudget(phone()).pixelRatio).toBe(1.5);
    expect(chooseBudget(phone({ saveData: true })).pixelRatio).toBe(1);
    expect(
      chooseBudget({
        mobile: false,
        devicePixelRatio: 1,
        cores: 16,
        deviceMemoryGb: 32,
        maxTextureSize: 16384,
      }).pixelRatio,
    ).toBe(1);
  });

  it('honours an explicit tier override', () => {
    expect(chooseBudget(phone(), 'low')).toMatchObject({ tier: 'low', lodSplatCount: 500_000 });
  });
});
