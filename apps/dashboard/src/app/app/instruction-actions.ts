'use server';

import { fieldErrors, instructionSchema } from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import type { FormState } from './org-actions.ts';

/**
 * Instructions of an appliance (Stage 8.3). Every save inserts the next version for that
 * language, unverified (append-only, migration 1200); RLS requires instruction.write.
 */

const uuid = z.uuid();
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};
const PAIRS = 5;

/** The appliance's instruction, created on first save. */
async function instructionFor(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  applianceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('instructions')
    .select('id')
    .eq('appliance_id', applianceId)
    .maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: created } = await supabase
    .from('instructions')
    .insert({ appliance_id: applianceId })
    .select('id')
    .maybeSingle();
  return (created as { id: string } | null)?.id ?? null;
}

export async function saveInstructionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const applianceId = uuid.safeParse(form.get('applianceId'));
  if (!applianceId.success) return { status: 'error', formError: 'NOT_FOUND' };
  const values: Record<string, string> = {
    title: str(form, 'title').slice(0, 200),
    steps: str(form, 'steps').slice(0, 40_000),
    bodyMd: str(form, 'bodyMd').slice(0, 6000),
  };
  const troubleshooting = Array.from({ length: PAIRS }, (_, i) => {
    values[`problem${i}`] = str(form, `problem${i}`).slice(0, 400);
    values[`solution${i}`] = str(form, `solution${i}`).slice(0, 1200);
    return { problem: values[`problem${i}`]!, solution: values[`solution${i}`]! };
  });
  const parsed = instructionSchema.safeParse({
    locale: str(form, 'locale'),
    title: values.title,
    steps: values.steps,
    troubleshooting,
    bodyMd: values.bodyMd,
  });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error), values };
  const supabase = await createSupabaseServerClient();
  const instructionId = await instructionFor(supabase, applianceId.data);
  if (!instructionId) return { status: 'error', formError: 'FORBIDDEN', values };
  const d = parsed.data;
  const { error } = await supabase.from('instruction_versions').insert({
    instruction_id: instructionId,
    locale: d.locale,
    // Placeholder: the database assigns the next number.
    version: 1,
    title: d.title,
    steps: d.steps.map((text) => ({ text })),
    troubleshooting: d.troubleshooting,
    body_md: d.bodyMd,
  });
  if (error) return { status: 'error', formError: dbErrorCode(error), values };
  revalidatePath(`/app/appliances/${applianceId.data}`);
  return { status: 'done' };
}

const mediaSchema = z.object({
  applianceId: z.uuid(),
  instructionId: z.uuid(),
  objectPath: z.string().max(512),
  kind: z.enum(['image', 'video']),
  sizeBytes: z.number().int().positive().max(52_428_800),
  captionEn: z.string().trim().max(200).nullable(),
  captionAr: z.string().trim().max(200).nullable(),
});

/** Records a file the browser uploaded to the instruction folder (storage RLS checked it). */
export async function addInstructionMediaAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = mediaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_FAILED' };
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('instruction_media').insert({
    instruction_id: d.instructionId,
    kind: d.kind,
    object_path: d.objectPath,
    size_bytes: d.sizeBytes,
    caption_en: d.captionEn || null,
    caption_ar: d.captionAr || null,
  });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/app/appliances/${d.applianceId}`);
  return { ok: true };
}

/** Ensures the instruction exists so files can be uploaded before the first text save. */
export async function ensureInstructionAction(
  applianceId: string,
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!uuid.safeParse(applianceId).success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const id = await instructionFor(supabase, applianceId);
  return id ? { ok: true, id } : { ok: false };
}

export async function deleteInstructionMediaAction(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get('id'));
  const applianceId = uuid.safeParse(form.get('applianceId'));
  if (!id.success || !applianceId.success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('instruction_media')
    .delete()
    .eq('id', id.data)
    .select('object_path');
  const path = (data ?? [])[0] as { object_path: string } | undefined;
  // Storage delete is RLS-checked too (instruction.write on the apartment).
  if (path) await supabase.storage.from('instruction-media').remove([path.object_path]);
  revalidatePath(`/app/appliances/${applianceId.data}`);
}

/** Stage 8.4: a manager verifies the latest version of one language (verify_instruction_version). */
export async function verifyInstructionAction(form: FormData): Promise<void> {
  const version = uuid.safeParse(form.get('versionId'));
  const applianceId = uuid.safeParse(form.get('applianceId'));
  if (!version.success || !applianceId.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('verify_instruction_version', { p_version: version.data });
  revalidatePath(`/app/appliances/${applianceId.data}`);
}
