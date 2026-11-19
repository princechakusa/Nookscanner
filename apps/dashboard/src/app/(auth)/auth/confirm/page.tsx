import type { Metadata } from 'next';
import { confirmEmailAction } from '../../actions.ts';
import { AuthForm } from '../../auth-form.tsx';

export const metadata: Metadata = { title: 'Confirm', referrer: 'no-referrer' };

/**
 * Landing page for emailed links (supabase/templates). The one-time token is only used when the
 * person presses the button (POST), so link scanners that prefetch URLs cannot consume it.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const value = (k: string) => {
    const v = p[k];
    return typeof v === 'string' ? v : '';
  };
  const recovery = value('type') === 'recovery';
  return (
    <>
      <h1>{recovery ? 'Reset your password' : 'Confirm your email'}</h1>
      <p className="nt-muted">
        {recovery
          ? 'Continue to choose a new password.'
          : 'Confirm your email address to finish creating your account.'}
      </p>
      <AuthForm
        action={confirmEmailAction}
        hidden={{
          token_hash: value('token_hash'),
          type: value('type'),
          next: value('next') || '/app',
        }}
        submitLabel={recovery ? 'Continue' : 'Confirm email'}
        pendingLabel="Checking link…"
        fields={[]}
      />
    </>
  );
}
