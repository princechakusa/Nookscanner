'use server';

import { qrLabelSchema } from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import type { FormState } from './org-actions.ts';

/**
 * Guest QR codes (Stage 4.4). Tokens are generated inside `create_qr_code` (never by the app);
 * both RPCs check `qr.manage` on the apartment and answer NOT_FOUND otherwise.
 */
const uuid = z.uuid();

export async function createQrAction(_prev: FormState, form: FormData): Promise<FormState> {
  const apartmentId = uuid.safeParse(form.get('apartmentId'));
  if (!apartmentId.success) return { status: 'error', formError: 'NOT_FOUND' };
  const rawLabel = typeof form.get('label') === 'string' ? (form.get('label') as string) : '';
  const label = qrLabelSchema.safeParse(rawLabel);
  if (!label.success)
    return {
      status: 'error',
      fieldErrors: { label: 'TOO_LONG' },
      values: { label: rawLabel.slice(0, 200) },
    };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('create_qr_code', {
    p_apartment: apartmentId.data,
    p_label: label.data,
  });
  if (error) return { status: 'error', formError: dbErrorCode(error), values: { label: rawLabel } };
  revalidatePath(`/app/apartments/${apartmentId.data}`);
  return { status: 'done' };
}

export async function revokeQrAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  const apartmentId = uuid.safeParse(form.get('apartmentId'));
  if (!id.success || !apartmentId.success) return { status: 'error', formError: 'NOT_FOUND' };
  if (form.get('confirm') !== 'on') return { status: 'error', formError: 'CONFIRM_REQUIRED' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('revoke_qr_code', { p_qr: id.data });
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  revalidatePath(`/app/apartments/${apartmentId.data}`);
  return { status: 'done' };
}
