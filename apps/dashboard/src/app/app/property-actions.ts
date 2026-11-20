'use server';

import {
  apartmentSchema,
  fieldErrors,
  layoutSchema,
  propertyColumns,
  propertySchema,
  type AuthFieldErrors,
} from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../lib/org-context.ts';
import { dbErrorCode } from '../../lib/db-errors.ts';
import type { FormState } from './org-actions.ts';

/**
 * Property and apartment CRUD (Stage 4.2). The UI hides controls by role, but every write is
 * authorized by RLS: a write that RLS filters out affects 0 rows and is reported as FORBIDDEN.
 */

const uuid = z.uuid();
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};

/** Text fields of a submitted form (never includes Next.js internals or the id). */
function submitted(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string' && !k.startsWith('$') && k !== 'id') out[k] = v.slice(0, 500);
  }
  return out;
}

function propertyFields(form: FormData) {
  return propertySchema.safeParse({
    name: str(form, 'name'),
    addressLine1: str(form, 'addressLine1'),
    city: str(form, 'city'),
    countryCode: str(form, 'countryCode'),
    supportPhone: str(form, 'supportPhone'),
    supportEmail: str(form, 'supportEmail'),
    supportWhatsapp: str(form, 'supportWhatsapp'),
  });
}

export async function createPropertyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, activeOrg } = await getOrgContext();
  if (!activeOrg) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = propertyFields(form);
  if (!parsed.success)
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: submitted(form) };
  const { data, error } = await supabase
    .from('properties')
    .insert({ organization_id: activeOrg.id, ...propertyColumns(parsed.data) })
    .select('id')
    .single();
  if (error) return { status: 'error', formError: dbErrorCode(error), values: submitted(form) };
  revalidatePath('/app', 'layout');
  redirect(`/app/properties/${(data as { id: string }).id}`);
}

export async function updatePropertyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = propertyFields(form);
  if (!parsed.success)
    return { status: 'error', fieldErrors: fieldErrors(parsed.error), values: submitted(form) };
  const { supabase } = await getOrgContext();
  const { data, error } = await supabase
    .from('properties')
    .update(propertyColumns(parsed.data))
    .eq('id', id.data)
    .select('id');
  if (error) return { status: 'error', formError: dbErrorCode(error), values: submitted(form) };
  if (!data || data.length === 0)
    return { status: 'error', formError: 'FORBIDDEN', values: submitted(form) };
  revalidatePath('/app', 'layout');
  return { status: 'done' };
}

export async function deletePropertyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return { status: 'error', formError: 'NOT_FOUND' };
  if (form.get('confirm') !== 'on') return { status: 'error', formError: 'CONFIRM_REQUIRED' };
  const { supabase } = await getOrgContext();
  const { data, error } = await supabase.from('properties').delete().eq('id', id.data).select('id');
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  if (!data || data.length === 0) return { status: 'error', formError: 'FORBIDDEN' };
  revalidatePath('/app', 'layout');
  redirect('/app/properties?deleted=1');
}

/** Apartment fields + layout questionnaire; errors are keyed by field name (layout keys too). */
function apartmentFields(form: FormData) {
  const layout = layoutSchema.safeParse({
    bedrooms: str(form, 'bedrooms'),
    bathrooms: str(form, 'bathrooms'),
    balconies: str(form, 'balconies'),
    hallways: str(form, 'hallways'),
    kitchen: str(form, 'kitchen'),
    dining: str(form, 'dining'),
    laundry: str(form, 'laundry'),
    office: str(form, 'office'),
    storage: str(form, 'storage'),
  });
  const base = apartmentSchema.omit({ layout: true }).safeParse({
    propertyId: str(form, 'propertyId'),
    name: str(form, 'name'),
    unitNumber: str(form, 'unitNumber'),
    floor: str(form, 'floor'),
  });
  if (!layout.success || !base.success) {
    const errors: AuthFieldErrors = {
      ...(base.success ? {} : fieldErrors(base.error)),
      ...(layout.success ? {} : fieldErrors(layout.error)),
    };
    return { ok: false as const, errors };
  }
  return { ok: true as const, value: { ...base.data, layout: layout.data } };
}

export async function createApartmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = apartmentFields(form);
  if (!parsed.ok) return { status: 'error', fieldErrors: parsed.errors, values: submitted(form) };
  const { supabase } = await getOrgContext();
  const a = parsed.value;
  // organization_id is filled from the property by the enforce_parent_org trigger (threat T03).
  const { data, error } = await supabase
    .from('apartments')
    .insert({
      property_id: a.propertyId,
      name: a.name,
      unit_number: a.unitNumber,
      floor: a.floor,
      layout: a.layout,
    })
    .select('id')
    .single();
  if (error) return { status: 'error', formError: dbErrorCode(error), values: submitted(form) };
  revalidatePath('/app', 'layout');
  redirect(`/app/apartments/${(data as { id: string }).id}`);
}

export async function updateApartmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = apartmentFields(form);
  if (!parsed.ok) return { status: 'error', fieldErrors: parsed.errors, values: submitted(form) };
  const { supabase } = await getOrgContext();
  const a = parsed.value;
  const { data, error } = await supabase
    .from('apartments')
    .update({
      property_id: a.propertyId,
      name: a.name,
      unit_number: a.unitNumber,
      floor: a.floor,
      layout: a.layout,
    })
    .eq('id', id.data)
    .select('id');
  if (error) return { status: 'error', formError: dbErrorCode(error), values: submitted(form) };
  if (!data || data.length === 0)
    return { status: 'error', formError: 'FORBIDDEN', values: submitted(form) };
  revalidatePath('/app', 'layout');
  return { status: 'done' };
}

export async function deleteApartmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) return { status: 'error', formError: 'NOT_FOUND' };
  if (form.get('confirm') !== 'on') return { status: 'error', formError: 'CONFIRM_REQUIRED' };
  const { supabase } = await getOrgContext();
  const { data, error } = await supabase.from('apartments').delete().eq('id', id.data).select('id');
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  if (!data || data.length === 0) return { status: 'error', formError: 'FORBIDDEN' };
  revalidatePath('/app', 'layout');
  redirect('/app/apartments?deleted=1');
}
