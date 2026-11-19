import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOutAction } from '../(auth)/actions.ts';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Signed-in landing page. The full shell (sidebar, organization switcher) is Phase 3;
 * organizations and properties are Phase 4. Data is read with the user's session; RLS limits
 * what is visible.
 */
export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/app');

  const [{ data: profile }, { data: orgs }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle(),
    supabase.from('organizations').select('id, name').order('name'),
  ]);
  const params = await searchParams;
  const fullName = (profile as { full_name: string | null } | null)?.full_name;
  const orgNames = ((orgs ?? []) as { name: string }[]).map((o) => o.name);

  return (
    <main className="nt-foundation">
      <div className="nt-card">
        <h1>Welcome{fullName ? `, ${fullName}` : ''}</h1>
        {params.password === 'updated' && (
          <p className="nt-notice" role="status">
            Your password was updated.
          </p>
        )}
        <p className="nt-muted" data-testid="signed-in-email">
          Signed in as {data.user.email}
        </p>
        <p className="nt-muted">
          {orgNames.length > 0
            ? `Organizations: ${orgNames.join(', ')}`
            : 'You are not a member of an organization yet. Creating organizations arrives in the next stage.'}
        </p>
        <form action={signOutAction}>
          <button type="submit" className="nt-button nt-button-secondary">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
