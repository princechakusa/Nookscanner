import {
  DEFAULT_LAYOUT,
  layoutSchema,
  roomsFromLayout,
  slugify,
  withSuffix,
} from '@nookscanner/shared';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';
import { JoinWithCode } from './JoinWithCode.tsx';

/**
 * First-run setup in the app (for accounts made in the app, e.g. with Sign in with Apple, which
 * cannot use the dashboard yet): creates the organization, a property, the first apartment and
 * its room plan with the same rules as the dashboard (shared slug/layout/room helpers, RLS).
 */
export function Setup({ email, onDone }: { email: string | null; onDone: () => void }) {
  const [company, setCompany] = useState('');
  const [building, setBuilding] = useState('');
  const [apartment, setApartment] = useState('');
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    try {
      const layout = layoutSchema.parse({ ...DEFAULT_LAYOUT, bedrooms, bathrooms });
      // Organization (slug from the name; one retry with a suffix if it is taken).
      let slug = slugify(company);
      let org = await supabase.rpc('create_organization', { p_name: company.trim(), p_slug: slug });
      if (org.error?.code === '23505' || /duplicate|taken/i.test(org.error?.message ?? '')) {
        slug = withSuffix(slug);
        org = await supabase.rpc('create_organization', { p_name: company.trim(), p_slug: slug });
      }
      if (org.error || !org.data) throw new Error('org');
      const orgId = org.data as unknown as string;
      const property = await supabase
        .from('properties')
        .insert({ organization_id: orgId, name: building.trim() })
        .select('id')
        .single();
      if (property.error) throw new Error('property');
      const apt = await supabase
        .from('apartments')
        .insert({ property_id: property.data.id, name: apartment.trim(), layout })
        .select('id')
        .single();
      if (apt.error) throw new Error('apartment');
      const rooms = roomsFromLayout(layout).map((r) => ({
        apartment_id: apt.data.id,
        name_en: r.nameEn,
        name_ar: r.nameAr,
        room_type: r.roomType,
        sort_order: r.sortOrder,
      }));
      const r = await supabase.from('rooms').insert(rooms);
      if (r.error) throw new Error('rooms');
      onDone();
    } catch {
      setError('Could not finish the setup. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const ready = company.trim() && building.trim() && apartment.trim();
  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { paddingTop: 72, flexGrow: 1 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.title}>
        Set up your first apartment
      </Text>
      <Text style={styles.muted}>
        Your account is not part of a company on Nookscanner yet. Create yours here, or ask your
        team to invite {email ? email : 'your email address'} and pull down to refresh.
      </Text>
      <Field
        label="Company name"
        value={company}
        onChange={setCompany}
        placeholder="Marina Stays"
      />
      <Field label="Building" value={building} onChange={setBuilding} placeholder="Marina Tower" />
      <Field
        label="Apartment"
        value={apartment}
        onChange={setApartment}
        placeholder="Apartment 12B"
      />
      <Stepper label="Bedrooms" value={bedrooms} min={0} max={10} onChange={setBedrooms} />
      <Stepper label="Bathrooms" value={bathrooms} min={1} max={10} onChange={setBathrooms} />
      <Text style={styles.muted}>
        The room plan (entrance, living room, kitchen, bedrooms, bathrooms) is created from this;
        you can change it in the dashboard later.
      </Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Create and continue"
        onPress={() => void create()}
        busy={busy}
        disabled={!ready}
      />
      <JoinWithCode email={email} onJoined={onDone} />
      <Button label="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        placeholder={placeholder}
        maxLength={120}
        value={value}
        onChangeText={onChange}
      />
    </>
  );
}

function Stepper({
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
