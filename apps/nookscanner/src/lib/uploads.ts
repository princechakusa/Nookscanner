import {
  createJob,
  isComplete,
  markPart,
  nextPendingPart,
  parseQueue,
  partRange,
  partUploadUrl,
  reconcile,
  retryDelayMs,
  type UploadJob,
} from '@nookscanner/shared';
import { Directory, File, FileMode, Paths, UploadType } from 'expo-file-system';
import { uploadBlocker } from './settings.ts';
import { supabase, supabaseConfig } from './supabase.ts';

/**
 * Background, resumable upload of accepted recordings (Stage 5.6, ADR-016/017).
 * - The recording is moved to the documents folder (the system may purge caches).
 * - Each 45 MiB part is cut into its own file and sent with a native background upload task, so
 *   it continues while the app is in the background.
 * - A part counts only when the database confirms it (`complete_media_upload_part` checks the
 *   stored size). After a restart, finished parts are recognised the same way and never resent.
 * - The queue is a JSON file; malformed entries are dropped instead of crashing the app.
 */

const QUEUE = () => new File(Paths.document, 'upload-queue.json');
const RECORDINGS = () => new Directory(Paths.document, 'recordings');
const COPY_CHUNK = 4 * 1024 * 1024;

export async function loadQueue(): Promise<UploadJob[]> {
  const f = QUEUE();
  return f.exists ? parseQueue(await f.text()) : [];
}

async function saveQueue(jobs: UploadJob[]): Promise<void> {
  const f = QUEUE();
  if (!f.exists) f.create();
  await f.write(JSON.stringify(jobs));
}

async function updateJob(next: UploadJob): Promise<UploadJob[]> {
  const jobs = (await loadQueue()).map((j) => (j.uploadId === next.uploadId ? next : j));
  await saveQueue(jobs);
  return jobs;
}

/** Registers the recording as a media upload and adds it to the queue. */
export async function enqueueRecording(input: {
  sessionId: string;
  apartmentName: string;
  recordingUri: string;
}): Promise<UploadJob> {
  // Retry-safe: a session already queued, or already registered, is reused (never registered twice).
  const queued = (await loadQueue()).find((j) => j.sessionId === input.sessionId);
  if (queued) return queued;
  const dir = RECORDINGS();
  if (!dir.exists) dir.create();
  const source = new File(input.recordingUri);
  const kept = new File(dir, `${input.sessionId}.mov`);
  if (!kept.exists) await source.move(kept);
  const sizeBytes = kept.size;

  const { data: existing } = await supabase
    .from('media_uploads')
    .select('id, storage_backend')
    .eq('scan_session_id', input.sessionId)
    .eq('status', 'pending')
    .eq('size_bytes', sizeBytes)
    .maybeSingle();
  const { data: upload, error } = existing
    ? { data: existing, error: null }
    : await supabase
        .rpc('register_media_upload', {
          p_scan_session: input.sessionId,
          p_filename: `walkthrough-${input.sessionId.slice(0, 8)}.mov`,
          p_mime: 'video/quicktime',
          p_size_bytes: sizeBytes,
        })
        .single();
  if (error || !upload) throw new Error(error?.message ?? 'Could not register the upload');
  const uploadId = (upload as { id: string }).id;
  const backend = (upload as { storage_backend?: 'supabase' | 'r2' }).storage_backend ?? 'supabase';
  const { data: parts, error: partsError } = await supabase
    .from('media_upload_parts')
    .select('part_number, object_path, size_bytes, status')
    .eq('media_upload_id', uploadId)
    .order('part_number');
  if (partsError) throw new Error(partsError.message);

  const job = createJob({
    uploadId,
    sessionId: input.sessionId,
    apartmentName: input.apartmentName,
    fileUri: kept.uri,
    mime: 'video/quicktime',
    sizeBytes,
    backend,
    serverParts: (
      (parts ?? []) as Array<{
        part_number: number;
        object_path: string;
        size_bytes: number;
        status: string;
      }>
    ).map((p) => ({
      partNumber: p.part_number,
      objectPath: p.object_path,
      sizeBytes: p.size_bytes,
      status: p.status,
    })),
    now: new Date(),
  });
  await saveQueue([...(await loadQueue()), job]);
  return job;
}

/** Copies one part's bytes into its own file (never the whole recording in memory). */
async function writePartFile(job: UploadJob, partNumber: number): Promise<File> {
  const { start, end } = partRange(job, partNumber);
  const out = new File(Paths.cache, `part-${job.uploadId}-${partNumber}.bin`);
  if (out.exists) out.delete();
  out.create();
  const src = new File(job.fileUri).open(FileMode.ReadOnly);
  const dst = out.open(FileMode.WriteOnly);
  try {
    src.offset = start;
    for (let pos = start; pos < end;) {
      const bytes = await src.readBytes(Math.min(COPY_CHUNK, end - pos));
      if (bytes.length === 0) throw new Error('Recording is shorter than registered');
      await dst.writeBytes(bytes);
      pos += bytes.length;
    }
  } finally {
    src.close();
    dst.close();
  }
  return out;
}

