/// <reference types="vitest/config" />
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * KI-029: the local research scene lives in public/dev-scenes (git-ignored) for performance
 * measurement only. Vite copies public/ into every build, so it is removed from the output
 * unless this is the explicit perf build (VITE_DEV_SCENE_URL). scripts/check-guest-dist.mjs
 * verifies deployable builds independently.
 */
function stripDevScenes(): Plugin {
  let outDir = 'dist';
  return {
    name: 'nookscanner-strip-dev-scenes',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env.VITE_DEV_SCENE_URL) return;
      rmSync(resolve(outDir, 'dev-scenes'), { recursive: true, force: true });
    },
  };
}

/**
 * Headers of the "/*" block in public/_headers (the Cloudflare Pages file), applied to the local
 * preview server so tests run under the production CSP. Local http origins are added to
 * connect-src for the local Supabase stack; upgrade-insecure-requests is dropped (http preview).
 */
function pagesHeaders(): Record<string, string> {
  const text = readFileSync(resolve(__dirname, 'public/_headers'), 'utf8');
  // Blocks start with a path at column 0; header lines are indented.
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('/*'));
  const headers: Record<string, string> = {};
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) headers[m[1]!] = m[2]!;
  }
  const csp = headers['Content-Security-Policy'];
  if (csp) {
    headers['Content-Security-Policy'] = csp
      .replace(/;\s*upgrade-insecure-requests/, '')
      .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:56521");
  }
  delete headers['Strict-Transport-Security'];
  return headers;
}

export default defineConfig({
  preview: { headers: pagesHeaders() },
  plugins: [react(), stripDevScenes()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Guest budget (NFR-PERF-02): keep the initial bundle small; the 3D renderer will be a lazy chunk.
    chunkSizeWarningLimit: 300,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
