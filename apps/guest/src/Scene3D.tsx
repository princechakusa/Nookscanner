/**
 * The 3D apartment (DESIGN_SYSTEM 9.1). The viewer and its renderer (Spark + three.js) are a lazy
 * chunk, so the guest shell, search and the appliance list work before (and without) 3D.
 * Measured load time, first frame and frame rate are exposed as data attributes for the
 * performance tests (docs/3D_QUALITY_BAR.md section 6).
 */
import type { Doorway, Mat4, RoomView, SceneBounds, Vec3, Viewer } from '@nookscanner/viewer';
import { useEffect, useRef, useState } from 'react';

export interface Scene3DProps {
  url: string;
  bounds?: SceneBounds | undefined;
  start?: { position: Vec3; target: Vec3 } | undefined;
  alignment?: number[] | undefined;
  /** Per-room viewpoints and doorways (Stage 7.4): choosing a room flies there. */
  viewpoints?: RoomView[] | undefined;
  doorways?: Doorway[] | undefined;
  /** The room chosen with the room chips. */
  roomId?: string | null | undefined;
  labels: { loading: string; failed: string; reset: string; showList: string };
  onFailed?: () => void;
  /** 3D too slow on this device (governor) or the guest chose the list while loading. */
  onTooSlow?: () => void;
  /** NFR-PERF-03: full detail within 20 s; after that the guest is offered the list. */
  slowLoadMs?: number;
}

export function Scene3D({
  url,
  bounds,
  start,
  alignment,
  viewpoints,
  doorways,
  roomId,
  labels,
  onFailed,
  onTooSlow,
  slowLoadMs = 20_000,
}: Scene3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const viewerRef = useRef<Viewer | null>(null);
  const [slowLoad, setSlowLoad] = useState(false);
  const tooSlow = useRef(onTooSlow);
  tooSlow.current = onTooSlow;
  // The room the camera is in (route start for the next transition).
  const atRoom = useRef<string | null>(roomId ?? null);

  useEffect(() => {
    let viewer: Viewer | null = null;
    let cancelled = false;
    let statsTimer: ReturnType<typeof setInterval> | undefined;
    const onResize = () => viewer?.resize();

    (async () => {
      try {
        const { createViewer } = await import('@nookscanner/viewer');
        if (cancelled || !canvas.current) return;
        // Start at the published start view, else the chosen room's viewpoint.
        const first = start ?? viewpoints?.find((v) => v.roomId === atRoom.current);
        viewer = await createViewer({
          canvas: canvas.current,
          url,
          ...(alignment?.length === 16 ? { alignment: alignment as Mat4 } : {}),
          ...(bounds ? { bounds } : {}),
          ...(first ? { camera: { position: first.position, target: first.target } } : {}),
          onProgress: (f) => setProgress(f),
          onTooSlow: () => tooSlow.current?.(),
        });
        if (cancelled) {
          viewer.dispose();
          return;
        }
        viewerRef.current = viewer;
        setState('ready');
        window.addEventListener('resize', onResize);
        statsTimer = setInterval(() => {
          const el = host.current;
          if (!el || !viewer) return;
          const s = viewer.stats;
          el.dataset.tier = s.tier;
          el.dataset.loadMs = String(s.loadMs ?? '');
          el.dataset.firstFrameMs = String(s.firstFrameMs ?? '');
          el.dataset.fps = String(s.fps ?? '');
          el.dataset.qualityLevel = String(s.qualityLevel ?? 0);
        }, 1000);
      } catch {
        if (!cancelled) {
          setState('failed');
          onFailed?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(statsTimer);
      window.removeEventListener('resize', onResize);
      viewerRef.current = null;
      viewer?.dispose();
    };
    // bounds/start are part of the published scene and change only with the url.
  }, [url, onFailed]);

  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setTimeout(() => setSlowLoad(true), slowLoadMs);
    return () => clearTimeout(timer);
  }, [state, slowLoadMs]);

  // Room chips: fly from the current room through the doorways on the route (navigation.ts).
  useEffect(() => {
    const viewer = viewerRef.current;
    const to = viewpoints?.find((v) => v.roomId === roomId);
    if (state !== 'ready' || !viewer || !to || !roomId || atRoom.current === roomId) return;
    let cancelled = false;
    (async () => {
      const nav = await import('@nookscanner/viewer');
      if (cancelled) return;
      const route = atRoom.current
        ? (nav.roomRoute(atRoom.current, roomId, doorways ?? []) ?? [])
        : [];
      atRoom.current = roomId;
      const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      void viewer.flyTo(nav.flightPath(viewer.getView(), to, route), { reducedMotion });
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, state, viewpoints, doorways]);

  return (
    <div className="g-scene" ref={host} data-state={state}>
      <canvas
        ref={canvas}
        className="g-scene__canvas"
        aria-label="3D view of the apartment. Drag to look around; use the room buttons or the list below to find appliances."
      />
      {state === 'loading' && (
        <div className="g-scene__loading g-glass" role="status" aria-live="polite">
          <span>{labels.loading}</span>
          <progress
            className="g-scene__progress"
            max={1}
            value={progress}
            aria-label={labels.loading}
          />
          <span>{Math.round(progress * 100)}%</span>
          {slowLoad && onTooSlow && (
            <button type="button" className="g-linkbtn" onClick={onTooSlow}>
              {labels.showList}
            </button>
          )}
        </div>
      )}
      {state === 'ready' && (
        <div className="g-scene__controls">
          <button
            type="button"
            className="g-roundbtn g-glass"
            aria-label={labels.reset}
            onClick={() => viewerRef.current?.reset()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="g-icon">
              <path
                d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
      {state === 'failed' && (
        <p className="g-stage__note g-glass" role="status">
          {labels.failed}
        </p>
      )}
    </div>
  );
}
