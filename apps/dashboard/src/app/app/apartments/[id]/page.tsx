import {
  ROOM_TYPE_LABELS,
  guestQrUrl,
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
import { guestBaseUrl } from '../../../../lib/qr-render.ts';
import { ApartmentStatus } from '../../apartment-status.tsx';
import { createQrAction, revokeQrAction } from '../../qr-actions.ts';
import { CopyField, CreateQrForm, RevokeQrForm } from '../../qr-forms.tsx';
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
import {
  addApplianceAction,
  deleteApplianceAction,
  updateApplianceAction,
} from '../../appliance-actions.ts';
import { AddApplianceForm, EditApplianceForm } from '../../appliance-forms.tsx';

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
  const canWriteAppliances = can('appliance.write');
  const [{ data: categoryRows }, { data: applianceRows }] = await Promise.all([
    supabase.from('appliance_categories').select('id, name_en').order('sort_order'),
    supabase
      .from('appliances')
      .select('id, room_id, category_id, name_en, name_ar, brand, model_number, notes')
      .eq('apartment_id', row.id)
      .order('name_en'),
  ]);
  const categories = ((categoryRows ?? []) as { id: string; name_en: string }[]).map((c) => ({
    value: c.id,
    label: c.name_en,
  }));
  const categoryName = new Map(categories.map((c) => [c.value, c.label]));
  // Verification status per appliance (8.4): latest version per language, pin in the newest scene.
  const [{ data: insRows }, { data: sceneRow }] = await Promise.all([
    supabase
      .from('instructions')
      .select('id, appliance_id, instruction_versions(locale, version, verification_status)')
      .eq('apartment_id', row.id),
    supabase
      .from('scene_versions')
      .select('id')
      .eq('apartment_id', row.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const { data: pinRows } = sceneRow
    ? await supabase
        .from('hotspots')
        .select('appliance_id, verification_status')
        .eq('scene_version_id', (sceneRow as { id: string }).id)
    : { data: [] };
  type Status = 'verified' | 'unverified' | 'missing';
  const textStatus = new Map<string, Record<'en' | 'ar', Status>>();
  for (const i of (insRows ?? []) as unknown as {
    appliance_id: string;
    instruction_versions: { locale: 'en' | 'ar'; version: number; verification_status: string }[];
  }[]) {
    const latest = (locale: 'en' | 'ar'): Status => {
      const v = i.instruction_versions
        .filter((x) => x.locale === locale)
        .sort((a, b) => b.version - a.version)[0];
      return v ? (v.verification_status === 'verified' ? 'verified' : 'unverified') : 'missing';
    };
    textStatus.set(i.appliance_id, { en: latest('en'), ar: latest('ar') });
  }
  const pinStatus = new Map<string, Status>(
    ((pinRows ?? []) as { appliance_id: string; verification_status: string }[]).map((p) => [
      p.appliance_id,
      p.verification_status === 'verified' ? 'verified' : 'unverified',
    ]),
  );
  const STATUS_TEXT: Record<Status, string> = {
    verified: 'verified',
    unverified: 'not verified',
    missing: 'missing',
  };
  const statusLine = (id: string) => {
    const t = textStatus.get(id) ?? { en: 'missing', ar: 'missing' };
    const pin = pinStatus.get(id) ?? 'missing';
    return `English ${STATUS_TEXT[t.en]} · Arabic ${STATUS_TEXT[t.ar]} · Pin ${STATUS_TEXT[pin]}`;
  };
  const roomOptions = rooms.map((r) => ({ value: r.id, label: r.name_en }));
  const appliances = (
    (applianceRows ?? []) as {
      id: string;
      room_id: string;
      category_id: string;
      name_en: string;
      name_ar: string | null;
      brand: string | null;
      model_number: string | null;
      notes: string | null;
    }[]
  ).map((a) => ({
    id: a.id,
    roomId: a.room_id,
    categoryId: a.category_id,
    nameEn: a.name_en,
    nameAr: a.name_ar,
    brand: a.brand,
    modelNumber: a.model_number,
    notes: a.notes,
  }));
  const canManageQr = can('qr.manage');
  const guestBase = guestBaseUrl();
  const { data: qrRows } = canManageQr
    ? await supabase
        .from('qr_codes')
        .select('id, token, label, status, created_at, revoked_at')
        .eq('apartment_id', row.id)
        .order('created_at', { ascending: false })
    : { data: [] };
  const qrCodes = (qrRows ?? []) as Array<{
    id: string;
    token: string;
    label: string | null;
    status: string;
    created_at: string;
    revoked_at: string | null;
  }>;
  const activeQr = qrCodes.filter((q) => q.status === 'active');
  const revokedQr = qrCodes.filter((q) => q.status !== 'active');
  const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);

  return (
    <div className="ns-page">
      <div className="ns-page__header">
        <h1 className="ns-page__title">{row.name}</h1>
        <ApartmentStatus status={row.status} />
      </div>
      {can('scan.create') && (
        <p>
          <Link
            className="ns-btn ns-btn--secondary ns-btn--md"
            href={`/app/apartments/${row.id}/upload`}
          >
            Upload a walkthrough video
          </Link>
        </p>
      )}
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

      <section className="ns-panel" aria-labelledby="appliances-h">
        <h2 id="appliances-h" className="ns-panel__title">
          Appliances
        </h2>
        {rooms.length === 0 ? (
          <p className="ns-muted">Create the rooms first; every appliance belongs to a room.</p>
        ) : (
          <>
            {appliances.length === 0 ? (
              <p className="ns-muted">
                No appliances yet. Add the ones guests ask about: air conditioners, TV, Wi-Fi,
                kitchen and laundry.
              </p>
            ) : (
              rooms
                .filter((r) => appliances.some((a) => a.roomId === r.id))
                .map((r) => (
                  <div key={r.id}>
                    <h3 className="ns-panel__subtitle">{r.name_en}</h3>
                    <ul className="ns-rooms" aria-label={`Appliances in ${r.name_en}`}>
                      {appliances
                        .filter((a) => a.roomId === r.id)
                        .map((a) => (
                          <li key={a.id} className="ns-rooms__item">
                            <div className="ns-rooms__row">
                              <span className="ns-rooms__name">
                                <span className="ns-rooms__en">{a.nameEn}</span>
                                {a.nameAr && (
                                  <span className="ns-muted" lang="ar" dir="rtl">
                                    {' · '}
                                    {a.nameAr}
                                  </span>
                                )}
                              </span>
                              <span className="ns-muted">
                                {[categoryName.get(a.categoryId), a.brand, a.modelNumber]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                              <span className="ns-rooms__actions">
                                <Link
                                  href={`/app/appliances/${a.id}`}
                                  className="ns-btn ns-btn--ghost ns-btn--sm"
                                  aria-label={`Instructions for ${a.nameEn}`}
                                >
                                  Instructions
                                </Link>
                              </span>
                              {canWriteAppliances && (
                                <span className="ns-rooms__actions">
                                  <form action={deleteApplianceAction}>
                                    <input type="hidden" name="id" value={a.id} />
                                    <button
                                      type="submit"
                                      className="ns-btn ns-btn--ghost ns-btn--sm"
                                      aria-label={`Delete ${a.nameEn}`}
                                    >
                                      Delete
                                    </button>
                                  </form>
                                </span>
                              )}
                            </div>
                            <p className="ns-muted" data-testid={`status-${a.nameEn}`}>
                              {statusLine(a.id)}
                            </p>
                            {canWriteAppliances && (
                              <details className="ns-rooms__edit">
                                <summary>Edit {a.nameEn}</summary>
                                <EditApplianceForm
                                  action={updateApplianceAction}
                                  appliance={a}
                                  rooms={roomOptions}
                                  categories={categories}
                                />
                              </details>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))
            )}
            {canWriteAppliances && (
              <>
                <h3 className="ns-panel__subtitle">Add an appliance</h3>
                <AddApplianceForm
                  action={addApplianceAction}
                  apartmentId={row.id}
                  rooms={roomOptions}
                  categories={categories}
                />
              </>
            )}
          </>
        )}
      </section>

      {canManageQr && (
        <section className="ns-panel" aria-labelledby="qr-h">
          <h2 id="qr-h" className="ns-panel__title">
            Guest QR codes
          </h2>
          <p className="ns-muted">
            Guests scan the code to open this apartment's guide. It shows content only after the
            apartment is published. Revoke a code if a sticker was removed or copied.
          </p>
          {!guestBase && (
            <p className="ns-field__error" role="alert">
              The guest app address is not configured (NEXT_PUBLIC_GUEST_URL), so QR codes cannot be
              shown.
            </p>
          )}
          {guestBase && activeQr.length > 0 && (
            <ul className="ns-qr-list" aria-label="Active QR codes">
              {activeQr.map((q) => {
                const name = q.label ?? `QR code from ${day(q.created_at)}`;
                const src = `/app/apartments/${row.id}/qr/${q.id}`;
                return (
                  <li key={q.id} className="ns-qr">
                    <img
                      className="ns-qr__img"
                      src={`${src}?format=svg`}
                      alt={`QR code: ${name}`}
                      width={160}
                      height={160}
                    />
                    <div className="ns-qr__body">
                      <p className="ns-qr__name">{name}</p>
                      <p className="ns-muted">Created {day(q.created_at)}</p>
                      <CopyField
                        value={guestQrUrl(guestBase, q.token)}
                        label={`Guest link for ${name}`}
                      />
                      <p className="ns-qr__downloads">
                        <a href={`${src}?format=svg&download=1`} download>
                          Download SVG
                        </a>
                        <a href={`${src}?format=png&download=1`} download>
                          Download PNG
                        </a>
                      </p>
                      <RevokeQrForm
                        action={revokeQrAction}
                        id={q.id}
                        apartmentId={row.id}
                        name={name}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {activeQr.length === 0 && <p>No active QR code yet.</p>}
          <CreateQrForm action={createQrAction} apartmentId={row.id} />
          {revokedQr.length > 0 && (
            <details className="ns-qr-revoked">
              <summary>Revoked QR codes ({revokedQr.length})</summary>
              <ul>
                {revokedQr.map((q) => (
                  <li key={q.id}>
                    {q.label ?? `QR code from ${day(q.created_at)}`}: revoked{' '}
                    {q.revoked_at ? day(q.revoked_at) : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

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
