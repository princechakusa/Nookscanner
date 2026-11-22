import { checkpointPlan, type PlanRoom, type PlanStep, type RoomType } from '@nookscanner/shared';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { ArrowIcon, Button, ErrorText, colors, styles } from '../ui.tsx';
import type { ApartmentItem } from './Apartments.tsx';

export interface CaptureJob {
  apartment: ApartmentItem;
  sessionId: string;
  rooms: PlanRoom[];
  plan: PlanStep[];
}

/**
 * Shows the walkthrough plan built from the apartment's rooms (in the order set in the dashboard)
 * and creates the scan session with that plan when the manager starts.
 */
export function Plan({
  apartment,
  onStart,
}: {
  apartment: ApartmentItem;
  onStart: (job: CaptureJob) => void;
}) {
  const [rooms, setRooms] = useState<PlanRoom[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await supabase
        .from('rooms')
        .select('id, name_en, name_ar, room_type')
        .eq('apartment_id', apartment.id)
        .order('sort_order')
        .order('name_en');
      if (e) return setError('Could not load the rooms. Check your connection.');
      setRooms(
        (
          (data ?? []) as Array<{
            id: string;
            name_en: string;
            name_ar: string | null;
            room_type: RoomType;
          }>
        ).map((r) => ({ id: r.id, nameEn: r.name_en, nameAr: r.name_ar, roomType: r.room_type })),
      );
    })();
  }, [apartment.id]);

  const plan = rooms ? checkpointPlan(rooms) : [];

  async function start() {
    if (!rooms?.length) return;
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase
      .from('scan_sessions')
      .insert({ apartment_id: apartment.id, method: 'guided_capture', checkpoint_plan: plan })
      .select('id')
      .single();
    setBusy(false);
    if (e || !data) {
      return setError(
        e?.code === '42501'
          ? 'Your role cannot start scans for this apartment. Ask a manager or admin.'
          : 'Could not start the scan. Try again.',
      );
    }
    onStart({ apartment, sessionId: (data as { id: string }).id, rooms, plan });
  }

  return (
    <View style={[styles.screen, styles.pushed, { paddingBottom: 32 }]}>
      <Text style={[styles.text, { fontWeight: '700' }]}>{apartment.name}</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {rooms && rooms.length === 0 ? (
        <Text style={styles.text}>
          This apartment has no rooms yet. In the dashboard, open the apartment and press "Create
          these rooms".
        </Text>
      ) : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        <Text style={styles.muted}>
          Daylight plus all lights on. Hold the phone sideways at chest height and walk slowly along
          the walls; capture every corner and the floor. You can pause at any time.
        </Text>
        {plan.map((step, i) =>
          step.kind === 'room' ? (
            <View key={i} style={[styles.card, { flexDirection: 'row', gap: 12 }]}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: '#fff',
                  }}
                >
                  {step.sequence + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.text, { fontWeight: '600' }]}>{step.labelEn}</Text>
                <Text style={styles.muted}>{step.tip}</Text>
              </View>
            </View>
          ) : (
            <View
              key={i}
              style={{ flexDirection: 'row', gap: 10, paddingLeft: 22, paddingRight: 6 }}
            >
              <ArrowIcon />
              <Text style={[styles.muted, { flex: 1, color: colors.accentStrong }]}>
                {step.instruction}
              </Text>
            </View>
          ),
        )}
      </ScrollView>
      <Button
        label="Start capture"
        onPress={() => void start()}
        busy={busy}
        disabled={!rooms?.length}
      />
    </View>
  );
}
