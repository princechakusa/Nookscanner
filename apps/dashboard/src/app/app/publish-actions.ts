'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import type { FormState } from './org-actions.ts';

/**
 * Stage 8.5: publish / unpublish an apartment (publish_apartment / unpublish_apartment). The
 * database checks the rules (PB-01) and builds the guest snapshot from verified content.
 */
const uuid = z.uuid();

export async function publishAction(_prev: FormState, form: FormData): Promise<FormState> {
  const apartment = uuid.safeParse(form.get('apartmentId'));
  const scene = uuid.safeParse(form.get('sceneId'));
  if (!apartment.success || !scene.success) return { status: 'error', formError: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('publish_apartment', {
    p_apartment: apartment.data,
    p_scene: scene.data,
  });
  if (error) {
    const blocked = error.message?.includes('PUBLISH_BLOCKED');
    return { status: 'error', formError: blocked ? 'PUBLISH_BLOCKED' : dbErrorCode(error) };
  }
  revalidatePath(`/app/apartments/${apartment.data}`);
  return { status: 'done' };
}

export async function unpublishAction(form: FormData): Promise<void> {
  const apartment = uuid.safeParse(form.get('apartmentId'));
  if (!apartment.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('unpublish_apartment', { p_apartment: apartment.data });
  revalidatePath(`/app/apartments/${apartment.data}`);
}
