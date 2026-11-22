import { INVITE_TOKEN_PATTERN } from '@nookscanner/shared';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, colors, styles } from '../ui.tsx';

/** Join a company with an invitation code (accept_invitation; bound to the invited email). */
export function JoinWithCode({ email, onJoined }: { email: string | null; onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const token = code.trim();

  async function join() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.rpc('accept_invitation', { p_token: token });
    setBusy(false);
    if (!e) return onJoined();
    setError(
      /FORBIDDEN|42501/.test(`${e.code} ${e.message}`)
        ? `This invitation is for another email address. You are signed in as ${email ?? 'a private Apple email'}; ask for an invitation to that address, or sign in with the invited email.`
        : 'This code is not valid any more (used, revoked or older than 7 days). Ask for a new invitation.',
    );
  }

  return (
    <View style={[styles.card, { gap: 8 }]}>
      <Text style={[styles.text, { fontWeight: '700' }]}>Join a company</Text>
      <Text style={styles.muted}>Paste the invitation code your team shared with you.</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Invitation code"
        placeholder="Invitation code"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Join"
        variant="secondary"
        onPress={() => void join()}
        busy={busy}
        disabled={!INVITE_TOKEN_PATTERN.test(token)}
      />
      <Text style={[styles.muted, { color: colors.muted }]}>
        The code only works for the email address it was sent to.
      </Text>
    </View>
  );
}
