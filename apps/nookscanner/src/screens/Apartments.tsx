import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { loadQueue } from '../lib/uploads.ts';
import { Button, ErrorText, HomeIcon, Screen, colors, styles } from '../ui.tsx';

export interface ApartmentItem {
  id: string;
  name: string;
  property: string;
  unit: string | null;
  roomCount: number;
}

/** Apartments this manager may see (RLS); capture needs scan.create, checked by the database. */
export function Apartments({
  onSelect,
  onUploads,
}: {
  onSelect: (a: ApartmentItem) => void;
  onUploads: () => void;
}) {
  const [items, setItems] = useState<ApartmentItem[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError('');
    const { data, error: e } = await supabase
      .from('apartments')
      .select('id, name, unit_number, properties(name), rooms(count)')
      .neq('status', 'archived')
      .order('name');
    if (e) return setError('Could not load apartments. Check your connection and try again.');
    setItems(
      (
        (data ?? []) as unknown as Array<{
          id: string;
          name: string;
          unit_number: string | null;
          properties: { name: string } | null;
          rooms: Array<{ count: number }>;
        }>
      ).map((a) => ({
        id: a.id,
        name: a.name,
        property: a.properties?.name ?? '',
        unit: a.unit_number,
        roomCount: a.rooms[0]?.count ?? 0,
      })),
    );
  }

  useEffect(() => {
    void load();
    void loadQueue().then((q) => setPending(q.length));
  }, []);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen title="Choose an apartment">
      {pending > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onUploads}
          style={[
            styles.card,
            { backgroundColor: colors.primarySoft, borderColor: colors.primary },
          ]}
        >
          <Text style={[styles.text, { fontWeight: '600', color: colors.primary }]}>
            {pending === 1 ? '1 walkthrough is uploading' : `${pending} walkthroughs are uploading`}
          </Text>
          <Text style={styles.muted}>Tap to see progress.</Text>
        </Pressable>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items && items.length === 0 ? (
        <Text style={styles.muted}>
          No apartments yet. Add one in the Nookscanner dashboard, set its layout and create its
          rooms.
        </Text>
      ) : null}
      <FlatList
        data={items ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => {
          const where = [item.property, item.unit ? `Unit ${item.unit}` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${where}, ${item.roomCount} rooms`}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [
                styles.card,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderColor: pressed ? colors.primary : colors.border,
                },
              ]}
            >
              <HomeIcon active={item.roomCount > 0} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.text, { fontWeight: '600' }]}>{item.name}</Text>
                <Text style={styles.muted}>{where}</Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: item.roomCount ? colors.primary : colors.warning,
                  backgroundColor: item.roomCount ? colors.primarySoft : '#FFF6EC',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  overflow: 'hidden',
                }}
              >
                {item.roomCount ? `${item.roomCount} rooms` : 'No rooms'}
              </Text>
            </Pressable>
          );
        }}
      />
      <Button label="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}
