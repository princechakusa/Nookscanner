import { formatDuration, type UploadJob } from '@nookscanner/shared';
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
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
  const [startedAt] = useState(() => Date.now());

  const refresh = useCallback(async () => setJobs(await loadQueue()), []);
  const run = useCallback(async () => {
    await runQueue(setProgress);
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
  const elapsed = Date.now() - startedAt;
  const remainingMs = progress && fraction > 0.02 ? (elapsed / fraction) * (1 - fraction) : null;

  return (
    <Screen title="Uploading">
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
