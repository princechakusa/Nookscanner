'use client';

import { Button } from '@nookscanner/ui';
import { useActionState } from 'react';
import { message } from '../../lib/messages.ts';
import type { FormState } from './org-actions.ts';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };

export function PublishForm({
  action,
  apartmentId,
  sceneId,
  label,
  disabled,
}: {
  action: Action;
  apartmentId: string;
  sceneId: string;
  label: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <input type="hidden" name="sceneId" value={sceneId} />
      {state.formError && (
        <p className="ns-field__error" role="alert">
          {message(state.formError)}
        </p>
      )}
      <Button type="submit" loading={pending} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}
