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

/** Plain-language stage names for managers (packages/shared JOB_STAGES). */
export const STAGE_LABELS: Record<string, string> = {
  queued: 'Waiting for a processing slot',
  downloading: 'Fetching the video',
  validating: 'Checking the video',
  extracting_frames: 'Picking sharp frames',
  estimating_poses: 'Working out camera positions',
  training: 'Building the 3D apartment',
  compressing: 'Preparing it for phones',
  uploading: 'Saving the result',
  reporting: 'Measuring quality',
  done: 'Done',
};

/** Failure codes the worker or database report, in words a manager can act on. */
export const JOB_ERRORS: Record<string, string> = {
  GPU_UNAVAILABLE: 'The processing service was busy. It retries automatically.',
  WORKER_TIMEOUT: 'Processing stopped responding. It retries automatically.',
  DOWNLOAD_FAILED: 'The video could not be fetched. It retries automatically.',
  UPLOAD_FAILED: 'The result could not be saved. It retries automatically.',
  POSE_ESTIMATION_FAILED:
    'Too few camera positions could be worked out. Record again more slowly, with more light and overlap between rooms.',
  TRAINING_NO_OUTPUT: 'The 3D apartment could not be built from this video. Record it again.',
  MULTI_INPUT_UNSUPPORTED: 'Upload the walkthrough as one video for now.',
  WORKER_REJECTED: 'The processing service rejected this job. Contact support.',
  INVALID_INPUTS: 'The uploaded files are incomplete. Upload the video again.',
  TOO_FEW_SHARP_FRAMES:
    'Too few sharp frames. Record again walking slowly, holding the phone steady, with all lights on.',
  TRAINING_NO_METRICS: 'The quality could not be measured. It will be checked by support.',
  PROVIDER_UNAVAILABLE: 'The selected processing service is not available. Contact support.',
  UNREADABLE_VIDEO: 'The video file cannot be read. Export it again from the phone and upload it.',
  NO_VIDEO_STREAM: 'The file has no video in it. Upload the walkthrough video file.',
  CONTAINER_UNSUPPORTED: 'This file type is not supported. Upload an MP4 or MOV video.',
  CODEC_UNSUPPORTED:
    'This video format is not supported. Record with the phone camera app (H.264 or HEVC).',
  RESOLUTION_TOO_LOW: 'The video resolution is too low. Record at least 1080p, ideally 4K.',
  FRAME_RATE_TOO_LOW: 'The frame rate is too low. Record at 30 fps or more.',
  VIDEO_TOO_SHORT: 'The video is too short to cover an apartment. Record a full walkthrough.',
  VIDEO_TOO_LONG:
    'The video is longer than 30 minutes. Split the walkthrough or record more efficiently.',
  CANCELLED: 'Processing was cancelled.',
};

/** Report flags (pipeline) explained for the review screen. */
export const FLAG_LABELS: Record<string, string> = {
  LOW_CAMERA_REGISTRATION:
    'Many frames could not be placed. Parts of the apartment may be missing or misaligned.',
  FIRST_LOAD_OVER_BUDGET:
    'The 3D file is larger than the first-load budget; it may load slowly on phones.',
};
