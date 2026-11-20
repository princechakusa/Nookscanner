import type { Metadata } from 'next';
import { createSupabaseServerClient } from '../../lib/supabase/server.ts';
import { CreateOrgForm } from './forms.tsx';
import { createOrganizationAction } from './org-actions.ts';

export const metadata: Metadata = { title: 'Overview' };

/** Overview. Organization creation and apartment summaries arrive in Phase 4. */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', data.user?.id ?? '')
    .maybeSingle();
  const { count } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true });
  const params = await searchParams;
  const fullName = (profile as { full_name: string | null } | null)?.full_name;

  return (
    <div className="ns-page">
      <h1 className="ns-page__title">Welcome{fullName ? `, ${fullName}` : ''}</h1>
      {params.password === 'updated' && (
        <p className="ns-notice" role="status">
          Your password was updated.
        </p>
      )}
      <p className="ns-muted" data-testid="signed-in-email">
        Signed in as {data.user?.email}
      </p>
      {params.joined === '1' && (
        <p className="ns-notice" role="status">
          You joined the organization.
        </p>
      )}
      {!count && (
        <section className="ns-panel">
          <h2 className="ns-panel__title">Set up your organization</h2>
          <p className="ns-muted">
            Create an organization for your company, or open an invitation link from a colleague to
            join theirs.
          </p>
          <CreateOrgForm action={createOrganizationAction} />
        </section>
      )}
    </div>
  );
}
