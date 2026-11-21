/**
 * Expo Go recording (testing without a development build). Expo Go does not contain
 * VisionCamera, so this screen records with expo-camera, which Expo Go ships. Same plan, rooms,
 * checkpoints, review and upload as Capture.tsx; NOT available here: live quality tips (frame
 * output), per-room exposure/focus/white-balance locks, and capability-based format selection
 * (expo-camera does not report formats, so it asks for 4K30 and the server validates the real
 * file, Stage 5.2). The development build (docs/CAPTURE_TEST_SCRIPT.md) remains the real app.
 */
import {
  captureProfile,
  captureReducer,
  initialCapture,
  type CaptureProfile,
} from '@nookscanner/shared';
import { CameraView, useCameraPermissions, type VideoCodec } from 'expo-camera';
import { useEffect, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ErrorText, Progress, Screen, colors, styles } from '../ui.tsx';
import type { CaptureResult } from './Capture.tsx';
import type { CaptureJob } from './Plan.tsx';

export function CaptureGo({
  job,
  onCancel,
  onFinished,
}: {
  job: CaptureJob;
  onCancel: () => void;
  onFinished: (result: CaptureResult) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [profile, setProfile] = useState<CaptureProfile | null>(null);
  const [canPause, setCanPause] = useState(false);
  const [state, dispatch] = useReducer(captureReducer, job.rooms.length, initialCapture);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Recorded time, excluding pauses (expo-camera does not report it).
  const clock = useRef({ startedAt: 0, pausedAt: 0, pausedMs: 0 });
  const atMs = () => {
    const c = clock.current;
    if (!c.startedAt) return 0;
    const now = c.pausedAt || Date.now();
    return Math.max(0, now - c.startedAt - c.pausedMs);
  };

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    void CameraView.getAvailableVideoCodecsAsync()
      .catch((): VideoCodec[] => [])
      .then((codecs) =>
        setProfile(
          captureProfile({
            videoFormats: [
              { width: 3840, height: 2160, maxFps: 30 },
              { width: 1920, height: 1080, maxFps: 30 },
            ],
            supportsHevc: codecs.includes('hvc1'),
            supportsStabilization: true,
          }),
        ),
      );
  }, []);

  const room = job.rooms[Math.min(state.current, job.rooms.length - 1)];
  const nextRoom = job.rooms[state.current + 1];
  const allDone = state.current >= job.rooms.length;

  async function start() {
    const cam = camera.current;
    if (!cam || !profile) return;
    setBusy(true);
    setError('');
    setCanPause(cam.getSupportedFeatures().toggleRecordingAsyncAvailable);
    clock.current = { startedAt: Date.now(), pausedAt: 0, pausedMs: 0 };
    dispatch({ type: 'start', atMs: 0 });
    setBusy(false);
    try {
      const video = await cam.recordAsync({ codec: profile.codec === 'hevc' ? 'hvc1' : 'avc1' });
      if (!video?.uri) throw new Error('no file');
      const durationMs = atMs();
      onFinished({
        job,
        quality: {},
        filePath: video.uri,
        state: captureReducer(stateRef.current, { type: 'stop', atMs: durationMs }),
        profile,
        lens: 'wide',
        exposureLocked: false,
        durationMs,
      });
    } catch (e) {
      setError(`Recording stopped: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  async function pauseOrResume() {
    const cam = camera.current;
    if (!cam || !canPause) return;
    await cam.toggleRecordingAsync();
    const c = clock.current;
    if (state.status === 'recording') {
      c.pausedAt = Date.now();
      dispatch({ type: 'pause', atMs: atMs() });
    } else {
      c.pausedMs += Date.now() - c.pausedAt;
      c.pausedAt = 0;
      dispatch({ type: 'resume', atMs: atMs() });
    }
  }

  function finish() {
    setBusy(true);
    camera.current?.stopRecording();
  }

  if (!permission) return <Screen title="Camera">{null}</Screen>;
  if (!permission.granted) {
    return (
      <Screen title="Camera access">
        <Text style={styles.text}>
          Nookscanner needs the camera to record the walkthrough. Allow camera access in Settings.
        </Text>
        <Button label="Back" variant="secondary" onPress={onCancel} />
      </Screen>
    );
  }

  return (
    <View style={local.root}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        mute
        videoQuality={profile?.height === 2160 ? '2160p' : '1080p'}
        videoStabilizationMode="standard"
        onMountError={(e) => setError(e.message)}
      />
      <View style={local.banner}>
        <Text style={local.bannerText}>
          Expo Go test mode: no live quality tips or exposure lock.
        </Text>
      </View>
      {state.status === 'recording' || state.status === 'paused' ? (
        <View style={local.chip} accessibilityLiveRegion="polite">
          <View
            style={[
              local.dot,
              { backgroundColor: state.status === 'paused' ? colors.accent : '#E5484D' },
            ]}
          />
          <Text style={local.chipText}>{state.status === 'paused' ? 'Paused' : 'Recording'}</Text>
        </View>
      ) : null}
      <View style={local.panel} accessibilityLiveRegion="polite">
        {state.status !== 'ready' ? (
          <Progress done={Math.min(state.current + 1, job.rooms.length)} total={job.rooms.length} />
        ) : null}
        <Text style={local.step}>
          {state.status === 'ready'
            ? `Start in ${room?.nameEn ?? 'the first room'}`
            : allDone
              ? 'Walk back to the start, then press Finish'
              : `Room ${state.current + 1} of ${job.rooms.length}: ${room?.nameEn}`}
        </Text>
        {profile ? (
          <Text style={local.hint}>
            {profile.width}x{profile.height} · {profile.fps} fps · {profile.codec.toUpperCase()}
          </Text>
        ) : null}
        {state.status === 'ready' ? (
          <Text style={local.hint}>Hold the phone sideways at chest height.</Text>
        ) : null}
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
              <Button
                label="Start recording"
                onPress={() => void start()}
                busy={busy}
                disabled={!profile}
              />
              <Button label="Cancel" variant="secondary" onPress={onCancel} />
            </>
          ) : (
            <>
              {canPause ? (
                <Button
                  label={state.status === 'paused' ? 'Resume' : 'Pause'}
                  variant="secondary"
                  onPress={() => void pauseOrResume()}
                />
              ) : null}
              {!allDone ? (
                <Button
                  label={nextRoom ? 'Room done' : 'Last room done'}
                  onPress={() => dispatch({ type: 'next', atMs: atMs() })}
                  disabled={state.status !== 'recording'}
                />
              ) : null}
              <Button label="Finish" variant="danger" onPress={finish} busy={busy} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  banner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 112,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(18,22,28,0.72)',
  },
  bannerText: { color: '#F4F1EC', fontSize: 13 },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(18,22,28,0.78)',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  step: { color: '#fff', fontSize: 18, fontWeight: '700' },
  hint: { color: '#F4F1EC', fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    position: 'absolute',
    left: 14,
    top: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(18,22,28,0.72)',
  },
  dot: { width: 8, height: 8, borderRadius: 999 },
  chipText: { color: '#F4F1EC', fontSize: 12, fontWeight: '700' },
});
