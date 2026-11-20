import { describe, expect, it } from 'vitest';
import fixture from './fixtures/job-request-v2.json' with { type: 'json' };
import { isSafeOutputPath, jobRequestSchema, workerEventSchema } from './processing.ts';

function mutate(path: Array<string | number>, value: unknown): unknown {
  const copy = structuredClone(fixture.valid) as Record<string, unknown>;
  let node = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  node[path.at(-1)!] = value;
  return copy;
}

describe('job contract v2 (shared fixture, also checked by the Python worker)', () => {
  it('accepts the valid request', () => {
    expect(jobRequestSchema.parse(fixture.valid).inputs[0]!.parts).toHaveLength(2);
  });

  it.each(Object.entries(fixture.invalid))('rejects: %s', (_name, { path, value }) => {
    expect(jobRequestSchema.safeParse(mutate(path, value)).success).toBe(false);
  });

  it('rejects unknown top-level keys (no smuggled fields)', () => {
    expect(jobRequestSchema.safeParse({ ...fixture.valid, extra: 1 }).success).toBe(false);
  });

  it.each(fixture.outputPaths.safe)('safe output path %s', (p) =>
    expect(isSafeOutputPath(p)).toBe(true),
  );
  it.each(fixture.outputPaths.unsafe)('unsafe output path %j', (p) =>
    expect(isSafeOutputPath(p)).toBe(false),
  );
});

describe('worker events', () => {
  const base = { contractVersion: 2, jobId: fixture.valid.jobId, attempt: 1 };

  it('accepts each event kind', () => {
    for (const e of [
      { ...base, kind: 'progress', stage: 'training', progress: 42.5 },
      { ...base, kind: 'upload_urls', files: [{ path: 'scene.sog', sizeBytes: 1000 }] },
      {
        ...base,
        kind: 'succeeded',
        files: [{ path: 'scene.sog', sizeBytes: 1000, sha256: 'a'.repeat(64) }],
        report: { heldout: { psnr: 27 } },
      },
      { ...base, kind: 'failed', code: 'GPU_UNAVAILABLE', message: 'No GPU', transient: true },
    ]) {
      expect(workerEventSchema.safeParse(e).success, JSON.stringify(e)).toBe(true);
    }
  });

  it('rejects unknown stages, unsafe paths, bad codes and extra fields', () => {
    for (const e of [
      { ...base, kind: 'progress', stage: 'mining', progress: 1 },
      { ...base, kind: 'progress', stage: 'training', progress: 101 },
      { ...base, kind: 'upload_urls', files: [{ path: '../x.sog', sizeBytes: 1 }] },
      { ...base, kind: 'failed', code: 'bad code', message: 'x', transient: false },
      { ...base, kind: 'progress', stage: 'training', progress: 1, admin: true },
      { ...base, kind: 'delete_everything' },
    ]) {
      expect(workerEventSchema.safeParse(e).success, JSON.stringify(e)).toBe(false);
    }
  });
});
