'use client';

import { useActionState } from 'react';
import { authMessage } from '../../lib/auth-messages.ts';
import type { AuthFormState } from './actions.ts';

export interface FieldSpec {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  hint?: string;
}

interface Props {
  action: (prev: AuthFormState, form: FormData) => Promise<AuthFormState>;
  fields: FieldSpec[];
  submitLabel: string;
  pendingLabel: string;
  /** Shown instead of the form after a successful "email sent" action. */
  sentMessage?: string;
  hidden?: Record<string, string>;
}

const initial: AuthFormState = { status: 'idle' };

export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  sentMessage,
  hidden,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initial);

  if (state.status === 'sent' && sentMessage) {
    return (
      <p className="nt-notice" role="status">
        {sentMessage}
      </p>
    );
  }

  const formError = authMessage(state.formError);
  return (
    <form action={formAction} className="nt-form" noValidate>
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {fields.map((f) => {
        const error = authMessage(state.fieldErrors?.[f.name]);
        const describedBy = [f.hint ? `${f.name}-hint` : '', error ? `${f.name}-error` : '']
          .filter(Boolean)
          .join(' ');
        return (
          <div className="nt-field" key={f.name}>
            <label htmlFor={f.name}>{f.label}</label>
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
            />
            {f.hint && (
              <p id={`${f.name}-hint`} className="nt-hint">
                {f.hint}
              </p>
            )}
            {error && (
              <p id={`${f.name}-error`} className="nt-field-error">
                {error}
              </p>
            )}
          </div>
        );
      })}
      {formError && (
        <p className="nt-form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="nt-button" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
