/**
 * The 3D apartment (DESIGN_SYSTEM 9.1). The viewer and its renderer (Spark + three.js) are a lazy
 * chunk, so the guest shell, search and the appliance list work before (and without) 3D.
 * Measured load time, first frame and frame rate are exposed as data attributes for the
 * performance tests (docs/3D_QUALITY_BAR.md section 6).
 */
import type { Viewer } from '@nookscanner/viewer';
import { useEffect, useRef, useState } from 'react';

export interface Scene3DProps {
  url: string;
  labels: { loading: string; failed: string };
  onFailed?: () => void;
}

export function Scene3D({ url, labels, onFailed }: Scene3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let viewer: Viewer | null = null;
    let cancelled = false;
    let statsTimer: ReturnType<typeof setInterval> | undefined;
    const onResize = () => viewer?.resize();

    (async () => {
      try {
        const { createViewer } = await import('@nookscanner/viewer');
        if (cancelled || !canvas.current) return;
        viewer = await createViewer({
          canvas: canvas.current,
          url,
          onProgress: (f) => setProgress(f),
        });
        if (cancelled) {
          viewer.dispose();
          return;
        }
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
      viewer?.dispose();
    };
  }, [url, onFailed]);

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
