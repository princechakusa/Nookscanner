import { mapAuthError } from '@nookscanner/shared';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, Logo, colors, styles } from '../ui.tsx';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_NOT_CONFIRMED: 'Confirm your email first (see the message we sent you).',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};

/** Managers sign in with the same account as the dashboard (no sign-up in the app). */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(MESSAGES[mapAuthError(e)] ?? 'Could not sign in. Check your connection.');
  }

  return (
    <View style={[styles.screen, { paddingTop: 96 }]}>
      <Logo />
      <Text accessibilityRole="header" style={[styles.title, { marginTop: 10 }]}>
        Nookscanner Capture
      </Text>
      <Text style={styles.muted}>Sign in with your Nookscanner dashboard account.</Text>
      <Text style={[styles.label, { marginTop: 10 }]}>Email</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Email"
        placeholder="you@company.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Password"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Sign in"
        onPress={() => void submit()}
        busy={busy}
        disabled={!email || !password}
      />
      <View
        style={{
          marginTop: 'auto',
          gap: 8,
          padding: 16,
          borderRadius: 14,
          backgroundColor: colors.primarySoft,
        }}
      >
        <Text
          style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.6, color: colors.primary }}
        >
          HOW IT WORKS
        </Text>
        <Text style={styles.text}>
          {[
            '1. Pick the apartment',
            '2. Follow the room-by-room plan',
            '3. Review and upload',
          ].join('\n')}
        </Text>
      </View>
    </View>
  );
}
