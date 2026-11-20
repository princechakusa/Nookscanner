import type { DeviceCapabilities } from '@nookscanner/shared';
import type { CameraDevice, CameraVideoOutput } from 'react-native-vision-camera';

/**
 * What the back camera reports, in the shape the shared tier rules expect (Stage 5.3). Only
 * capabilities are read, never the model name.
 */
export function deviceCapabilities(
  device: CameraDevice,
  videoOutput: CameraVideoOutput | undefined,
): DeviceCapabilities {
  // VisionCamera 5 reports fps ranges per device, not per resolution; the session's fps
  // constraint then negotiates the real rate (validated again on the server, Stage 5.2).
  const maxFps = Math.max(0, ...device.supportedFPSRanges.map((r) => r.max));
  const videoFormats = device
    .getSupportedResolutions('video')
    .map((s) => ({ width: s.width, height: s.height, maxFps }));
  const codecs = videoOutput?.getSupportedVideoCodecs() ?? [];
  return {
    videoFormats,
    supportsHevc: codecs.includes('h265'),
    supportsStabilization: device.supportsVideoStabilizationMode('standard'),
  };
}

/** Lens of the selected device, for capture metadata. */
export function lensOf(device: CameraDevice): 'wide' | 'ultra-wide' | 'telephoto' | 'unknown' {
  const t = String(device.type);
  if (t.includes('ultra')) return 'ultra-wide';
  if (t.includes('tele')) return 'telephoto';
  if (t.includes('wide')) return 'wide';
  return 'unknown';
}
