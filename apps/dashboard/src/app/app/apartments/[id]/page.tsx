import {
  ROOM_TYPE_LABELS,
  missingPlannedRooms,
  parseLayout,
  roomsFromLayout,
  type RoomType,
} from '@nookscanner/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '../../../../lib/org-context.ts';
import { ApartmentStatus } from '../../apartment-status.tsx';
import { deleteApartmentAction, updateApartmentAction } from '../../property-actions.ts';
import { ApartmentForm, DeleteForm, type ApartmentValues } from '../../property-forms.tsx';
import {
  addRoomAction,
  deleteRoomAction,
  generateRoomsAction,
  moveRoomAction,
  updateRoomAction,
} from '../../room-actions.ts';
import { AddRoomForm, EditRoomForm, GenerateRoomsForm } from '../../room-forms.tsx';

export const metadata: Metadata = { title: 'Apartment' };

interface RoomRow {
  id: string;
  name_en: string;
  name_ar: string | null;
  room_type: RoomType;
  sort_order: number;
}

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
  const { data: roomRows } = await supabase
    .from('rooms')
    .select('id, name_en, name_ar, room_type, sort_order')
    .eq('apartment_id', row.id)
    .order('sort_order')
    .order('name_en');
  const rooms = (roomRows ?? []) as RoomRow[];
  const missing = missingPlannedRooms(
    planned,
    rooms.map((r) => r.name_en),
  );
  const canWriteRooms = can('room.write');

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
          Rooms
        </h2>
        {rooms.length === 0 ? (
          planned.length > 0 ? (
            <>
              <p className="ns-muted">Planned from the layout, in walking order:</p>
              <ol className="ns-room-list" aria-label="Planned rooms">
                {planned.map((r) => (
                  <li key={r.nameEn}>{r.nameEn}</li>
                ))}
              </ol>
              {canWriteRooms && (
                <GenerateRoomsForm
                  action={generateRoomsAction}
                  apartmentId={row.id}
                  label="Create these rooms"
                />
              )}
            </>
          ) : (
            <p className="ns-muted">Set the layout below to plan the rooms.</p>
          )
        ) : (
          <>
            <p className="ns-muted">
              The capture walkthrough follows this order. Guests see the names in their language.
            </p>
            <ol className="ns-rooms" aria-label="Rooms">
              {rooms.map((r, i) => (
                <li key={r.id} className="ns-rooms__item">
                  <div className="ns-rooms__row">
                    <span className="ns-rooms__name">
                      <span className="ns-rooms__en">{r.name_en}</span>
                      {r.name_ar && (
                        <span className="ns-muted" lang="ar" dir="rtl">
                          {' · '}
                          {r.name_ar}
                        </span>
                      )}
                    </span>
                    <span className="ns-muted">{ROOM_TYPE_LABELS[r.room_type]}</span>
                    {canWriteRooms && (
                      <span className="ns-rooms__actions">
                        <form action={moveRoomAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            type="submit"
                            className="ns-btn ns-btn--ghost ns-btn--sm"
                            disabled={i === 0}
                            aria-label={`Move ${r.name_en} up`}
                          >
                            Up
                          </button>
                        </form>
                        <form action={moveRoomAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            type="submit"
                            className="ns-btn ns-btn--ghost ns-btn--sm"
                            disabled={i === rooms.length - 1}
                            aria-label={`Move ${r.name_en} down`}
                          >
                            Down
                          </button>
                        </form>
                        <form action={deleteRoomAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="ns-btn ns-btn--ghost ns-btn--sm"
                            aria-label={`Delete ${r.name_en}`}
                          >
                            Delete
                          </button>
                        </form>
                      </span>
                    )}
                  </div>
                  {canWriteRooms && (
                    <details className="ns-rooms__edit">
                      <summary>Edit {r.name_en}</summary>
                      <EditRoomForm
                        action={updateRoomAction}
                        room={{
                          id: r.id,
                          nameEn: r.name_en,
                          nameAr: r.name_ar,
                          roomType: r.room_type,
                        }}
                      />
                    </details>
                  )}
                </li>
              ))}
            </ol>
            {canWriteRooms && missing.length > 0 && (
              <GenerateRoomsForm
                action={generateRoomsAction}
                apartmentId={row.id}
                label={`Add ${missing.length} missing room${missing.length === 1 ? '' : 's'} from the layout`}
              />
            )}
          </>
        )}
        {canWriteRooms && (
          <>
            <h3 className="ns-panel__subtitle">Add a room</h3>
            <AddRoomForm action={addRoomAction} apartmentId={row.id} />
          </>
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
