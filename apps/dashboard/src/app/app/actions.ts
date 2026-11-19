'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import { ACTIVE_ORG_COOKIE } from '../../lib/active-org.ts';

/**
 * Remembers the selected organization. The cookie is only a UI preference: every query is still
 * limited by RLS, and the value is accepted only if the user is a member of that organization.
 */
export async function setActiveOrganization(form: FormData): Promise<void> {
  const parsed = z.uuid().safeParse(form.get('organizationId'));
  if (!parsed.success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', parsed.data)
    .maybeSingle();
  if (!data) return;
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/app',
    maxAge: 60 * 60 * 24 * 180,
  });
  revalidatePath('/app', 'layout');
}
