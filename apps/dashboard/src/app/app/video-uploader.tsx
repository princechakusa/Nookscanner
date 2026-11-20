'use client';

import { validateVideoFile, videoMimeFor, type UploadIssueCode } from '@nookscanner/shared';
import { Button } from '@nookscanner/ui';
import { useEffect, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { getPublicEnv } from '../../lib/env.ts';
import { createSupabaseBrowserClient } from '../../lib/supabase/browser.ts';
import {
  completeUploadPartAction,
  resumeVideoUploadAction,
  startVideoUploadAction,
  type UploadPartPlan,
} from './upload-actions.ts';

/** Supabase Storage requires exactly 6 MiB TUS chunks. */
const CHUNK = 6 * 1024 * 1024;
/** Survives drops of about two minutes before giving up (then the person can resume). */
const RETRY_DELAYS = [0, 1000, 3000, 5000, 10_000, 15_000, 20_000, 30_000, 30_000];

const ISSUE_TEXT: Record<string, string> = {
  UNSUPPORTED_TYPE: 'Choose an MP4 or MOV video.',
  EXTENSION_MISMATCH:
    'The file name ending does not match the video type. Choose the original file.',
  EMPTY_FILE: 'This file is empty.',
  FILE_TOO_LARGE: 'The video is larger than 10 GB. Record a shorter walkthrough or split it.',
  VIDEO_TOO_SHORT: 'The video is shorter than 20 seconds; it cannot cover an apartment.',
  VIDEO_TOO_LONG: 'The video is longer than 30 minutes. Record a shorter walkthrough.',
  RESOLUTION_TOO_LOW:
    'The video is below 1080p. It may not give a sharp 3D apartment; record in 4K or 1080p if you can.',
  INVALID_NAME: 'The file name is not valid.',
  UPLOAD_REJECTED: 'This video cannot be uploaded. Choose an MP4 or MOV file up to 10 GB.',
  UPLOAD_LIMIT_REACHED: 'This scan already has the maximum number of videos.',
  FORBIDDEN: 'You do not have permission to upload videos for this apartment.',
  NOT_FOUND: 'This upload no longer exists or you cannot access it.',
  PART_INCOMPLETE: 'A part did not arrive completely. Press Resume to continue.',
  NETWORK: 'The connection was lost for too long. Press Resume to continue where it stopped.',
  WRONG_FILE: 'This is not the same file as the unfinished upload (name or size differ).',
  UNKNOWN: 'Something went wrong. Try again.',
};
const text = (code: string) => ISSUE_TEXT[code] ?? ISSUE_TEXT.UNKNOWN!;

interface Meta {
  durationMs?: number;
  width?: number;
  height?: number;
}

/** Duration and size from the browser's decoder; unknown when it cannot read the codec. */
function readMeta(file: File): Promise<Meta> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (m: Meta) => {
      URL.revokeObjectURL(url);
      resolve(m);
    };
    const timer = setTimeout(() => done({}), 5000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(
        Number.isFinite(video.duration) && video.videoWidth > 0
          ? {
              durationMs: Math.round(video.duration * 1000),
              width: video.videoWidth,
              height: video.videoHeight,
            }
          : {},
      );
    };
    video.onerror = () => {
      clearTimeout(timer);
      done({});
    };
    video.src = url;
  });
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

type Phase = 'idle' | 'checking' | 'ready' | 'uploading' | 'done' | 'error';

export interface UnfinishedUpload {
  id: string;
  filename: string;
  sizeBytes: number;
}

