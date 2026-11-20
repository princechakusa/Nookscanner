'use client';

import { Button, TextField } from '@nookscanner/ui';
import { useActionState } from 'react';
import { message } from '../../lib/messages.ts';
import type { FormState } from './org-actions.ts';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };

function FormError({ state }: { state: FormState }) {
  const text = message(state.formError);
  return text ? (
    <p className="ns-field__error" role="alert">
      {text}
    </p>
  ) : null;
}

export function CreateQrForm({ action, apartmentId }: { action: Action; apartmentId: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form" noValidate>
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <TextField
        name="label"
        label="QR code label"
        hint="Optional, for your team only, for example 'Front door sticker'."
        maxLength={80}
        defaultValue={state.values?.label}
        error={message(state.fieldErrors?.label)}
      />
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Create QR code
        </Button>
      </div>
    </form>
  );
}

export function RevokeQrForm({
  action,
  id,
  apartmentId,
  name,
}: {
  action: Action;
  id: string;
  apartmentId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <label className="ns-check">
        <input type="checkbox" name="confirm" /> {`Printed copies of ${name} will stop working`}
      </label>
      <FormError state={state} />
      <div>
        <Button type="submit" size="sm" variant="danger" loading={pending}>
          {`Revoke ${name}`}
        </Button>
      </div>
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <input
      className="ns-input"
      readOnly
      value={value}
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}
