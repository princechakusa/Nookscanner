import { describe, expect, it } from 'vitest';
import {
  createJob,
  estimateRemainingMs,
  isComplete,
  jobProgress,
  markPart,
  nextPendingPart,
  parseQueue,
  partRange,
  partUploadUrl,
  reconcile,
  retryDelayMs,
} from './upload-queue.ts';
import { UPLOAD_PART_BYTES as P } from './uploads.ts';

const uploadId = '33333333-3333-4333-8333-333333333333';
const sessionId = '22222222-2222-4222-8222-222222222222';
const size = 2 * P + 1000;
const serverParts = [3, 1, 2].map((n) => ({
  partNumber: n,
  objectPath: `org/o/scans/s/${uploadId}/part-0000${n}.mov`,
  sizeBytes: n === 3 ? 1000 : P,
  status: 'pending',
}));
const job = createJob({
  uploadId,
  sessionId,
  apartmentName: 'Marina View 2BR',
  fileUri: 'file:///docs/recordings/a.mov',
  mime: 'video/quicktime',
  sizeBytes: size,
  serverParts,
  now: new Date('2026-11-20T08:00:00Z'),
});

describe('upload queue', () => {
  it('creates a job with parts in order, checked against the local file size', () => {
    expect(job.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(nextPendingPart(job)?.partNumber).toBe(1);
    expect(partRange(job, 3)).toEqual({ start: 2 * P, end: size });
    expect(() => createJob({ ...job, serverParts, sizeBytes: size + 1, now: new Date() })).toThrow(
      'do not match',
    );
    expect(() =>
      createJob({ ...job, serverParts: serverParts.slice(0, 2), sizeBytes: size, now: new Date() }),
    ).toThrow('do not match');
  });

  it('tracks progress, failures with attempts, and completion', () => {
    let j = markPart(job, 1, 'failed', 'offline');
    expect(j.lastError).toBe('offline');
    expect(j.parts[0]!.attempts).toBe(1);
    expect(jobProgress(j, 1000).sentBytes).toBe(1000);
    j = markPart(markPart(j, 1, 'uploaded'), 2, 'uploaded');
    expect(j.lastError).toBeNull();
    expect(jobProgress(j).doneBytes).toBe(2 * P);
    expect(nextPendingPart(j)?.partNumber).toBe(3);
    expect(isComplete(markPart(j, 3, 'uploaded'))).toBe(true);
    expect(jobProgress(markPart(j, 3, 'uploaded'), 999).fraction).toBe(1);
  });

  it('reconciles with the database after a restart', () => {
    const j = reconcile(job, [
      { partNumber: 1, status: 'uploaded' },
      { partNumber: 2, status: 'pending' },
    ]);
    expect(j.parts.map((p) => p.status)).toEqual(['uploaded', 'pending', 'pending']);
  });

  it('persists and restores; malformed entries are dropped', () => {
    const json = JSON.stringify([job, { uploadId: 'nope' }]);
    expect(parseQueue(json)).toEqual([job]);
    expect(parseQueue('not json')).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('{}')).toEqual([]);
  });

  it('backs off exponentially up to five minutes', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([2000, 4000, 8000, 16000]);
    expect(retryDelayMs(20)).toBe(300_000);
  });

  it('builds the storage URL with each path segment encoded', () => {
    expect(partUploadUrl('https://x.supabase.co/', 'org/a b/part-00001.mov')).toBe(
      'https://x.supabase.co/storage/v1/object/raw-footage/org/a%20b/part-00001.mov',
    );
  });
});

describe('estimateRemainingMs', () => {
  const MB = 1024 * 1024;
  it('uses only the speed seen since watching started (bytes sent earlier do not count)', () => {
    // 10 MB in 10 s since opening; 50 MB left -> 50 s, however much was sent before.
    expect(estimateRemainingMs(10 * MB, 10_000, 50 * MB)).toBe(50_000);
  });
  it('waits for enough data before estimating', () => {
    expect(estimateRemainingMs(10 * MB, 1000, 50 * MB)).toBeNull();
    expect(estimateRemainingMs(MB / 2, 10_000, 50 * MB)).toBeNull();
  });
});
