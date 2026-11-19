/**
 * Nookscanner design tokens. Source of truth for docs/DESIGN_SYSTEM.md.
 * Changing a value here requires: `npm run generate -w @nookscanner/design-tokens` and a docs update.
 */

export const brand = {
  name: 'Nookscanner',
  tagline: 'Your stay, shown not told.',
} as const;

export const color = {
  brand: {
    primary: '#1F5662',
    primaryHover: '#17434D',
    primarySoft: '#E8F1F2',
    accent: '#C8893B',
    accentStrong: '#8F5E1F',
  },
  neutral: {
    ink: '#161A20',
    muted: '#5A6370',
    subtle: '#8A929C',
    border: '#E3DFD8',
    canvas: '#F7F5F1',
    surface: '#FFFFFF',
  },
  viewer: {
    background: '#0E1116',
    panel: 'rgba(18,22,28,0.78)',
    text: '#F4F1EC',
  },
  status: {
    success: '#1E7A4F',
    warning: '#9A5408',
    danger: '#B42318',
    info: '#1D5FD1',
  },
  focus: '#2F80ED',
} as const;

export const font = {
  latin: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  arabic: "'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif",
} as const;

/** [font-size rem, line-height rem] */
export const fontSize = {
  xs: ['0.75rem', '1rem'],
  sm: ['0.875rem', '1.25rem'],
  md: ['1rem', '1.5rem'],
  lg: ['1.125rem', '1.625rem'],
  xl: ['1.25rem', '1.75rem'],
  '2xl': ['1.5rem', '2rem'],
  '3xl': ['1.875rem', '2.25rem'],
  '4xl': ['2.25rem', '2.5rem'],
} as const;

export const space = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80] as const;

export const radius = { sm: '6px', md: '10px', lg: '16px', pill: '999px' } as const;

export const shadow = {
  e1: '0 1px 2px rgba(22,26,32,.06), 0 1px 1px rgba(22,26,32,.04)',
  e2: '0 4px 12px rgba(22,26,32,.08)',
  e3: '0 12px 32px rgba(22,26,32,.14)',
} as const;

export const breakpoint = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export const motion = { fast: '150ms', sheet: '220ms', camera: '900ms' } as const;

/** Text/background pairs that must meet WCAG AA. [foreground, background, minimum ratio] */
export const contrastPairs: ReadonlyArray<readonly [string, string, string, number]> = [
  ['ink on canvas', color.neutral.ink, color.neutral.canvas, 4.5],
  ['ink on surface', color.neutral.ink, color.neutral.surface, 4.5],
  ['muted on surface', color.neutral.muted, color.neutral.surface, 4.5],
  ['muted on canvas', color.neutral.muted, color.neutral.canvas, 4.5],
  ['muted on primarySoft', color.neutral.muted, color.brand.primarySoft, 4.5],
  ['white on primary', '#FFFFFF', color.brand.primary, 4.5],
  ['white on primaryHover', '#FFFFFF', color.brand.primaryHover, 4.5],
  ['primary on surface', color.brand.primary, color.neutral.surface, 4.5],
  ['accentStrong on surface', color.brand.accentStrong, color.neutral.surface, 4.5],
  ['danger on surface', color.status.danger, color.neutral.surface, 4.5],
  ['success on surface', color.status.success, color.neutral.surface, 4.5],
  ['warning on surface', color.status.warning, color.neutral.surface, 4.5],
  ['info on surface', color.status.info, color.neutral.surface, 4.5],
  ['viewer text on viewer background', color.viewer.text, color.viewer.background, 4.5],
  ['accent on viewer background', color.brand.accent, color.viewer.background, 3],
  ['focus ring on surface (non-text)', color.focus, color.neutral.surface, 3],
];
