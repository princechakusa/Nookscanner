import { DEFAULT_LAYOUT, layoutSchema, roomsFromLayout } from '@nookscanner/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';

interface Property {
  id: string;
  name: string;
  organization_id: string;
}

/** New apartment: building (existing or new), name, unit, layout -> rooms (dashboard rules, RLS). */
export function NewApartment({ onCreated }: { onCreated: () => void }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | 'new'>('new');
  const [building, setBuilding] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [balconies, setBalconies] = useState(0);
  const [openKitchen, setOpenKitchen] = useState(false);
  const [laundry, setLaundry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      supabase.from('properties').select('id, name, organization_id').order('name'),
      supabase.from('organization_members').select('organization_id').limit(1),
    ]).then(([p, m]) => {
      const list = (p.data ?? []) as Property[];
      setProperties(list);
      if (list[0]) setPropertyId(list[0].id);
      setOrgId((m.data?.[0] as { organization_id: string } | undefined)?.organization_id ?? null);
    });
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      let pid = propertyId;
      if (pid === 'new') {
        if (!orgId) throw new Error('Only company admins can add a building.');
        const p = await supabase
          .from('properties')
          .insert({ organization_id: orgId, name: building.trim() })
          .select('id')
          .single();
        if (p.error) throw new Error('Only company admins can add a building.');
        pid = p.data.id;
      }
      const layout = layoutSchema.parse({
        ...DEFAULT_LAYOUT,
        bedrooms,
        bathrooms,
        balconies,
        kitchen: openKitchen ? 'open' : 'separate',
        laundry,
      });
      const a = await supabase
        .from('apartments')
        .insert({ property_id: pid, name: name.trim(), unit_number: unit.trim() || null, layout })
        .select('id')
        .single();
      if (a.error) throw new Error('Could not create the apartment (managers and admins only).');
      const rooms = roomsFromLayout(layout).map((r) => ({
        apartment_id: a.data.id,
        name_en: r.nameEn,
        name_ar: r.nameAr,
        room_type: r.roomType,
        sort_order: r.sortOrder,
      }));
      const r = await supabase.from('rooms').insert(rooms);
      if (r.error) throw new Error('The apartment was created, but its rooms could not be added.');
      onCreated();
    } catch (e) {
      setError((e as Error).message || 'Could not create the apartment. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim() && (propertyId !== 'new' || building.trim());
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        styles.pushed,
        { flexGrow: 1, paddingBottom: 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Building</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          ...properties.map((p) => ({ id: p.id, name: p.name })),
          { id: 'new', name: '+ New building' },
        ].map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: propertyId === p.id }}
            onPress={() => setPropertyId(p.id)}
            style={{
              paddingHorizontal: 14,
              minHeight: 44,
              justifyContent: 'center',
              borderRadius: 999,
              borderWidth: 1,
              borderColor: propertyId === p.id ? colors.primary : colors.border,
              backgroundColor: propertyId === p.id ? colors.primarySoft : colors.surface,
            }}
          >
            <Text style={{ color: propertyId === p.id ? colors.primary : colors.ink }}>
              {p.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {propertyId === 'new' ? (
        <TextInput
          style={styles.input}
          accessibilityLabel="Building name"
          placeholder="Marina Tower"
          value={building}
          onChangeText={setBuilding}
          maxLength={120}
        />
      ) : null}

      <Text style={styles.label}>Apartment name</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Apartment name"
        placeholder="Sea view 12B"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Text style={styles.label}>Unit number (optional)</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Unit number"
        placeholder="12B"
        value={unit}
        onChangeText={setUnit}
        maxLength={40}
      />

      <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 6 }]}>
        Layout
      </Text>
      <Stepper label="Bedrooms" value={bedrooms} min={0} max={10} onChange={setBedrooms} />
      <Stepper label="Bathrooms" value={bathrooms} min={1} max={10} onChange={setBathrooms} />
      <Stepper label="Balconies" value={balconies} min={0} max={5} onChange={setBalconies} />
      <Toggle
        label="Open kitchen (part of the living room)"
        value={openKitchen}
        onChange={setOpenKitchen}
      />
      <Toggle label="Laundry room" value={laundry} onChange={setLaundry} />
      <Text style={styles.muted}>
        Rooms are created from the layout in walking order; you can rename, reorder or add rooms
        afterwards.
      </Text>

      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Create apartment"
        onPress={() => void create()}
        busy={busy}
        disabled={!ready}
      />
    </ScrollView>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn = (text: string, next: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={next < min || next > max}
      onPress={() => onChange(next)}
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: next < min || next > max ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 22, color: colors.primary }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      {btn('−', value - 1, `Fewer ${label.toLowerCase()}`)}
      <Text
        accessibilityLabel={`${label}: ${value}`}
        style={[styles.text, { minWidth: 24, textAlign: 'center' }]}
      >
        {value}
      </Text>
      {btn('+', value + 1, `More ${label.toLowerCase()}`)}
    </View>
  );
}
