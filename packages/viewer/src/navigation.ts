/**
 * Rooms, viewpoints and transitions (roadmap 7.4, PRODUCT_REQUIREMENTS GX-02, RV-02).
 * Per scene version, every room has a viewpoint (where the camera stands, looking at a target) and
 * doorways connect pairs of rooms at a point on the floor. All coordinates are aligned metres
 * (floor at y = 0, alignment.ts). Pure functions, unit-tested; the viewer animates the result.
 */
import type { Vec3 } from './constraints.ts';

export interface RoomView {
  roomId: string;
  position: Vec3;
  target: Vec3;
}

export interface Doorway {
  a: string;
  b: string;
  /** A point in the doorway on the floor (y is ignored; the camera keeps its eye height). */
  position: Vec3;
}

export interface NavRoom {
  id: string;
  type: string;
}

/** The room guests start in: the entrance if there is one, else the first room in walking order. */
export function entranceRoom(rooms: readonly NavRoom[]): NavRoom | undefined {
  return rooms.find((r) => r.type === 'entrance') ?? rooms[0];
}

function neighbours(doorways: readonly Doorway[]): Map<string, { room: string; door: Doorway }[]> {
  const map = new Map<string, { room: string; door: Doorway }[]>();
  const add = (from: string, room: string, door: Doorway) => {
    const list = map.get(from) ?? [];
    list.push({ room, door });
    map.set(from, list);
  };
  for (const d of doorways) {
    if (d.a === d.b) continue;
    add(d.a, d.b, d);
    add(d.b, d.a, d);
  }
  return map;
}

/**
 * Shortest route (fewest doorways) from one room to another, as the doorways to pass through in
 * order; [] for the same room; null when the rooms are not connected.
 */
export function roomRoute(
  from: string,
  to: string,
  doorways: readonly Doorway[],
): Doorway[] | null {
  if (from === to) return [];
  const next = neighbours(doorways);
  const came = new Map<string, { prev: string; door: Doorway }>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const room = queue.shift()!;
    for (const n of next.get(room) ?? []) {
      if (seen.has(n.room)) continue;
      seen.add(n.room);
      came.set(n.room, { prev: room, door: n.door });
      if (n.room === to) {
        const route: Doorway[] = [];
        let at = to;
        while (at !== from) {
          const step = came.get(at)!;
          route.unshift(step.door);
          at = step.prev;
        }
        return route;
      }
      queue.push(n.room);
    }
  }
  return null;
}

export interface NavigationCheck {
  entranceId: string | null;
  /** Rooms without a viewpoint in this scene version. */
  missingViewpoints: string[];
  /** Rooms that cannot be reached from the entrance through doorways. */
  unreachable: string[];
  /** Every room has a viewpoint and is reachable from the entrance (acceptance 7.4). */
  ok: boolean;
}

/** RV-02 room continuity: every room has a viewpoint and is reachable from the entrance. */
export function checkNavigation(
  rooms: readonly NavRoom[],
  views: readonly RoomView[],
  doorways: readonly Doorway[],
): NavigationCheck {
  const entrance = entranceRoom(rooms);
  const withView = new Set(views.map((v) => v.roomId));
  const missingViewpoints = rooms.filter((r) => !withView.has(r.id)).map((r) => r.id);
  const reached = new Set<string>();
  if (entrance) {
    const next = neighbours(doorways);
    const queue = [entrance.id];
    reached.add(entrance.id);
    while (queue.length > 0) {
      const room = queue.shift()!;
      for (const n of next.get(room) ?? []) {
        if (!reached.has(n.room)) {
          reached.add(n.room);
          queue.push(n.room);
        }
      }
    }
  }
  const unreachable = rooms.filter((r) => !reached.has(r.id)).map((r) => r.id);
  return {
    entranceId: entrance?.id ?? null,
    missingViewpoints,
    unreachable,
    ok: rooms.length > 0 && missingViewpoints.length === 0 && unreachable.length === 0,
  };
}

export interface Waypoint {
  position: Vec3;
  target: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

/**
 * Camera waypoints from the current view to a room's viewpoint, walking through each doorway on
 * the route at the current eye height and looking ahead, so the guest sees where they go.
 */
export function flightPath(
  from: Waypoint,
  to: Waypoint,
  route: readonly Doorway[] = [],
): Waypoint[] {
  const eye = from.position[1];
  const points: Vec3[] = [
    from.position,
    ...route.map((d): Vec3 => [d.position[0], eye, d.position[2]]),
    to.position,
  ];
  const path: Waypoint[] = [from];
  for (let i = 1; i < points.length - 1; i += 1) {
    const here = points[i]!;
    const ahead = points[i + 1]!;
    // Look one metre towards the next waypoint, at eye height.
    const dir = sub(ahead, here);
    const l = Math.hypot(dir[0], dir[2]) || 1;
    path.push({ position: here, target: [here[0] + dir[0] / l, eye, here[2] + dir[2] / l] });
  }
  path.push(to);
  return path;
}

/** Total walked distance of a path in metres. */
export function pathLength(path: readonly Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += dist(path[i - 1]!.position, path[i]!.position);
  return total;
}

/** DESIGN_SYSTEM motion: fly-throughs take 600-1200 ms; 0 (a cut) with reduced motion. */
export function flightDuration(path: readonly Waypoint[], reducedMotion = false): number {
  if (reducedMotion) return 0;
  return Math.round(Math.min(1200, Math.max(600, 600 + 120 * pathLength(path))));
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Camera pose at progress t (0..1, eased) along the path: positions move at constant speed over
 * the walked distance; the look target blends between waypoint targets on each segment.
 */
export function samplePath(path: readonly Waypoint[], t: number): Waypoint {
  const first = path[0]!;
  const last = path[path.length - 1]!;
  if (path.length === 1 || t <= 0) return first;
  if (t >= 1) return last;
  const total = pathLength(path);
  if (total === 0) {
    // Turning on the spot.
    return { position: first.position, target: lerp(first.target, last.target, easeInOutCubic(t)) };
  }
  let along = easeInOutCubic(t) * total;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = dist(a.position, b.position);
    if (along <= seg || i === path.length - 1) {
      const f = seg === 0 ? 1 : Math.min(1, along / seg);
      return { position: lerp(a.position, b.position, f), target: lerp(a.target, b.target, f) };
    }
    along -= seg;
  }
  return last;
}
