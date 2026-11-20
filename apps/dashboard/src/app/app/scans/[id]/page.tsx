import {
  ARTEFACT_LABELS,
  assessReport,
  TARGETS_CALIBRATED,
  type ArtefactCheck,
} from '@nookscanner/shared';
import { StatusPill, type Status } from '@nookscanner/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { cancelJobAction, reviewResultAction, submitScanAction } from '../../scan-actions.ts';
import { AutoRefresh, CancelJobForm, ReviewForm, SubmitScanForm } from '../../scan-forms.tsx';
import {
  FLAG_LABELS,
  JOB_ERRORS,
  JOB_STATUS,
  SCAN_STATUS,
  STAGE_LABELS,
} from '../../scan-status.ts';

export const metadata: Metadata = { title: 'Scan' };

interface SessionRow {
  id: string;
  method: string;
  status: string;
  created_at: string;
  apartments: { id: string; name: string } | null;
}
interface UploadRow {
  id: string;
  original_filename: string;
  size_bytes: number;
  status: string;
}
interface JobRow {
  id: string;
  status: string;
  stage: string | null;
  progress: number;
  attempt: number;
  max_attempts: number;
  error_code: string | null;
  queued_at: string;
  finished_at: string | null;
}
interface ResultRow {
  report: Record<string, unknown>;
  review_status: string;
  checklist: Partial<Record<ArtefactCheck, boolean>>;
  review_notes: string | null;
  reviewed_at: string | null;
}

