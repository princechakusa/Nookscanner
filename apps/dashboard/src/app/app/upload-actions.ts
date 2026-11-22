'use server';

import { ALLOWED_VIDEO_TYPES, validateVideoFile } from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';

/**
 * Stage 5.1: video upload registration (ADR-016). The server creates the scan session and
 * registers the upload; the database builds every part path. The browser then uploads each part
 * with TUS straight to Storage (policies accept only pending, registered parts) and reports each
 * finished part here; the database checks the stored object's size before accepting it.
 */

export interface UploadPartPlan {
  partNumber: number;
  objectPath: string;
  sizeBytes: number;
  status: 'pending' | 'uploaded';
}

export type StartUploadResult =
  | {
      ok: true;
      uploadId: string;
      mime: string;
      /** Where the parts go (Stage 5.7): Supabase Storage (TUS) or R2 (uploads Worker). */
      backend: 'supabase' | 'r2';
      parts: UploadPartPlan[];
    }
  | { ok: false; error: string };

const startSchema = z.object({
  apartmentId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mime: z.enum(Object.keys(ALLOWED_VIDEO_TYPES) as [string, ...string[]]),
  size: z.number().int().positive(),
});

async function partsOf(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  uploadId: string,
): Promise<UploadPartPlan[]> {
  const { data } = await supabase
    .from('media_upload_parts')
    .select('part_number, object_path, size_bytes, status')
    .eq('media_upload_id', uploadId)
    .order('part_number');
  return (
    (data ?? []) as Array<{
      part_number: number;
      object_path: string;
      size_bytes: number;
      status: 'pending' | 'uploaded';
    }>
  ).map((p) => ({
    partNumber: p.part_number,
    objectPath: p.object_path,
    sizeBytes: p.size_bytes,
    status: p.status,
  }));
}

export async function startVideoUploadAction(input: {
  apartmentId: string;
  filename: string;
  mime: string;
  size: number;
}): Promise<StartUploadResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'UPLOAD_REJECTED' };
  const v = parsed.data;
  const blocking = validateVideoFile({ name: v.filename, type: v.mime, size: v.size }).find(
    (i) => i.blocking,
  );
  if (blocking) return { ok: false, error: blocking.code };

  const supabase = await createSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from('scan_sessions')
    .insert({ apartment_id: v.apartmentId, method: 'video_upload' })
    .select('id')
    .single();
  if (sessionError || !session) return { ok: false, error: dbErrorCode(sessionError) };

  const { data: upload, error } = await supabase
    .rpc('register_media_upload', {
      p_scan_session: (session as { id: string }).id,
      p_filename: v.filename,
      p_mime: v.mime,
      p_size_bytes: v.size,
    })
    .single();
  if (error || !upload) return { ok: false, error: dbErrorCode(error) };
  const row = upload as { id: string; mime_type: string; storage_backend?: 'supabase' | 'r2' };
  return {
    ok: true,
    uploadId: row.id,
    mime: row.mime_type,
    backend: row.storage_backend ?? 'supabase',
    parts: await partsOf(supabase, row.id),
  };
}

/** Parts of an unfinished upload (to resume it with the same file); finished parts are skipped. */
export async function resumeVideoUploadAction(uploadId: string): Promise<StartUploadResult> {
  const id = z.uuid().safeParse(uploadId);
  if (!id.success) return { ok: false, error: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('media_uploads')
    .select('id, mime_type, status, storage_backend')
    .eq('id', id.data)
    .maybeSingle();
  const row = data as {
    id: string;
    mime_type: string;
    status: string;
    storage_backend: 'supabase' | 'r2';
  } | null;
  // An upload finished just before the page closed resumes as already complete (all parts done).
  if (!row || !['pending', 'uploaded'].includes(row.status))
    return { ok: false, error: 'NOT_FOUND' };
  return {
    ok: true,
    uploadId: row.id,
    mime: row.mime_type,
    backend: row.storage_backend ?? 'supabase',
    parts: await partsOf(supabase, row.id),
  };
}

export async function completeUploadPartAction(
  uploadId: string,
  partNumber: number,
  apartmentId: string,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const ids = z
    .object({
      uploadId: z.uuid(),
      partNumber: z.number().int().min(1).max(1000),
      apartmentId: z.uuid(),
    })
    .safeParse({ uploadId, partNumber, apartmentId });
  if (!ids.success) return { ok: false, error: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('complete_media_upload_part', {
    p_upload: ids.data.uploadId,
    p_part: ids.data.partNumber,
  });
  if (error) return { ok: false, error: dbErrorCode(error) };
  const remaining = data as number;
  if (remaining === 0) revalidatePath(`/app/apartments/${ids.data.apartmentId}`);
  return { ok: true, remaining };
}
