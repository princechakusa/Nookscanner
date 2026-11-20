'use server';

import { ARTEFACT_CHECKS, fieldErrors, reviewSchema } from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import type { FormState } from './org-actions.ts';

/**
 * Stage 6.2/6.3 member actions on scans. Every action is an RPC that re-checks permissions in the
 * database (scan.create to submit/cancel, scan.review to review).
 */

const uuid = z.uuid();
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};

export async function submitScanAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = uuid.safeParse(form.get('sessionId'));
  if (!session.success) return { status: 'error', formError: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('submit_scan_for_processing', { p_session: session.data });
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  revalidatePath(`/app/scans/${session.data}`);
  revalidatePath('/app/scans');
  return { status: 'done' };
}

export async function cancelJobAction(_prev: FormState, form: FormData): Promise<FormState> {
  const job = uuid.safeParse(form.get('jobId'));
  const session = uuid.safeParse(form.get('sessionId'));
  if (!job.success || !session.success) return { status: 'error', formError: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('cancel_processing_job', { p_job: job.data });
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  revalidatePath(`/app/scans/${session.data}`);
  return { status: 'done' };
}

export async function reviewResultAction(_prev: FormState, form: FormData): Promise<FormState> {
  const job = uuid.safeParse(form.get('jobId'));
  const session = uuid.safeParse(form.get('sessionId'));
  if (!job.success || !session.success) return { status: 'error', formError: 'NOT_FOUND' };
  const checklist = Object.fromEntries(ARTEFACT_CHECKS.map((k) => [k, form.get(k) === 'on']));
  const notes = str(form, 'notes');
  const parsed = reviewSchema.safeParse({ decision: str(form, 'decision'), checklist, notes });
  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: { notes } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('review_processing_result', {
    p_job: job.data,
    p_decision: parsed.data.decision,
    p_checklist: parsed.data.checklist,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return { status: 'error', formError: dbErrorCode(error), values: { notes } };
  revalidatePath(`/app/scans/${session.data}`);
  revalidatePath('/app/scans');
  return { status: 'done' };
}
