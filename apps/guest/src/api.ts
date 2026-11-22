/**
 * Guest API client (Stage 9.2): resolves a QR token through the guest-experience Edge Function
 * (Stage 9.1, ADR-023) and validates the payload with the shared schema before rendering it.
 * Nothing is cached: the response carries short-lived signed URLs.
 */
import { guestExperienceSchema, type GuestExperience } from '@nookscanner/shared';

export type LoadResult =
  | { kind: 'ok'; experience: GuestExperience }
  | { kind: 'not-found' }
  | { kind: 'rate-limited'; retryAfterSeconds: number }
  | { kind: 'error' };

/** Functions base URL, e.g. https://<project>.supabase.co/functions/v1 (public value). */
export function apiBase(): string {
  const explicit = import.meta.env.VITE_GUEST_API_BASE as string | undefined;
  if (explicit) return explicit.replace(/\/+$/, '');
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '';
}

export async function loadExperience(
  token: string,
  fetcher: typeof fetch = fetch,
  base = apiBase(),
): Promise<LoadResult> {
  if (!base) return { kind: 'error' };
  let res: Response;
  try {
    res = await fetcher(`${base}/guest-experience?t=${encodeURIComponent(token)}`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    return { kind: 'error' };
  }
  if (res.status === 404) return { kind: 'not-found' };
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after') ?? '60');
    return { kind: 'rate-limited', retryAfterSeconds: Number.isFinite(after) ? after : 60 };
  }
  if (!res.ok) return { kind: 'error' };
  try {
    const parsed = guestExperienceSchema.safeParse(await res.json());
    return parsed.success ? { kind: 'ok', experience: parsed.data } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
