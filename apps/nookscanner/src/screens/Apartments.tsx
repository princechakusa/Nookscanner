import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, Screen, styles } from '../ui.tsx';

export interface ApartmentItem {
  id: string;
  name: string;
  property: string;
}

/** Apartments this manager may see (RLS); capture needs scan.create, checked by the database. */
export function Apartments({ onSelect }: { onSelect: (a: ApartmentItem) => void }) {
  const [items, setItems] = useState<ApartmentItem[] | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const { data, error: e } = await supabase
      .from('apartments')
      .select('id, name, properties(name)')
      .neq('status', 'archived')
      .order('name');
    if (e) return setError('Could not load apartments. Check your connection and try again.');
    setItems(
      (
        (data ?? []) as unknown as Array<{
          id: string;
          name: string;
          properties: { name: string } | null;
        }>
      ).map((a) => ({ id: a.id, name: a.name, property: a.properties?.name ?? '' })),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Screen title="Choose an apartment">
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
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.property}`}
            onPress={() => onSelect(item)}
            style={styles.card}
          >
            <Text style={styles.text}>{item.name}</Text>
            <Text style={styles.muted}>{item.property}</Text>
          </Pressable>
        )}
      />
      <Button label="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}
