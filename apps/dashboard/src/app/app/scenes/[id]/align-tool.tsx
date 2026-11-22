'use client';

/**
 * Stage 7.3 alignment tool (DESIGN_SYSTEM 9.6 toolbar style): the manager taps three floor points,
 * the two sides of something with a known width (a door), and two opposite corners of the
 * apartment. The math lives in @nookscanner/viewer alignment.ts (unit-tested); the database
 * validates and stores the result (save_scene_alignment).
 */
import type * as ViewerLib from '@nookscanner/viewer';
import type {
  Alignment,
  Doorway,
  Mat4,
  RoomView,
  SceneBounds,
  Vec3,
  Viewer,
} from '@nookscanner/viewer';
import { Button } from '@nookscanner/ui';
import { useEffect, useRef, useState } from 'react';
import { saveAlignmentAction } from '../../scene-actions.ts';
import { HotspotPanel, type ApplianceRow, type HotspotRow } from './hotspot-panel.tsx';
import { NavigationPanel, type NavRoomRow } from './navigation-panel.tsx';

type Step = 'floor' | 'measure' | 'corners' | 'review';
const NEEDED: Record<Exclude<Step, 'review'>, number> = { floor: 3, measure: 2, corners: 2 };
const STEP_TEXT: Record<Step, string> = {
  floor: 'Step 1 of 3: tap three points on the floor, far apart from each other.',
  measure:
    'Step 2 of 3: tap both sides of a door (or anything you have measured), then enter its width.',
  corners: 'Step 3 of 3: tap two opposite corners of the apartment on the floor.',
  review: 'Check the result: walk around, then save. Use “Start here” to set where guests begin.',
};

export interface SavedAlignment {
  alignment: { matrix: number[]; scale: number };
  bounds: SceneBounds;
  start: { position: Vec3; target: Vec3 } | null;
}

