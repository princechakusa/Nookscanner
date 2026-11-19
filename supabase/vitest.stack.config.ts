import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.ts';

/** Same suites against the local Supabase stack (`npm run test:stack`, ADR-013). */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      env: { DB_TEST_TARGET: 'stack' },
      // One shared database: run files sequentially so catalog checks see a stable state.
      fileParallelism: false,
    },
  }),
);
