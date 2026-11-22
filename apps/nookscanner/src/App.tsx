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
import { Uploads } from './screens/Uploads.tsx';
import { Screen } from './ui.tsx';

type Route =
  | { name: 'apartments' }
  | { name: 'plan'; apartment: ApartmentItem }
  | { name: 'capture'; job: CaptureJob }
  | { name: 'review'; result: CaptureResult }
  | { name: 'uploads' };

/** Nookscanner Capture: sign in -> apartment -> plan -> guided recording -> review (Stage 5.4). */
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>({ name: 'apartments' });
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
      if (!s) setRoute({ name: 'apartments' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Screen title="Nookscanner Capture">{null}</Screen>;
  if (!session) return <SignIn />;
  if (hasOrg === null) return <Screen title="Nookscanner Capture">{null}</Screen>;
  if (!hasOrg) return <Setup email={session.user.email ?? null} onDone={() => setHasOrg(true)} />;

  switch (route.name) {
    case 'apartments':
      return (
        <Apartments
          onSelect={(apartment) => setRoute({ name: 'plan', apartment })}
          onUploads={() => setRoute({ name: 'uploads' })}
        />
      );
    case 'plan':
      return (
        <Plan
          apartment={route.apartment}
          onBack={() => setRoute({ name: 'apartments' })}
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
            setRoute(
              accepted
                ? { name: 'uploads' }
                : { name: 'plan', apartment: route.result.job.apartment },
            )
          }
        />
      );
    case 'uploads':
      return <Uploads onDone={() => setRoute({ name: 'apartments' })} />;
  }
}
