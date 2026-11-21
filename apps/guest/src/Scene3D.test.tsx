import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reset = vi.fn();
const dispose = vi.fn();
const createViewer = vi.fn();
vi.mock('@nookscanner/viewer', async () => {
  // Real navigation math (navigation.ts), mocked renderer.
  const real = await import('@nookscanner/viewer/navigation');
  return { ...real, createViewer: (o: unknown) => createViewer(o) };
});

import { Scene3D } from './Scene3D.tsx';

const labels = {
  loading: 'Loading the 3D apartment',
  failed: 'Could not show 3D',
  reset: 'Reset view',
  showList: 'Show the list instead',
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Scene3D', () => {
  it('passes bounds and start view to the viewer and offers a reset button', async () => {
    createViewer.mockResolvedValue({
      stats: { tier: 'mid', loadMs: 1, firstFrameMs: 2, fps: 60 },
      reset,
      resize: vi.fn(),
      lookAt: vi.fn(),
      dispose,
    });
    const bounds = { min: [-3, 0, -4], max: [3, 2.6, 4] } as const;
    const start = { position: [0, 1.5, 3], target: [0, 1.5, 0] } as const;
    const { unmount } = render(
      <Scene3D
        url="https://cdn.test/scene.sog"
        bounds={bounds as never}
        start={start as never}
        labels={labels}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Loading the 3D apartment');
    const button = await screen.findByRole('button', { name: 'Reset view' });
    expect(createViewer).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.test/scene.sog', bounds, camera: start }),
    );
    fireEvent.click(button);
    expect(reset).toHaveBeenCalledTimes(1);
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('shows the fallback message when the viewer cannot start', async () => {
    createViewer.mockRejectedValue(new Error('no webgl'));
    const onFailed = vi.fn();
    await act(async () => {
      render(<Scene3D url="https://cdn.test/x.sog" labels={labels} onFailed={onFailed} />);
    });
    expect(await screen.findByText('Could not show 3D')).toBeTruthy();
    expect(onFailed).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reset view' })).toBeNull();
  });

  it('applies the alignment and flies through the doorway when another room is chosen (7.4)', async () => {
    const flyTo = vi.fn().mockResolvedValue(undefined);
    createViewer.mockResolvedValue({
      stats: { tier: 'mid', loadMs: 1, firstFrameMs: 2, fps: 60 },
      reset,
      resize: vi.fn(),
      lookAt: vi.fn(),
      getView: () => ({ position: [0, 1.6, 0], target: [0, 1.6, -1] }),
      flyTo,
      dispose,
    });
    const viewpoints = [
      { roomId: 'ent', position: [0, 1.6, 0], target: [0, 1.6, -1] },
      { roomId: 'liv', position: [4, 1.6, -3], target: [5, 1.6, -3] },
    ] as never;
    const doorways = [{ a: 'ent', b: 'liv', position: [0, 0, -3] }] as never;
    const alignment = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const props = { url: 'https://cdn.test/s.sog', labels, alignment, viewpoints, doorways };
    const { rerender } = render(<Scene3D {...props} roomId="ent" />);
    await screen.findByRole('button', { name: 'Reset view' });
    // Starts at the chosen room's viewpoint when no start view is published.
    expect(createViewer).toHaveBeenCalledWith(
      expect.objectContaining({
        alignment,
        camera: { position: [0, 1.6, 0], target: [0, 1.6, -1] },
      }),
    );
    expect(flyTo).not.toHaveBeenCalled();
    rerender(<Scene3D {...props} roomId="liv" />);
    await vi.waitFor(() => expect(flyTo).toHaveBeenCalledTimes(1));
    const [path, options] = flyTo.mock.calls[0]!;
    expect(path.map((w: { position: number[] }) => w.position)).toEqual([
      [0, 1.6, 0],
      [0, 1.6, -3], // the doorway, at eye height
      [4, 1.6, -3],
    ]);
    expect(options).toEqual({ reducedMotion: false });
  });

  it('passes the governor "too slow" signal on (7.5)', async () => {
    let tooSlow: (() => void) | undefined;
    createViewer.mockImplementation(async (o: { onTooSlow?: () => void }) => {
      tooSlow = o.onTooSlow;
      return { stats: {}, reset, resize: vi.fn(), lookAt: vi.fn(), dispose };
    });
    const onTooSlow = vi.fn();
    render(<Scene3D url="https://cdn.test/s.sog" labels={labels} onTooSlow={onTooSlow} />);
    await screen.findByRole('button', { name: 'Reset view' });
    act(() => tooSlow?.());
    expect(onTooSlow).toHaveBeenCalledTimes(1);
  });

  it('offers the list when loading takes longer than the 20 s target (NFR-PERF-03)', async () => {
    vi.useFakeTimers();
    try {
      createViewer.mockReturnValue(new Promise(() => {})); // never finishes loading
      const onTooSlow = vi.fn();
      render(<Scene3D url="https://cdn.test/s.sog" labels={labels} onTooSlow={onTooSlow} />);
      expect(screen.queryByRole('button', { name: 'Show the list instead' })).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Show the list instead' }));
      expect(onTooSlow).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
