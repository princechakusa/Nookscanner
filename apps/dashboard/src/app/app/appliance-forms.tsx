'use client';

import { Button, SelectField, TextField } from '@nookscanner/ui';
import { useActionState } from 'react';
import { message } from '../../lib/messages.ts';
import type { FormState } from './org-actions.ts';

/** Stage 8.1 appliance forms (same pattern as room-forms.tsx). */
type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };

export interface Option {
  value: string;
  label: string;
}
export interface ApplianceValues {
  id: string;
  roomId: string;
  categoryId: string;
  nameEn: string;
  nameAr: string | null;
  brand: string | null;
  modelNumber: string | null;
  notes: string | null;
}
type Key = Exclude<keyof ApplianceValues, 'id'>;

function FormError({ state }: { state: FormState }) {
  const text = message(state.formError);
  return text ? (
    <p className="ns-field__error" role="alert">
      {text}
    </p>
  ) : null;
}

function ApplianceFields({
  state,
  values,
  idPrefix,
  rooms,
  categories,
}: {
  state: FormState;
  values?: ApplianceValues;
  idPrefix: string;
  rooms: Option[];
  categories: Option[];
}) {
  const v = (k: Key) => state.values?.[k] ?? values?.[k] ?? '';
  const err = (k: string) => message(state.fieldErrors?.[k]);
  return (
    <>
      <div className="ns-form__row ns-form__row--3">
        <SelectField
          id={`${idPrefix}-room`}
          name="roomId"
          label="Room"
          defaultValue={v('roomId') || rooms[0]?.value || ''}
          options={rooms}
          error={err('roomId')}
        />
        <SelectField
          id={`${idPrefix}-cat`}
          name="categoryId"
          label="Kind of appliance"
          defaultValue={v('categoryId') || categories[0]?.value || ''}
          options={categories}
          error={err('categoryId')}
        />
        <TextField
          id={`${idPrefix}-en`}
          name="nameEn"
          label="Name (English)"
          required
          maxLength={80}
          placeholder="Living room AC"
          defaultValue={v('nameEn')}
          error={err('nameEn')}
        />
      </div>
      <div className="ns-form__row ns-form__row--3">
        <TextField
          id={`${idPrefix}-ar`}
          name="nameAr"
          label="Name (Arabic)"
          dir="rtl"
          lang="ar"
          maxLength={80}
          defaultValue={v('nameAr')}
          error={err('nameAr')}
        />
        <TextField
          id={`${idPrefix}-brand`}
          name="brand"
          label="Brand"
          maxLength={60}
          defaultValue={v('brand')}
          error={err('brand')}
        />
        <TextField
          id={`${idPrefix}-model`}
          name="modelNumber"
          label="Model number"
          maxLength={60}
          defaultValue={v('modelNumber')}
          error={err('modelNumber')}
        />
      </div>
      <TextField
        id={`${idPrefix}-notes`}
        name="notes"
        label="Notes for your team (not shown to guests)"
        maxLength={2000}
        defaultValue={v('notes')}
        error={err('notes')}
      />
    </>
  );
}

export function AddApplianceForm({
  action,
  apartmentId,
  rooms,
  categories,
}: {
  action: Action;
  apartmentId: string;
  rooms: Option[];
  categories: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form
      action={formAction}
      className="ns-form ns-form--wide"
      noValidate
      aria-label="Add appliance"
    >
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <ApplianceFields
        state={state}
        idPrefix="new-appliance"
        rooms={rooms}
        categories={categories}
      />
      <FormError state={state} />
      {state.status === 'done' && (
        <p className="ns-notice" role="status">
          Appliance added.
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          Add appliance
        </Button>
      </div>
    </form>
  );
}

export function EditApplianceForm({
  action,
  appliance,
  rooms,
  categories,
}: {
  action: Action;
  appliance: ApplianceValues;
  rooms: Option[];
  categories: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form ns-form--wide" noValidate>
      <input type="hidden" name="id" value={appliance.id} />
      <ApplianceFields
        state={state}
        values={appliance}
        idPrefix={`appliance-${appliance.id}`}
        rooms={rooms}
        categories={categories}
      />
      <FormError state={state} />
      {state.status === 'done' && (
        <p className="ns-notice" role="status">
          Appliance saved.
        </p>
      )}
      <div>
        <Button type="submit" size="sm" loading={pending} aria-label={`Save ${appliance.nameEn}`}>
          Save
        </Button>
      </div>
    </form>
  );
}
