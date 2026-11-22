import {
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  guestQrUrl,
  missingPlannedRooms,
  parseLayout,
  roomsFromLayout,
  type RoomType,
} from '@nookscanner/shared';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';
import type { ApartmentItem } from './Apartments.tsx';

const GUEST_BASE = process.env.EXPO_PUBLIC_GUEST_URL ?? 'https://nookscanner-guest.pages.dev';
const SCAN_LABEL: Record<string, string> = {
  draft: 'Draft',
  recording: 'Recording',
  uploading: 'Uploading',
  uploaded: 'Ready to process',
  submitted: 'Queued for 3D',
  processing: 'Creating 3D',
  succeeded: '3D ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

interface Room {
  id: string;
  organization_id: string;
  apartment_id: string;
  name_en: string;
  name_ar: string | null;
  room_type: RoomType;
  sort_order: number;
}
interface Scan {
  id: string;
  status: string;
  created_at: string;
}

/** One apartment: record, rooms (add, rename, reorder, delete, top up), walkthroughs, guest QR. */
export function ApartmentDetail({
  apartment,
  onBack,
  onRecord,
  onOpenScan,
}: {
  apartment: ApartmentItem;
  onBack: () => void;
  onRecord: (a: ApartmentItem) => void;
  onOpenScan: (scanId: string, apartmentName: string) => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [layout, setLayout] = useState<ReturnType<typeof parseLayout>>(null);
  const [qr, setQr] = useState<{ url: string; svg: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [newType, setNewType] = useState<RoomType>('bedroom');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const [r, s, a, q] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, organization_id, apartment_id, name_en, name_ar, room_type, sort_order')
        .eq('apartment_id', apartment.id)
        .order('sort_order')
        .order('name_en'),
      supabase
        .from('scan_sessions')
        .select('id, status, created_at')
        .eq('apartment_id', apartment.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('apartments').select('layout').eq('id', apartment.id).maybeSingle(),
      supabase
        .from('qr_codes')
        .select('token')
        .eq('apartment_id', apartment.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    if (r.error) setError('Could not load the rooms. Pull down to try again.');
    setRooms((r.data ?? []) as Room[]);
    setScans((s.data ?? []) as Scan[]);
    setLayout(parseLayout((a.data as { layout: unknown } | null)?.layout));
    const token = (q.data?.[0] as { token: string } | undefined)?.token;
    setQr(token ? await qrFor(token) : null);
  }, [apartment.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function qrFor(token: string) {
    const url = guestQrUrl(GUEST_BASE, token);
    const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    return { url, svg };
  }

  /** Renumbers the whole list (10, 20, ...) in one upsert, like the dashboard. */
  async function saveOrder(next: Room[]) {
    setRooms(next);
    const { error: e } = await supabase.from('rooms').upsert(
      next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 })),
      { onConflict: 'id' },
    );
    if (e) setError('Could not save the order (you may not have permission).');
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...rooms];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    void saveOrder(next);
  };

  async function rename(room: Room) {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === room.name_en) return;
    const { error: e } = await supabase.from('rooms').update({ name_en: name }).eq('id', room.id);
    if (e)
      setError(
        e.code === '23505'
          ? 'This apartment already has a room with this name.'
          : 'Could not rename the room.',
      );
    void load();
  }

  function remove(room: Room) {
    Alert.alert(`Delete ${room.name_en}?`, 'Its appliances are deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void supabase
            .from('rooms')
            .delete()
            .eq('id', room.id)
            .then(({ error: e }) => {
              if (e) setError('Could not delete the room.');
              void load();
            }),
      },
    ]);
  }

  async function addRoom() {
    const name = newRoom.trim();
    if (!name) return;
    const max = rooms.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error: e } = await supabase.from('rooms').insert({
      apartment_id: apartment.id,
      name_en: name,
      room_type: newType,
      sort_order: max + 10,
    });
    if (e)
      return setError(
        e.code === '23505'
          ? 'This apartment already has a room with this name.'
          : 'Could not add the room.',
      );
    setNewRoom('');
    void load();
  }

  const missing = layout
    ? missingPlannedRooms(
        roomsFromLayout(layout),
        rooms.map((r) => r.name_en),
      )
    : [];
  async function addMissing() {
    const max = rooms.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error: e } = await supabase.from('rooms').insert(
      missing.map((r, i) => ({
        apartment_id: apartment.id,
        name_en: r.nameEn,
        name_ar: r.nameAr,
        room_type: r.roomType,
        sort_order: max + (i + 1) * 10,
      })),
    );
    if (e) setError('Could not add the rooms.');
    void load();
  }

  async function createQr() {
    const { data, error: e } = await supabase
      .rpc('create_qr_code', { p_apartment: apartment.id, p_label: 'Front door' })
      .single();
    if (e || !data) return setError('Only managers can create guest QR codes.');
    setQr(await qrFor((data as { token: string }).token));
  }

  const where = [apartment.property, apartment.unit ? `Unit ${apartment.unit}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { flexGrow: 1, paddingBottom: 40 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        hitSlop={10}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>‹ Apartments</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        {apartment.name}
      </Text>
      {where ? <Text style={styles.muted}>{where}</Text> : null}
      <Button
        label={rooms.length ? 'Record a walkthrough' : 'Add rooms first'}
        onPress={() => onRecord({ ...apartment, roomCount: rooms.length })}
        disabled={rooms.length === 0}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Section title={`Rooms (${rooms.length})`} />
      {rooms.map((r, i) => (
        <View key={r.id} style={[styles.card, { gap: 8 }]}>
          {editing === r.id ? (
            <TextInput
              style={styles.input}
              accessibilityLabel={`New name for ${r.name_en}`}
              value={draft}
              autoFocus
              onChangeText={setDraft}
              onSubmitEditing={() => void rename(r)}
              onBlur={() => void rename(r)}
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontWeight: '600' }]}>{r.name_en}</Text>
                <Text style={styles.muted}>{ROOM_TYPE_LABELS[r.room_type]}</Text>
              </View>
              <Small
                label="↑"
                a11y={`Move ${r.name_en} up`}
                disabled={i === 0}
                onPress={() => move(i, -1)}
              />
              <Small
                label="↓"
                a11y={`Move ${r.name_en} down`}
                disabled={i === rooms.length - 1}
                onPress={() => move(i, 1)}
              />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Link
              label="Rename"
              a11y={`Rename ${r.name_en}`}
              onPress={() => (setEditing(r.id), setDraft(r.name_en))}
            />
            <Link label="Delete" a11y={`Delete ${r.name_en}`} danger onPress={() => remove(r)} />
          </View>
        </View>
      ))}
      {missing.length > 0 ? (
        <Button
          label={`Add ${missing.length} room${missing.length === 1 ? '' : 's'} from the layout`}
          variant="secondary"
          onPress={() => void addMissing()}
        />
      ) : null}
      <View style={[styles.card, { gap: 8 }]}>
        <Text style={styles.label}>Add a room</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Room name"
          placeholder="Guest bedroom"
          value={newRoom}
          onChangeText={setNewRoom}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {ROOM_TYPES.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ selected: newType === t }}
              onPress={() => setNewType(t)}
              style={{
                paddingHorizontal: 12,
                minHeight: 40,
                justifyContent: 'center',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: newType === t ? colors.primary : colors.border,
                backgroundColor: newType === t ? colors.primarySoft : colors.surface,
              }}
            >
              <Text style={{ color: newType === t ? colors.primary : colors.ink }}>
                {ROOM_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Button
          label="Add room"
          variant="secondary"
          onPress={() => void addRoom()}
          disabled={!newRoom.trim()}
        />
      </View>

      <Section title="Walkthroughs" />
      {scans.length === 0 ? (
        <Text style={styles.muted}>No walkthroughs yet.</Text>
      ) : (
        scans.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => onOpenScan(s.id, apartment.name)}
            style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}
          >
            <Text style={[styles.text, { flex: 1 }]}>
              {new Date(s.created_at).toLocaleString()}
            </Text>
            <Text
              style={{
                color: s.status === 'failed' ? colors.danger : colors.primary,
                fontWeight: '700',
              }}
            >
              {SCAN_LABEL[s.status] ?? s.status} ›
            </Text>
          </Pressable>
        ))
      )}

      <Section title="Guest QR code" />
      {qr ? (
        <View style={[styles.card, { alignItems: 'center', gap: 10 }]}>
          <View
            accessible
            accessibilityLabel="Guest QR code"
            style={{ backgroundColor: '#fff', padding: 8 }}
          >
            <SvgXml xml={qr.svg} width={220} height={220} />
          </View>
          <Text style={[styles.muted, { textAlign: 'center' }]} selectable>
            {qr.url}
          </Text>
          <Button
            label="Share guest link"
            variant="secondary"
            onPress={() =>
              void Share.share({ message: `Your apartment guide for ${apartment.name}: ${qr.url}` })
            }
          />
          <Text style={styles.muted}>
            Guests see the apartment once it is published in the dashboard.
          </Text>
        </View>
      ) : (
        <Button label="Create guest QR code" variant="secondary" onPress={() => void createQr()} />
      )}
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 8 }]}>
      {title}
    </Text>
  );
}
function Small({
  label,
  a11y,
  disabled,
  onPress,
}: {
  label: string;
  a11y: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Text style={{ fontSize: 20, color: colors.primary }}>{label}</Text>
    </Pressable>
  );
}
function Link({
  label,
  a11y,
  danger,
  onPress,
}: {
  label: string;
  a11y: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      hitSlop={8}
      style={{ minHeight: 36, justifyContent: 'center' }}
    >
      <Text style={{ color: danger ? colors.danger : colors.primary, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}
