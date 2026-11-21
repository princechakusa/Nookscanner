'use client';

/**
 * Stage 7.4: room viewpoints and doorways for an aligned scene version. The manager walks to a
 * good spot in each room and presses "Set viewpoint here"; a doorway is two rooms plus a tap in
 * the doorway. The room-continuity check (navigation.ts checkNavigation, RV-02) names rooms
 * without a viewpoint or that cannot be reached from the entrance. Saved with
 * save_scene_navigation (validated again in the database).
 */
import type { Doorway, RoomView, SceneBounds, Vec3, Viewer } from '@nookscanner/viewer';
import { constrainPosition } from '@nookscanner/viewer/constraints';
import { checkNavigation } from '@nookscanner/viewer/navigation';
import { Button } from '@nookscanner/ui';
import { useState } from 'react';
import { saveNavigationAction } from '../../scene-actions.ts';

export interface NavRoomRow {
  id: string;
  name: string;
  type: string;
}

export function NavigationPanel({
  sceneId,
  rooms,
  viewer,
  initialViews,
  initialDoorways,
  bounds,
  onPickRequest,
}: {
  sceneId: string;
  rooms: NavRoomRow[];
  viewer: () => Viewer | null;
  initialViews: RoomView[];
  initialDoorways: Doorway[];
  /** Apartment outline (aligned metres): viewpoints are kept inside it, like the guest camera. */
  bounds: SceneBounds;
  /** Asks the tool to send the next tap on the scene (aligned metres) to the callback. */
  onPickRequest: (callback: ((point: Vec3) => void) | null) => void;
}) {
  const [views, setViews] = useState<RoomView[]>(initialViews);
  const [doorways, setDoorways] = useState<Doorway[]>(initialDoorways);
  const [doorA, setDoorA] = useState(rooms[0]?.id ?? '');
  const [doorB, setDoorB] = useState(rooms[1]?.id ?? '');
  const [waiting, setWaiting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const name = (id: string) => rooms.find((r) => r.id === id)?.name ?? '?';
  const check = checkNavigation(rooms, views, doorways);

  const setViewpoint = (roomId: string) => {
    const v = viewer();
    if (!v) return;
    const view = v.getView();
    // Same limits as the guest camera (constraints.ts): inside the outline, at eye height.
    // Standing eye height (1.5 m) where the manager stands; direction kept.
    const position = constrainPosition([view.position[0], 1.5, view.position[2]], bounds);
    const shift = view.position.map((c, i) => position[i]! - c);
    const target: Vec3 = [
      view.target[0] + shift[0]!,
      view.target[1] + shift[1]!,
      view.target[2] + shift[2]!,
    ];
    setViews([...views.filter((x) => x.roomId !== roomId), { roomId, position, target }]);
    setMessage(null);
  };

  const goTo = (roomId: string) => {
    const v = viewer();
    const to = views.find((x) => x.roomId === roomId);
    if (v && to) v.lookAt(to.position, to.target);
  };

  const addDoorway = () => {
    if (!doorA || !doorB || doorA === doorB) {
      setMessage({ kind: 'error', text: 'Choose two different rooms for the doorway.' });
      return;
    }
    setWaiting(true);
    setMessage(null);
    onPickRequest((point) => {
      // Same 0.5 m slack as save_scene_navigation: doorways may sit on the outline.
      const inside = [0, 2].every(
        (i) => point[i]! >= bounds.min[i]! - 0.5 && point[i]! <= bounds.max[i]! + 0.5,
      );
      if (!inside) {
        setMessage({
          kind: 'error',
          text: 'That point is outside the apartment outline. Tap inside the doorway.',
        });
        return;
      }
      setWaiting(false);
      onPickRequest(null);
      const others = doorways.filter(
        (d) => !((d.a === doorA && d.b === doorB) || (d.a === doorB && d.b === doorA)),
      );
      // Doorways are floor points (the flight keeps eye height); splat noise can put the hit
      // below or above the fitted floor, so store it on the floor.
      setDoorways([...others, { a: doorA, b: doorB, position: [point[0], 0, point[2]] }]);
    });
  };

  const save = async () => {
    setSaving(true);
    const result = await saveNavigationAction({
      sceneId,
      views: views.map((v) => ({ room: v.roomId, position: v.position, target: v.target })),
      doorways,
    });
    setSaving(false);
    setMessage(
      result.ok
        ? { kind: 'ok', text: 'Rooms and doorways saved.' }
        : {
            kind: 'error',
            text:
              result.error === 'NOT_ALIGNED'
                ? 'Save the alignment first.'
                : 'Could not save. A viewpoint or doorway is outside the apartment outline.',
          },
    );
  };

  return (
    <section className="ns-panel ns-align" aria-labelledby="nav-title">
      <h2 id="nav-title" className="ns-panel__title">
        Rooms and doorways
      </h2>
      <p className="ns-muted">
        Walk to a good spot in each room, then press “Set viewpoint here”. Add a doorway for every
        pair of connected rooms so guests can move between them.
      </p>
      <ul className="ns-nav-rooms" aria-label="Room viewpoints">
        {rooms.map((r) => {
          const has = views.some((v) => v.roomId === r.id);
          return (
            <li key={r.id} className="ns-nav-rooms__row">
              <span>
                {r.name}
                {r.id === check.entranceId && (
                  <span className="ns-muted"> (guests start here)</span>
                )}
                <span className="ns-muted">{has ? ' · viewpoint set' : ' · no viewpoint'}</span>
              </span>
              <span className="ns-inline-form">
                {has && (
                  <Button variant="ghost" size="sm" onClick={() => goTo(r.id)}>
                    Go to {r.name}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setViewpoint(r.id)}>
                  Set viewpoint for {r.name} here
                </Button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="ns-inline-form">
        <label className="ns-field">
          <span className="ns-field__label">Doorway from</span>
          <select className="ns-input" value={doorA} onChange={(e) => setDoorA(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ns-field">
          <span className="ns-field__label">to</span>
          <select className="ns-input" value={doorB} onChange={(e) => setDoorB(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={addDoorway} disabled={waiting}>
          {waiting ? 'Tap the doorway in the 3D view' : 'Add doorway'}
        </Button>
      </div>
      {doorways.length > 0 && (
        <ul aria-label="Doorways">
          {doorways.map((d) => (
            <li key={`${d.a}-${d.b}`}>
              {name(d.a)} ↔ {name(d.b)}{' '}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDoorways(doorways.filter((x) => x !== d))}
              >
                Remove doorway {name(d.a)} to {name(d.b)}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div role="status" data-testid="nav-check">
        {check.ok ? (
          <p className="ns-notice">
            Every room has a viewpoint and can be reached from the entrance.
          </p>
        ) : (
          <ul className="ns-field__error">
            {check.missingViewpoints.map((id) => (
              <li key={`v-${id}`}>{name(id)} has no viewpoint.</li>
            ))}
            {check.unreachable.map((id) => (
              <li key={`u-${id}`}>{name(id)} cannot be reached from the entrance.</li>
            ))}
          </ul>
        )}
      </div>
      <div className="ns-inline-form">
        <Button onClick={save} loading={saving}>
          Save rooms and doorways
        </Button>
      </div>
      {message && (
        <p
          className={message.kind === 'error' ? 'ns-field__error' : 'ns-notice'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
