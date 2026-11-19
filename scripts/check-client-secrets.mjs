// Fails if a privileged Supabase key appears in any built client bundle (threat T06).
// Run after `npm run build`. Scans apps/guest/dist and apps/dashboard/.next/static.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps/guest/dist', 'apps/dashboard/.next/static'];
const patterns = [
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  {
    name: 'service_role JWT',
    re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/,
  },
  { name: 'SUPABASE_SERVICE_ROLE_KEY reference', re: /SUPABASE_SERVICE_ROLE_KEY/ },
  { name: 'RECONSTRUCTION_HMAC_SECRET reference', re: /RECONSTRUCTION_HMAC_SECRET/ },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|css|html|json|map)$/.test(entry)) yield path;
  }
}

let scanned = 0;
const findings = [];
for (const root of roots) {
  if (!existsSync(root)) {
    console.error(`Missing build output ${root}; run npm run build first.`);
    process.exit(1);
  }
  for (const file of walk(root)) {
    scanned += 1;
    const text = readFileSync(file, 'utf8');
    for (const { name, re } of patterns) if (re.test(text)) findings.push(`${name} in ${file}`);
  }
}

if (findings.length) {
  console.error(`Privileged secrets found in client bundles:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`check-client-secrets: scanned ${scanned} files, no privileged keys found.`);
