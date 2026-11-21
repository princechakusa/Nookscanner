import { describe, expect, it } from 'vitest';
import {
  checkNavigation,
  easeInOutCubic,
  entranceRoom,
  flightDuration,
  flightPath,
  pathLength,
  roomRoute,
  samplePath,
  type Doorway,
  type RoomView,
} from './navigation.ts';

// A two-bedroom flat: entrance - hallway - living - kitchen; hallway - bed1, bed2; bed1 - bath.
const rooms = [
  { id: 'liv', type: 'living' },
  { id: 'ent', type: 'entrance' },
  { id: 'hall', type: 'hallway' },
  { id: 'kit', type: 'kitchen' },
  { id: 'bed1', type: 'bedroom' },
  { id: 'bed2', type: 'bedroom' },
  { id: 'bath', type: 'bathroom' },
];
const door = (a: string, b: string, x: number, z: number): Doorway => ({
  a,
  b,
  position: [x, 0, z],
});
const doors: Doorway[] = [
  door('ent', 'hall', 0, 1),
  door('hall', 'liv', 2, 1),
  door('liv', 'kit', 4, 1),
  door('hall', 'bed1', 1, 3),
  door('bed2', 'hall', 1, -1), // listed in either direction
  door('bed1', 'bath', 1, 5),
];
const view = (roomId: string, x: number, z: number): RoomView => ({
  roomId,
  position: [x, 1.6, z],
  target: [x, 1.6, z - 1],
});
const views = rooms.map((r, i) => view(r.id, i, 0));

describe('entranceRoom', () => {
  it('prefers the entrance, else the first room', () => {
    expect(entranceRoom(rooms)?.id).toBe('ent');
    expect(entranceRoom([{ id: 'a', type: 'living' }])?.id).toBe('a');
    expect(entranceRoom([])).toBeUndefined();
  });
});

describe('roomRoute', () => {
  it('finds the fewest doorways in both directions', () => {
    expect(roomRoute('ent', 'bath', doors)?.map((d) => `${d.a}-${d.b}`)).toEqual([
      'ent-hall',
      'hall-bed1',
      'bed1-bath',
    ]);
    expect(roomRoute('kit', 'bed2', doors)).toHaveLength(3);
    expect(roomRoute('liv', 'liv', doors)).toEqual([]);
  });
  it('returns null for rooms without a connection', () => {
    expect(roomRoute('ent', 'garage', doors)).toBeNull();
    expect(roomRoute('ent', 'hall', [door('ent', 'ent', 0, 0)])).toBeNull();
  });
});

describe('checkNavigation (acceptance: every room reachable from the entrance)', () => {
  it('passes when every room has a viewpoint and a doorway path from the entrance', () => {
    const r = checkNavigation(rooms, views, doors);
    expect(r).toEqual({ entranceId: 'ent', missingViewpoints: [], unreachable: [], ok: true });
  });
  it('names rooms that are cut off and rooms without a viewpoint', () => {
    const r = checkNavigation(
      rooms,
      views.filter((v) => v.roomId !== 'kit'),
      doors.filter((d) => d.b !== 'bed1'),
    );
    expect(r.ok).toBe(false);
    expect(r.missingViewpoints).toEqual(['kit']);
    expect(r.unreachable).toEqual(['bed1', 'bath']);
  });
  it('fails for an apartment with no rooms', () => {
    expect(checkNavigation([], [], []).ok).toBe(false);
  });
});

describe('flight path', () => {
  const from = {
    position: [0, 1.5, 0] as [number, number, number],
    target: [0, 1.5, -1] as [number, number, number],
  };
  const to = {
    position: [4, 1.6, 4] as [number, number, number],
    target: [5, 1.6, 4] as [number, number, number],
  };
  const route = [door('a', 'b', 0, 4)];

  it('walks through each doorway at the current eye height, looking ahead', () => {
    const path = flightPath(from, to, route);
    expect(path).toHaveLength(3);
    expect(path[1]!.position).toEqual([0, 1.5, 4]);
    expect(path[1]!.target).toEqual([1, 1.5, 4]); // towards the next point, 1 m ahead
    expect(pathLength(path)).toBeCloseTo(4 + Math.hypot(4, 0.1), 6);
  });

  it('samples from start to end, passing the doorway', () => {
    const path = flightPath(from, to, route);
    expect(samplePath(path, 0)).toEqual(from);
    expect(samplePath(path, 1)).toEqual(to);
    // Halfway in eased time is halfway along the walked distance: at the doorway.
    const mid = samplePath(path, 0.5);
    expect(mid.position[0]).toBeCloseTo(0, 1);
    expect(mid.position[2]).toBeCloseTo(4, 1);
    // Every sample stays on the path segments (never cuts through the wall).
    for (let t = 0; t <= 1; t += 0.05) {
      const p = samplePath(path, t).position;
      const onFirst = Math.abs(p[0]) < 1e-9;
      const onSecond = Math.abs(p[2] - 4) < 0.11;
      expect(onFirst || onSecond).toBe(true);
    }
  });

  it('turns on the spot when the position does not change', () => {
    const turn = flightPath(from, { position: from.position, target: [1, 1.5, 0] });
    const s = samplePath(turn, 0.5);
    expect(s.position).toEqual(from.position);
    expect(s.target[0]).toBeCloseTo(0.5, 6);
  });

  it('lasts 600-1200 ms, and cuts with reduced motion', () => {
    expect(flightDuration(flightPath(from, from))).toBe(600);
    expect(flightDuration(flightPath(from, to, route))).toBe(1200);
    expect(flightDuration(flightPath(from, to, route), true)).toBe(0);
  });

  it('eases in and out', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });
});
