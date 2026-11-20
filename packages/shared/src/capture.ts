/**
 * Guided capture (Stage 5.4): the checkpoint plan built from an apartment's rooms, the recording
 * state machine (pause/resume/review) and per-capture metadata. Pure functions, used by the
 * Nookscanner Capture app and tested here. Guidance follows docs/3D_QUALITY_BAR.md section 2.
 */
import { z } from 'zod';
import type { CaptureProfile, TierId } from './device-tiers.ts';
import type { RoomType } from './property.ts';

export interface PlanRoom {
  id: string;
  nameEn: string;
  nameAr: string | null;
  roomType: RoomType;
}

export type PlanStep =
  | {
      kind: 'room';
      sequence: number;
      roomId: string;
      roomType: RoomType;
      labelEn: string;
      labelAr: string | null;
      /** Room-specific guidance only (short, for list cards). */
      tip: string;
      /** Full guidance: the tip plus the general walking advice. */
      instruction: string;
    }
  | { kind: 'transition'; fromRoomId: string; toRoomId: string; instruction: string }
  | { kind: 'loop_closure'; instruction: string };

const ROOM_TIPS: Partial<Record<RoomType, string>> = {
  entrance: 'Start at the front door. Show the door, the light switches and the way in.',
  kitchen:
    'Film every appliance (hob, oven, fridge, dishwasher, washing machine) for a few seconds from two angles.',
  bathroom: 'Show the shower or bath controls, the water heater and the toilet flush clearly.',
  bedroom: 'Show the air conditioning unit and its remote, wardrobes and any safe.',
  living: 'Show the TV and its remote, air conditioning and light switches.',
  laundry: 'Show the washing machine and dryer controls up close, then from a step back.',
  balcony: 'Keep the doorway in view as you step out; avoid filming straight into the sun.',
};

const ROOM_BASE =
  'Walk slowly along the walls at chest height, then make a second pass a little lower. Capture every corner and the floor.';

/**
 * Walking-order plan: one step per room (rooms are already ordered by the manager), a doorway
 * transition between consecutive rooms, and a final return to the entrance (loop closure).
 */
export function checkpointPlan(rooms: readonly PlanRoom[]): PlanStep[] {
  const steps: PlanStep[] = [];
  rooms.forEach((room, i) => {
    const prev = rooms[i - 1];
    if (prev) {
      steps.push({
        kind: 'transition',
        fromRoomId: prev.id,
        toRoomId: room.id,
        instruction: `Walk slowly through the doorway into ${room.nameEn}, keeping the door frame and part of ${prev.nameEn} in view.`,
      });
    }
    steps.push({
      kind: 'room',
      sequence: i,
      roomId: room.id,
      roomType: room.roomType,
      labelEn: room.nameEn.slice(0, 80),
      labelAr: room.nameAr ? room.nameAr.slice(0, 80) : null,
      tip: ROOM_TIPS[room.roomType] ?? ROOM_BASE,
      instruction: [ROOM_TIPS[room.roomType], ROOM_BASE].filter(Boolean).join(' '),
    });
  });
  if (rooms.length > 1) {
    steps.push({
      kind: 'loop_closure',
      instruction: `Walk back to ${rooms[0]!.nameEn} the way you came and end where you started.`,
    });
  }
  return steps;
}

// ------------------------------------------------------------------------ Recording session

export type CaptureStatus = 'ready' | 'recording' | 'paused' | 'review' | 'accepted' | 'discarded';

export interface CheckpointMark {
  sequence: number;
  startMs: number;
  endMs: number | null;
}

export interface CaptureState {
  status: CaptureStatus;
  /** Index into the room steps (not transitions) of the current checkpoint. */
  current: number;
  roomCount: number;
  marks: CheckpointMark[];
  pauses: number;
}

export type CaptureEvent =
  | { type: 'start'; atMs: number }
  | { type: 'pause'; atMs: number }
  | { type: 'resume'; atMs: number }
  /** The manager taps "Room done" (or "Skip"): closes the current mark, opens the next. */
  | { type: 'next'; atMs: number }
  | { type: 'stop'; atMs: number }
  | { type: 'accept' }
  | { type: 'discard' };

