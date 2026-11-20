import { mapAuthError } from '@nookscanner/shared';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, Screen, styles } from '../ui.tsx';

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
    <Screen title="Nookscanner Capture">
      <Text style={styles.muted}>Sign in with your Nookscanner dashboard account.</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        accessibilityLabel="Password"
        placeholder="Password"
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
    </Screen>
  );
}
