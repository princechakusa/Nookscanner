/**
 * Bottom tab bar (Home, Apartments, Uploads, Account). Plain React Native, no navigation
 * library, so it runs in Expo Go and the development build alike. 44 pt+ targets, labelled for
 * VoiceOver; the selected tab is announced.
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './ui.tsx';

export type Tab = 'home' | 'apartments' | 'uploads' | 'account';

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'apartments', label: 'Apartments' },
  { key: 'uploads', label: 'Uploads' },
  { key: 'account', label: 'Account' },
];

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  const p = {
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      {tab === 'home' && <Path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" {...p} />}
      {tab === 'apartments' && (
        <>
          <Path d="M5 21V4h9v17M14 9h5v12M3 21h18" {...p} />
          <Path d="M8 8h3M8 12h3M8 16h3" {...p} />
        </>
      )}
      {tab === 'uploads' && <Path d="M12 16V5M7 10l5-5 5 5M5 19h14" {...p} />}
      {tab === 'account' && (
        <>
          <Circle cx={12} cy={8} r={4} {...p} />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p} />
        </>
      )}
    </Svg>
  );
}

export function TabBar({
  active,
  onChange,
  badges = {},
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  badges?: Partial<Record<Tab, number>>;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        paddingBottom: 24, // home indicator
        paddingTop: 6,
      }}
    >
      {TABS.map((t) => {
        const selected = t.key === active;
        const color = selected ? colors.primary : colors.muted;
        const badge = badges[t.key] ?? 0;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={badge ? `${t.label}, ${badge} in progress` : t.label}
            onPress={() => onChange(t.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              minHeight: 52,
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <View>
              <TabIcon tab={t.key} color={color} />
              {badge > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -10,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 12, fontWeight: selected ? '700' : '500', color }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
