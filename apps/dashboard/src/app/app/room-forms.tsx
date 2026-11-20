'use client';

import { ROOM_TYPES, ROOM_TYPE_LABELS } from '@nookscanner/shared';
import { Button, SelectField, TextField } from '@nookscanner/ui';
import { useActionState } from 'react';
import { message } from '../../lib/messages.ts';
import type { FormState } from './org-actions.ts';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };
const TYPE_OPTIONS = ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] }));

function FormError({ state }: { state: FormState }) {
  const text = message(state.formError);
  return text ? (
    <p className="ns-field__error" role="alert">
      {text}
    </p>
  ) : null;
}

export function GenerateRoomsForm({
  action,
  apartmentId,
  label,
}: {
  action: Action;
  apartmentId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <FormError state={state} />
      <Button type="submit" variant="secondary" loading={pending}>
        {label}
      </Button>
    </form>
  );
}

function RoomFields({
  state,
  values,
  idPrefix,
}: {
  state: FormState;
  values?: { nameEn: string; nameAr: string | null; roomType: string };
  idPrefix: string;
}) {
  const v = (k: 'nameEn' | 'nameAr' | 'roomType', saved?: string | null) =>
    state.values?.[k] ?? saved ?? '';
  const err = (k: string) => message(state.fieldErrors?.[k]);
  return (
    <div className="ns-form__row ns-form__row--3">
      <TextField
        id={`${idPrefix}-en`}
        name="nameEn"
        label="Name (English)"
        required
        maxLength={80}
        defaultValue={v('nameEn', values?.nameEn)}
        error={err('nameEn')}
      />
      <TextField
        id={`${idPrefix}-ar`}
        name="nameAr"
        label="Name (Arabic)"
        dir="rtl"
        lang="ar"
        maxLength={80}
        defaultValue={v('nameAr', values?.nameAr)}
        error={err('nameAr')}
      />
      <SelectField
        id={`${idPrefix}-type`}
        name="roomType"
        label="Type"
        defaultValue={v('roomType', values?.roomType) || 'other'}
        options={TYPE_OPTIONS}
        error={err('roomType')}
      />
    </div>
  );
}

export function AddRoomForm({ action, apartmentId }: { action: Action; apartmentId: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form ns-form--wide" noValidate>
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <RoomFields state={state} idPrefix="new-room" />
      <FormError state={state} />
      <div>
        <Button type="submit" loading={pending}>
          Add room
        </Button>
      </div>
    </form>
  );
}

export function EditRoomForm({
  action,
  room,
}: {
  action: Action;
  room: { id: string; nameEn: string; nameAr: string | null; roomType: string };
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form ns-form--wide" noValidate>
      <input type="hidden" name="id" value={room.id} />
      <RoomFields state={state} values={room} idPrefix={`room-${room.id}`} />
      <FormError state={state} />
      {state.status === 'done' && (
        <p className="ns-notice" role="status">
          Room saved.
        </p>
      )}
      <div>
        <Button type="submit" size="sm" loading={pending} aria-label={`Save ${room.nameEn}`}>
          Save
        </Button>
      </div>
    </form>
  );
}
