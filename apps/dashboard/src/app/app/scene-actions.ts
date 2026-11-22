'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const saveSchema = z.object({
  sceneId: z.uuid(),
  alignment: z.object({
    matrix: z.array(z.number().finite()).length(16),
    scale: z.number().positive(),
  }),
  bounds: z.object({ min: vec3, max: vec3 }),
  start: z.object({ position: vec3, target: vec3 }).nullable(),
});

export type SaveAlignmentResult = { ok: true } | { ok: false; error: string };

/** Stage 7.3: stores the alignment; the database validates it again (save_scene_alignment). */
export async function saveAlignmentAction(input: unknown): Promise<SaveAlignmentResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_FAILED' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('save_scene_alignment', {
    p_scene: parsed.data.sceneId,
    p_alignment: parsed.data.alignment,
    p_bounds: parsed.data.bounds,
    p_start: parsed.data.start,
  });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/app/scenes/${parsed.data.sceneId}`);
  return { ok: true };
}

const navSchema = z.object({
  sceneId: z.uuid(),
  views: z.array(z.object({ room: z.uuid(), position: vec3, target: vec3 })).max(40),
  doorways: z.array(z.object({ a: z.uuid(), b: z.uuid(), position: vec3 })).max(80),
});

/** Stage 7.4: room viewpoints and doorways; save_scene_navigation validates them again. */
export async function saveNavigationAction(input: unknown): Promise<SaveAlignmentResult> {
  const parsed = navSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_FAILED' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('save_scene_navigation', {
    p_scene: parsed.data.sceneId,
    p_views: parsed.data.views,
    p_doorways: parsed.data.doorways,
  });
  if (error) return { ok: false, error: dbErrorCode(error) };
  revalidatePath(`/app/scenes/${parsed.data.sceneId}`);
  return { ok: true };
}

const hotspotSchema = z.object({
  sceneId: z.uuid(),
  applianceId: z.uuid(),
  position: vec3,
  camera: z.object({ position: vec3, target: vec3 }).nullable(),
});

export type HotspotResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Stage 8.2: places (or moves) the hotspot of one appliance in this scene version. The database
 * checks the point is inside the aligned apartment and resets verification on a move.
 */
export async function placeHotspotAction(input: unknown): Promise<HotspotResult> {
  const parsed = hotspotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_FAILED' };
  const d = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('hotspots')
    .upsert(
      {
        scene_version_id: d.sceneId,
        appliance_id: d.applianceId,
        position: d.position,
        camera_pose: d.camera,
      },
      { onConflict: 'scene_version_id,appliance_id' },
    )
    .select('id')
    .maybeSingle();
  if (error) {
    const outside = error.message?.includes('outside the apartment');
    return { ok: false, error: outside ? 'OUTSIDE' : dbErrorCode(error) };
  }
  if (!data) return { ok: false, error: 'FORBIDDEN' };
  revalidatePath(`/app/scenes/${d.sceneId}`);
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteHotspotAction(input: unknown): Promise<SaveAlignmentResult> {
  const parsed = z.object({ sceneId: z.uuid(), id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_FAILED' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('hotspots')
    .delete()
    .eq('id', parsed.data.id)
    .select('id');
  if (error) return { ok: false, error: dbErrorCode(error) };
  if (!data?.length) return { ok: false, error: 'FORBIDDEN' };
  revalidatePath(`/app/scenes/${parsed.data.sceneId}`);
  return { ok: true };
}
