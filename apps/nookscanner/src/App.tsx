import { NavigationContainer, DefaultTheme, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './lib/supabase.ts';
import { loadQueue } from './lib/uploads.ts';
import { Account } from './screens/Account.tsx';
import { ApartmentDetail } from './screens/ApartmentDetail.tsx';
import { Apartments, type ApartmentItem } from './screens/Apartments.tsx';
import { Appliances, type ApplianceRow } from './screens/Appliances.tsx';
import type { CaptureResult } from './screens/Capture.tsx';
import { CaptureScreen } from './screens/CaptureScreen.ts';
import { Home } from './screens/Home.tsx';
import { Instructions } from './screens/Instructions.tsx';
import { NewApartment } from './screens/NewApartment.tsx';
import { Plan, type CaptureJob } from './screens/Plan.tsx';
import { Review } from './screens/Review.tsx';
import { ScanDetail } from './screens/ScanDetail.tsx';
import { Setup } from './screens/Setup.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Team } from './screens/Team.tsx';
import { Uploads } from './screens/Uploads.tsx';
import { TabBar, type Tab } from './tabs.tsx';
import { Screen, colors } from './ui.tsx';

export type RootStack = {
  Tabs: undefined;
  Apartment: { apartment: ApartmentItem };
  Appliances: { apartment: ApartmentItem };
  Instructions: { appliance: ApplianceRow };
  NewApartment: undefined;
  Team: undefined;
  Scan: { scanId: string; apartmentName: string; apartment?: ApartmentItem | undefined };
  Plan: { apartment: ApartmentItem };
  Capture: { job: CaptureJob };
  Review: { result: CaptureResult };
};

const Stack = createNativeStackNavigator<RootStack>();
const TAB_TITLE: Record<Tab, string> = {
  home: 'Home',
  apartments: 'Apartments',
  uploads: 'Uploads',
  account: 'Account',
};
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.canvas,
    card: colors.canvas,
    text: colors.ink,
    border: colors.border,
  },
};

