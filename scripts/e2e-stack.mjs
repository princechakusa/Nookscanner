/**
 * Runs the stack E2E suite (playwright.stack.config.ts) against the local Supabase stack.
 * Reads the stack's PUBLIC values (API URL, anon key, Mailpit URL) from `supabase status` and
 * passes them to the dashboard build via the environment. Nothing is written to disk.
 * The service-role key is never read here.
 */
import { execSync, spawnSync } from 'node:child_process';

const status = execSync('npx -y supabase@3.2.0 status -o env', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const env = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?([^"]*)"?$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.API_URL || !env.ANON_KEY) {
  console.error('Local Supabase stack is not running. Start it with: npx supabase@3.2.0 start');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['playwright', 'test', '-c', 'playwright.stack.config.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_ENV: 'local',
      NEXT_PUBLIC_SUPABASE_URL: env.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.ANON_KEY,
      MAILPIT_URL: env.MAILPIT_URL ?? 'http://127.0.0.1:56524',
    },
  },
);
process.exit(result.status ?? 1);
