import { passwordSchema } from '@nookscanner/shared';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { deleteAccount } from '../lib/account.ts';
import { loadSettings, saveSettings } from '../lib/settings.ts';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';
import { JoinWithCode } from './JoinWithCode.tsx';

const GUEST_SITE = 'https://nookscanner-guest.pages.dev';
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
};
const PASSWORD_TEXT: Record<string, string> = {
  PASSWORD_TOO_SHORT: 'Use at least 10 characters.',
  PASSWORD_TOO_LONG: 'Use at most 72 characters.',
  PASSWORD_TOO_WEAK: 'Use upper- and lower-case letters and a digit.',
};

interface Membership {
  role: string;
  organizations: { name: string } | null;
}

/**
 * Account: profile name, password (set one for Apple accounts so the dashboard works too),
 * company and role, team, joining a company, upload settings, help, sign out and deletion (10.6).
 */
export function Account({
  email,
  userId,
  onTeam,
  onJoined,
}: {
  email: string | null;
  userId: string;
  onTeam: () => void;
  onJoined: () => void;
}) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [password, setPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void supabase
      .from('organization_members')
      .select('role, organizations(name)')
      .then(({ data }) => setMemberships((data ?? []) as unknown as Membership[]));
    void supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const n = (data as { full_name: string | null } | null)?.full_name ?? '';
        setName(n);
        setSavedName(n);
      });
    void loadSettings().then((s) => setWifiOnly(s.wifiOnly));
  }, [userId]);

  const say = (text: string) => {
    setError('');
    setNotice(text);
  };

  async function saveName() {
    setBusy('name');
    const full = name.trim().slice(0, 120);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase
        .from('profiles')
        .update({ full_name: full || null })
        .eq('id', userId),
      supabase.auth.updateUser({ data: { full_name: full } }),
    ]);
    setBusy(null);
    if (e1 || e2) return setError('Could not save your name.');
    setSavedName(full);
    say('Name saved.');
  }

  async function savePassword() {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success)
      return setError(PASSWORD_TEXT[parsed.error.issues[0]!.message] ?? 'Choose another password.');
    setBusy('password');
    setError('');
    const { error: e } = await supabase.auth.updateUser(
      needsCode ? { password, nonce: nonce.trim() } : { password },
    );
    if (e && /reauthenticat/i.test(e.message) && !needsCode) {
      // Secure password change: confirm with the code Supabase emails to you.
      await supabase.auth.reauthenticate();
      setNeedsCode(true);
      setBusy(null);
      return say(
        `We emailed a confirmation code to ${email ?? 'your address'}. Enter it below, then save again.`,
      );
    }
    setBusy(null);
    if (e)
      return setError(
        needsCode ? 'The code is not right or has expired.' : 'Could not change the password.',
      );
    setPassword('');
    setNonce('');
    setNeedsCode(false);
    say('Password saved. You can now also sign in to the Nookscanner dashboard with it.');
  }

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
    setBusy('delete');
    setError('');
    const result = await deleteAccount();
    setBusy(null);
    if (result.ok) {
      await supabase.auth.signOut();
      return;
    }
    setError(
      result.error === 'SOLE_OWNER'
        ? `You are the only owner of ${result.organizations.join(', ')}. Make another member an owner first (or delete the company in the dashboard), then try again.`
        : 'Could not delete the account. Check your connection and try again.',
    );
  }

  const version = Constants.expoConfig?.version ?? '';
  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { flexGrow: 1, paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.title}>
        Account
      </Text>
      <Text style={styles.muted}>{email ?? 'Signed in with Apple (private email)'}</Text>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.primary }]}>
          {notice}
        </Text>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Section title="Profile" />
      <View style={[styles.card, { gap: 8 }]}>
        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Your name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={120}
        />
        <Button
          label="Save name"
          variant="secondary"
          onPress={() => void saveName()}
          busy={busy === 'name'}
          disabled={name.trim() === savedName}
        />
      </View>
      <View style={[styles.card, { gap: 8 }]}>
        <Text style={styles.label}>Password</Text>
        <Text style={styles.muted}>
          Set or change your password. Accounts made with Apple can set one to sign in to the
          dashboard.
        </Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="New password"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />
        {needsCode ? (
          <TextInput
            style={styles.input}
            accessibilityLabel="Confirmation code from the email"
            placeholder="Code from the email"
            keyboardType="number-pad"
            value={nonce}
            onChangeText={setNonce}
          />
        ) : null}
        <Button
          label="Save password"
          variant="secondary"
          onPress={() => void savePassword()}
          busy={busy === 'password'}
          disabled={!password || (needsCode && !nonce.trim())}
        />
      </View>

      <Section title="Company" />
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
      <Row label="Team and invitations" onPress={onTeam} />
      <JoinWithCode email={email} onJoined={() => (say('You joined the company.'), onJoined())} />

      <Section title="Settings" />
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>Upload on Wi-Fi only</Text>
          <Text style={styles.muted}>
            Walkthroughs are large; leave this on to save mobile data.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Upload on Wi-Fi only"
          value={wifiOnly}
          onValueChange={(v) => {
            setWifiOnly(v);
            void saveSettings({ wifiOnly: v });
          }}
        />
      </View>

      <Section title="Help" />
      <Row
        label="See a guest guide (demo)"
        onPress={() => void Linking.openURL(`${GUEST_SITE}/demo`)}
      />
      <Row
        label="Contact support"
        onPress={() => void Linking.openURL('mailto:support@nookscanner.com')}
      />

      <View style={{ gap: 10, paddingTop: 16 }}>
        <Button label="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
        <Button
          label="Delete account"
          variant="danger"
          onPress={confirmDelete}
          busy={busy === 'delete'}
        />
        <Text style={[styles.muted, { textAlign: 'center' }]}>Nookscanner Capture {version}</Text>
      </View>
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

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
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
      <Text style={[styles.text, { color: colors.primary, fontWeight: '600' }]}>{label} ›</Text>
    </Pressable>
  );
}
