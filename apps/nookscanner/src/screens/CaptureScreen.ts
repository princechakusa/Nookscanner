/**
 * Picks the recording screen at runtime. Expo Go has no VisionCamera, and importing it there
 * fails at load, so the full screen is required only outside Expo Go (development and store
 * builds); Expo Go gets the expo-camera test screen (CaptureGo.tsx).
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ComponentType } from 'react';
import type * as CaptureModule from './Capture.tsx';
import type * as CaptureGoModule from './CaptureGo.tsx';
import type { CaptureResult } from './Capture.tsx';
import type { CaptureJob } from './Plan.tsx';

export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type CaptureProps = {
  job: CaptureJob;
  onCancel: () => void;
  onFinished: (result: CaptureResult) => void;
};

/* eslint-disable @typescript-eslint/no-require-imports -- conditional native module loading */
export const CaptureScreen: ComponentType<CaptureProps> = inExpoGo
  ? (require('./CaptureGo.tsx') as typeof CaptureGoModule).CaptureGo
  : (require('./Capture.tsx') as typeof CaptureModule).Capture;
/* eslint-enable @typescript-eslint/no-require-imports */
