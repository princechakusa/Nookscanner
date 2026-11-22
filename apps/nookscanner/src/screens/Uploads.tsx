import { estimateRemainingMs, formatDuration, type UploadJob } from '@nookscanner/shared';
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { loadSettings, saveSettings } from '../lib/settings.ts';
import { loadQueue, runQueue, type UploadProgress } from '../lib/uploads.ts';
import { Button, ErrorText, Screen, colors, styles } from '../ui.tsx';

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(0)} MB`;

/**
 * Upload status (Stage 5.6). Uploads continue in the background; this screen restarts the queue
 * whenever the app becomes active again and shows progress for the current part.
 */
export function Uploads({ onDone }: { onDone: () => void }) {
  const [jobs, setJobs] = useState<UploadJob[] | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [blocked, setBlocked] = useState<'offline' | 'wifi' | null>(null);
  // Speed is measured from the first progress this screen saw, not from when it opened: bytes
  // sent before (in the background or an earlier visit) must not make the estimate too short.
  const [baseline, setBaseline] = useState<{ uploadId: string; at: number; sent: number } | null>(
    null,
  );
  useEffect(() => {
    if (progress && baseline?.uploadId !== progress.uploadId)
      setBaseline({ uploadId: progress.uploadId, at: Date.now(), sent: progress.sentBytes });
  }, [progress, baseline]);

  const refresh = useCallback(async () => setJobs(await loadQueue()), []);
  const run = useCallback(async () => {
    await runQueue(setProgress, setBlocked);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh().then(run);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run();
    });
    return () => sub.remove();
  }, [refresh, run]);

  const active = progress && jobs?.find((j) => j.uploadId === progress.uploadId);
  const fraction = progress ? progress.sentBytes / progress.totalBytes : 0;
  const remainingMs =
    progress && baseline?.uploadId === progress.uploadId
      ? estimateRemainingMs(
          progress.sentBytes - baseline.sent,
          Date.now() - baseline.at,
          progress.totalBytes - progress.sentBytes,
        )
      : null;

  return (
    <Screen title="Uploads">
      {blocked && jobs && jobs.length > 0 ? (
        <View style={[styles.card, { gap: 8, borderColor: colors.accent }]}>
          <Text style={[styles.text, { fontWeight: '700' }]}>
            {blocked === 'wifi' ? 'Waiting for Wi-Fi' : 'No internet connection'}
          </Text>
          <Text style={styles.muted}>
            {blocked === 'wifi'
              ? 'Walkthroughs are large, so they upload on Wi-Fi only. Uploading resumes by itself on Wi-Fi.'
              : 'Uploading resumes by itself when the phone is back online.'}
          </Text>
          {blocked === 'wifi' ? (
            <Button
              label="Use mobile data for uploads"
              variant="secondary"
              onPress={() =>
                void loadSettings()
                  .then((s) => saveSettings({ ...s, wifiOnly: false }))
                  .then(run)
              }
            />
          ) : null}
        </View>
      ) : null}
      <Text style={styles.muted}>
        You can switch to other apps; the upload continues. If the connection drops, it carries on
        where it stopped.
      </Text>
      <ScrollView contentContainerStyle={{ gap: 10 }}>
        {jobs?.length === 0 ? (
          <View style={styles.card}>
            <Text style={[styles.text, { fontWeight: '600' }]}>All walkthroughs are uploaded.</Text>
            <Text style={styles.muted}>
              The video is checked automatically, then the 3D apartment is built.
            </Text>
          </View>
        ) : null}
        {(jobs ?? []).map((job) => {
          const isActive = active?.uploadId === job.uploadId;
          const done = job.parts.filter((p) => p.status === 'uploaded').length;
          const pct = isActive
            ? Math.floor(fraction * 100)
            : Math.floor((done / job.parts.length) * 100);
          return (
            <View key={job.uploadId} style={[styles.card, { gap: 8 }]}>
              <Text style={[styles.text, { fontWeight: '600' }]}>{job.apartmentName}</Text>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: pct }}
                style={{ height: 8, borderRadius: 4, backgroundColor: colors.primarySoft }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
              <Text style={styles.muted}>
                {pct}% of {mb(job.sizeBytes)} · part{' '}
                {isActive ? progress!.partNumber : Math.min(done + 1, job.parts.length)} of{' '}
                {job.parts.length}
                {isActive && remainingMs ? ` · about ${formatDuration(remainingMs)} left` : ''}
              </Text>
              {!isActive && job.lastError ? (
                <ErrorText>Waiting to retry: {job.lastError}</ErrorText>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {jobs && jobs.length > 0 && !progress ? (
        <Button label="Retry now" variant="secondary" onPress={() => void run()} />
      ) : null}
      <Button label="Done" onPress={onDone} />
    </Screen>
  );
}