export function VideoUploader({
  apartmentId,
  unfinished,
}: {
  apartmentId: string;
  unfinished: UnfinishedUpload[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [issues, setIssues] = useState<Array<{ code: UploadIssueCode; blocking: boolean }>>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(0);
  const [partsDone, setPartsDone] = useState(0);
  const [partsTotal, setPartsTotal] = useState(0);
  const [offline, setOffline] = useState(false);
  // The upload being resumed: picked from the list, or the current one after a failure.
  const [resume, setResume] = useState<UnfinishedUpload | null>(null);
  const resumeId = resume?.id ?? null;
  const current = useRef<tus.Upload | null>(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      current.current?.abort();
    };
  }, []);

  async function choose(f: File | null) {
    setFile(f);
    setError('');
    setIssues([]);
    if (!f) return setPhase('idle');
    if (resume && (resume.filename !== f.name || resume.sizeBytes !== f.size)) {
      setError(text('WRONG_FILE'));
      return setPhase('error');
    }
    setPhase('checking');
    const meta = await readMeta(f);
    const found = validateVideoFile({
      name: f.name,
      type: videoMimeFor(f.name, f.type),
      size: f.size,
      ...meta,
    });
    setIssues(found);
    setPhase(found.some((i) => i.blocking) ? 'error' : 'ready');
  }

  function uploadPart(f: File, mime: string, part: UploadPartPlan, start: number, base: number) {
    const env = getPublicEnv();
    const supabase = createSupabaseBrowserClient();
    return new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(f.slice(start, start + part.sizeBytes, mime), {
        endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`,
        retryDelays: RETRY_DELAYS,
        chunkSize: CHUNK,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: { apikey: env.supabaseAnonKey, 'x-upsert': 'false' },
        metadata: {
          bucketName: 'raw-footage',
          objectName: part.objectPath,
          contentType: mime,
          cacheControl: '3600',
        },
        // One fingerprint per part path, so a reload resumes the right part.
        fingerprint: async () => `nookscanner:${part.objectPath}:${part.sizeBytes}`,
        // Fresh access token on every request (uploads can outlive a token).
        onBeforeRequest: async (req) => {
          const { data } = await supabase.auth.getSession();
          req.setHeader('authorization', `Bearer ${data.session?.access_token ?? ''}`);
        },
        onProgress: (bytes) => {
          setOffline(!navigator.onLine);
          setSent(base + bytes);
        },
        // tus-js-client's default gives up whenever the browser reports itself offline, which is
        // exactly when a phone loses signal. Retry network errors and transient server errors.
        onShouldRetry: (err) => {
          const status = err.originalResponse?.getStatus() ?? 0;
          return status === 0 || status >= 500 || status === 423 || status === 429;
        },
        onSuccess: () => resolve(),
        onError: (err) => {
          // 409: the part is already stored (e.g. completed before a reload); verified below.
          const status = (err as tus.DetailedError).originalResponse?.getStatus();
          if (status === 409) return resolve();
          // Still offline after all retries: continue from the same offset once back online.
          if (!navigator.onLine) {
            setOffline(true);
            window.addEventListener('online', () => upload.start(), { once: true });
            return;
          }
          reject(err);
        },
      });
      current.current = upload;
      void upload.findPreviousUploads().then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      });
    });
  }

  async function start() {
    if (!file) return;
    if (resume && (resume.filename !== file.name || resume.sizeBytes !== file.size)) {
      setError(text('WRONG_FILE'));
      return setPhase('error');
    }
    setPhase('uploading');
    setError('');
    const plan = resume
      ? await resumeVideoUploadAction(resume.id)
      : await startVideoUploadAction({
          apartmentId,
          filename: file.name,
          mime: videoMimeFor(file.name, file.type),
          size: file.size,
        });
    if (!plan.ok) {
      setError(text(plan.error));
      return setPhase('error');
    }
    // A failed attempt can now be resumed with the same plan.
    setResume({ id: plan.uploadId, filename: file.name, sizeBytes: file.size });
    setPartsTotal(plan.parts.length);
    let offset = 0;
    let done = 0;
    let base = 0;
    for (const part of plan.parts) {
      const start = offset;
      offset += part.sizeBytes;
      if (part.status === 'uploaded') {
        done += 1;
        base += part.sizeBytes;
        setPartsDone(done);
        setSent(base);
        continue;
      }
      try {
        await uploadPart(file, plan.mime, part, start, base);
      } catch {
        setError(text('NETWORK'));
        return setPhase('error');
      }
      const result = await completeUploadPartAction(plan.uploadId, part.partNumber, apartmentId);
      if (!result.ok) {
        setError(text(result.error));
        return setPhase('error');
      }
      done += 1;
      base += part.sizeBytes;
      setPartsDone(done);
      setSent(base);
    }
    setPhase('done');
  }

  const total = file?.size ?? 0;
  const percent = total ? Math.floor((sent / total) * 100) : 0;
  const blocking = issues.filter((i) => i.blocking);
  const warnings = issues.filter((i) => !i.blocking);

  if (phase === 'done') {
    return (
      <div className="ns-notice" role="status">
        <p className="ns-notice__title">Upload complete.</p>
        <p className="ns-muted">
          {file?.name} ({mb(total)}) arrived in {partsTotal} part{partsTotal === 1 ? '' : 's'}. The
          video is checked automatically next.
        </p>
      </div>
    );
  }

  return (
    <div className="ns-form">
      {unfinished.length > 0 && phase !== 'uploading' && (
        <fieldset className="ns-fieldset">
          <legend className="ns-field__label">Unfinished uploads</legend>
          <p className="ns-muted">
            To continue one, select it and choose the same video file again.
          </p>
          {unfinished.map((u) => (
            <label key={u.id} className="ns-check">
              <input
                type="radio"
                name="resume"
                checked={resumeId === u.id}
                onChange={() => {
                  setResume(u);
                  setFile(null);
                  setPhase('idle');
                }}
              />{' '}
              {`Resume ${u.filename} (${mb(u.sizeBytes)})`}
            </label>
          ))}
          <label className="ns-check">
            <input
              type="radio"
              name="resume"
              checked={resumeId === null}
              onChange={() => setResume(null)}
            />{' '}
            New upload
          </label>
        </fieldset>
      )}
      <div className="ns-field">
        <label className="ns-field__label" htmlFor="video-file">
          Walkthrough video
        </label>
        <p className="ns-field__hint" id="video-file-hint">
          MP4 or MOV from any phone or camera, up to 10 GB and 30 minutes. Large videos are sent in
          parts and continue automatically after a short connection drop.
        </p>
        <input
          id="video-file"
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
          aria-describedby="video-file-hint"
          disabled={phase === 'uploading' || phase === 'checking'}
          onChange={(e) => void choose(e.currentTarget.files?.[0] ?? null)}
        />
      </div>
      {file && phase !== 'error' && (
        <p className="ns-muted">
          {file.name}: {mb(file.size)}
        </p>
      )}
      {blocking.length > 0 && (
        <ul className="ns-field__error" role="alert">
          {blocking.map((i) => (
            <li key={i.code}>{text(i.code)}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="ns-notice" role="status">
          {warnings.map((i) => (
            <li key={i.code}>{text(i.code)}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="ns-field__error" role="alert">
          {error}
        </p>
      )}
      {phase === 'uploading' && (
        <div role="status" aria-live="polite">
          <progress
            className="ns-progress"
            max={100}
            value={percent}
            aria-label="Upload progress"
          />
          <p className="ns-muted">
            {percent}% · part {Math.min(partsDone + 1, partsTotal)} of {partsTotal || '…'}
            {offline ? ' · Connection lost, waiting to continue…' : ''}
          </p>
        </div>
      )}
      <div>
        <Button
          type="button"
          onClick={() => void start()}
          disabled={!file || (phase !== 'ready' && phase !== 'error') || blocking.length > 0}
          loading={phase === 'uploading'}
        >
          {resume ? 'Resume upload' : 'Upload video'}
        </Button>
      </div>
    </div>
  );
}