export function AlignTool({
  sceneId,
  sceneUrl,
  canEdit,
  saved,
  rooms = [],
  views = [],
  doorways = [],
  appliances = [],
  initialHotspots = [],
  canPlaceHotspots = false,
  canVerifyHotspots = false,
}: {
  sceneId: string;
  sceneUrl: string;
  canEdit: boolean;
  saved: SavedAlignment | null;
  rooms?: NavRoomRow[];
  views?: RoomView[];
  doorways?: Doorway[];
  appliances?: ApplianceRow[];
  initialHotspots?: HotspotRow[];
  /** hotspot.write (editors too), separate from aligning (scan.review). */
  canPlaceHotspots?: boolean;
  canVerifyHotspots?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const math = useRef<typeof ViewerLib | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [step, setStep] = useState<Step>(saved ? 'review' : 'floor');
  const [floor, setFloor] = useState<Vec3[]>([]);
  const [measure, setMeasure] = useState<Vec3[]>([]);
  const [corners, setCorners] = useState<Vec3[]>([]);
  const [metres, setMetres] = useState('0.80');
  const [height, setHeight] = useState('2.70');
  const [alignment, setAlignment] = useState<Alignment | null>(
    saved ? { matrix: saved.alignment.matrix as Mat4, scale: saved.alignment.scale } : null,
  );
  const [bounds, setBounds] = useState<SceneBounds | null>(saved?.bounds ?? null);
  const [start, setStart] = useState<{ position: Vec3; target: Vec3 } | null>(saved?.start ?? null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Alignment stored in the database (navigation needs aligned metres).
  const [stored, setStored] = useState(!!saved);
  const pickHandler = useRef<((p: Vec3) => void) | null>(null);
  const [hotspots, setHotspots] = useState<HotspotRow[]>(initialHotspots);
  const markers = useRef(new Map<string, HTMLElement>());

  // Hotspot markers follow the camera (projected every frame, no React re-render).
  useEffect(() => {
    if (status !== 'ready') return;
    let frame = 0;
    const tick = () => {
      const v = viewer.current;
      if (v) {
        for (const h of hotspots) {
          const el = markers.current.get(h.id);
          if (!el) continue;
          const p = v.project(h.position);
          el.style.transform = `translate(${p.x}px, ${p.y}px)`;
          el.hidden = !p.visible;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, hotspots]);

  // The signed URL changes on every server render (e.g. after saving); the scene does not.
  const urlRef = useRef(sceneUrl);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await import('@nookscanner/viewer');
        math.current = lib;
        if (!canvas.current || cancelled) return;
        const v = await lib.createViewer({
          canvas: canvas.current,
          url: urlRef.current,
          tier: 'high',
          lod: false,
        });
        if (cancelled) return v.dispose();
        viewer.current = v;
        if (saved) v.setAlignment(saved.alignment.matrix as Mat4);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      viewer.current?.dispose();
      viewer.current = null;
    };
    // The scene version id identifies the scene; saved values only seed the first render.
  }, [sceneId]);

  const onTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!viewer.current || (!canEdit && !pickHandler.current)) return;
    if (step === 'review' && !pickHandler.current) return;
    // A drag (looking around) is not a tap.
    if (e.detail === 0) return;
    const p = viewer.current.pick(e.clientX, e.clientY);
    if (p && step === 'review' && pickHandler.current && alignment && math.current) {
      // Doorway taps are stored in aligned metres.
      pickHandler.current(math.current.applyMatrix(alignment.matrix, p));
      return;
    }
    if (!p) {
      setMessage({ kind: 'error', text: 'Nothing there. Tap on a visible surface.' });
      return;
    }
    setMessage(null);
    if (step === 'floor' && floor.length < 3) setFloor([...floor, p]);
    if (step === 'measure' && measure.length < 2) setMeasure([...measure, p]);
    if (step === 'corners' && corners.length < 2) setCorners([...corners, p]);
  };

  const next = () => {
    const lib = math.current;
    const v = viewer.current;
    if (!lib || !v) return;
    try {
      if (step === 'floor') setStep('measure');
      else if (step === 'measure') {
        const width = Number(metres.replace(',', '.'));
        const a = lib.computeAlignment(
          floor as [Vec3, Vec3, Vec3],
          { a: measure[0]!, b: measure[1]!, metres: width },
          v.sceneUp(),
        );
        setAlignment(a);
        v.setAlignment(a.matrix);
        setStep('corners');
      } else if (step === 'corners' && alignment) {
        const [c1, c2] = corners.map((c) => lib.applyMatrix(alignment.matrix, c));
        const top = Number(height.replace(',', '.'));
        const b = lib.boundsFromCrop([c1![0], top, c1![2]], [c2![0], 0, c2![2]]);
        const width = b.max[0] - b.min[0];
        const depth = b.max[2] - b.min[2];
        if (width < 1 || depth < 1 || width > 100 || depth > 100) {
          setCorners([]);
          setMessage({
            kind: 'error',
            text: `The outline would be ${width.toFixed(1)} m × ${depth.toFixed(1)} m. Tap two corners on opposite sides of the apartment (at least 1 m apart in both directions).`,
          });
          return;
        }
        setBounds(b);
        setStep('review');
      }
      setMessage(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setMessage({
        kind: 'error',
        text:
          code === 'FLOOR_POINTS_COLLINEAR'
            ? 'The three floor points are almost in a line. Start again and spread them out.'
            : code === 'KNOWN_DISTANCE_INVALID'
              ? 'Enter the measured width in metres, for example 0.80.'
              : 'That did not work. Start again.',
      });
    }
  };

  const restart = () => {
    setFloor([]);
    setMeasure([]);
    setCorners([]);
    setAlignment(null);
    setBounds(null);
    setStart(null);
    viewer.current?.setAlignment(null);
    setStep('floor');
    setStored(false);
    setMessage(null);
  };

  const save = async () => {
    if (!alignment || !bounds) return;
    setSaving(true);
    const result = await saveAlignmentAction({
      sceneId,
      alignment: { matrix: alignment.matrix, scale: alignment.scale },
      bounds,
      start,
    });
    setSaving(false);
    if (result.ok) setStored(true);
    setMessage(
      result.ok
        ? { kind: 'ok', text: 'Alignment saved.' }
        : { kind: 'error', text: 'Could not save. Check the values and try again.' },
    );
  };

  const picked =
    step === 'floor' ? floor : step === 'measure' ? measure : step === 'corners' ? corners : [];
  const enough = step !== 'review' && picked.length >= NEEDED[step];

  return (
    <section className="ns-panel ns-align" aria-labelledby="align-step">
      <p id="align-step" className="ns-align__step" aria-live="polite">
        {canEdit
          ? STEP_TEXT[step]
          : 'You can look at the 3D apartment; aligning needs review rights.'}
      </p>
      <div className="ns-align__stage">
        <canvas
          ref={canvas}
          className="ns-align__canvas"
          onClick={onTap}
          aria-label="3D apartment. Drag to look around; tap to place a point."
        />
        {status === 'ready' &&
          hotspots.map((h) => (
            <span
              key={h.id}
              ref={(el) => {
                if (el) markers.current.set(h.id, el);
                else markers.current.delete(h.id);
              }}
              className="ns-align__marker"
              data-testid="hotspot-marker"
              data-appliance={h.applianceId}
            >
              {appliances.find((a) => a.id === h.applianceId)?.name ?? ''}
            </span>
          ))}
        {status === 'loading' && (
          <p className="ns-align__overlay" role="status">
            Loading the 3D apartment…
          </p>
        )}
        {status === 'failed' && (
          <p className="ns-align__overlay ns-field__error" role="alert">
            The 3D apartment could not be shown in this browser.
          </p>
        )}
      </div>
      {canEdit && status === 'ready' && (
        <div className="ns-align__controls">
          {step !== 'review' && (
            <p className="ns-muted" data-testid="picked-count">
              Points placed: {picked.length} of {NEEDED[step]}
            </p>
          )}
          {step === 'measure' && (
            <label className="ns-field">
              <span className="ns-field__label">Measured width (metres)</span>
              <input
                className="ns-input"
                inputMode="decimal"
                value={metres}
                onChange={(e) => setMetres(e.target.value)}
              />
            </label>
          )}
          {step === 'corners' && (
            <label className="ns-field">
              <span className="ns-field__label">Ceiling height (metres)</span>
              <input
                className="ns-input"
                inputMode="decimal"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </label>
          )}
          <div className="ns-inline-form">
            {step !== 'review' && (
              <Button onClick={next} disabled={!enough}>
                Next
              </Button>
            )}
            {step === 'review' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => viewer.current && setStart(viewer.current.getView())}
                >
                  Start here
                </Button>
                <Button onClick={save} loading={saving} disabled={!alignment || !bounds}>
                  Save alignment
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={restart}>
              Start again
            </Button>
          </div>
          {alignment && (
            <p className="ns-muted" data-testid="alignment-scale">
              Scale: 1 scene unit = {alignment.scale.toFixed(3)} m
              {bounds &&
                ` · Apartment ${(bounds.max[0] - bounds.min[0]).toFixed(1)} m × ${(bounds.max[2] - bounds.min[2]).toFixed(1)} m`}
              {start && ' · Start view set'}
            </p>
          )}
          {message && (
            <p
              className={message.kind === 'error' ? 'ns-field__error' : 'ns-notice'}
              role={message.kind === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
      {canEdit &&
        status === 'ready' &&
        stored &&
        bounds &&
        step === 'review' &&
        rooms.length > 0 && (
          <NavigationPanel
            sceneId={sceneId}
            rooms={rooms}
            viewer={() => viewer.current}
            initialViews={views}
            initialDoorways={doorways}
            bounds={bounds}
            onPickRequest={(cb) => {
              pickHandler.current = cb;
            }}
          />
        )}
      {canPlaceHotspots && status === 'ready' && alignment && bounds && step === 'review' && (
        <HotspotPanel
          sceneId={sceneId}
          appliances={appliances}
          hotspots={hotspots}
          onChange={setHotspots}
          canVerify={canVerifyHotspots}
          viewer={() => viewer.current}
          onPickRequest={(cb) => {
            pickHandler.current = cb;
          }}
        />
      )}
    </section>
  );
}