/**
 * Asks the database whether a part is stored completely (also after a background finish).
 * Supabase parts are verified here; R2 parts were completed by the uploads Worker (5.7).
 */
async function confirmPart(
  uploadId: string,
  partNumber: number,
  backend: 'supabase' | 'r2' = 'supabase',
): Promise<boolean> {
  if (backend === 'r2') {
    const { data, error } = await supabase.rpc('r2_part_target', {
      p_upload: uploadId,
      p_part: partNumber,
    });
    return !error && (data as { status: string }[] | null)?.[0]?.status === 'uploaded';
  }
  const { error } = await supabase.rpc('complete_media_upload_part', {
    p_upload: uploadId,
    p_part: partNumber,
  });
  return !error;
}

/** Stage 5.7: the uploads Worker (EXPO_PUBLIC_UPLOADS_URL) stores R2 parts with the session. */
const uploadsUrl = (process.env.EXPO_PUBLIC_UPLOADS_URL ?? '').replace(/\/+$/, '');

export interface UploadProgress {
  uploadId: string;
  apartmentName: string;
  sentBytes: number;
  totalBytes: number;
  partNumber: number;
  partCount: number;
}

let running = false;

/**
 * Works through the queue until it is empty or the network fails. Safe to call repeatedly (for
 * example whenever the app returns to the foreground); only one run happens at a time.
 */
export async function runQueue(
  onProgress: (p: UploadProgress | null) => void,
  onBlocked: (reason: 'offline' | 'wifi' | null) => void = () => {},
): Promise<void> {
  if (running) return;
  // Settings: walkthroughs wait for Wi-Fi unless mobile data is allowed (Account > Settings).
  const blocked = await uploadBlocker();
  onBlocked(blocked);
  if (blocked) return;
  running = true;
  try {
    for (let job of await loadQueue()) {
      const { data: server } = await supabase
        .from('media_upload_parts')
        .select('part_number, status')
        .eq('media_upload_id', job.uploadId);
      job = reconcile(
        job,
        ((server ?? []) as Array<{ part_number: number; status: string }>).map((p) => ({
          partNumber: p.part_number,
          status: p.status,
        })),
      );
      await updateJob(job);

      for (let part = nextPendingPart(job); part; part = nextPendingPart(job)) {
        // Wi-Fi may drop while a long walkthrough uploads: stop before the next part.
        const reason = await uploadBlocker();
        if (reason) {
          onBlocked(reason);
          return;
        }
        const done = job.parts
          .filter((p) => p.status === 'uploaded')
          .reduce((s, p) => s + p.sizeBytes, 0);
        const report = (inFlight: number) =>
          onProgress({
            uploadId: job.uploadId,
            apartmentName: job.apartmentName,
            sentBytes: done + inFlight,
            totalBytes: job.sizeBytes,
            partNumber: part!.partNumber,
            partCount: job.parts.length,
          });
        report(0);

        // Finished in the background or before a crash? Then nothing to send.
        if (await confirmPart(job.uploadId, part.partNumber, job.backend)) {
          job = markPart(job, part.partNumber, 'uploaded');
          await updateJob(job);
          continue;
        }

        const partFile = await writePartFile(job, part.partNumber);
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) throw new Error('Signed out');
          const r2 = job.backend === 'r2';
          if (r2 && !uploadsUrl) throw new Error('Uploads service not configured');
          const task = partFile.createUploadTask(
            r2
              ? `${uploadsUrl}/parts/${job.uploadId}/${part.partNumber}`
              : partUploadUrl(supabaseConfig.url, part.objectPath),
            {
              httpMethod: r2 ? 'PUT' : 'POST',
              uploadType: UploadType.BINARY_CONTENT,
              sessionType: 'background',
              headers: r2
                ? { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }
                : {
                    authorization: `Bearer ${token}`,
                    apikey: supabaseConfig.anonKey,
                    'content-type': job.mime,
                    'x-upsert': 'false',
                  },
              onProgress: (p) => report(p.bytesSent),
            },
          );
          const result = await task.uploadAsync();
          // 2xx, or "already exists" from an earlier attempt: the database decides either way.
          if (!(await confirmPart(job.uploadId, part.partNumber, job.backend))) {
            throw new Error(`Part ${part.partNumber} was not stored (HTTP ${result.status})`);
          }
          job = markPart(job, part.partNumber, 'uploaded');
          await updateJob(job);
        } catch (e) {
          job = markPart(job, part.partNumber, 'failed', (e as Error).message);
          await updateJob(job);
          const failed = job.parts.find((p) => p.partNumber === part!.partNumber)!;
          await new Promise((r) => setTimeout(r, retryDelayMs(failed.attempts)));
          if (failed.attempts >= 8) return; // Give up for now; the next run (foreground) resumes.
        } finally {
          if (partFile.exists) partFile.delete();
        }
      }

      if (isComplete(job)) {
        const recording = new File(job.fileUri);
        if (recording.exists) recording.delete();
        await saveQueue((await loadQueue()).filter((j) => j.uploadId !== job.uploadId));
      }
    }
  } finally {
    running = false;
    onProgress(null);
  }
}
