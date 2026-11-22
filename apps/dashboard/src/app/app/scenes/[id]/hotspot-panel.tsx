'use client';

/**
 * Stage 8.2: pin each appliance to the real object in the 3D apartment. "Place in 3D" takes the
 * next tap on the scene (raycast, aligned metres), saves it (placeHotspotAction; the database
 * checks it lies inside the apartment) and shows a marker; "Move" places it again, which makes
 * it unverified; "Remove" deletes it.
 */
import type { Vec3, Viewer } from '@nookscanner/viewer';
import { Button } from '@nookscanner/ui';
import { useState } from 'react';
import {
  deleteHotspotAction,
  placeHotspotAction,
  verifyHotspotAction,
} from '../../scene-actions.ts';

export interface HotspotRow {
  id: string;
  applianceId: string;
  position: Vec3;
  verified: boolean;
}
export interface ApplianceRow {
  id: string;
  name: string;
  roomName: string;
}

export function HotspotPanel({
  sceneId,
  appliances,
  hotspots,
  onChange,
  viewer,
  onPickRequest,
  canVerify = false,
}: {
  sceneId: string;
  appliances: ApplianceRow[];
  hotspots: HotspotRow[];
  onChange: (next: HotspotRow[]) => void;
  viewer: () => Viewer | null;
  onPickRequest: (callback: ((point: Vec3) => void) | null) => void;
  /** instruction.verify: confirm the pin sits on the right object (8.4). */
  canVerify?: boolean;
}) {
  const [placing, setPlacing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const place = (appliance: ApplianceRow) => {
    setPlacing(appliance.id);
    setMessage(null);
    const onPoint = async (point: Vec3) => {
      onPickRequest(null);
      const view = viewer()?.getView() ?? null;
      const result = await placeHotspotAction({
        sceneId,
        applianceId: appliance.id,
        position: point,
        camera: view,
      });
      if (!result.ok && result.error === 'OUTSIDE') {
        // Still placing: the next tap tries again.
        setMessage({
          kind: 'error',
          text: 'That point is outside the apartment outline. Tap the appliance itself.',
        });
        onPickRequest(onPoint);
        return;
      }
      setPlacing(null);
      if (!result.ok) {
        setMessage({ kind: 'error', text: 'Could not save the hotspot. Try again.' });
        return;
      }
      onChange([
        ...hotspots.filter((h) => h.applianceId !== appliance.id),
        { id: result.id, applianceId: appliance.id, position: point, verified: false },
      ]);
      setMessage({ kind: 'ok', text: `${appliance.name} pinned.` });
    };
    onPickRequest(onPoint);
  };

  const cancel = () => {
    onPickRequest(null);
    setPlacing(null);
  };

  const remove = async (appliance: ApplianceRow, hotspot: HotspotRow) => {
    const result = await deleteHotspotAction({ sceneId, id: hotspot.id });
    if (!result.ok) {
      setMessage({ kind: 'error', text: 'Could not remove the hotspot.' });
      return;
    }
    onChange(hotspots.filter((h) => h.id !== hotspot.id));
    setMessage({ kind: 'ok', text: `${appliance.name} unpinned.` });
  };

  const verify = async (appliance: ApplianceRow, hotspot: HotspotRow) => {
    const result = await verifyHotspotAction({ sceneId, id: hotspot.id });
    if (!result.ok) {
      setMessage({ kind: 'error', text: 'Could not verify the pin.' });
      return;
    }
    onChange(hotspots.map((h) => (h.id === hotspot.id ? { ...h, verified: true } : h)));
    setMessage({ kind: 'ok', text: `${appliance.name} pin verified.` });
  };

  return (
    <section className="ns-panel ns-align" aria-labelledby="hotspots-title">
      <h2 id="hotspots-title" className="ns-panel__title">
        Hotspots
      </h2>
      {appliances.length === 0 ? (
        <p className="ns-muted">
          Add the apartment&apos;s appliances first (apartment page, Appliances), then pin them
          here.
        </p>
      ) : (
        <>
          <p className="ns-muted">
            Walk to the appliance, press “Place in 3D”, then tap the appliance itself. Guests tap
            these pins to open the instructions.
          </p>
          <ul className="ns-nav-rooms" aria-label="Appliance hotspots">
            {appliances.map((a) => {
              const h = hotspots.find((x) => x.applianceId === a.id);
              return (
                <li key={a.id} className="ns-nav-rooms__row">
                  <span>
                    {a.name}
                    <span className="ns-muted">
                      {' · '}
                      {a.roomName}
                      {h ? (h.verified ? ' · pinned, verified' : ' · pinned') : ' · not pinned'}
                    </span>
                  </span>
                  <span className="ns-inline-form">
                    {placing === a.id ? (
                      <>
                        <span className="ns-muted" role="status">
                          Tap {a.name} in the 3D view
                        </span>
                        <Button variant="ghost" size="sm" onClick={cancel}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => place(a)}
                          disabled={placing !== null}
                        >
                          {h ? `Move ${a.name}` : `Place ${a.name} in 3D`}
                        </Button>
                        {h && canVerify && !h.verified && (
                          <Button size="sm" onClick={() => void verify(a, h)}>
                            Verify pin of {a.name}
                          </Button>
                        )}
                        {h && (
                          <Button variant="ghost" size="sm" onClick={() => void remove(a, h)}>
                            Remove pin of {a.name}
                          </Button>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
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
