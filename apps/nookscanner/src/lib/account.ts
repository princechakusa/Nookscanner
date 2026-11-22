/** Account deletion through the delete-account Edge Function (Stage 10.6). */
import { supabase } from './supabase.ts';

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: 'SOLE_OWNER'; organizations: string[] }
  | { ok: false; error: 'FAILED' };

export async function deleteAccount(): Promise<DeleteResult> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (!error)
    return (data as { deleted?: boolean })?.deleted ? { ok: true } : { ok: false, error: 'FAILED' };
  // FunctionsHttpError carries the response; 409 lists the companies the user solely owns.
  const ctx = (error as { context?: Response }).context;
  if (ctx?.status === 409) {
    const body = (await ctx.json().catch(() => null)) as { organizations?: string[] } | null;
    return { ok: false, error: 'SOLE_OWNER', organizations: body?.organizations ?? [] };
  }
  return { ok: false, error: 'FAILED' };
}
