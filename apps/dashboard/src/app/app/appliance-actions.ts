'use server';

import { applianceSchema, fieldErrors } from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import type { FormState } from './org-actions.ts';

/**
 * Appliances of an apartment (Stage 8.1). Writes need `appliance.write` on the apartment's
 * property (RLS); the database also checks the room is in the apartment and a linked model is
 * global or the organization's own. A filtered write affects 0 rows and is reported as FORBIDDEN.
 */

const uuid = z.uuid();
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};
const KEYS = ['roomId', 'categoryId', 'nameEn', 'nameAr', 'brand', 'modelNumber', 'notes'] as const;
const fields = (form: FormData) =>
  applianceSchema.safeParse(Object.fromEntries(KEYS.map((k) => [k, str(form, k)])));
const echo = (form: FormData) =>
  Object.fromEntries(KEYS.map((k) => [k, str(form, k).slice(0, k === 'notes' ? 2000 : 200)]));
const columns = (d: z.infer<typeof applianceSchema>) => ({
  room_id: d.roomId,
  category_id: d.categoryId,
  name_en: d.nameEn,
  name_ar: d.nameAr,
  brand: d.brand,
  model_number: d.modelNumber,
  notes: d.notes,
});
// A room of another apartment is refused by the link trigger (check_appliance_links).
const failure = (error: { message?: string; code?: string }) =>
  error.message?.includes('room is not in this apartment')
    ? { fieldErrors: { roomId: 'ROOM_REQUIRED' } }
    : { formError: dbErrorCode(error) };

export async function addApplianceAction(_prev: FormState, form: FormData): Promise<FormState> {
  const apartmentId = uuid.safeParse(form.get('apartmentId'));
  if (!apartmentId.success) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = fields(form);
  if (!parsed.success)
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: echo(form) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('appliances')
    .insert({ apartment_id: apartmentId.data, ...columns(parsed.data) });
  if (error) return { status: 'error', ...failure(error), values: echo(form) };
  revalidatePath(`/app/apartments/${apartmentId.data}`);
  return { status: 'done' };
}

export async function updateApplianceAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = fields(form);
  if (!parsed.success)
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: echo(form) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('appliances')
    .update(columns(parsed.data))
    .eq('id', id.data)
    .select('apartment_id');
  if (error) return { status: 'error', ...failure(error), values: echo(form) };
  const row = (data ?? [])[0] as { apartment_id: string } | undefined;
  if (!row) return { status: 'error', formError: 'FORBIDDEN', values: echo(form) };
  revalidatePath(`/app/apartments/${row.apartment_id}`);
  return { status: 'done' };
}

export async function deleteApplianceAction(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('appliances')
    .delete()
    .eq('id', id.data)
    .select('apartment_id');
  const row = (data ?? [])[0] as { apartment_id: string } | undefined;
  if (row) revalidatePath(`/app/apartments/${row.apartment_id}`);
}
