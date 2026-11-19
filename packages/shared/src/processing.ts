/**
 * Reconstruction worker job contract v1 (docs/API_SPECIFICATION.md section 6).
 * Mirrored in services/reconstruction/nooktour_reconstruction/contract.py.
 */
import { z } from 'zod';

export const RECONSTRUCTION_PROVIDERS = ['self_hosted_gsplat', 'varjo_teleport'] as const;

export const JOB_STAGES = [
  'queued',
  'downloading',
  'extracting_frames',
  'estimating_poses',
  'training',
  'cleaning',
  'compressing',
  'uploading',
  'done',
] as const;

const httpsUrl = z.url().refine((u) => u.startsWith('https://'), 'must be https');

export const jobRequestSchema = z.object({
  contractVersion: z.literal(1),
  jobId: z.uuid(),
  attempt: z.number().int().min(1).max(10),
  organizationId: z.uuid(),
  apartmentId: z.uuid(),
  provider: z.enum(RECONSTRUCTION_PROVIDERS),
  inputs: z
    .array(
      z.object({
        uploadId: z.uuid(),
        downloadUrl: httpsUrl,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(20),
  outputs: z.object({
    uploadUrls: z.object({ ply: httpsUrl, sog: httpsUrl, spz: httpsUrl, preview: httpsUrl }),
  }),
  callbackUrl: httpsUrl,
  parameters: z.object({
    maxGaussians: z.number().int().min(100_000).max(10_000_000),
    trainingSteps: z.number().int().min(1_000).max(100_000),
    frameSampleFps: z.number().min(0.5).max(10),
  }),
});

export type JobRequest = z.infer<typeof jobRequestSchema>;
