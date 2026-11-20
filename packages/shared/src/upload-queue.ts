/**
 * Upload queue for the capture app (Stage 5.6). A job is one accepted recording registered as a
 * media upload; its parts (ADR-016) are uploaded one by one and confirmed by the database
 * (`complete_media_upload_part`, size-verified). The queue is persisted on the phone so uploads
 * continue after backgrounding, network loss or an app restart. Pure functions, unit-tested.
 */
import { z } from 'zod';
import { planParts } from './uploads.ts';

const partSchema = z.object({
  partNumber: z.number().int().min(1).max(1000),
  objectPath: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive(),
  status: z.enum(['pending', 'uploaded']),
  attempts: z.number().int().nonnegative().default(0),
});

export const uploadJobSchema = z.object({
  uploadId: z.uuid(),
  sessionId: z.uuid(),
  apartmentName: z.string().max(120),
  fileUri: z.string().min(1),
  mime: z.enum(['video/mp4', 'video/quicktime']),
  sizeBytes: z.number().int().positive(),
  parts: z.array(partSchema).min(1).max(1000),
  createdAt: z.iso.datetime(),
  lastError: z.string().max(300).nullable().default(null),
});
export type UploadJob = z.infer<typeof uploadJobSchema>;
export type UploadPartState = UploadJob['parts'][number];

/** Reads a persisted queue; anything malformed is dropped rather than crashing the app. */
export function parseQueue(json: string | null | undefined): UploadJob[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((j) => {
      const r = uploadJobSchema.safeParse(j);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Builds a job from the server's part list and checks it against the local file: the parts must
 * cover exactly the file size with the planned byte ranges, otherwise the file is not the one
 * that was registered (never upload mismatched bytes).
 */
export function createJob(input: {
  uploadId: string;
  sessionId: string;
  apartmentName: string;
  fileUri: string;
  mime: 'video/mp4' | 'video/quicktime';
  sizeBytes: number;
  serverParts: ReadonlyArray<{
    partNumber: number;
    objectPath: string;
    sizeBytes: number;
    status: string;
  }>;
  now: Date;
}): UploadJob {
  const plan = planParts(input.sizeBytes);
  const sorted = [...input.serverParts].sort((a, b) => a.partNumber - b.partNumber);
  if (
    plan.length !== sorted.length ||
    plan.some(
      (p, i) => p.partNumber !== sorted[i]!.partNumber || p.end - p.start !== sorted[i]!.sizeBytes,
    )
  ) {
    throw new Error('Registered parts do not match the recording');
  }
  return uploadJobSchema.parse({
    uploadId: input.uploadId,
    sessionId: input.sessionId,
    apartmentName: input.apartmentName,
    fileUri: input.fileUri,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    parts: sorted.map((p) => ({
      partNumber: p.partNumber,
      objectPath: p.objectPath,
      sizeBytes: p.sizeBytes,
      status: p.status === 'uploaded' ? 'uploaded' : 'pending',
      attempts: 0,
    })),
    createdAt: input.now.toISOString(),
    lastError: null,
  });
}

/** Byte range of a part inside the recording file. */
export function partRange(job: UploadJob, partNumber: number): { start: number; end: number } {
  const p = planParts(job.sizeBytes).find((x) => x.partNumber === partNumber);
  if (!p) throw new Error(`No part ${partNumber}`);
  return { start: p.start, end: p.end };
}

export const nextPendingPart = (job: UploadJob): UploadPartState | undefined =>
  job.parts.find((p) => p.status === 'pending');

export const isComplete = (job: UploadJob) => job.parts.every((p) => p.status === 'uploaded');

/** Bytes confirmed by the database, and the fraction of the recording. */
export function jobProgress(job: UploadJob, inFlightBytes = 0) {
  const done = job.parts
    .filter((p) => p.status === 'uploaded')
    .reduce((s, p) => s + p.sizeBytes, 0);
  const sent = Math.min(job.sizeBytes, done + Math.max(0, inFlightBytes));
  return { doneBytes: done, sentBytes: sent, fraction: sent / job.sizeBytes };
}

export function markPart(
  job: UploadJob,
  partNumber: number,
  status: 'uploaded' | 'failed',
  error?: string,
): UploadJob {
  return {
    ...job,
    lastError: status === 'failed' ? (error ?? 'Upload failed').slice(0, 300) : null,
    parts: job.parts.map((p) =>
      p.partNumber !== partNumber
        ? p
        : status === 'uploaded'
          ? { ...p, status: 'uploaded' }
          : { ...p, attempts: p.attempts + 1 },
    ),
  };
}

/** Takes the database's view (after a restart, a part may have finished in the background). */
export function reconcile(
  job: UploadJob,
  server: ReadonlyArray<{ partNumber: number; status: string }>,
): UploadJob {
  const uploaded = new Set(server.filter((p) => p.status === 'uploaded').map((p) => p.partNumber));
  return {
    ...job,
    parts: job.parts.map((p) => (uploaded.has(p.partNumber) ? { ...p, status: 'uploaded' } : p)),
  };
}

/** Wait before retrying a part: 2 s, 4 s, 8 s ... capped at 5 minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 2000 * 2 ** Math.max(0, attempts - 1));
}

/** Storage endpoint for one part (standard upload; each part is at most 45 MiB). */
export function partUploadUrl(supabaseUrl: string, objectPath: string): string {
  const path = objectPath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/raw-footage/${path}`;
}
