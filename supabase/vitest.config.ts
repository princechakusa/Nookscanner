import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Each test file boots its own in-process Postgres (PGlite); allow time for WASM startup.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
