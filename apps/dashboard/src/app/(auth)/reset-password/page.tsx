import type { Metadata } from 'next';
import { resetPasswordAction } from '../actions.ts';
import { AuthForm } from '../auth-form.tsx';

export const metadata: Metadata = { title: 'Choose a new password' };

/** Reached after a recovery link was confirmed (the proxy requires a session here). */
export default function ResetPasswordPage() {
  return (
    <>
      <h1>Choose a new password</h1>
      <AuthForm
        action={resetPasswordAction}
        submitLabel="Save password"
        pendingLabel="Saving…"
        fields={[
          {
            name: 'password',
            label: 'New password',
            type: 'password',
            autoComplete: 'new-password',
            hint: 'At least 10 characters with upper- and lower-case letters and a digit.',
          },
          {
            name: 'confirm',
            label: 'Repeat new password',
            type: 'password',
            autoComplete: 'new-password',
          },
        ]}
      />
    </>
  );
}
