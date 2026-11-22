import {
  ARTEFACT_CHECKS,
  ARTEFACT_LABELS,
  FLAG_LABELS,
  JOB_ERRORS,
  STAGE_LABELS,
  assessReport,
  type ArtefactCheck,
} from '@nookscanner/shared';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';

interface Job {
  id: string;
  status: string;
  stage: string | null;
  progress: number | null;
  error_code: string | null;
  attempt: number;
  max_attempts: number;
}
interface Result {
  report: unknown;
  review_status: string;
  review_notes: string | null;
}
const STATUS_TEXT: Record<string, string> = {
  queued: 'Waiting for a processing slot',
  dispatched: 'Starting',
  running: 'Running',
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
const TONE = {
  pass: colors.primary,
  warn: colors.warning,
  fail: colors.danger,
  missing: colors.muted,
};
const CHECK_TEXT = { pass: 'Good', warn: 'Check', fail: 'Poor', missing: 'Not measured' };

/** One walkthrough: upload, processing steps (live), quality report, approve/reject, re-record. */
export function ScanDetail({
  scanId,
  apartmentName,
  onRecordAgain,
}: {
  scanId: string;
  apartmentName: string;
  onRecordAgain: () => void;
}) {
  const [status, setStatus] = useState<string>('');
  const [upload, setUpload] = useState<{ status: string; size_bytes: number } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [checks, setChecks] = useState<Partial<Record<ArtefactCheck, boolean>>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, u, j] = await Promise.all([
      supabase.from('scan_sessions').select('status').eq('id', scanId).maybeSingle(),
      supabase
        .from('media_uploads')
        .select('status, size_bytes')
        .eq('scan_session_id', scanId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('processing_jobs')
        .select('id, status, stage, progress, error_code, attempt, max_attempts')
        .eq('scan_session_id', scanId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    setStatus((s.data as { status: string } | null)?.status ?? '');
    setUpload((u.data?.[0] as { status: string; size_bytes: number } | undefined) ?? null);
    const latest = (j.data?.[0] as Job | undefined) ?? null;
    setJob(latest);
    if (latest?.status === 'succeeded') {
      const { data } = await supabase
        .from('processing_results')
        .select('report, review_status, review_notes')
        .eq('processing_job_id', latest.id)
        .maybeSingle();
      setResult((data as Result | null) ?? null);
    } else setResult(null);
  }, [scanId]);

  useEffect(() => {
    void load();
  }, [load]);
  // Live while processing.
  useEffect(() => {
    if (!job || !['queued', 'dispatched', 'running'].includes(job.status)) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [job, load]);

  async function submit() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.rpc('submit_scan_for_processing', { p_session: scanId });
    setBusy(false);
    if (e)
      setError('Could not start processing. Only managers can do this, after the upload finished.');
    void load();
  }

  async function review(decision: 'approved' | 'rejected') {
    if (!job) return;
    if (decision === 'rejected' && !notes.trim()) {
      setError('Explain what is wrong so the walkthrough can be recorded again.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: e } = await supabase.rpc('review_processing_result', {
      p_job: job.id,
      p_decision: decision,
      p_checklist: checks,
      p_notes: notes.trim() || null,
    });
    setBusy(false);
    if (e) setError('Could not save the review. Only managers can review.');
    void load();
  }

  const assessment = result ? assessReport(result.report) : null;
  const active = job && ['queued', 'dispatched', 'running'].includes(job.status);
  const gb = upload ? (upload.size_bytes / 1e9).toFixed(2) : null;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        styles.pushed,
        { flexGrow: 1, paddingBottom: 40 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={styles.muted}>{apartmentName}</Text>

      <Step
        title="1. Video uploaded"
        done={!!upload && upload.status !== 'pending'}
        text={
          upload
            ? upload.status === 'pending'
              ? `Uploading (${gb} GB)`
              : `${gb} GB received`
            : 'No video yet'
        }
      />
      <Step
        title="2. 3D apartment"
        done={job?.status === 'succeeded'}
        failed={job?.status === 'failed'}
        text={
          !job
            ? status === 'uploaded'
              ? 'Ready to process'
              : 'Starts after the upload'
            : job.status === 'running' && job.stage
              ? `${STAGE_LABELS[job.stage] ?? job.stage}${job.progress !== null ? ` · ${Math.round(job.progress * 100)}%` : ''}`
              : (STATUS_TEXT[job.status] ?? job.status)
        }
      />
      {active && job?.progress !== null && job?.progress !== undefined ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ now: Math.round(job.progress * 100), min: 0, max: 100 }}
          style={{ height: 8, borderRadius: 4, backgroundColor: colors.border }}
        >
          <View
            style={{
              width: `${Math.round(job.progress * 100)}%`,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.primary,
            }}
          />
        </View>
      ) : null}
      {!job && status === 'uploaded' ? (
        <Button label="Create 3D apartment" onPress={() => void submit()} busy={busy} />
      ) : null}
      {job?.status === 'failed' ? (
        <View style={[styles.card, { gap: 8, borderColor: colors.danger }]}>
          <Text style={[styles.text, { color: colors.danger, fontWeight: '700' }]}>
            Processing failed
          </Text>
          <Text style={styles.text}>
            {(job.error_code && JOB_ERRORS[job.error_code]) ??
              'Something went wrong. Record the walkthrough again.'}
          </Text>
          <Button label="Record again" onPress={onRecordAgain} />
        </View>
      ) : null}

      {assessment ? (
        <>
          <Step
            title="3. Review"
            done={result?.review_status === 'approved'}
            failed={result?.review_status === 'rejected'}
            text={
              result?.review_status === 'approved'
                ? 'Approved: align it and add appliances in the dashboard'
                : result?.review_status === 'rejected'
                  ? `Rejected${result.review_notes ? `: ${result.review_notes}` : ''}`
                  : 'Waiting for your review'
            }
          />
          <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 6 }]}>
            Quality
          </Text>
          {assessment.items.map((it) => (
            <View
              key={it.key}
              style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{it.label}</Text>
                <Text style={styles.muted}>Target {it.target}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.text, { fontWeight: '700' }]}>{it.display}</Text>
                <Text style={{ color: TONE[it.status], fontWeight: '700' }}>
                  {CHECK_TEXT[it.status]}
                </Text>
              </View>
            </View>
          ))}
          {assessment.flags.map((f) => (
            <Text key={f} style={styles.warning}>
              {FLAG_LABELS[f] ?? f}
            </Text>
          ))}
          {result?.review_status === 'pending' ? (
            <View style={[styles.card, { gap: 10 }]}>
              <Text style={styles.label}>
                Walk through the 3D apartment in the dashboard, then tick what you saw:
              </Text>
              {ARTEFACT_CHECKS.map((c) => (
                <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch
                    accessibilityLabel={ARTEFACT_LABELS[c]}
                    value={!!checks[c]}
                    onValueChange={(v) => setChecks({ ...checks, [c]: v })}
                  />
                  <Text style={[styles.text, { flex: 1 }]}>{ARTEFACT_LABELS[c]}</Text>
                </View>
              ))}
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                accessibilityLabel="Notes"
                placeholder="Notes (needed when rejecting)"
                multiline
                value={notes}
                onChangeText={setNotes}
              />
              <Button label="Approve" onPress={() => void review('approved')} busy={busy} />
              <Button
                label="Reject and record again"
                variant="danger"
                onPress={() => void review('rejected')}
                busy={busy}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </ScrollView>
  );
}

function Step({
  title,
  text,
  done,
  failed,
}: {
  title: string;
  text: string;
  done?: boolean;
  failed?: boolean;
}) {
  const color = failed ? colors.danger : done ? colors.primary : colors.muted;
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${text}`}
      style={[styles.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: done || failed ? color : 'transparent',
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, { fontWeight: '700' }]}>{title}</Text>
        <Text style={[styles.muted, { color: failed ? colors.danger : colors.muted }]}>{text}</Text>
      </View>
    </View>
  );
}
