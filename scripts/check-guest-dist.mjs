/**
 * Refuses a guest build that would publish local-only 3D files (KI-029): no dev-scenes folder and
 * no scene files (.splat, .ply, .sog, .spz, .ksplat) anywhere in the output. Run before every
 * deploy of apps/guest/dist and in CI. Usage: node scripts/check-guest-dist.mjs [dir]
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'apps/guest/dist';
const banned = /\.(splat|ksplat|ply|sog|spz)$/i;
const found = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'dev-scenes' || banned.test(name)) found.push(relative(root, path));
    else if (statSync(path).isDirectory()) walk(path);
  }
};
walk(root);
if (found.length > 0) {
  console.error(
    `check-guest-dist: refusing ${root}; local-only files present:\n  ${found.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(`check-guest-dist: ${root} contains no scene files.`);
