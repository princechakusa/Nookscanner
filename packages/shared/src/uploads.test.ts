import { describe, expect, it } from 'vitest';
import {
  UPLOAD_LIMITS,
  UPLOAD_PART_BYTES,
  planParts,
  rawFootagePartPath,
  rawFootagePath,
  validateVideoFile,
  videoMimeFor,
} from './uploads.ts';

const ok = { name: 'walkthrough.mov', type: 'video/quicktime', size: 1_000_000 };
const codes = (input: Parameters<typeof validateVideoFile>[0]) =>
  validateVideoFile(input).map((i) => i.code);

describe('validateVideoFile', () => {
  it('accepts a normal iPhone MOV', () => {
    expect(validateVideoFile({ ...ok, durationMs: 600_000, width: 3840, height: 2160 })).toEqual(
      [],
    );
  });

  it('accepts MP4', () => {
    expect(codes({ name: 'a.MP4', type: 'video/mp4', size: 10 })).toEqual([]);
  });

  it('rejects unsupported types', () => {
    expect(codes({ name: 'a.avi', type: 'video/x-msvideo', size: 10 })).toContain(
      'UNSUPPORTED_TYPE',
    );
    expect(codes({ name: 'a.exe', type: 'application/octet-stream', size: 10 })).toContain(
      'UNSUPPORTED_TYPE',
    );
  });

  it('rejects extension that does not match the type', () => {
    expect(codes({ name: 'clip.mp4.exe', type: 'video/mp4', size: 10 })).toContain(
      'EXTENSION_MISMATCH',
    );
  });

  it('rejects empty and oversized files', () => {
    expect(codes({ ...ok, size: 0 })).toContain('EMPTY_FILE');
    expect(codes({ ...ok, size: UPLOAD_LIMITS.maxBytes + 1 })).toContain('FILE_TOO_LARGE');
  });

  it('rejects too short and too long videos', () => {
    expect(codes({ ...ok, durationMs: 5_000 })).toContain('VIDEO_TOO_SHORT');
    expect(codes({ ...ok, durationMs: UPLOAD_LIMITS.maxDurationMs + 1 })).toContain(
      'VIDEO_TOO_LONG',
    );
  });

  it('warns (non-blocking) on low resolution', () => {
    const issues = validateVideoFile({ ...ok, width: 1280, height: 720 });
    expect(issues).toEqual([{ code: 'RESOLUTION_TOO_LOW', blocking: false }]);
  });

  it('rejects overlong file names', () => {
    expect(codes({ ...ok, name: `${'a'.repeat(300)}.mov` })).toEqual(['INVALID_NAME']);
  });
});

describe('rawFootagePath', () => {
  const ids = {
    organizationId: '0b9f5c1e-8a51-4c5e-9d43-2f0c7b1a8e11',
    scanSessionId: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    uploadId: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
  };

  it('builds an org-prefixed path', () => {
    expect(rawFootagePath({ ...ids, mime: 'video/quicktime' })).toBe(
      `org/${ids.organizationId}/scans/${ids.scanSessionId}/${ids.uploadId}.mov`,
    );
  });

  it('rejects path traversal attempts', () => {
    expect(() =>
      rawFootagePath({ ...ids, organizationId: '../other-org', mime: 'video/mp4' }),
    ).toThrow();
  });
});

describe('planParts (ADR-016 chunked uploads)', () => {
  it('matches the database part plan', () => {
    const p = UPLOAD_PART_BYTES;
    expect(p).toBe(47185920);
    expect(planParts(2 * p + 1234)).toEqual([
      { partNumber: 1, start: 0, end: p },
      { partNumber: 2, start: p, end: 2 * p },
      { partNumber: 3, start: 2 * p, end: 2 * p + 1234 },
    ]);
    expect(planParts(p)).toHaveLength(1);
    expect(planParts(10 * 1024 ** 3)).toHaveLength(228);
  });

  it('every part is within the 50 MB Free object limit and parts cover the file exactly', () => {
    const size = 3 * UPLOAD_PART_BYTES - 7;
    const parts = planParts(size);
    expect(parts.every((x) => x.end - x.start <= 50 * 1000 * 1000)).toBe(true);
    expect(parts.reduce((sum, x) => sum + (x.end - x.start), 0)).toBe(size);
  });

  it('returns no parts for empty or invalid sizes', () => {
    expect(planParts(0)).toEqual([]);
    expect(planParts(-1)).toEqual([]);
    expect(planParts(1.5)).toEqual([]);
  });
});

describe('rawFootagePartPath', () => {
  const ids = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    scanSessionId: '22222222-2222-4222-8222-222222222222',
    uploadId: '33333333-3333-4333-8333-333333333333',
  };
  it('matches the server-built part path', () => {
    expect(rawFootagePartPath({ ...ids, mime: 'video/quicktime', partNumber: 2 })).toBe(
      `org/${ids.organizationId}/scans/${ids.scanSessionId}/${ids.uploadId}/part-00002.mov`,
    );
  });
  it('rejects invalid part numbers', () => {
    for (const partNumber of [0, 1001, 1.5])
      expect(() => rawFootagePartPath({ ...ids, mime: 'video/mp4', partNumber })).toThrow();
  });
});

describe('videoMimeFor', () => {
  it('falls back to the extension when the browser reports no or a generic type', () => {
    expect(videoMimeFor('walk.MOV', '')).toBe('video/quicktime');
    expect(videoMimeFor('walk.m4v', 'application/octet-stream')).toBe('video/mp4');
    expect(videoMimeFor('walk.mp4', 'video/mp4')).toBe('video/mp4');
  });
  it('never overrides a specific reported type or invents one', () => {
    expect(videoMimeFor('walk.mp4', 'application/pdf')).toBe('application/pdf');
    expect(videoMimeFor('notes.txt', '')).toBe('');
  });
});
