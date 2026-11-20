import { forwardRef, useImperativeHandle } from 'react';
import { Image } from 'react-native';

// The viewfinder shows a real interior photo where the phone would show the live camera feed.
const q = new URLSearchParams(location.search);
const photo = '/' + (q.get('photo') ?? 'living') + '.jpg';
const SPEED = Number(q.get('speed') ?? 40);
let started = 0;
let finish: ((p: string) => void) | null = null;
const recorder = {
  get recordedDuration() {
    return started ? ((Date.now() - started) / 1000) * SPEED : 0;
  },
  async startRecording(onFinish: (p: string) => void) {
    started = Date.now();
    finish = onFinish;
  },
  async pauseRecording() {},
  async resumeRecording() {},
  async stopRecording() {
    finish?.('file:///walk.mov');
  },
};
const controller = {
  async resetFocus() {},
  async lockCurrentFocus() {},
  async lockCurrentExposure() {},
  async lockCurrentWhiteBalance() {},
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Camera = forwardRef<unknown, any>(function Camera({ style }, ref) {
  useImperativeHandle(ref, () => ({ controller }));
  return (
    <Image
      source={{ uri: photo }}
      style={[style, { width: '100%', height: '100%' }]}
      resizeMode="cover"
    />
  );
});
export const CommonDynamicRanges = { ANY_SDR: {} };
const device = {
  type: 'wide-angle-camera',
  supportedFPSRanges: [{ min: 1, max: 60 }],
  getSupportedResolutions: () => [
    { width: 3840, height: 2160 },
    { width: 1920, height: 1080 },
  ],
  supportsVideoStabilizationMode: () => true,
};
export const useCameraDevice = () => device;
export const useCameraPermission = () => ({
  hasPermission: true,
  canRequestPermission: false,
  requestPermission: async () => true,
});
const output = {
  getSupportedVideoCodecs: () => ['h264', 'h265'],
  setOutputSettings: async () => {},
  createRecorder: async () => recorder,
};
export const useVideoOutput = () => output;
export const useFrameOutput = () => ({});
