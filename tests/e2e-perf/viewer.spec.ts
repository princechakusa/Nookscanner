/**
 * Phase 7.1 viewer measurement on a real captured interior (local dev scene, never committed:
 * apps/guest/public/dev-scenes/room-7k.splat). Records load time, time to first frame, frame
 * rate while dragging and the GPU used, into test-results/perf/<project>.json, plus screenshots.
 * These are measurements on THIS machine (and emulated phone viewports), not on real phones:
 * real-device numbers are a separate, user-run step (docs/3D_QUALITY_BAR.md section 6).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SCENE = 'apps/guest/public/dev-scenes/room-7k.splat';

test.skip(!existsSync(SCENE), `local test scene missing (${SCENE})`);

test('real interior scene loads and renders in the guest viewer', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/demo');
  const scene = page.locator('.g-scene');
  await expect(scene).toHaveAttribute('data-state', 'ready', { timeout: 180_000 });
  await expect(scene).toHaveAttribute('data-first-frame-ms', /\d+/, { timeout: 30_000 });

  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });

  // Idle frame rate, then while dragging to look around.
  await page.waitForTimeout(3000);
  const idleFps = Number(await scene.getAttribute('data-fps'));
  const box = (await page.locator('.g-scene__canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.move(cx + Math.sin(i / 8) * 150, cy + Math.cos(i / 10) * 40);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const dragFps = Number(await scene.getAttribute('data-fps'));

  const result = {
    project: info.project.name,
    measuredAt: new Date().toISOString(),
    scene: 'room-7k.splat (36.2 MB, research scene, local only)',
    gpu,
    tier: await scene.getAttribute('data-tier'),
    loadMs: Number(await scene.getAttribute('data-load-ms')),
    firstFrameMs: Number(await scene.getAttribute('data-first-frame-ms')),
    idleFps,
    dragFps,
    pageErrors: errors,
  };
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync(`test-results/perf/${info.project.name}.json`, JSON.stringify(result, null, 2));
  await page.screenshot({ path: `test-results/perf/${info.project.name}.png` });

  expect(errors).toEqual([]);
  expect(result.firstFrameMs).toBeGreaterThan(0);
  // The canvas must show a scene, not an empty background. WebGL clears its buffer after each
  // frame, so check the composited screenshot: a flat image compresses to a few kB.
  const shot = await page.locator('.g-scene__canvas').screenshot();
  expect(shot.length).toBeGreaterThan(100_000);
});
