import { layoutSummary, parseLayout } from '@nookscanner/shared';
import { DataTable, EmptyState } from '@nookscanner/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { ApartmentStatus } from '../../apartment-status.tsx';
import { deletePropertyAction, updatePropertyAction } from '../../property-actions.ts';
import { DeleteForm, PropertyForm, type PropertyValues } from '../../property-forms.tsx';

export const metadata: Metadata = { title: 'Property' };

interface ApartmentRow {
  id: string;
  name: string;
  unit_number: string | null;
  status: string;
  layout: unknown;
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase, can } = await getOrgContext();

  // RLS: a property outside this person's access is simply not returned (404, no oracle).
  const { data: property } = await supabase
    .from('properties')
    .select(
      'id, name, address_line1, city, country_code, support_phone, support_email, support_whatsapp',
    )
    .eq('id', id.data)
    .maybeSingle();
  if (!property) notFound();
  const p = property as PropertyValues & { id: string };

  const { data: apartmentRows } = await supabase
    .from('apartments')
    .select('id, name, unit_number, status, layout')
    .eq('property_id', p.id)
    .order('name');
  const apartments = (apartmentRows ?? []) as ApartmentRow[];

  return (
    <div className="ns-page">
      <div className="ns-page__header">
        <h1 className="ns-page__title">{p.name}</h1>
        {can('apartment.create') && (
          <Link
            className="ns-btn ns-btn--primary ns-btn--md"
            href={`/app/apartments/new?property=${p.id}`}
          >
            Add apartment
          </Link>
        )}
      </div>

      <section className="ns-panel" aria-labelledby="apts-h">
        <h2 id="apts-h" className="ns-panel__title">
          Apartments
        </h2>
        <DataTable
          caption="Apartments in this property"
          rowKey={(a) => a.id}
          rows={apartments}
          empty={<EmptyState title="No apartments in this property yet" />}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (a) => <Link href={`/app/apartments/${a.id}`}>{a.name}</Link>,
            },
            { key: 'unit', header: 'Unit', render: (a) => a.unit_number ?? '-' },
            {
              key: 'layout',
              header: 'Layout',
              render: (a) => layoutSummary(parseLayout(a.layout)),
            },
            {
              key: 'status',
              header: 'Status',
              render: (a) => <ApartmentStatus status={a.status} />,
            },
          ]}
        />
      </section>

      <section className="ns-panel" aria-labelledby="details-h">
        <h2 id="details-h" className="ns-panel__title">
          Details
        </h2>
        <PropertyForm
          action={updatePropertyAction}
          values={p}
          submitLabel="Save property"
          readOnly={!can('property.update')}
        />
      </section>

      {can('property.delete') && (
        <section className="ns-panel" aria-labelledby="delete-h">
          <h2 id="delete-h" className="ns-panel__title">
            Delete property
          </h2>
          <p className="ns-muted">
            Deletes the property and all {apartments.length} apartment
            {apartments.length === 1 ? '' : 's'} in it, including their rooms, scans and QR codes.
            This cannot be undone.
          </p>
          <DeleteForm
            action={deletePropertyAction}
            id={p.id}
            label="Delete property"
            confirmText="I understand that this deletes the property and its apartments"
          />
        </section>
      )}
    </div>
  );
}
