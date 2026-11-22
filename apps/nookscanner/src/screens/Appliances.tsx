import { applianceSchema } from '@nookscanner/shared';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';

interface Room {
  id: string;
  name_en: string;
}
interface Category {
  id: string;
  name_en: string;
}
export interface ApplianceRow {
  id: string;
  room_id: string;
  category_id: string;
  name_en: string;
  name_ar: string | null;
  brand: string | null;
  model_number: string | null;
}

/** Appliances of one apartment, grouped by room: add, edit, delete; tap for instructions. */
export function Appliances({
  apartmentId,
  onOpen,
}: {
  apartmentId: string;
  onOpen: (a: ApplianceRow) => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ApplianceRow[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{
    id?: string;
    roomId: string;
    categoryId: string;
    nameEn: string;
    nameAr: string;
    brand: string;
    model: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [r, c, a, ins] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, name_en')
        .eq('apartment_id', apartmentId)
        .order('sort_order'),
      supabase.from('appliance_categories').select('id, name_en').order('sort_order'),
      supabase
        .from('appliances')
        .select('id, room_id, category_id, name_en, name_ar, brand, model_number')
        .eq('apartment_id', apartmentId)
        .order('name_en'),
      supabase
        .from('instructions')
        .select('appliance_id, instruction_versions(locale, version, verification_status)')
        .eq('apartment_id', apartmentId),
    ]);
    setRooms((r.data ?? []) as Room[]);
    setCategories((c.data ?? []) as Category[]);
    setItems((a.data ?? []) as ApplianceRow[]);
    const st: Record<string, string> = {};
    for (const i of (ins.data ?? []) as unknown as {
      appliance_id: string;
      instruction_versions: { locale: string; version: number; verification_status: string }[];
    }[]) {
      const en = i.instruction_versions
        .filter((v) => v.locale === 'en')
        .sort((x, y) => y.version - x.version)[0];
      st[i.appliance_id] = en
        ? en.verification_status === 'verified'
          ? 'Instructions verified'
          : 'Instructions not verified'
        : 'No instructions';
    }
    setStatus(st);
  }, [apartmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form) return;
    const parsed = applianceSchema.safeParse({
      roomId: form.roomId,
      categoryId: form.categoryId,
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      brand: form.brand,
      modelNumber: form.model,
      notes: '',
    });
    if (!parsed.success) return setError('Choose a room and a kind, and enter a name.');
    const d = parsed.data;
    const row = {
      room_id: d.roomId,
      category_id: d.categoryId,
      name_en: d.nameEn,
      name_ar: d.nameAr,
      brand: d.brand,
      model_number: d.modelNumber,
    };
    const { error: e } = form.id
      ? await supabase.from('appliances').update(row).eq('id', form.id)
      : await supabase.from('appliances').insert({ apartment_id: apartmentId, ...row });
    if (e) return setError('Could not save the appliance (editors and managers only).');
    setForm(null);
    setError('');
    void load();
  }

  function remove(a: ApplianceRow) {
    Alert.alert(`Delete ${a.name_en}?`, 'Its instructions and pin are deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void supabase
            .from('appliances')
            .delete()
            .eq('id', a.id)
            .then(() => load()),
      },
    ]);
  }

  const startNew = () =>
    setForm({
      roomId: rooms[0]?.id ?? '',
      categoryId: categories[0]?.id ?? '',
      nameEn: '',
      nameAr: '',
      brand: '',
      model: '',
    });

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        styles.pushed,
        { flexGrow: 1, paddingBottom: 40 },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => (setRefreshing(true), void load().finally(() => setRefreshing(false)))}
        />
      }
    >
      <Text style={styles.muted}>
        Add what guests ask about: air conditioners, TV, Wi-Fi, kitchen and laundry. Pin them in 3D
        in the dashboard.
      </Text>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {form ? (
        <View style={[styles.card, { gap: 8 }]}>
          <Text style={[styles.text, { fontWeight: '700' }]}>
            {form.id ? 'Edit appliance' : 'New appliance'}
          </Text>
          <Text style={styles.label}>Room</Text>
          <Chips
            items={rooms.map((r) => ({ id: r.id, label: r.name_en }))}
            value={form.roomId}
            onChange={(v) => setForm({ ...form, roomId: v })}
          />
          <Text style={styles.label}>Kind</Text>
          <Chips
            items={categories.map((c) => ({ id: c.id, label: c.name_en }))}
            value={form.categoryId}
            onChange={(v) => setForm({ ...form, categoryId: v })}
          />
          <Field
            label="Name (English)"
            placeholder="Living room AC"
            value={form.nameEn}
            onChange={(v) => setForm({ ...form, nameEn: v })}
          />
          <Field
            label="Name (Arabic)"
            placeholder="مكيف غرفة المعيشة"
            value={form.nameAr}
            onChange={(v) => setForm({ ...form, nameAr: v })}
            rtl
          />
          <Field
            label="Brand"
            placeholder="Daikin"
            value={form.brand}
            onChange={(v) => setForm({ ...form, brand: v })}
          />
          <Field
            label="Model number"
            placeholder="FTXM35R"
            value={form.model}
            onChange={(v) => setForm({ ...form, model: v })}
          />
          <Button
            label="Save appliance"
            onPress={() => void save()}
            disabled={!form.nameEn.trim() || !form.roomId}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setForm(null)} />
        </View>
      ) : (
        <Button
          label="+ Add appliance"
          variant="secondary"
          onPress={startNew}
          disabled={rooms.length === 0}
        />
      )}

      {rooms
        .filter((r) => items.some((a) => a.room_id === r.id))
        .map((r) => (
          <View key={r.id} style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 6 }]}>
              {r.name_en}
            </Text>
            {items
              .filter((a) => a.room_id === r.id)
              .map((a) => (
                <View key={a.id} style={[styles.card, { gap: 6 }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Instructions for ${a.name_en}`}
                    onPress={() => onOpen(a)}
                  >
                    <Text style={[styles.text, { fontWeight: '600' }]}>{a.name_en} ›</Text>
                    <Text style={styles.muted}>
                      {[a.brand, a.model_number].filter(Boolean).join(' · ') || 'No brand or model'}{' '}
                      · {status[a.id] ?? 'No instructions'}
                    </Text>
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${a.name_en}`}
                      onPress={() =>
                        setForm({
                          id: a.id,
                          roomId: a.room_id,
                          categoryId: a.category_id,
                          nameEn: a.name_en,
                          nameAr: a.name_ar ?? '',
                          brand: a.brand ?? '',
                          model: a.model_number ?? '',
                        })
                      }
                      style={{ minHeight: 36, justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '600' }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${a.name_en}`}
                      onPress={() => remove(a)}
                      style={{ minHeight: 36, justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
          </View>
        ))}
      {items.length === 0 ? <Text style={styles.muted}>No appliances yet.</Text> : null}
    </ScrollView>
  );
}

function Chips({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {items.map((i) => (
        <Pressable
          key={i.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === i.id }}
          onPress={() => onChange(i.id)}
          style={{
            paddingHorizontal: 12,
            minHeight: 40,
            justifyContent: 'center',
            borderRadius: 999,
            borderWidth: 1,
            borderColor: value === i.id ? colors.primary : colors.border,
            backgroundColor: value === i.id ? colors.primarySoft : colors.surface,
          }}
        >
          <Text style={{ color: value === i.id ? colors.primary : colors.ink }}>{i.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  rtl,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rtl?: boolean;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, rtl ? { textAlign: 'right', writingDirection: 'rtl' } : null]}
        accessibilityLabel={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        maxLength={80}
      />
    </>
  );
}
