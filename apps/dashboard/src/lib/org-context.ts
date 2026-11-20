import 'server-only';
import { roleHasPermission, type OrgRole, type Permission } from '@nookscanner/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTIVE_ORG_COOKIE, resolveActiveOrg, type OrgSummary } from './active-org.ts';
import { createSupabaseServerClient } from './supabase/server.ts';

/**
 * Signed-in user, their organizations, the active one and their role in it. UI uses the role
 * only to hide controls; every write is still authorized by RLS / RPC checks in the database.
 */
export async function getOrgContext() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/app');
  const user = data.user;

  const { data: orgRows } = await supabase.from('organizations').select('id, name').order('name');
  const orgs = (orgRows ?? []) as OrgSummary[];
  const activeOrg = resolveActiveOrg(orgs, (await cookies()).get(ACTIVE_ORG_COOKIE)?.value);

  let role: OrgRole | null = null;
  if (activeOrg) {
    const { data: m } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', activeOrg.id)
      .eq('user_id', user.id)
      .maybeSingle();
    role = ((m as { role: OrgRole } | null)?.role ?? null) as OrgRole | null;
  }
  const can = (permission: Permission) => (role ? roleHasPermission(role, permission) : false);
  return { supabase, user, orgs, activeOrg, role, can };
}