const TONE: Record<string, Status> = {
  pass: 'published',
  warn: 'review',
  fail: 'failed',
  missing: 'draft',
};
const WORD: Record<string, string> = {
  pass: 'Good',
  warn: 'Borderline',
  fail: 'Below target',
  missing: 'Not measured',
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase, can } = await getOrgContext();

  const { data: s } = await supabase
    .from('scan_sessions')
    .select('id, method, status, created_at, apartments(id, name)')
    .eq('id', id.data)
    .maybeSingle();
  if (!s) notFound();
  const session = s as unknown as SessionRow;

  const [{ data: uploadRows }, { data: jobRows }] = await Promise.all([
    supabase
      .from('media_uploads')
      .select('id, original_filename, size_bytes, status')
      .eq('scan_session_id', session.id)
      .order('created_at'),
    supabase
      .from('processing_jobs')
      .select(
        'id, status, stage, progress, attempt, max_attempts, error_code, queued_at, finished_at',
      )
      .eq('scan_session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const uploads = (uploadRows ?? []) as UploadRow[];
  const job = ((jobRows ?? []) as JobRow[])[0] ?? null;

  let result: ResultRow | null = null;
  if (job?.status === 'succeeded') {
    const { data } = await supabase
      .from('processing_results')
      .select('report, review_status, checklist, review_notes, reviewed_at')
      .eq('processing_job_id', job.id)
      .maybeSingle();
    result = (data as ResultRow | null) ?? null;
  }
  const assessment = result ? assessReport(result.report) : null;
  const active = !!job && ['queued', 'dispatched', 'running'].includes(job.status);
  const scanStatus = SCAN_STATUS[session.status] ?? {
    tone: 'draft' as Status,
    label: session.status,
  };
  const canSubmit =
    can('scan.create') && ['uploaded', 'submitted', 'failed'].includes(session.status) && !active;

  return (
    <div className="ns-page">
      <AutoRefresh active={active} />
      <p className="ns-muted">
        <Link href="/app/scans">Scans</Link>
        {session.apartments && (
          <>
            {' · '}
            <Link href={`/app/apartments/${session.apartments.id}`}>{session.apartments.name}</Link>
          </>
        )}
      </p>
      <h1 className="ns-page__title">
        {session.method === 'guided_capture' ? 'Guided capture' : 'Uploaded walkthrough'}
      </h1>
      <p>
        <StatusPill status={scanStatus.tone} label={scanStatus.label} />
      </p>

      <section className="ns-panel" aria-labelledby="videos-h">
        <h2 id="videos-h" className="ns-panel__title">
          Video
        </h2>
        {uploads.length === 0 ? (
          <p className="ns-muted">No video uploaded yet.</p>
        ) : (
          <ul className="ns-plain-list">
            {uploads.map((u) => (
              <li key={u.id}>
                {u.original_filename} · {mb(Number(u.size_bytes))} · {u.status}
              </li>
            ))}
          </ul>
        )}
        {canSubmit && (
          <div className="ns-panel__actions">
            <p className="ns-muted">
              Processing turns the video into a 3D apartment in the cloud. It takes about an hour.
            </p>
            <SubmitScanForm action={submitScanAction} sessionId={session.id} />
          </div>
        )}
      </section>

      {job && (
        <section className="ns-panel" aria-labelledby="job-h" aria-live="polite">
          <h2 id="job-h" className="ns-panel__title">
            3D processing
          </h2>
          <p>
            <StatusPill
              status={(JOB_STATUS[job.status] ?? { tone: 'draft' as Status }).tone}
              label={(JOB_STATUS[job.status] ?? { label: job.status }).label}
            />{' '}
            {active && job.stage && (
              <span className="ns-muted">{STAGE_LABELS[job.stage] ?? job.stage}</span>
            )}
          </p>
          {active && (
            <div className="ns-job-progress">
              <progress
                className="ns-progress"
                max={100}
                value={Number(job.progress)}
                aria-label="Processing progress"
              ></progress>
              <span>{Number(job.progress).toFixed(0)}%</span>
            </div>
          )}
          {job.error_code && (
            <p className={job.status === 'failed' ? 'ns-field__error' : 'ns-muted'}>
              {JOB_ERRORS[job.error_code] ?? 'Processing failed. Contact support.'}{' '}
              <span className="ns-muted">
                (code {job.error_code}, attempt {job.attempt} of {job.max_attempts})
              </span>
            </p>
          )}
          {active && can('scan.create') && (
            <CancelJobForm action={cancelJobAction} jobId={job.id} sessionId={session.id} />
          )}
        </section>
      )}

      {assessment && result && job && (
        <section className="ns-panel" aria-labelledby="quality-h">
          <h2 id="quality-h" className="ns-panel__title">
            Quality report
          </h2>
          {!TARGETS_CALIBRATED && (
            <p className="ns-muted">
              Targets are initial guidance and will be calibrated on the first real apartments.
              Always judge the 3D apartment itself before approving.
            </p>
          )}
          <table className="ns-table">
            <caption className="ns-visually-hidden">Quality measurements</caption>
            <thead>
              <tr>
                <th scope="col">Measurement</th>
                <th scope="col">Result</th>
                <th scope="col">Target</th>
                <th scope="col">Assessment</th>
              </tr>
            </thead>
            <tbody>
              {assessment.items.map((i) => (
                <tr key={i.key}>
                  <td data-label="Measurement">{i.label}</td>
                  <td data-label="Result">{i.display}</td>
                  <td data-label="Target">{i.target}</td>
                  <td data-label="Assessment">
                    <StatusPill
                      status={TONE[i.status] ?? 'draft'}
                      label={WORD[i.status] ?? i.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assessment.frames.input !== null && (
            <p className="ns-muted">
              {assessment.frames.registered ?? 0} of {assessment.frames.input} frames placed;{' '}
              {assessment.frames.heldout ?? 0} frames held back to measure quality.
            </p>
          )}
          {assessment.flags.length > 0 && (
            <ul className="ns-plain-list" aria-label="Warnings">
              {assessment.flags.map((f) => (
                <li key={f} className="ns-field__error">
                  {FLAG_LABELS[f] ?? f}
                </li>
              ))}
            </ul>
          )}

          <h3 id="review-h" className="ns-panel__subtitle">
            Review
          </h3>
          {result.review_status === 'pending_review' ? (
            can('scan.review') ? (
              <ReviewForm action={reviewResultAction} jobId={job.id} sessionId={session.id} />
            ) : (
              <p className="ns-muted">Waiting for a manager to review this scene.</p>
            )
          ) : (
            <div>
              <p>
                <StatusPill
                  status={result.review_status === 'approved' ? 'published' : 'failed'}
                  label={result.review_status === 'approved' ? 'Approved' : 'Needs a new capture'}
                />
              </p>
              {Object.entries(result.checklist).some(([, v]) => v) && (
                <ul className="ns-plain-list" aria-label="Problems noted">
                  {Object.entries(result.checklist)
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <li key={k}>{ARTEFACT_LABELS[k as ArtefactCheck] ?? k}</li>
                    ))}
                </ul>
              )}
              {result.review_notes && <p className="ns-muted">{result.review_notes}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
