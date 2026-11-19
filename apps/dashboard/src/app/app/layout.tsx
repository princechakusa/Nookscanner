import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ACTIVE_ORG_COOKIE, resolveActiveOrg, type OrgSummary } from '../../lib/active-org.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import { AppShell } from './shell.tsx';

/** Authenticated area. The proxy already redirects signed-out visitors; this re-checks server-side. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/app');

  const { data: orgRows } = await supabase.from('organizations').select('id, name').order('name');
  const orgs = (orgRows ?? []) as OrgSummary[];
  const activeOrg = resolveActiveOrg(orgs, (await cookies()).get(ACTIVE_ORG_COOKIE)?.value);

  return (
    <AppShell orgs={orgs} activeOrg={activeOrg} userEmail={data.user.email ?? ''}>
      {children}
    </AppShell>
  );
}
