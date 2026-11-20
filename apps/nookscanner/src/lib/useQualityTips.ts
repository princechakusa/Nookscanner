import {
  QUALITY_HINTS,
  QualityMonitor,
  frameQuality,
  qualityThresholds,
  type GrayFrame,
  type QualityIssue,
  type TierId,
} from '@nookscanner/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFrameOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

/** Fix the cause first: light, then speed (fast movement also blurs), then blur. */
const PRIORITY: QualityIssue[] = ['TOO_DARK', 'TOO_BRIGHT', 'MOVING_TOO_FAST', 'TOO_BLURRY'];

/** Analysis frames per second: enough for steady hints, cheap on any phone. */
const SAMPLES_PER_SECOND = 2;
const WINDOW_MS = 1000 / SAMPLES_PER_SECOND;

/**
 * Live capture quality feedback (Stage 5.5, quality bar section 3). The camera delivers small
 * YUV frames on its own thread; the worklet keeps one frame per WINDOW_MS (stateless, from the
 * frame timestamp), copies only the luma plane and hands it to the JS thread, where the shared,
 * unit-tested metrics and the hysteresis monitor decide which tip to show.
 */
export function useQualityTips(tier: TierId | null, enabled: boolean) {
  const thresholds = useMemo(() => qualityThresholds(tier), [tier]);
  const monitor = useRef(new QualityMonitor(thresholds));
  const previous = useRef<GrayFrame | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [issues, setIssues] = useState<QualityIssue[]>([]);

  const onSample = useCallback(
    (width: number, height: number, data: Uint8Array) => {
      if (!enabledRef.current) return;
      const frame: GrayFrame = { width, height, data };
      const q = frameQuality(frame, previous.current, thresholds);
      previous.current = frame;
      setIssues(monitor.current.push(q.issues));
    },
    [thresholds],
  );

  const output = useFrameOutput({
    targetResolution: {
      width: thresholds.analysisWidth,
      height: Math.round((thresholds.analysisWidth * 9) / 16),
    },
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame(frame: Frame) {
      'worklet';
      try {
        // Timestamps are in seconds or nanoseconds depending on platform; both work for this
        // modulo test, which keeps roughly one frame per window without shared state.
        const ms = frame.timestamp > 1e12 ? frame.timestamp / 1e6 : frame.timestamp * 1000;
        if (ms % WINDOW_MS < 1000 / 30) {
          const plane = frame.getPlanes()[0];
          if (plane) {
            const w = plane.width;
            const h = plane.height;
            const stride = plane.bytesPerRow;
            const src = new Uint8Array(plane.getPixelBuffer());
            const luma = new Uint8Array(w * h);
            for (let y = 0; y < h; y += 1)
              luma.set(src.subarray(y * stride, y * stride + w), y * w);
            scheduleOnRN(onSample, w, h, luma);
          }
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const reset = useCallback(() => {
    monitor.current = new QualityMonitor(thresholds);
    previous.current = null;
    setIssues([]);
  }, [thresholds]);

  return {
    output,
    /** The most important active tip, or null. */
    tip: (() => {
      const top = PRIORITY.find((p) => issues.includes(p));
      return top ? QUALITY_HINTS[top] : null;
    })(),
    issues,
    summary: () => monitor.current.summary(),
    reset,
  };
}
