import {
  captureProfile,
  captureReducer,
  initialCapture,
  type CaptureProfile,
  type CaptureState,
} from '@nookscanner/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonDynamicRanges,
  useCameraDevice,
  useCameraPermission,
  useVideoOutput,
  type CameraController,
  type CameraRef,
  type Recorder,
} from 'react-native-vision-camera';
import { deviceCapabilities, lensOf } from '../lib/camera.ts';
import { Button, ErrorText, Screen, styles } from '../ui.tsx';
import type { CaptureJob } from './Plan.tsx';

export interface CaptureResult {
  job: CaptureJob;
  filePath: string;
  state: CaptureState;
  profile: CaptureProfile;
  lens: 'wide' | 'ultra-wide' | 'telephoto' | 'unknown';
  exposureLocked: boolean;
  durationMs: number;
}

/** Lets auto exposure/focus/white balance settle on the new room, then locks them (protocol s2). */
async function relockForRoom(controller: CameraController | undefined): Promise<boolean> {
  if (!controller) return false;
  try {
    await controller.resetFocus();
    await new Promise((r) => setTimeout(r, 1500));
    await Promise.all([
      controller.lockCurrentFocus(),
      controller.lockCurrentExposure(),
      controller.lockCurrentWhiteBalance(),
    ]);
    return true;
  } catch {
    return false; // Some devices cannot lock every value; recording continues in auto.
  }
}

export function Capture({
  job,
  onCancel,
  onFinished,
}: {
  job: CaptureJob;
  onCancel: () => void;
  onFinished: (result: CaptureResult) => void;
}) {
  const permission = useCameraPermission();
  const device = useCameraDevice('back');
  // First pass without codec info picks the resolution; the codec is refined once the output exists.
  const firstProfile = useMemo(
    () => (device ? captureProfile(deviceCapabilities(device, undefined)) : null),
    [device],
  );
  const videoOutput = useVideoOutput({
    targetResolution: firstProfile
      ? { width: firstProfile.width, height: firstProfile.height }
      : { width: 1920, height: 1080 },
    enableAudio: false,
    fileType: 'mov',
  });
  const profile = useMemo(
    () => (device ? captureProfile(deviceCapabilities(device, videoOutput)) : null),
    [device, videoOutput],
  );
  const camera = useRef<CameraRef>(null);
  const recorder = useRef<Recorder | null>(null);
  const [state, dispatch] = useReducer(captureReducer, job.rooms.length, initialCapture);
  const [error, setError] = useState('');
  const [locked, setLockedState] = useState(false);
  const [busy, setBusy] = useState(false);
  // The recorder's finish callback outlives renders: read the latest values through refs.
  const stateRef = useRef(state);
  stateRef.current = state;
  const lockedRef = useRef(false);
  const setLocked = (v: boolean) => {
    lockedRef.current = v;
    setLockedState(v);
  };

  useEffect(() => {
    if (!permission.hasPermission && permission.canRequestPermission)
      void permission.requestPermission();
  }, [permission]);

  useEffect(() => {
    if (profile?.codec === 'hevc') void videoOutput.setOutputSettings({ codec: 'h265' });
  }, [profile, videoOutput]);

  const atMs = () => Math.round((recorder.current?.recordedDuration ?? 0) * 1000);
  const room = job.rooms[Math.min(state.current, job.rooms.length - 1)];
  const nextRoom = job.rooms[state.current + 1];
  const allDone = state.current >= job.rooms.length;

  async function start() {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      setLocked(await relockForRoom(camera.current?.controller));
      const rec = await videoOutput.createRecorder({});
      recorder.current = rec;
      await rec.startRecording(
        (filePath) =>
          onFinished({
            job,
            filePath,
            state: captureReducer(stateRef.current, { type: 'stop', atMs: atMs() }),
            profile,
            lens: device ? lensOf(device) : 'unknown',
            exposureLocked: lockedRef.current,
            durationMs: atMs(),
          }),
        (e) => setError(`Recording stopped: ${e.message}`),
      );
      dispatch({ type: 'start', atMs: 0 });
    } catch (e) {
      setError(`Could not start recording: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function pauseOrResume() {
    const rec = recorder.current;
    if (!rec) return;
    if (state.status === 'recording') {
      await rec.pauseRecording();
      dispatch({ type: 'pause', atMs: atMs() });
    } else {
      await rec.resumeRecording();
      dispatch({ type: 'resume', atMs: atMs() });
    }
  }

  async function nextCheckpoint() {
    dispatch({ type: 'next', atMs: atMs() });
    if (nextRoom) setLocked(await relockForRoom(camera.current?.controller));
  }

  async function finish() {
    setBusy(true);
    await recorder.current?.stopRecording();
  }

  if (!permission.hasPermission) {
    return (
      <Screen title="Camera access">
        <Text style={styles.text}>
          Nookscanner needs the camera to record the walkthrough. Allow camera access in Settings.
        </Text>
        <Button label="Back" variant="secondary" onPress={onCancel} />
      </Screen>
    );
  }
  if (!device || !profile) {
    return (
      <Screen title="Camera not suitable">
        <Text style={styles.text}>
          This phone's camera does not reach the minimum (720p at 20 frames per second) for a 3D
          walkthrough. Record with another phone or camera and upload the video in the dashboard.
        </Text>
        <Button label="Back" variant="secondary" onPress={onCancel} />
      </Screen>
    );
  }

  return (
    <View style={local.root}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        isActive
        device={device}
        outputs={[videoOutput]}
        orientationSource="device"
        constraints={[
          { fps: profile.fps },
          { videoStabilizationMode: profile.stabilization },
          { videoDynamicRange: CommonDynamicRanges.ANY_SDR },
        ]}
        onError={(e) => setError(e.message)}
      />
      <View style={local.panel} accessibilityLiveRegion="polite">
        <Text style={local.step}>
          {state.status === 'ready'
            ? `Start in ${room?.nameEn ?? 'the first room'}`
            : allDone
              ? 'Walk back to the start, then press Finish'
              : `Room ${state.current + 1} of ${job.rooms.length}: ${room?.nameEn}`}
        </Text>
        <Text style={local.hint}>
          {profile.width}x{profile.height} · {profile.fps} fps · {profile.codec.toUpperCase()} ·
          tier {profile.tier}
          {locked ? ' · exposure locked' : ''}
          {state.status === 'paused' ? ' · PAUSED' : ''}
        </Text>
        {nextRoom && state.status !== 'ready' ? (
          <Text style={local.hint}>
            Next: walk slowly through the doorway into {nextRoom.nameEn}, keeping the door frame in
            view.
          </Text>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={local.row}>
          {state.status === 'ready' ? (
            <>
              <Button label="Start recording" onPress={() => void start()} busy={busy} />
              <Button label="Cancel" variant="secondary" onPress={onCancel} />
            </>
          ) : (
            <>
              <Button
                label={state.status === 'paused' ? 'Resume' : 'Pause'}
                variant="secondary"
                onPress={() => void pauseOrResume()}
              />
              {!allDone ? (
                <Button
                  label={nextRoom ? 'Room done' : 'Last room done'}
                  onPress={() => void nextCheckpoint()}
                  disabled={state.status !== 'recording'}
                />
              ) : null}
              <Button label="Finish" variant="danger" onPress={() => void finish()} busy={busy} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(20,33,61,0.85)',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  step: { color: '#fff', fontSize: 18, fontWeight: '700' },
  hint: { color: '#E6EAF0', fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
