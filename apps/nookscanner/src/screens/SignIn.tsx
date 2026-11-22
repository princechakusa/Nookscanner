import { mapAuthError, signUpSchema } from '@nookscanner/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase.ts';
import { Button, ErrorText, Logo, colors, styles } from '../ui.tsx';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_NOT_CONFIRMED: 'Confirm your email first: tap the link in the email we sent you.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  WEAK_PASSWORD: 'Choose a stronger password.',
};
const FIELD_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: 'Enter your name.',
  INVALID_EMAIL: 'Enter a valid email address.',
  PASSWORD_TOO_SHORT: 'Use at least 10 characters.',
  PASSWORD_TOO_LONG: 'Use at most 72 characters.',
  PASSWORD_TOO_WEAK: 'Use upper- and lower-case letters and a digit.',
};

type Mode = 'signin' | 'signup' | 'reset';

/**
 * Sign in to Nookscanner Capture: Sign in with Apple (iOS), email + password, create an account,
 * or reset the password. Accounts are the same as the dashboard's. Email sign-in codes need a
 * custom email provider first (Supabase Free cannot change the email templates; Blocked item 1).
 */
export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  async function signIn() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(MESSAGES[mapAuthError(e)] ?? 'Could not sign in. Check your connection.');
  }

  async function signUp() {
    const parsed = signUpSchema.safeParse({ fullName: name, email, password });
    if (!parsed.success) {
      setError(FIELD_MESSAGES[parsed.error.issues[0]!.message] ?? 'Check the fields.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.fullName } },
    });
    setBusy(false);
    if (e) {
      setError(MESSAGES[mapAuthError(e)] ?? 'Could not create the account. Check your connection.');
      return;
    }
    // With email confirmation on, there is no session until the link is tapped.
    if (!data.session) {
      setNotice(
        `We sent a confirmation email to ${parsed.data.email}. Tap the link in it (it may open a page that does not load on the phone; the account is confirmed anyway), then come back and sign in.`,
      );
      setMode('signin');
    }
  }

  async function reset() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (e && mapAuthError(e) === 'RATE_LIMITED') return setError(MESSAGES.RATE_LIMITED!);
    // Same answer whether or not the account exists (no account enumeration).
    setNotice(
      'If an account exists for this email, we sent a reset link. Open it on the computer with the Nookscanner dashboard to choose a new password.',
    );
  }

  async function signInWithApple() {
    setError('');
    try {
      // Replay protection: Apple signs the SHA-256 of the nonce; Supabase checks the raw nonce.
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });
      if (!credential.identityToken) throw new Error('No identity token');
      setBusy(true);
      const { error: e } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce,
      });
      setBusy(false);
      if (e) setError('Apple sign-in did not work. Try again or use your email.');
    } catch (e) {
      setBusy(false);
      // The person closed the Apple sheet: not an error.
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError('Apple sign-in did not work. Try again or use your email.');
    }
  }

  const title =
    mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Sign in';

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { paddingTop: 80, flexGrow: 1 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Logo />
      <Text accessibilityRole="header" style={[styles.title, { marginTop: 10 }]}>
        Nookscanner Capture
      </Text>
      <Text style={styles.muted}>
        {mode === 'signup'
          ? 'One account for the app and the Nookscanner dashboard.'
          : mode === 'reset'
            ? 'Enter your email; we send a reset link.'
            : 'Sign in to record and upload apartment walkthroughs.'}
      </Text>

      {appleAvailable && mode !== 'reset' ? (
        <View style={{ marginTop: 12 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              mode === 'signup'
                ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 50 }}
            onPress={() => void signInWithApple()}
          />
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 10 }]}>or with email</Text>
        </View>
      ) : null}

      <Text accessibilityRole="header" style={[styles.label, { marginTop: 10, fontSize: 17 }]}>
        {title}
      </Text>
      {mode === 'signup' ? (
        <>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Your name"
            autoComplete="name"
            textContentType="name"
            value={name}
            onChangeText={setName}
          />
        </>
      ) : null}
      <Text style={styles.label}>Email</Text>
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
      {mode !== 'reset' ? (
        <>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Password"
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void (mode === 'signup' ? signUp() : signIn())}
          />
          {mode === 'signup' ? (
            <Text style={styles.muted}>
              At least 10 characters with upper- and lower-case letters and a digit.
            </Text>
          ) : null}
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.primary }]}>
          {notice}
        </Text>
      ) : null}
      <Button
        label={
          mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'
        }
        onPress={() => void (mode === 'signup' ? signUp() : mode === 'reset' ? reset() : signIn())}
        busy={busy}
        disabled={!email || (mode !== 'reset' && !password) || (mode === 'signup' && !name)}
      />

      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}
      >
        {mode === 'signin' ? (
          <>
            <TextLink label="Create an account" onPress={() => switchTo('signup')} />
            <TextLink label="Forgot password?" onPress={() => switchTo('reset')} />
          </>
        ) : (
          <TextLink label="Back to sign in" onPress={() => switchTo('signin')} />
        )}
      </View>
    </ScrollView>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={10}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
