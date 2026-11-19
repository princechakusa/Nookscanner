import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
import { generateCss } from './css.ts';
import { contrastPairs } from './tokens.ts';

describe('contrast (WCAG AA, docs/DESIGN_SYSTEM.md section 2)', () => {
  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  for (const [label, fg, bg, min] of contrastPairs) {
    it(`${label} >= ${min}:1`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('generated CSS', () => {
  it('committed tokens.css is in sync with tokens.ts (run `npm run generate` if this fails)', () => {
    const committed = readFileSync(
      fileURLToPath(new URL('../tokens.css', import.meta.url)),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(committed).toBe(generateCss());
  });

  it('exposes key variables', () => {
    const css = generateCss();
    expect(css).toContain('--nt-color-brand-primary: #1F5662;');
    expect(css).toContain('--nt-color-viewer-background: #0E1116;');
    expect(css).toContain("--nt-font-arabic: 'IBM Plex Sans Arabic'");
  });
});
