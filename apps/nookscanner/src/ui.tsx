import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

/** Minimal shared UI for the capture app (brand colours from the design tokens). */
export const colors = {
  ink: '#14213D',
  muted: '#5B6475',
  surface: '#FFFFFF',
  canvas: '#F5F7FA',
  primary: '#0B6E4F',
  danger: '#B42318',
  border: '#D5DBE3',
};

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && styles.buttonSecondary,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.ink : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.ink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, padding: 20, paddingTop: 64, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  text: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonSecondary: { borderWidth: 1, borderColor: colors.border },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
});
