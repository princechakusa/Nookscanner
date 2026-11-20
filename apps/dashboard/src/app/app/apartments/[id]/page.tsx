import { parseLayout, roomsFromLayout } from '@nookscanner/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { ApartmentStatus } from '../../apartment-status.tsx';
import { deleteApartmentAction, updateApartmentAction } from '../../property-actions.ts';
import { ApartmentForm, DeleteForm, type ApartmentValues } from '../../property-forms.tsx';

export const metadata: Metadata = { title: 'Apartment' };

export default async function ApartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase, activeOrg, can } = await getOrgContext();

  // RLS: apartments outside this person's access are not returned (404).
  const { data } = await supabase
    .from('apartments')
    .select('id, property_id, name, unit_number, floor, status, layout, properties(id, name)')
    .eq('id', id.data)
    .maybeSingle();
  if (!data) notFound();
  const row = data as unknown as Omit<ApartmentValues, 'layout'> & {
    id: string;
    status: string;
    layout: unknown;
    properties: { id: string; name: string } | null;
  };
  const layout = parseLayout(row.layout);
  const values: ApartmentValues = { ...row, layout };

  const { data: propertyRows } = await supabase
    .from('properties')
    .select('id, name')
    .eq('organization_id', activeOrg?.id ?? '')
    .order('name');
  const properties = (propertyRows ?? []) as Array<{ id: string; name: string }>;
  const planned = layout ? roomsFromLayout(layout) : [];

  return (
    <div className="ns-page">
      <div className="ns-page__header">
        <h1 className="ns-page__title">{row.name}</h1>
        <ApartmentStatus status={row.status} />
      </div>
      {row.properties && (
        <p className="ns-muted">
          In <Link href={`/app/properties/${row.properties.id}`}>{row.properties.name}</Link>
        </p>
      )}

      <section className="ns-panel" aria-labelledby="rooms-h">
        <h2 id="rooms-h" className="ns-panel__title">
          Planned rooms
        </h2>
        {planned.length > 0 ? (
          <ol className="ns-room-list" aria-label="Planned rooms">
            {planned.map((r) => (
              <li key={r.nameEn}>{r.nameEn}</li>
            ))}
          </ol>
        ) : (
          <p className="ns-muted">Set the layout below to plan the rooms.</p>
        )}
      </section>

      <section className="ns-panel" aria-labelledby="details-h">
        <h2 id="details-h" className="ns-panel__title">
          Details and layout
        </h2>
        <ApartmentForm
          action={updateApartmentAction}
          values={values}
          properties={properties}
          submitLabel="Save apartment"
          readOnly={!can('apartment.update')}
        />
      </section>

      {can('apartment.delete') && (
        <section className="ns-panel" aria-labelledby="delete-h">
          <h2 id="delete-h" className="ns-panel__title">
            Delete apartment
          </h2>
          <p className="ns-muted">
            Deletes the apartment with its rooms, scans and QR codes. Guests with its QR code will
            no longer reach it. This cannot be undone.
          </p>
          <DeleteForm
            action={deleteApartmentAction}
            id={row.id}
            label="Delete apartment"
            confirmText="I understand that this deletes the apartment"
          />
        </section>
      )}
    </div>
  );
}
