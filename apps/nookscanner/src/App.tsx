import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.ts';
import { Apartments, type ApartmentItem } from './screens/Apartments.tsx';
import type { CaptureResult } from './screens/Capture.tsx';
import { CaptureScreen } from './screens/CaptureScreen.ts';
import { Plan, type CaptureJob } from './screens/Plan.tsx';
import { Review } from './screens/Review.tsx';
import { Setup } from './screens/Setup.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Account } from './screens/Account.tsx';
import { Home } from './screens/Home.tsx';
import { Uploads } from './screens/Uploads.tsx';
import { loadQueue } from './lib/uploads.ts';
import { TabBar, type Tab } from './tabs.tsx';
import { View } from 'react-native';
import { Screen } from './ui.tsx';

type Route =
  | { name: 'tabs' }
  | { name: 'plan'; apartment: ApartmentItem }
  | { name: 'capture'; job: CaptureJob }
  | { name: 'review'; result: CaptureResult };

/**
 * Nookscanner Capture: tabs (Home, Apartments, Uploads, Account); recording (plan -> capture ->
 * review) runs full screen over them.
 */
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>({ name: 'tabs' });
  const [tab, setTab] = useState<Tab>('home');
  const [uploading, setUploading] = useState(0);
  // Badge on the Uploads tab, refreshed whenever the tabs are shown.
  useEffect(() => {
    if (route.name === 'tabs') void loadQueue().then((q) => setUploading(q.length));
  }, [route.name, tab]);
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
      if (!s) {
        setRoute({ name: 'tabs' });
        setTab('home');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Screen title="Nookscanner Capture">{null}</Screen>;
  if (!session) return <SignIn />;
  if (hasOrg === null) return <Screen title="Nookscanner Capture">{null}</Screen>;
  if (!hasOrg) return <Setup email={session.user.email ?? null} onDone={() => setHasOrg(true)} />;

  switch (route.name) {
    case 'tabs': {
      const email = session.user.email ?? null;
      const name = (session.user.user_metadata?.full_name as string | undefined) ?? null;
      return (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {tab === 'home' && (
              <Home
                email={email}
                onRecord={() => setTab('apartments')}
                onUploads={() => setTab('uploads')}
              />
            )}
            {tab === 'apartments' && (
              <Apartments
                onSelect={(apartment) => setRoute({ name: 'plan', apartment })}
                onUploads={() => setTab('uploads')}
              />
            )}
            {tab === 'uploads' && <Uploads onDone={() => setTab('home')} />}
            {tab === 'account' && <Account email={email} name={name} />}
          </View>
          <TabBar active={tab} onChange={setTab} badges={{ uploads: uploading }} />
        </View>
      );
    }
    case 'plan':
      return (
        <Plan
          apartment={route.apartment}
          onBack={() => setRoute({ name: 'tabs' })}
          onStart={(job) => setRoute({ name: 'capture', job })}
        />
      );
    case 'capture':
      return (
        <CaptureScreen
          job={route.job}
          onCancel={() => setRoute({ name: 'plan', apartment: route.job.apartment })}
          onFinished={(result) => setRoute({ name: 'review', result })}
        />
      );
    case 'review':
      return (
        <Review
          result={route.result}
          onRetake={() => setRoute({ name: 'capture', job: route.result.job })}
          onDone={(accepted) =>
            accepted
              ? (setTab('uploads'), setRoute({ name: 'tabs' }))
              : setRoute({ name: 'plan', apartment: route.result.job.apartment })
          }
        />
      );
  }
}
