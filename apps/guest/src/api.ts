/**
 * Guest API client (Stage 9.2): resolves a QR token through the guest-experience Edge Function
 * (Stage 9.1, ADR-023) and validates the payload with the shared schema before rendering it.
 * Nothing is cached: the response carries short-lived signed URLs.
 */
import { guestExperienceSchema, type GuestExperience } from '@nookscanner/shared';
import { z } from 'zod';

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

const mediaSchema = z.object({
  media: z
    .array(
      z.object({
        kind: z.enum(['image', 'video']),
        url: z
          .string()
          .url()
          .refine((u) => u.startsWith('https://') || u.startsWith('http://127.0.0.1'), {
            message: 'https only',
          }),
        caption: z
          .object({ en: z.string().max(200), ar: z.string().max(200).optional() })
          .optional(),
      }),
    )
    .max(20),
});
export type GuestMedia = z.infer<typeof mediaSchema>['media'][number];

/** Photos/videos of one appliance (guest-instruction, Stage 9.1/9.4); [] when none or on error. */
export async function loadMedia(
  token: string,
  applianceId: string,
  fetcher: typeof fetch = fetch,
  base = apiBase(),
): Promise<GuestMedia[]> {
  if (!base) return [];
  try {
    const res = await fetcher(
      `${base}/guest-instruction?t=${encodeURIComponent(token)}&a=${encodeURIComponent(applianceId)}`,
      {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      },
    );
    if (!res.ok) return [];
    const parsed = mediaSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.media : [];
  } catch {
    return [];
  }
}
