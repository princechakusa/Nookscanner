import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests that need the local Supabase stack (dashboard auth flows, Stage 2.4).
 * Started by scripts/e2e-stack.mjs, which injects the local stack's public URL and anon key.
 * The dashboard runs as a production build on http://localhost:3000 (the Auth site_url).
 */
export default defineConfig({
  testDir: 'tests/e2e-stack',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Real GPU on Windows dev machines so the 3D alignment spec can render (align.spec.ts).
        ...(process.platform === 'win32'
          ? {
              launchOptions: {
                args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
              },
            }
          : {}),
      },
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 15'],
        // Trace recording pegs the WebKit process on Windows and slowed later specs ~10x
        // (KNOWN_ISSUES R-023); CI (Linux) keeps traces.
        trace: process.platform === 'win32' ? 'off' : 'retain-on-failure',
      },
    },
  ],
  webServer: {
    command: 'npm run build -w @nookscanner/dashboard && npm run start -w @nookscanner/dashboard',
    url: 'http://localhost:3000/login',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
