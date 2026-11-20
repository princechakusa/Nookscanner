/**
 * Reconstruction worker job contract v2 (Stage 6.2; docs/API_SPECIFICATION.md section 6).
 * Mirrored in services/reconstruction/nookscanner_reconstruction/contract.py; both sides validate
 * the same fixtures in `fixtures/` so they cannot drift.
 *
 * v2 replaces v1: inputs carry their stored parts (ADR-016) instead of one file, and the worker
 * asks for signed upload URLs for the files it actually produced (a streamed LOD scene is many
 * files) instead of receiving four fixed upload URLs.
 */
import { z } from 'zod';

export const CONTRACT_VERSION = 2;

export const RECONSTRUCTION_PROVIDERS = ['self_hosted_gsplat', 'varjo_teleport'] as const;

/** Stages the worker reports, in order (services/reconstruction pipeline.STAGES + transfer). */
export const JOB_STAGES = [
  'queued',
  'downloading',
  'validating',
  'extracting_frames',
  'estimating_poses',
  'training',
  'compressing',
  'uploading',
  'reporting',
  'done',
] as const;

const httpsUrl = z.url().refine((u) => u.startsWith('https://'), 'must be https');

const partSchema = z.object({
  partNumber: z.number().int().min(1).max(1000),
  sizeBytes: z.number().int().positive().max(47_185_920),
  downloadUrl: httpsUrl,
});

export const jobRequestSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    jobId: z.uuid(),
    attempt: z.number().int().min(1).max(10),
    organizationId: z.uuid(),
    apartmentId: z.uuid(),
    provider: z.enum(RECONSTRUCTION_PROVIDERS),
    inputs: z
      .array(
        z
          .object({
            uploadId: z.uuid(),
            mime: z.enum(['video/mp4', 'video/quicktime']),
            sizeBytes: z.number().int().positive().max(10_737_418_240),
            parts: z.array(partSchema).min(1).max(1000),
          })
          .refine(
            (i) =>
              i.parts.every((p, n) => p.partNumber === n + 1) &&
              i.parts.reduce((s, p) => s + p.sizeBytes, 0) === i.sizeBytes,
            { message: 'parts must be numbered 1..n and add up to sizeBytes' },
          ),
      )
      .min(1)
      .max(20),
    callbackUrl: httpsUrl,
    parameters: z.object({
      maxGaussians: z.number().int().min(100_000).max(10_000_000),
      trainingSteps: z.number().int().min(1_000).max(100_000),
      frameSampleFps: z.number().min(0.5).max(10),
      captureTier: z.enum(['T1', 'T2', 'T3', 'T4', 'T5']).nullable(),
    }),
  })
  .strict();
export type JobRequest = z.infer<typeof jobRequestSchema>;

/**
 * Output files are relative paths under the job's scene folder: lower-case segments, no `..`,
 * only the formats the viewer loads. The platform builds the full storage path itself.
 */
export const OUTPUT_PATH =
  /^(?:[a-z0-9][a-z0-9_.-]{0,63}\/){0,3}[a-z0-9][a-z0-9_.-]{0,63}\.(?:sog|json|webp|ply|spz|png|jpg)$/;
export const isSafeOutputPath = (p: string) =>
  OUTPUT_PATH.test(p) && !p.split('/').some((s) => s === '..' || s.startsWith('.'));

const outputFile = z.object({
  path: z.string().max(260).refine(isSafeOutputPath, 'unsafe output path'),
  sizeBytes: z.number().int().positive().max(47_185_920),
});

const base = {
  contractVersion: z.literal(CONTRACT_VERSION),
  jobId: z.uuid(),
  attempt: z.number().int().min(1).max(10),
};

export const workerEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('progress'),
      stage: z.enum(JOB_STAGES),
      progress: z.number().min(0).max(100),
    })
    .strict(),
  z
    .object({ ...base, kind: z.literal('upload_urls'), files: z.array(outputFile).min(1).max(200) })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('succeeded'),
      files: z
        .array(outputFile.extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
        .min(1)
        .max(200),
      report: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('failed'),
      code: z.string().regex(/^[A-Z0-9_]{2,60}$/),
      message: z.string().max(500),
      transient: z.boolean(),
    })
    .strict(),
]);
export type WorkerEvent = z.infer<typeof workerEventSchema>;

/** HTTP headers carrying the HMAC signature (worker <-> platform), as in runner.py. */
export const WORKER_TIMESTAMP_HEADER = 'x-nookscanner-timestamp';
export const WORKER_SIGNATURE_HEADER = 'x-nookscanner-signature';
/** Callback bodies above this size are rejected before parsing. */
export const MAX_CALLBACK_BYTES = 256 * 1024;

/** Storage path of a job's output file (bucket scene-drafts; DATABASE_SCHEMA section 5). */
export function sceneOutputPath(p: {
  organizationId: string;
  apartmentId: string;
  jobId: string;
  attempt: number;
  file: string;
}): string {
  if (!isSafeOutputPath(p.file)) throw new Error('unsafe output path');
  return `org/${p.organizationId}/apartments/${p.apartmentId}/scenes/${p.jobId}/a${p.attempt}/${p.file}`;
}
