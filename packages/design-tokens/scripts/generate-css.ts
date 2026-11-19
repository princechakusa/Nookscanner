// Run with: npm run generate -w @nooktour/design-tokens (Node 24 strips TypeScript types natively).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateCss } from '../src/css.ts';

const target = fileURLToPath(new URL('../tokens.css', import.meta.url));
writeFileSync(target, generateCss(), 'utf8');
console.warn(`Wrote ${target}`);
