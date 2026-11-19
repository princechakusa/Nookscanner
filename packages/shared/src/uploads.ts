/**
 * Client-side upload rules for apartment walkthrough videos (requirements UP-02, docs/SECURITY.md
 * section 7). These checks are a usability layer only: the database registration function and the
 * worker's container probe repeat them server-side.
 */
import { z } from 'zod';

export const ALLOWED_VIDEO_TYPES = {
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov'],
} as const;

export type AllowedVideoMime = keyof typeof ALLOWED_VIDEO_TYPES;

export const UPLOAD_LIMITS = {
  /** Pilot limit per file: 10 GiB. */
  maxBytes: 10 * 1024 ** 3,
  /** Pilot limit per file: 30 minutes. */
  maxDurationMs: 30 * 60 * 1000,
  /** Shorter than this cannot cover an apartment. */
  minDurationMs: 20 * 1000,
  /** Minimum short side in pixels (1080p). */
  minShortSidePx: 1080,
  /** TUS chunk size required by Supabase Storage resumable uploads. */
  tusChunkBytes: 6 * 1024 * 1024,
} as const;

export const videoFileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string(),
  size: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type VideoFileInfo = z.infer<typeof videoFileSchema>;

export type UploadIssueCode =
  | 'UNSUPPORTED_TYPE'
  | 'EXTENSION_MISMATCH'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'VIDEO_TOO_SHORT'
  | 'VIDEO_TOO_LONG'
  | 'RESOLUTION_TOO_LOW'
  | 'INVALID_NAME';

export interface UploadIssue {
  code: UploadIssueCode;
  /** True when the upload must be blocked; false for warnings the manager can accept. */
  blocking: boolean;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function validateVideoFile(input: VideoFileInfo): UploadIssue[] {
  const parsed = videoFileSchema.safeParse(input);
  if (!parsed.success) return [{ code: 'INVALID_NAME', blocking: true }];
  const file = parsed.data;
  const issues: UploadIssue[] = [];

  const mime = file.type.toLowerCase();
  const allowedExts = (ALLOWED_VIDEO_TYPES as Record<string, readonly string[]>)[mime];
  if (!allowedExts) {
    issues.push({ code: 'UNSUPPORTED_TYPE', blocking: true });
  } else if (!allowedExts.includes(extensionOf(file.name))) {
    issues.push({ code: 'EXTENSION_MISMATCH', blocking: true });
  }

  if (file.size === 0) issues.push({ code: 'EMPTY_FILE', blocking: true });
  if (file.size > UPLOAD_LIMITS.maxBytes) issues.push({ code: 'FILE_TOO_LARGE', blocking: true });

  if (file.durationMs !== undefined) {
    if (file.durationMs < UPLOAD_LIMITS.minDurationMs)
      issues.push({ code: 'VIDEO_TOO_SHORT', blocking: true });
    if (file.durationMs > UPLOAD_LIMITS.maxDurationMs)
      issues.push({ code: 'VIDEO_TOO_LONG', blocking: true });
  }

  if (file.width !== undefined && file.height !== undefined) {
    if (Math.min(file.width, file.height) < UPLOAD_LIMITS.minShortSidePx)
      issues.push({ code: 'RESOLUTION_TOO_LOW', blocking: false });
  }

  return issues;
}

/**
 * Storage object path for raw footage. The org id prefix is what storage RLS checks
 * (docs/DATABASE_SCHEMA.md section 5). Ids must be UUIDs; the extension is normalised.
 */
export function rawFootagePath(params: {
  organizationId: string;
  scanSessionId: string;
  uploadId: string;
  mime: AllowedVideoMime;
}): string {
  const uuid = z.uuid();
  uuid.parse(params.organizationId);
  uuid.parse(params.scanSessionId);
  uuid.parse(params.uploadId);
  const ext = ALLOWED_VIDEO_TYPES[params.mime][0];
  return `org/${params.organizationId}/scans/${params.scanSessionId}/${params.uploadId}${ext}`;
}