export function initialCapture(roomCount: number): CaptureState {
  return { status: 'ready', current: 0, roomCount, marks: [], pauses: 0 };
}

const closeMark = (marks: CheckpointMark[], atMs: number) =>
  marks.map((m, i) => (i === marks.length - 1 && m.endMs === null ? { ...m, endMs: atMs } : m));

/**
 * Recording state machine. `atMs` is the recorder's recorded duration (pauses excluded), so marks
 * are positions in the final video. Invalid transitions return the state unchanged.
 */
export function captureReducer(state: CaptureState, event: CaptureEvent): CaptureState {
  switch (event.type) {
    case 'start':
      if (state.status !== 'ready' || state.roomCount === 0) return state;
      return { ...state, status: 'recording', marks: [{ sequence: 0, startMs: 0, endMs: null }] };
    case 'pause':
      return state.status === 'recording'
        ? { ...state, status: 'paused', pauses: state.pauses + 1 }
        : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'recording' } : state;
    case 'next': {
      if (state.status !== 'recording') return state;
      const marks = closeMark(state.marks, event.atMs);
      const current = state.current + 1;
      if (current >= state.roomCount) return { ...state, marks, current: state.roomCount };
      return {
        ...state,
        current,
        marks: [...marks, { sequence: current, startMs: event.atMs, endMs: null }],
      };
    }
    case 'stop':
      if (state.status !== 'recording' && state.status !== 'paused') return state;
      return { ...state, status: 'review', marks: closeMark(state.marks, event.atMs) };
    case 'accept':
      return state.status === 'review' ? { ...state, status: 'accepted' } : state;
    case 'discard':
      return state.status === 'review' ? { ...state, status: 'discarded' } : state;
  }
}

/** Rooms the review screen should warn about (never recorded, or shorter than `minMs`). */
export function missedRooms(state: CaptureState, minMs = 5000): number[] {
  const out: number[] = [];
  for (let seq = 0; seq < state.roomCount; seq += 1) {
    const m = state.marks.find((x) => x.sequence === seq);
    if (!m || m.endMs === null || m.endMs - m.startMs < minMs) out.push(seq);
  }
  return out;
}

// ------------------------------------------------------------------------ Capture metadata

/** Stored in `scan_sessions.device_info` (the DB refuses location keys; privacy). */
export const captureMetadataSchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    deviceModel: z.string().max(80),
    osVersion: z.string().max(40),
    appVersion: z.string().max(40),
    tier: z.enum(['T1', 'T2', 'T3', 'T4']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
    codec: z.enum(['hevc', 'h264']),
    hdr: z.literal(false),
    stabilization: z.enum(['standard', 'off']),
    lens: z.enum(['wide', 'ultra-wide', 'telephoto', 'unknown']),
    exposureMode: z.enum(['locked', 'auto']),
    durationMs: z.number().int().nonnegative(),
    pauses: z.number().int().nonnegative(),
    capturedAt: z.iso.datetime(),
  })
  .strict();
export type CaptureMetadata = z.infer<typeof captureMetadataSchema>;

export function captureMetadata(input: {
  platform: 'ios' | 'android';
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  profile: CaptureProfile & { tier: TierId };
  lens: CaptureMetadata['lens'];
  exposureLocked: boolean;
  state: CaptureState;
  durationMs: number;
  capturedAt: Date;
}): CaptureMetadata {
  return captureMetadataSchema.parse({
    platform: input.platform,
    deviceModel: input.deviceModel.slice(0, 80),
    osVersion: input.osVersion.slice(0, 40),
    appVersion: input.appVersion.slice(0, 40),
    tier: input.profile.tier,
    width: input.profile.width,
    height: input.profile.height,
    fps: input.profile.fps,
    codec: input.profile.codec,
    hdr: false,
    stabilization: input.profile.stabilization,
    lens: input.lens,
    exposureMode: input.exposureLocked ? 'locked' : 'auto',
    durationMs: Math.round(input.durationMs),
    pauses: input.state.pauses,
    capturedAt: input.capturedAt.toISOString(),
  });
}

/** Clock time for review lists: 0:31, 6:18, 1:02:05. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Spoken-style duration for summaries: "45 s", "6 min 18 s", "12 min". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}