/**
 * Nookscanner Capture: tabs (Home, Apartments, Uploads, Account) with native iOS navigation for
 * everything opened from them (system back button and swipe back). Recording (plan -> capture ->
 * review) runs full screen without the swipe, so a walkthrough is never dropped by accident.
 */
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('home');
  const [uploading, setUploading] = useState(0);
  // Bumped after a new apartment or joining a company so the list reloads.
  const [apartmentsVersion, setApartmentsVersion] = useState(0);
  // Accounts made in the app (e.g. Sign in with Apple) start without a company: first-run setup.
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return setHasOrg(null);
    void supabase
      .from('organization_members')
      .select('organization_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count, error }) => setHasOrg(error ? true : (count ?? 0) > 0));
  }, [userId]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setTab('home');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  let body;
  if (session === undefined || (session && hasOrg === null)) {
    body = <Screen title="Nookscanner Capture">{null}</Screen>;
  } else if (!session) {
    body = <SignIn />;
  } else if (!hasOrg) {
    body = <Setup email={session.user.email ?? null} onDone={() => setHasOrg(true)} />;
  } else {
    const email = session.user.email ?? null;
    body = (
      <NavigationContainer theme={theme}>
        <Stack.Navigator
          screenOptions={{
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.ink, fontWeight: '600' },
            headerStyle: { backgroundColor: colors.canvas },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="Tabs" options={{ headerShown: false, title: TAB_TITLE[tab] }}>
            {({ navigation }) => (
              <TabsView tab={tab} onTab={setTab} badge={uploading} onBadge={setUploading}>
                {tab === 'home' && (
                  <Home
                    email={email}
                    onRecord={() => setTab('apartments')}
                    onUploads={() => setTab('uploads')}
                  />
                )}
                {tab === 'apartments' && (
                  <Apartments
                    key={apartmentsVersion}
                    onSelect={(apartment) => navigation.navigate('Apartment', { apartment })}
                    onUploads={() => setTab('uploads')}
                    onNew={() => navigation.navigate('NewApartment')}
                  />
                )}
                {tab === 'uploads' && <Uploads onDone={() => setTab('home')} />}
                {tab === 'account' && (
                  <Account
                    email={email}
                    userId={session.user.id}
                    onTeam={() => navigation.navigate('Team')}
                    onJoined={() => setApartmentsVersion((v) => v + 1)}
                  />
                )}
              </TabsView>
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Apartment"
            options={({ route }) => ({ title: route.params.apartment.name })}
          >
            {({ route, navigation }) => (
              <ApartmentDetail
                apartment={route.params.apartment}
                onRecord={(apartment) => navigation.navigate('Plan', { apartment })}
                onOpenScan={(scanId, apartmentName) =>
                  navigation.navigate('Scan', {
                    scanId,
                    apartmentName,
                    apartment: route.params.apartment,
                  })
                }
                onAppliances={() =>
                  navigation.navigate('Appliances', { apartment: route.params.apartment })
                }
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Appliances" options={{ title: 'Appliances' }}>
            {({ route, navigation }) => (
              <Appliances
                apartmentId={route.params.apartment.id}
                onOpen={(appliance) => navigation.navigate('Instructions', { appliance })}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Instructions"
            options={({ route }) => ({ title: route.params.appliance.name_en })}
          >
            {({ route }) => <Instructions appliance={route.params.appliance} />}
          </Stack.Screen>
          <Stack.Screen name="NewApartment" options={{ title: 'New apartment' }}>
            {({ navigation }) => (
              <NewApartment
                onCreated={() => {
                  setApartmentsVersion((v) => v + 1);
                  setTab('apartments');
                  navigation.popToTop();
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Team" options={{ title: 'Team' }}>
            {() => <Team />}
          </Stack.Screen>
          <Stack.Screen name="Scan" options={{ title: 'Walkthrough' }}>
            {({ route, navigation }) => (
              <ScanDetail
                scanId={route.params.scanId}
                apartmentName={route.params.apartmentName}
                onRecordAgain={() => {
                  const apartment = route.params.apartment;
                  if (apartment) navigation.navigate('Plan', { apartment });
                  else navigation.popToTop();
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Plan" options={{ title: 'Walkthrough plan' }}>
            {({ route, navigation }) => (
              <Plan
                apartment={route.params.apartment}
                onStart={(job) => navigation.navigate('Capture', { job })}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Capture"
            options={{ headerShown: false, gestureEnabled: false, presentation: 'fullScreenModal' }}
          >
            {({ route, navigation }) => (
              <>
                <StatusBar style="light" />
                <CaptureScreen
                  job={route.params.job}
                  onCancel={() => navigation.goBack()}
                  onFinished={(result) => navigation.replace('Review', { result })}
                />
              </>
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Review"
            options={{ headerShown: false, gestureEnabled: false, presentation: 'fullScreenModal' }}
          >
            {({ route, navigation }) => (
              <Review
                result={route.params.result}
                onRetake={() => navigation.replace('Capture', { job: route.params.result.job })}
                onDone={(accepted) => {
                  if (accepted) {
                    setTab('uploads');
                    navigation.popToTop();
                  } else navigation.goBack();
                }}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <StatusBar style="dark" />
        {body}
      </View>
    </SafeAreaProvider>
  );
}

/** Tab content plus the tab bar; refreshes the Uploads badge whenever the tabs come back. */
function TabsView({
  tab,
  onTab,
  badge,
  onBadge,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  badge: number;
  onBadge: (n: number) => void;
  children: React.ReactNode;
}) {
  useFocusEffect(
    useCallback(() => {
      void loadQueue().then((q) => onBadge(q.length));
    }, [onBadge, tab]),
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <TabBar active={tab} onChange={onTab} badges={{ uploads: badge }} />
    </View>
  );
}
