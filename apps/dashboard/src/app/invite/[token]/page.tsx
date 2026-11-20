import { INVITE_TOKEN_PATTERN } from '@nookscanner/shared';
import { brand } from '@nookscanner/design-tokens';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AcceptInviteForm } from '../../app/forms.tsx';
import { acceptInvitationAction } from '../../app/org-actions.ts';
import { createSupabaseServerClient } from '../../../lib/supabase/server.ts';

export const metadata: Metadata = { title: 'Invitation', referrer: 'no-referrer' };

/**
 * Invitation landing page. Signed-out visitors sign in (or sign up with the invited email) and
 * come back here. Acceptance is a POST; the database checks token hash, expiry, single use and
 * that the signed-in email matches the invitation.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = INVITE_TOKEN_PATTERN.test(token);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user && valid) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  return (
    <main className="nt-foundation">
      <div className="nt-card nt-auth-card">
        <p className="nt-wordmark">{brand.name.toLowerCase()}</p>
        <h1>Join an organization</h1>
        {valid ? (
          <>
            <p className="nt-muted">
              You are signed in as <strong>{data.user?.email}</strong>. Accept to join the
              organization that invited this address.
            </p>
            <AcceptInviteForm action={acceptInvitationAction} token={token} />
          </>
        ) : (
          <p className="nt-muted" role="alert">
            This invitation link is not valid.
          </p>
        )}
      </div>
    </main>
  );
}
