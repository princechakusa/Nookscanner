import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import appIcon from '../assets/icon.png';
import Svg, { Circle, Path } from 'react-native-svg';

/** Minimal shared UI for the capture app; colours are the brand tokens (packages/design-tokens). */
export const colors = {
  ink: '#161A20',
  muted: '#5A6370',
  surface: '#FFFFFF',
  canvas: '#F7F5F1',
  primary: '#1F5662',
  primarySoft: '#E8F1F2',
  accent: '#C8893B',
  accentStrong: '#8F5E1F',
  warning: '#9A5408',
  danger: '#B42318',
  border: '#E3DFD8',
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
  warning: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
});

// ---------------------------------------------------------------- Icons and small parts

/** Brand mark: the Open Door app icon (store/logo-final/photo/night-door.png). */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <Image
      source={appIcon}
      accessibilityRole="image"
      accessibilityLabel="Nookscanner"
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
    />
  );
}

export function HomeIcon({ active }: { active?: boolean }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: active ? colors.primarySoft : colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path
          d="M4 11 12 5l8 6v8H4z"
          fill="none"
          stroke={active ? colors.primary : colors.muted}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export function StatusIcon({ ok }: { ok: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={10} fill={ok ? '#1E7A4F' : '#9A5408'} />
      {ok ? (
        <Path
          d="M6.5 11.5l3 3 6-6.5"
          fill="none"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M11 6v6M11 15.5v.5"
          fill="none"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

export function ArrowIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M4 2v9a3 3 0 0 0 3 3h7M11 11l3 3-3 3"
        fill="none"
        stroke={colors.accentStrong}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Room progress: one segment per room, done ones in the accent colour. */
export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <View
      accessibilityLabel={`Room ${Math.min(done, total)} of ${total}`}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < done ? colors.accent : 'rgba(244,241,236,0.28)',
          }}
        />
      ))}
    </View>
  );
}
