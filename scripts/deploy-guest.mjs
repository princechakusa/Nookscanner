/**
 * Deploys the guest app to Cloudflare Pages (project nookscanner-guest, ADR-024):
 * build -> refuse local-only scene files (check-guest-dist) -> copy without source maps to a temp
 * folder -> wrangler pages deploy. Uses the browser login of `wrangler login`; an unrelated
 * CLOUDFLARE_API_TOKEN in the environment is ignored for this command (KNOWN_ISSUES KI-034).
 * Usage: npm run deploy:guest
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, env = process.env) =>
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env });

run('npm', ['run', 'build', '-w', '@nookscanner/guest']);
run('node', ['scripts/check-guest-dist.mjs', 'apps/guest/dist']);

const out = mkdtempSync(join(tmpdir(), 'nookscanner-guest-'));
cpSync('apps/guest/dist', out, { recursive: true });
const dropMaps = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) dropMaps(path);
    else if (name.endsWith('.map')) rmSync(path);
  }
};
dropMaps(out);
run('node', ['scripts/check-guest-dist.mjs', out]);

const env = { ...process.env };
delete env.CLOUDFLARE_API_TOKEN;
delete env.CLOUDFLARE_ACCOUNT_ID;
run(
  'npx',
  [
    '-y',
    'wrangler@4',
    'pages',
    'deploy',
    out,
    '--project-name',
    'nookscanner-guest',
    '--branch',
    'main',
    '--commit-dirty=true',
  ],
  env,
);
rmSync(out, { recursive: true, force: true });
