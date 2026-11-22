/**
 * Deploys the uploads Worker (services/uploads-worker, ADR-025) with the project's PUBLIC
 * publishable key read from apps/dashboard/.env.local. Uses the wrangler browser login; a stray
 * CLOUDFLARE_API_TOKEN is ignored (KI-034). Secrets are set separately (docs/DEPLOYMENT.md 2c).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const key = /^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m
  .exec(readFileSync('apps/dashboard/.env.local', 'utf8'))?.[1]
  ?.trim();
if (!key?.startsWith('sb_publishable_')) {
  console.error('deploy-uploads: no publishable key in apps/dashboard/.env.local');
  process.exit(1);
}
const env = { ...process.env };
delete env.CLOUDFLARE_API_TOKEN;
delete env.CLOUDFLARE_ACCOUNT_ID;
execFileSync('npx', ['-y', 'wrangler@4', 'deploy', '--var', `SUPABASE_PUBLISHABLE_KEY:${key}`], {
  cwd: 'services/uploads-worker',
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});
