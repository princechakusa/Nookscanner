import type { Status } from '@nookscanner/ui';

/** `scan_status` and `job_status` (DB enums) mapped onto status-pill tones and plain words. */
export const SCAN_STATUS: Record<string, { tone: Status; label: string }> = {
  draft: { tone: 'draft', label: 'Draft' },
  recording: { tone: 'processing', label: 'Recording' },
  uploading: { tone: 'processing', label: 'Uploading' },
  uploaded: { tone: 'review', label: 'Ready to process' },
  submitted: { tone: 'processing', label: 'Queued' },
  processing: { tone: 'processing', label: 'Creating 3D' },
  succeeded: { tone: 'published', label: '3D ready' },
  failed: { tone: 'failed', label: 'Failed' },
  cancelled: { tone: 'draft', label: 'Cancelled' },
};

export const JOB_STATUS: Record<string, { tone: Status; label: string }> = {
  queued: { tone: 'processing', label: 'Queued' },
  dispatched: { tone: 'processing', label: 'Starting' },
  running: { tone: 'processing', label: 'Running' },
  succeeded: { tone: 'published', label: 'Finished' },
  failed: { tone: 'failed', label: 'Failed' },
  cancelled: { tone: 'draft', label: 'Cancelled' },
};

export { FLAG_LABELS, JOB_ERRORS, STAGE_LABELS } from '@nookscanner/shared';
