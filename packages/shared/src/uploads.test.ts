import { describe, expect, it } from 'vitest';
import { UPLOAD_LIMITS, rawFootagePath, validateVideoFile } from './uploads.ts';

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
