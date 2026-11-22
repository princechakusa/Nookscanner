// Nookscanner Capture entry point: tabs (Home, Apartments, Uploads, Account) and guided capture.
import { registerRootComponent } from 'expo';
import App from './src/App.tsx';

// Development only: print the full stack of unhandled promise rejections to the Metro log
// (Hermes otherwise shows the message without where it came from).
declare const HermesInternal:
  | {
      enablePromiseRejectionTracker?: (o: {
        allRejections: boolean;
        onUnhandled: (id: number, error: unknown) => void;
      }) => void;
    }
  | undefined;
if (__DEV__ && typeof HermesInternal !== 'undefined') {
  HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => {
      const e = error as { message?: string; stack?: string };
      console.error(`Unhandled rejection: ${e?.message ?? String(error)}\n${e?.stack ?? ''}`);
    },
  });
}

registerRootComponent(App);
