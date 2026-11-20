import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reset = vi.fn();
const dispose = vi.fn();
const createViewer = vi.fn();
vi.mock('@nookscanner/viewer', () => ({ createViewer: (o: unknown) => createViewer(o) }));

import { Scene3D } from './Scene3D.tsx';

const labels = {
  loading: 'Loading the 3D apartment',
  failed: 'Could not show 3D',
  reset: 'Reset view',
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
});
