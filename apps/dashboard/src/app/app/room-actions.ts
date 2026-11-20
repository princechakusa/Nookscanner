'use server';

import {
  fieldErrors,
  missingPlannedRooms,
  moveInOrder,
  parseLayout,
  roomSchema,
  roomsFromLayout,
} from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import type { FormState } from './org-actions.ts';

/**
 * Rooms of an apartment (Stage 4.3). Writes need `room.write` on the apartment's property,
 * enforced by RLS; a filtered write affects 0 rows and is reported as FORBIDDEN.
 */

const uuid = z.uuid();
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};

interface RoomRow {
  id: string;
  apartment_id: string;
  organization_id: string;
  name_en: string;
  room_type: string;
  sort_order: number;
}

async function roomsOf(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  apartmentId: string,
) {
  const { data } = await supabase
    .from('rooms')
    .select('id, apartment_id, organization_id, name_en, room_type, sort_order')
    .eq('apartment_id', apartmentId)
    .order('sort_order')
    .order('name_en');
  return (data ?? []) as RoomRow[];
}

const nextSortOrder = (rooms: readonly RoomRow[]) =>
  rooms.reduce((max, r) => Math.max(max, r.sort_order), 0) + 10;

/** Creates the planned rooms from the layout questionnaire that do not exist yet. */
export async function generateRoomsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const apartmentId = uuid.safeParse(form.get('apartmentId'));
  if (!apartmentId.success) return { status: 'error', formError: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { data: apartment } = await supabase
    .from('apartments')
    .select('id, layout')
    .eq('id', apartmentId.data)
    .maybeSingle();
  const layout = parseLayout((apartment as { layout: unknown } | null)?.layout);
  if (!apartment || !layout) return { status: 'error', formError: 'NOT_FOUND' };

  const existing = await roomsOf(supabase, apartmentId.data);
  const missing = missingPlannedRooms(
    roomsFromLayout(layout),
    existing.map((r) => r.name_en),
  );
  if (missing.length === 0) return { status: 'done' };
  const start = nextSortOrder(existing);
  const { error } = await supabase.from('rooms').insert(
    missing.map((r, i) => ({
      apartment_id: apartmentId.data,
      name_en: r.nameEn,
      name_ar: r.nameAr,
      room_type: r.roomType,
      sort_order: start + i * 10,
    })),
  );
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  revalidatePath(`/app/apartments/${apartmentId.data}`);
  return { status: 'done' };
}

function roomFields(form: FormData) {
  return roomSchema.safeParse({
    nameEn: str(form, 'nameEn'),
    nameAr: str(form, 'nameAr'),
    roomType: str(form, 'roomType'),
  });
}

const echo = (form: FormData) => ({
  nameEn: str(form, 'nameEn').slice(0, 200),
  nameAr: str(form, 'nameAr').slice(0, 200),
  roomType: str(form, 'roomType'),
});

export async function addRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  const apartmentId = uuid.safeParse(form.get('apartmentId'));
  if (!apartmentId.success) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = roomFields(form);
  if (!parsed.success)
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: echo(form) };
  const supabase = await createSupabaseServerClient();
  const existing = await roomsOf(supabase, apartmentId.data);
  const { error } = await supabase.from('rooms').insert({
    apartment_id: apartmentId.data,
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr,
    room_type: parsed.data.roomType,
    sort_order: nextSortOrder(existing),
  });
  if (error) {
    const code = dbErrorCode(error);
    return {
      status: 'error',
      ...(code === 'CONFLICT'
        ? { fieldErrors: { nameEn: 'ROOM_NAME_TAKEN' } }
        : { formError: code }),
      values: echo(form),
    };
  }
  revalidatePath(`/app/apartments/${apartmentId.data}`);
  return { status: 'done' };
}

export async function updateRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = roomFields(form);
  if (!parsed.success)
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: echo(form) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('rooms')
    .update({
      name_en: parsed.data.nameEn,
      name_ar: parsed.data.nameAr,
      room_type: parsed.data.roomType,
    })
    .eq('id', id.data)
    .select('apartment_id');
  if (error) {
    const code = dbErrorCode(error);
    return {
      status: 'error',
      ...(code === 'CONFLICT'
        ? { fieldErrors: { nameEn: 'ROOM_NAME_TAKEN' } }
        : { formError: code }),
      values: echo(form),
    };
  }
  const row = (data ?? [])[0] as { apartment_id: string } | undefined;
  if (!row) return { status: 'error', formError: 'FORBIDDEN', values: echo(form) };
  revalidatePath(`/app/apartments/${row.apartment_id}`);
  return { status: 'done' };
}

/**
 * Moves a room one place up or down and renumbers all rooms (10, 20, ...) in one upsert
 * statement, so the order never ends up half-applied.
 */
export async function moveRoomAction(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get('id'));
  const direction = z.enum(['up', 'down']).safeParse(form.get('direction'));
  if (!id.success || !direction.success) return;
  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase
    .from('rooms')
    .select('apartment_id')
    .eq('id', id.data)
    .maybeSingle();
  if (!room) return;
  const apartmentId = (room as { apartment_id: string }).apartment_id;
  const rooms = await roomsOf(supabase, apartmentId);
  const order = moveInOrder(
    rooms.map((r) => r.id),
    id.data,
    direction.data,
  );
  const byId = new Map(rooms.map((r) => [r.id, r]));
  await supabase.from('rooms').upsert(
    order.map((rid, i) => {
      const r = byId.get(rid)!;
      return {
        id: r.id,
        apartment_id: r.apartment_id,
        organization_id: r.organization_id,
        name_en: r.name_en,
        room_type: r.room_type,
        sort_order: (i + 1) * 10,
      };
    }),
    { onConflict: 'id' },
  );
  revalidatePath(`/app/apartments/${apartmentId}`);
}

export async function deleteRoomAction(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('rooms').delete().eq('id', id.data).select('apartment_id');
  const row = (data ?? [])[0] as { apartment_id: string } | undefined;
  if (row) revalidatePath(`/app/apartments/${row.apartment_id}`);
}
