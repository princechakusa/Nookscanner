import type { Metadata } from 'next';
import Link from 'next/link';
import { signUpAction } from '../actions.ts';
import { AuthForm } from '../auth-form.tsx';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <>
      <h1>Create an account</h1>
      <AuthForm
        action={signUpAction}
        submitLabel="Create account"
        pendingLabel="Creating account…"
        sentMessage="Check your email. We sent a link to confirm your address. If you already have an account, sign in instead."
        fields={[
          { name: 'fullName', label: 'Full name', type: 'text', autoComplete: 'name' },
          { name: 'email', label: 'Work email', type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            autoComplete: 'new-password',
            hint: 'At least 10 characters with upper- and lower-case letters and a digit.',
          },
        ]}
      />
      <p className="nt-links">
        <Link href="/login">Already have an account? Sign in</Link>
      </p>
    </>
  );
}
