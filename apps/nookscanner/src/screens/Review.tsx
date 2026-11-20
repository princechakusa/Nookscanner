import { captureMetadata, formatClock, formatDuration, missedRooms } from '@nookscanner/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { enqueueRecording } from '../lib/uploads.ts';
import { Button, ErrorText, Screen, StatusIcon, styles } from '../ui.tsx';
import type { CaptureResult } from './Capture.tsx';

/**
 * Review before upload: per-room times, rooms that were skipped or too short, capture metadata.
 * Accept stores the checkpoints and metadata on the scan session; the file is uploaded next
 * (Stage 5.6). Discard cancels the session.
 */
export function Review({
  result,
  onDone,
  onRetake,
}: {
  result: CaptureResult;
  onDone: (accepted: boolean) => void;
  onRetake: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const missed = new Set(missedRooms(result.state));
  const { job } = result;

  async function accept() {
    setBusy(true);
    setError('');
    const metadata = captureMetadata({
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      deviceModel: Device.modelId ?? Device.modelName ?? 'unknown',
      osVersion: Device.osVersion ?? String(Platform.Version),
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      profile: result.profile,
      lens: result.lens,
      exposureLocked: result.exposureLocked,
      state: result.state,
      durationMs: result.durationMs,
      capturedAt: new Date(),
    });
    const rows = job.rooms.map((room, sequence) => {
      const mark = result.state.marks.find((m) => m.sequence === sequence);
      return {
        scan_session_id: job.sessionId,
        sequence,
        label_en: room.nameEn.slice(0, 80),
        label_ar: room.nameAr?.slice(0, 80) ?? null,
        room_type: room.roomType,
        room_id: room.id,
        start_ms: mark?.startMs ?? null,
        end_ms: mark?.endMs ?? null,
        status: mark && !missed.has(sequence) ? 'recorded' : 'skipped',
        quality: result.quality[sequence] ?? {},
      };
    });
    // Upsert: pressing again after a failed upload start must not trip the unique (session, sequence).
    const { error: e1 } = await supabase
      .from('scan_checkpoints')
      .upsert(rows, { onConflict: 'scan_session_id,sequence' });
    const { error: e2 } = e1
      ? { error: e1 }
      : await supabase
          .from('scan_sessions')
          .update({ device_info: metadata, status: 'recording' })
          .eq('id', job.sessionId);
    if (e2) {
      setBusy(false);
      return setError('Could not save the capture. Check your connection and try again.');
    }
    try {
      await enqueueRecording({
        sessionId: job.sessionId,
        apartmentName: job.apartment.name,
        recordingUri: result.filePath,
      });
    } catch {
      setBusy(false);
      return setError(
        'Saved, but the upload could not start. Check your connection and try again.',
      );
    }
    setBusy(false);
    onDone(true);
  }

  async function discard() {
    setBusy(true);
    await supabase.from('scan_sessions').update({ status: 'cancelled' }).eq('id', job.sessionId);
    setBusy(false);
    onDone(false);
  }

  const short = job.rooms.filter((_, i) => missed.has(i)).map((r) => r.nameEn);
  const pauses = result.state.pauses;

  return (
    <Screen title="Review the walkthrough">
      <Text style={styles.muted}>
        {formatDuration(result.durationMs)} recorded at {result.profile.width}x
        {result.profile.height}, {result.profile.fps} fps
        {pauses ? `, paused ${pauses === 1 ? 'once' : `${pauses} times`}` : ''}.
      </Text>
      <ScrollView contentContainerStyle={{ gap: 8 }}>
        {job.rooms.map((room, sequence) => {
          const mark = result.state.marks.find((m) => m.sequence === sequence);
          const bad = missed.has(sequence);
          return (
            <View
              key={room.id}
              style={[
                styles.card,
                { flexDirection: 'row', alignItems: 'center', gap: 12 },
                bad && { backgroundColor: '#FFF6EC', borderColor: '#E9C9A0' },
              ]}
            >
              <StatusIcon ok={!bad} />
              <Text style={[styles.text, { flex: 1, fontWeight: '600' }]}>{room.nameEn}</Text>
              <Text style={bad ? [styles.warning, { fontWeight: '600' }] : styles.muted}>
                {!mark
                  ? 'Not recorded'
                  : bad
                    ? `Only ${formatClock((mark.endMs ?? mark.startMs) - mark.startMs)}`
                    : `${formatClock(mark.startMs)} – ${formatClock(mark.endMs ?? mark.startMs)}`}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {short.length > 0 ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          {short.length === 1
            ? `${short[0]} is very short or was skipped and may be missing from the 3D apartment.`
            : `${short.join(', ')} are very short or were skipped and may be missing from the 3D apartment.`}{' '}
          Consider recording again.
        </Text>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Use this recording" onPress={() => void accept()} busy={busy} />
      <Button label="Record again" variant="secondary" onPress={onRetake} disabled={busy} />
      <Button label="Discard" variant="danger" onPress={() => void discard()} disabled={busy} />
    </Screen>
  );
}
