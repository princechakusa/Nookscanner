import type { Metadata } from 'next';
import Link from 'next/link';
import { forgotPasswordAction } from '../actions.ts';
import { AuthForm } from '../auth-form.tsx';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1>Reset your password</h1>
      <AuthForm
        action={forgotPasswordAction}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
        sentMessage="If an account exists for that address, we sent a link to reset the password."
        fields={[{ name: 'email', label: 'Email', type: 'email', autoComplete: 'email' }]}
      />
      <p className="nt-links">
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}
