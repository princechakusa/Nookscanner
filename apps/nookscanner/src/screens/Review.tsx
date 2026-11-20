import { captureMetadata, missedRooms } from '@nookscanner/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, Screen, styles } from '../ui.tsx';
import type { CaptureResult } from './Capture.tsx';

const sec = (ms: number) => `${Math.round(ms / 1000)} s`;

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
      };
    });
    const { error: e1 } = await supabase.from('scan_checkpoints').insert(rows);
    const { error: e2 } = e1
      ? { error: e1 }
      : await supabase
          .from('scan_sessions')
          .update({ device_info: metadata, status: 'recording' })
          .eq('id', job.sessionId);
    setBusy(false);
    if (e2) return setError('Could not save the capture. Check your connection and try again.');
    onDone(true);
  }

  async function discard() {
    setBusy(true);
    await supabase.from('scan_sessions').update({ status: 'cancelled' }).eq('id', job.sessionId);
    setBusy(false);
    onDone(false);
  }

  return (
    <Screen title="Review the walkthrough">
      <Text style={styles.muted}>
        {sec(result.durationMs)} recorded at {result.profile.width}x{result.profile.height},{' '}
        {result.profile.fps} fps{result.state.pauses ? `, paused ${result.state.pauses} times` : ''}
        .
      </Text>
      <ScrollView contentContainerStyle={{ gap: 8 }}>
        {job.rooms.map((room, sequence) => {
          const mark = result.state.marks.find((m) => m.sequence === sequence);
          return (
            <View key={room.id} style={styles.card}>
              <Text style={styles.text}>{room.nameEn}</Text>
              <Text style={missed.has(sequence) ? styles.error : styles.muted}>
                {!mark
                  ? 'Not recorded'
                  : missed.has(sequence)
                    ? `Only ${sec((mark.endMs ?? mark.startMs) - mark.startMs)}: probably too short`
                    : `${sec(mark.startMs)} to ${sec(mark.endMs ?? mark.startMs)}`}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {missed.size > 0 ? (
        <ErrorText>
          {missed.size} room{missed.size === 1 ? ' was' : 's were'} skipped or very short. Rooms
          that are not covered will be missing from the 3D apartment. Consider recording again.
        </ErrorText>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Use this recording" onPress={() => void accept()} busy={busy} />
      <Button label="Record again" variant="secondary" onPress={onRetake} disabled={busy} />
      <Button label="Discard" variant="danger" onPress={() => void discard()} disabled={busy} />
    </Screen>
  );
}
