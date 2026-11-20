import { QUALITY_HINTS } from '@nookscanner/shared';

export function useQualityTips(_tier: unknown, enabled: boolean) {
  const t = new URLSearchParams(location.search).get('tip') as keyof typeof QUALITY_HINTS | null;
  return {
    output: {},
    tip: enabled && t ? QUALITY_HINTS[t] : null,
    issues: [],
    summary: () => ({}),
    reset: () => {},
  };
}
