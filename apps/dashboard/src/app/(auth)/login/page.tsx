import type { Metadata } from 'next';
import Link from 'next/link';
import { signInAction } from '../actions.ts';
import { AuthForm } from '../auth-form.tsx';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/app';
  return (
    <>
      <h1>Sign in</h1>
      <AuthForm
        action={signInAction}
        hidden={{ next }}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        fields={[
          { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
      />
      <p className="nt-links">
        <Link href="/forgot-password">Forgot your password?</Link>
        <Link href="/signup">Create an account</Link>
      </p>
    </>
  );
}
