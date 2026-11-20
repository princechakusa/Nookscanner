'use client';

import { DEFAULT_LAYOUT, type ApartmentLayout } from '@nookscanner/shared';
import { Button, SelectField, TextField } from '@nookscanner/ui';
import { useActionState } from 'react';
import { message } from '../../lib/messages.ts';
import type { FormState } from './org-actions.ts';

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
const initial: FormState = { status: 'idle' };

function Feedback({ state, savedText }: { state: FormState; savedText?: string }) {
  const text = message(state.formError);
  if (text)
    return (
      <p className="ns-field__error" role="alert">
        {text}
      </p>
    );
  if (state.status === 'done' && savedText)
    return (
      <p className="ns-notice" role="status">
        {savedText}
      </p>
    );
  return null;
}

export interface PropertyValues {
  id?: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  country_code: string | null;
  support_phone: string | null;
  support_email: string | null;
  support_whatsapp: string | null;
}

export function PropertyForm({
  action,
  values,
  submitLabel,
  readOnly = false,
}: {
  action: Action;
  values?: PropertyValues;
  submitLabel: string;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (k: string) => message(state.fieldErrors?.[k]);
  // After a failed submit, show what was typed (the form is reset to these defaults).
  const v = (k: string, saved: string | null | undefined) => state.values?.[k] ?? saved ?? '';
  return (
    <form action={formAction} className="ns-form" noValidate>
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset className="ns-fieldset ns-fieldset--plain" disabled={readOnly}>
        <TextField
          name="name"
          label="Property name"
          hint="For example the building name."
          required
          defaultValue={v('name', values?.name)}
          error={err('name')}
        />
        <TextField
          name="addressLine1"
          label="Address"
          autoComplete="street-address"
          defaultValue={v('addressLine1', values?.address_line1)}
          error={err('addressLine1')}
        />
        <div className="ns-form__row">
          <TextField
            name="city"
            label="City"
            autoComplete="address-level2"
            defaultValue={v('city', values?.city)}
            error={err('city')}
          />
          <TextField
            name="countryCode"
            label="Country code"
            hint="Two letters, for example AE."
            maxLength={2}
            autoComplete="country"
            defaultValue={v('countryCode', values?.country_code)}
            error={err('countryCode')}
          />
        </div>
        <div className="ns-form__row">
          <TextField
            name="supportPhone"
            type="tel"
            label="Guest support phone"
            defaultValue={v('supportPhone', values?.support_phone)}
            error={err('supportPhone')}
          />
          <TextField
            name="supportWhatsapp"
            type="tel"
            label="Guest support WhatsApp"
            hint="Digits only, with country code."
            defaultValue={v('supportWhatsapp', values?.support_whatsapp)}
            error={err('supportWhatsapp')}
          />
        </div>
        <TextField
          name="supportEmail"
          type="email"
          label="Guest support email"
          defaultValue={v('supportEmail', values?.support_email)}
          error={err('supportEmail')}
        />
      </fieldset>
      <Feedback state={state} savedText="Property saved." />
      {!readOnly && (
        <div>
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

export interface ApartmentValues {
  id?: string;
  property_id: string;
  name: string;
  unit_number: string | null;
  floor: string | null;
  layout: ApartmentLayout | null;
}

const COUNTS: ReadonlyArray<{
  key: 'bedrooms' | 'bathrooms' | 'balconies' | 'hallways';
  label: string;
  min: number;
  max: number;
  hint?: string;
}> = [
  { key: 'bedrooms', label: 'Bedrooms', min: 0, max: 10, hint: '0 for a studio.' },
  { key: 'bathrooms', label: 'Bathrooms', min: 1, max: 10 },
  { key: 'balconies', label: 'Balconies', min: 0, max: 5 },
  { key: 'hallways', label: 'Hallways', min: 0, max: 5 },
];
const EXTRAS: ReadonlyArray<{ key: 'dining' | 'laundry' | 'office' | 'storage'; label: string }> = [
  { key: 'dining', label: 'Separate dining area' },
  { key: 'laundry', label: 'Laundry room' },
  { key: 'office', label: 'Office or study' },
  { key: 'storage', label: 'Storage room' },
];

export function ApartmentForm({
  action,
  values,
  properties,
  submitLabel,
  readOnly = false,
}: {
  action: Action;
  values?: ApartmentValues;
  properties: ReadonlyArray<{ id: string; name: string }>;
  submitLabel: string;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const err = (k: string) => message(state.fieldErrors?.[k]);
  const layout = values?.layout ?? DEFAULT_LAYOUT;
  const sent = state.values;
  const v = (k: string, saved: string | null | undefined) => sent?.[k] ?? saved ?? '';
  return (
    <form action={formAction} className="ns-form" noValidate>
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset className="ns-fieldset ns-fieldset--plain" disabled={readOnly}>
        <SelectField
          name="propertyId"
          label="Property"
          defaultValue={v('propertyId', values?.property_id ?? properties[0]?.id)}
          options={properties.map((p) => ({ value: p.id, label: p.name }))}
          error={err('propertyId')}
        />
        <TextField
          name="name"
          label="Apartment name"
          hint="Shown to guests, for example 'Marina View 2BR'."
          required
          defaultValue={v('name', values?.name)}
          error={err('name')}
        />
        <div className="ns-form__row">
          <TextField
            name="unitNumber"
            label="Unit number"
            defaultValue={v('unitNumber', values?.unit_number)}
            error={err('unitNumber')}
          />
          <TextField
            name="floor"
            label="Floor"
            defaultValue={v('floor', values?.floor)}
            error={err('floor')}
          />
        </div>
      </fieldset>
      <fieldset className="ns-fieldset" disabled={readOnly}>
        <legend className="ns-field__label">Layout</legend>
        <p className="ns-muted">
          Used to plan the rooms and the capture walkthrough. You can change it later.
        </p>
        <div className="ns-form__row ns-form__row--4">
          {COUNTS.map((c) => (
            <TextField
              key={c.key}
              name={c.key}
              type="number"
              inputMode="numeric"
              label={c.label}
              hint={c.hint}
              min={c.min}
              max={c.max}
              step={1}
              defaultValue={v(c.key, String(layout[c.key]))}
              error={err(c.key)}
            />
          ))}
        </div>
        <SelectField
          name="kitchen"
          label="Kitchen"
          defaultValue={v('kitchen', layout.kitchen)}
          options={[
            { value: 'separate', label: 'Separate room' },
            { value: 'open', label: 'Open plan (part of the living room)' },
            { value: 'none', label: 'No kitchen' },
          ]}
          error={err('kitchen')}
        />
        {EXTRAS.map((x) => (
          <label key={x.key} className="ns-check">
            <input
              type="checkbox"
              name={x.key}
              defaultChecked={sent ? sent[x.key] === 'on' : layout[x.key]}
            />{' '}
            {x.label}
          </label>
        ))}
      </fieldset>
      <Feedback state={state} savedText="Apartment saved." />
      {!readOnly && (
        <div>
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Delete with an explicit confirmation checkbox (cascades to child records). */
export function DeleteForm({
  action,
  id,
  label,
  confirmText,
}: {
  action: Action;
  id: string;
  label: string;
  confirmText: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="ns-form" noValidate>
      <input type="hidden" name="id" value={id} />
      <label className="ns-check">
        <input type="checkbox" name="confirm" /> {confirmText}
      </label>
      <Feedback state={state} />
      <div>
        <Button type="submit" variant="danger" loading={pending}>
          {label}
        </Button>
      </div>
    </form>
  );
}
