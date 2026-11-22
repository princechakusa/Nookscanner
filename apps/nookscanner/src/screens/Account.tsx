import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { deleteAccount } from '../lib/account.ts';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';

const GUEST_SITE = 'https://nookscanner-guest.pages.dev';
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
};

interface Membership {
  role: string;
  organizations: { name: string } | null;
}

/** Account: who you are, your company and role, help, sign out and account deletion (10.6). */
export function Account({ email, name }: { email: string | null; name: string | null }) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase
      .from('organization_members')
      .select('role, organizations(name)')
      .then(({ data }) => setMemberships((data ?? []) as unknown as Membership[]));
  }, []);

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'Your sign-in and personal details are removed. Apartments and walkthroughs belong to your company and stay with it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void runDelete() },
      ],
    );
  }

  async function runDelete() {
    setBusy(true);
    setError('');
    const result = await deleteAccount();
    setBusy(false);
    if (result.ok) {
      await supabase.auth.signOut();
      return;
    }
    setError(
      result.error === 'SOLE_OWNER'
        ? `You are the only owner of ${result.organizations.join(', ')}. Make another member an owner in the dashboard (Settings > Members), or delete the company there, then try again.`
        : 'Could not delete the account. Check your connection and try again.',
    );
  }

  const version = Constants.expoConfig?.version ?? '';
  return (
    <ScrollView contentContainerStyle={[styles.screen, { flexGrow: 1 }]}>
      <Text accessibilityRole="header" style={styles.title}>
        Account
      </Text>
      <View style={styles.card}>
        {name ? <Text style={[styles.text, { fontWeight: '700' }]}>{name}</Text> : null}
        <Text style={styles.text}>{email ?? 'Signed in with Apple'}</Text>
      </View>

      <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 6 }]}>
        Company
      </Text>
      {memberships.length === 0 ? (
        <Text style={styles.muted}>Not part of a company yet.</Text>
      ) : (
        memberships.map((m, i) => (
          <View
            key={i}
            style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between' }]}
          >
            <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
              {m.organizations?.name ?? 'Company'}
            </Text>
            <Text style={[styles.muted, { fontWeight: '600' }]}>
              {ROLE_LABEL[m.role] ?? m.role}
            </Text>
          </View>
        ))
      )}
      <Text style={styles.muted}>
        Invite your team, add appliances and instructions, and publish apartments for guests in the
        Nookscanner dashboard.
      </Text>

      <Text accessibilityRole="header" style={[styles.label, { fontSize: 15, marginTop: 6 }]}>
        Help
      </Text>
      <Row
        label="How to record a good walkthrough"
        onPress={() => void Linking.openURL(`${GUEST_SITE}/demo`)}
      />
      <Row
        label="Contact support"
        onPress={() => void Linking.openURL('mailto:support@nookscanner.com')}
      />
      <Row label="Privacy policy" onPress={() => void Linking.openURL(`${GUEST_SITE}/privacy`)} />

      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={{ marginTop: 'auto', gap: 10, paddingTop: 16 }}>
        <Button label="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
        <Button label="Delete account" variant="danger" onPress={confirmDelete} busy={busy} />
        <Text style={[styles.muted, { textAlign: 'center' }]}>Nookscanner Capture {version}</Text>
      </View>
    </ScrollView>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          minHeight: 52,
          justifyContent: 'center',
          borderColor: pressed ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.text, { color: colors.primary, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}
