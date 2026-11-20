import { defineConfig, devices } from '@playwright/test';

/**
 * Viewer performance on this machine with a local real scene (tests/e2e-perf). Not part of CI:
 * the scene file is local-only. Run: npx playwright test -c playwright.perf.config.ts
 * Chromium is started with the real GPU (ANGLE) so frame rates are meaningful for this PC.
 */
const gpuArgs = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-angle=d3d11',
  '--enable-unsafe-swiftshader',
];

export default defineConfig({
  testDir: 'tests/e2e-perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 240_000,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: gpuArgs },
      },
    },
    {
      name: 'phone-viewport-chromium',
      use: { ...devices['Pixel 7'], launchOptions: { args: gpuArgs } },
    },
  ],
  webServer: {
    // Separate output folder: a perf build (with the local scene) must never replace dist/.
    command:
      'npm run typecheck -w @nookscanner/guest && npx -w @nookscanner/guest vite build --outDir dist-perf && npx -w @nookscanner/guest vite preview --outDir dist-perf --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/demo',
    reuseExistingServer: false,
    timeout: 240_000,
    env: { VITE_DEV_SCENE_URL: '/dev-scenes/room-7k.splat' },
  },
});
