import { describe, expect, it } from 'vitest';
import {
  captureMetadata,
  captureMetadataSchema,
  captureReducer,
  checkpointPlan,
  initialCapture,
  missedRooms,
  type CaptureEvent,
  type PlanRoom,
} from './capture.ts';
import { captureProfile } from './device-tiers.ts';

const rooms: PlanRoom[] = [
  { id: 'r0', nameEn: 'Entrance', nameAr: 'المدخل', roomType: 'entrance' },
  { id: 'r1', nameEn: 'Living room', nameAr: null, roomType: 'living' },
  { id: 'r2', nameEn: 'Kitchen', nameAr: 'المطبخ', roomType: 'kitchen' },
];

describe('checkpointPlan', () => {
  it('alternates rooms and doorway transitions and ends with a loop back to the start', () => {
    const plan = checkpointPlan(rooms);
    expect(plan.map((s) => s.kind)).toEqual([
      'room',
      'transition',
      'room',
      'transition',
      'room',
      'loop_closure',
    ]);
    const roomsOnly = plan.filter((s) => s.kind === 'room');
    expect(roomsOnly.map((s) => s.sequence)).toEqual([0, 1, 2]);
    expect(plan[1]).toMatchObject({ fromRoomId: 'r0', toRoomId: 'r1' });
    expect(plan[1]!.instruction).toContain('door frame');
    expect(plan.at(-1)!.instruction).toContain('Entrance');
    // Room-specific guidance (appliances from two angles in the kitchen).
    expect(roomsOnly[2]!.instruction).toContain('two angles');
  });

  it('a single room has no transitions or loop; no rooms gives no plan', () => {
    expect(checkpointPlan(rooms.slice(0, 1)).map((s) => s.kind)).toEqual(['room']);
    expect(checkpointPlan([])).toEqual([]);
  });
});

describe('captureReducer', () => {
  const run = (events: CaptureEvent[], count = 3) =>
    events.reduce(captureReducer, initialCapture(count));

  it('records marks in video time across pause and resume, then reviews and accepts', () => {
    const s = run([
      { type: 'start', atMs: 0 },
      { type: 'next', atMs: 20_000 },
      { type: 'pause', atMs: 25_000 },
      { type: 'resume', atMs: 25_000 },
      { type: 'next', atMs: 60_000 },
      { type: 'stop', atMs: 90_000 },
    ]);
    expect(s.status).toBe('review');
    expect(s.pauses).toBe(1);
    expect(s.marks).toEqual([
      { sequence: 0, startMs: 0, endMs: 20_000 },
      { sequence: 1, startMs: 20_000, endMs: 60_000 },
      { sequence: 2, startMs: 60_000, endMs: 90_000 },
    ]);
    expect(missedRooms(s)).toEqual([]);
    expect(captureReducer(s, { type: 'accept' }).status).toBe('accepted');
  });

  it('ignores invalid transitions', () => {
    const ready = initialCapture(2);
    expect(captureReducer(ready, { type: 'pause', atMs: 0 })).toBe(ready);
    expect(captureReducer(ready, { type: 'stop', atMs: 0 })).toBe(ready);
    expect(captureReducer(initialCapture(0), { type: 'start', atMs: 0 }).status).toBe('ready');
    const paused = run([
      { type: 'start', atMs: 0 },
      { type: 'pause', atMs: 1 },
    ]);
    expect(captureReducer(paused, { type: 'next', atMs: 2 })).toBe(paused);
    expect(captureReducer(paused, { type: 'accept' })).toBe(paused);
  });

  it('stopping while paused is allowed; rooms never reached or too short are reported', () => {
    const s = run([
      { type: 'start', atMs: 0 },
      { type: 'next', atMs: 3000 },
      { type: 'pause', atMs: 30_000 },
      { type: 'stop', atMs: 30_000 },
    ]);
    expect(s.status).toBe('review');
    expect(missedRooms(s)).toEqual([0, 2]);
    expect(captureReducer(s, { type: 'discard' }).status).toBe('discarded');
  });

  it('"next" past the last room keeps recording without new marks', () => {
    const s = run(
      [
        { type: 'start', atMs: 0 },
        { type: 'next', atMs: 10_000 },
        { type: 'next', atMs: 20_000 },
      ],
      2,
    );
    expect(s.status).toBe('recording');
    expect(s.marks).toHaveLength(2);
    expect(s.marks[1]!.endMs).toBe(20_000);
  });
});

describe('captureMetadata', () => {
  const profile = captureProfile({
    videoFormats: [{ width: 3840, height: 2160, maxFps: 60 }],
    supportsHevc: true,
    supportsStabilization: true,
  })!;
  const state = captureReducer(initialCapture(1), { type: 'start', atMs: 0 });

  it('records device, format, lens and exposure mode without any location', () => {
    const m = captureMetadata({
      platform: 'ios',
      deviceModel: 'iPhone17,2',
      osVersion: '26.1',
      appVersion: '0.1.0',
      profile,
      lens: 'wide',
      exposureLocked: true,
      state,
      durationMs: 123_456.7,
      capturedAt: new Date('2026-11-20T08:00:00Z'),
    });
    expect(m).toMatchObject({
      tier: 'T1',
      width: 3840,
      height: 2160,
      fps: 30,
      codec: 'hevc',
      exposureMode: 'locked',
      durationMs: 123_457,
    });
    expect(Object.keys(m).some((k) => /location|latitude|longitude|gps/i.test(k))).toBe(false);
  });

  it('the schema refuses extra keys such as location', () => {
    expect(
      captureMetadataSchema.safeParse({ platform: 'ios', location: { lat: 1, lng: 2 } }).success,
    ).toBe(false);
  });
});
