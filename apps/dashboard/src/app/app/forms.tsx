'use client';

import { Button, SelectField, TextField } from '@nookscanner/ui';
import { useActionState, useEffect, useState } from 'react';
import { message, ROLE_HINTS, ROLE_LABELS } from '../../lib/messages.ts';
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

export function CreateOrgForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form" noValidate>
      <TextField
        name="name"
        label="Organization name"
        hint="Usually your company name. You can change it later."
        autoComplete="organization"
        required
        error={message(state.fieldErrors?.name)}
      />
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Create organization
        </Button>
      </div>
    </form>
  );
}

export function InviteForm({
  action,
  properties,
}: {
  action: Action;
  properties: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [scope, setScope] = useState('organization');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = state.invitePath ? `${origin}${state.invitePath}` : '';

  return (
    <form action={formAction} className="ns-form" noValidate>
      <div className="ns-form__row">
        <TextField
          name="email"
          type="email"
          label="Email"
          autoComplete="off"
          required
          defaultValue={state.values?.email}
          error={message(state.fieldErrors?.email)}
        />
        <SelectField
          name="role"
          label="Role"
          defaultValue={state.values?.role || 'editor'}
          options={['admin', 'manager', 'editor', 'viewer'].map((r) => ({
            value: r,
            label: `${ROLE_LABELS[r]} - ${ROLE_HINTS[r]}`,
          }))}
          error={message(state.fieldErrors?.role)}
        />
      </div>
      <SelectField
        name="scope"
        label="Access"
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        options={[
          { value: 'organization', label: 'All properties' },
          ...(properties.length > 0
            ? [{ value: 'properties', label: 'Selected properties only' }]
            : []),
        ]}
        error={message(state.fieldErrors?.scope)}
      />
      {scope === 'properties' && (
        <fieldset className="ns-fieldset">
          <legend className="ns-field__label">Properties</legend>
          {properties.map((p) => (
            <label key={p.id} className="ns-check">
              <input type="checkbox" name="propertyIds" value={p.id} /> {p.name}
            </label>
          ))}
          {state.fieldErrors?.propertyIds && (
            <p className="ns-field__error">{message(state.fieldErrors.propertyIds)}</p>
          )}
        </fieldset>
      )}
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Create invitation
        </Button>
      </div>
      {link && (
        <div className="ns-notice" role="status">
          <p className="ns-notice__title">
            Invitation created. Copy this link now; it is shown only once.
          </p>
          <p className="ns-muted">
            Send it to the person you invited. It works only when they sign in with that email
            address, once, within 7 days.
          </p>
          <div className="ns-copy">
            <input
              className="ns-input"
              readOnly
              value={link}
              aria-label="Invitation link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export function MemberControls({
  userId,
  role,
  canSetOwner,
  changeRole,
  remove,
  isSelf,
  memberName,
}: {
  memberName: string;
  userId: string;
  role: string;
  canSetOwner: boolean;
  changeRole: Action;
  remove: Action;
  isSelf: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(changeRole, initial);
  const [removeState, removeAction, removePending] = useActionState(remove, initial);
  const roles = (canSetOwner ? ['owner'] : []).concat(['admin', 'manager', 'editor', 'viewer']);
  return (
    <div className="ns-member-controls">
      <form action={roleAction} className="ns-inline-form">
        <input type="hidden" name="userId" value={userId} />
        <label className="ns-visually-hidden" htmlFor={`role-${userId}`}>
          {`Role for ${memberName}`}
        </label>
        <select
          id={`role-${userId}`}
          name="role"
          className="ns-input"
          defaultValue={role}
          disabled={role === 'owner' && !canSetOwner}
        >
          {(roles.includes(role) ? roles : [role, ...roles]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={rolePending}
          aria-label={`Save role for ${memberName}`}
        >
          Save
        </Button>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="userId" value={userId} />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          loading={removePending}
          aria-label={isSelf ? 'Leave organization' : `Remove ${memberName}`}
        >
          {isSelf ? 'Leave' : 'Remove'}
        </Button>
      </form>
      <FormError state={roleState.formError ? roleState : removeState} />
    </div>
  );
}

export function AcceptInviteForm({ action, token }: { action: Action; token: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form">
      <input type="hidden" name="token" value={token} />
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Accept invitation
        </Button>
      </div>
    </form>
  );
}
