'use server';

import {
  INVITE_TOKEN_PATTERN,
  createOrgSchema,
  fieldErrors,
  inviteSchema,
  slugify,
  withSuffix,
  type AuthFieldErrors,
} from '@nookscanner/shared';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ACTIVE_ORG_COOKIE } from '../../lib/active-org.ts';
import { dbErrorCode } from '../../lib/db-errors.ts';
import { getOrgContext } from '../../lib/org-context.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';

export interface FormState {
  status: 'idle' | 'error' | 'done';
  fieldErrors?: AuthFieldErrors;
  formError?: string;
  /**
   * Submitted text values, echoed back on errors: React 19 resets a form after its action, so
   * without them the person would lose what they typed (KNOWN_ISSUES R-021).
   */
  values?: Record<string, string>;
  /** Relative path of a newly created invitation link (shown once). */
  invitePath?: string;
}

async function setActiveOrgCookie(id: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/app',
    maxAge: 60 * 60 * 24 * 180,
  });
}

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};

export async function createOrganizationAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = createOrgSchema.safeParse({ name: str(form, 'name') });
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  let slug = slugify(parsed.data.name);
  let result = await supabase.rpc('create_organization', {
    p_name: parsed.data.name,
    p_slug: slug,
  });
  for (
    let attempt = 0;
    result.error && dbErrorCode(result.error) === 'CONFLICT' && attempt < 3;
    attempt += 1
  ) {
    slug = withSuffix(slugify(parsed.data.name));
    result = await supabase.rpc('create_organization', { p_name: parsed.data.name, p_slug: slug });
  }
  if (result.error) return { status: 'error', formError: dbErrorCode(result.error) };
  await setActiveOrgCookie(result.data as string);
  revalidatePath('/app', 'layout');
  redirect('/app/settings');
}

export async function inviteMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, activeOrg } = await getOrgContext();
  if (!activeOrg) return { status: 'error', formError: 'NOT_FOUND' };
  const parsed = inviteSchema.safeParse({
    email: str(form, 'email'),
    role: str(form, 'role'),
    scope: str(form, 'scope') || 'organization',
    propertyIds: form.getAll('propertyIds').filter((v): v is string => typeof v === 'string'),
  });
  const values = { email: str(form, 'email').slice(0, 320), role: str(form, 'role') };
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrors(parsed.error), values };
  const { data, error } = await supabase
    .rpc('create_invitation', {
      p_org: activeOrg.id,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
      p_scope: parsed.data.scope,
      p_property_ids: parsed.data.propertyIds,
    })
    .single();
  if (error) return { status: 'error', formError: dbErrorCode(error), values };
  const token = (data as { token: string }).token;
  revalidatePath('/app/settings');
  // The token is returned to the inviting admin exactly once; it is never stored in plain text.
  return { status: 'done', invitePath: `/invite/${token}` };
}

const uuid = z.uuid();

export async function revokeInvitationAction(form: FormData): Promise<void> {
  const id = uuid.safeParse(form.get('invitationId'));
  if (!id.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc('revoke_invitation', { p_invitation: id.data });
  revalidatePath('/app/settings');
}

export async function changeRoleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, activeOrg } = await getOrgContext();
  const userId = uuid.safeParse(form.get('userId'));
  const role = z
    .enum(['owner', 'admin', 'manager', 'editor', 'viewer'])
    .safeParse(form.get('role'));
  if (!activeOrg || !userId.success || !role.success)
    return { status: 'error', formError: 'UNKNOWN' };
  const { data, error } = await supabase
    .from('organization_members')
    .update({ role: role.data })
    .eq('organization_id', activeOrg.id)
    .eq('user_id', userId.data)
    .select('user_id');
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  if (!data || data.length === 0) return { status: 'error', formError: 'FORBIDDEN' };
  revalidatePath('/app/settings');
  return { status: 'done' };
}

export async function removeMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, activeOrg } = await getOrgContext();
  const userId = uuid.safeParse(form.get('userId'));
  if (!activeOrg || !userId.success) return { status: 'error', formError: 'UNKNOWN' };
  const { data, error } = await supabase
    .from('organization_members')
    .delete()
    .eq('organization_id', activeOrg.id)
    .eq('user_id', userId.data)
    .select('user_id');
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  if (!data || data.length === 0) return { status: 'error', formError: 'FORBIDDEN' };
  revalidatePath('/app', 'layout');
  return { status: 'done' };
}

export async function acceptInvitationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = str(form, 'token');
  if (!INVITE_TOKEN_PATTERN.test(token)) return { status: 'error', formError: 'NOT_FOUND' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) return { status: 'error', formError: dbErrorCode(error) };
  await setActiveOrgCookie(data as string);
  revalidatePath('/app', 'layout');
  redirect('/app?joined=1');
}
