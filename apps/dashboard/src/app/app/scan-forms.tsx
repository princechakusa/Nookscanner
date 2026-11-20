'use client';

import { ARTEFACT_CHECKS, ARTEFACT_LABELS } from '@nookscanner/shared';
import { Button } from '@nookscanner/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { message } from '../../lib/messages.ts';
import type { FormState } from './org-actions.ts';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };

function Problem({ state }: { state: FormState }) {
  const text = message(state.formError);
  return text ? (
    <p className="ns-field__error" role="alert">
      {text}
    </p>
  ) : null;
}

/** Refreshes server data every few seconds while a job is running (status + progress). */
export function AutoRefresh({ active, seconds = 5 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}

export function SubmitScanForm({ action, sessionId }: { action: Action; sessionId: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-inline-form">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" loading={pending}>
        Create 3D apartment
      </Button>
      <Problem state={state} />
    </form>
  );
}

export function CancelJobForm({
  action,
  jobId,
  sessionId,
}: {
  action: Action;
  jobId: string;
  sessionId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-inline-form">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        Cancel processing
      </Button>
      <Problem state={state} />
    </form>
  );
}

export function ReviewForm({
  action,
  jobId,
  sessionId,
}: {
  action: Action;
  jobId: string;
  sessionId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const notesError = message(state.fieldErrors?.notes);
  return (
    <form action={formAction} className="ns-form" aria-labelledby="review-h">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <fieldset className="ns-fieldset">
        <legend className="ns-field__label">
          Look through the 3D apartment. Tick every problem you see.
        </legend>
        {ARTEFACT_CHECKS.map((k) => (
          <label key={k} className="ns-check">
            <input type="checkbox" name={k} /> {ARTEFACT_LABELS[k]}
          </label>
        ))}
      </fieldset>
      <div className="ns-field">
        <label className="ns-field__label" htmlFor="review-notes">
          Notes (required when the scan needs to be recorded again)
        </label>
        <textarea
          id="review-notes"
          name="notes"
          className="ns-input ns-textarea"
          rows={3}
          maxLength={2000}
          defaultValue={state.values?.notes ?? ''}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? 'review-notes-error' : undefined}
        />
        {notesError && (
          <p id="review-notes-error" className="ns-field__error">
            {notesError}
          </p>
        )}
      </div>
      <Problem state={state} />
      <div className="ns-inline-form">
        <Button type="submit" name="decision" value="approved" loading={pending}>
          Approve scene
        </Button>
        <Button
          type="submit"
          name="decision"
          value="rejected"
          variant="secondary"
          loading={pending}
        >
          Needs a new capture
        </Button>
      </div>
    </form>
  );
}
