import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { loadQueue } from '../lib/uploads.ts';
import { Button, Logo, colors, styles } from '../ui.tsx';

/** Scan statuses as the manager reads them (same wording as the dashboard). */
const SCAN_LABEL: Record<string, { label: string; tone: 'busy' | 'ok' | 'bad' | 'idle' }> = {
  draft: { label: 'Draft', tone: 'idle' },
  recording: { label: 'Recording', tone: 'busy' },
  uploading: { label: 'Uploading', tone: 'busy' },
  uploaded: { label: 'Ready to process', tone: 'idle' },
  submitted: { label: 'Queued for 3D', tone: 'busy' },
  processing: { label: 'Creating 3D', tone: 'busy' },
  succeeded: { label: '3D ready', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'idle' },
};
const TONE = {
  busy: colors.accentStrong,
  ok: colors.primary,
  bad: colors.danger,
  idle: colors.muted,
};

interface RecentScan {
  id: string;
  status: string;
  created_at: string;
  apartments: { name: string } | null;
}

/** Home: company, what is going on, and the main action (record a walkthrough). */
export function Home({
  email,
  onRecord,
  onUploads,
}: {
  email: string | null;
  onRecord: () => void;
  onUploads: () => void;
}) {
  const [company, setCompany] = useState<string | null>(null);
  const [apartments, setApartments] = useState<number | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [uploading, setUploading] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [orgs, apts, scans, queue] = await Promise.all([
      supabase.from('organizations').select('name').order('created_at').limit(1),
      supabase
        .from('apartments')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'archived'),
      supabase
        .from('scan_sessions')
        .select('id, status, created_at, apartments(name)')
        .order('created_at', { ascending: false })
        .limit(5),
      loadQueue(),
    ]);
    setCompany((orgs.data?.[0] as { name: string } | undefined)?.name ?? null);
    setApartments(apts.count ?? 0);
    setRecent((scans.data ?? []) as unknown as RecentScan[]);
    setUploading(queue.length);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Logo size={44} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={styles.title}>
            {greeting}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {company ?? email ?? ''}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Apartments" value={apartments} />
        <Stat label="Uploading" value={uploading} onPress={uploading ? onUploads : undefined} />
        <Stat label="3D ready" value={recent.filter((s) => s.status === 'succeeded').length} />
      </View>

      <View
        style={[
          styles.card,
          { gap: 10, backgroundColor: colors.primarySoft, borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.text, { fontWeight: '700', color: colors.primary }]}>
          Record a walkthrough
        </Text>
        <Text style={styles.muted}>
          Pick an apartment, follow the room-by-room plan, then upload. The 3D apartment is built
          for you.
        </Text>
        <Button label="Start recording" onPress={onRecord} />
      </View>

      <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 6 }]}>
        Latest walkthroughs
      </Text>
      {recent.length === 0 ? (
        <Text style={styles.muted}>No walkthroughs yet. Your first one appears here.</Text>
      ) : (
        recent.map((s) => {
          const st = SCAN_LABEL[s.status] ?? { label: s.status, tone: 'idle' as const };
          return (
            <View
              key={s.id}
              accessible
              accessibilityLabel={`${s.apartments?.name ?? 'Apartment'}, ${st.label}`}
              style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontWeight: '600' }]} numberOfLines={1}>
                  {s.apartments?.name ?? 'Apartment'}
                </Text>
                <Text style={styles.muted}>{new Date(s.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={{ color: TONE[st.tone], fontWeight: '700', fontSize: 14 }}>
                {st.label}
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number | null;
  onPress?: (() => void) | undefined;
}) {
  const body = (
    <>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.ink }}>{value ?? '–'}</Text>
      <Text style={styles.muted}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { flex: 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View
      accessible
      accessibilityLabel={`${label}: ${value ?? 'loading'}`}
      style={[styles.card, { flex: 1 }]}
    >
      {body}
    </View>
  );
}
