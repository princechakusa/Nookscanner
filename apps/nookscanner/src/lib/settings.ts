/**
 * App settings kept on the phone (documents folder, next to the upload queue). Defaults are the
 * safe choice: walkthroughs are gigabytes, so uploads wait for Wi-Fi unless the manager allows
 * mobile data.
 */
import { File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

export interface AppSettings {
  /** Upload walkthroughs only on Wi-Fi (default true). */
  wifiOnly: boolean;
}
const DEFAULTS: AppSettings = { wifiOnly: true };
const FILE = () => new File(Paths.document, 'settings.json');

export async function loadSettings(): Promise<AppSettings> {
  try {
    const f = FILE();
    if (!f.exists) return DEFAULTS;
    const raw = JSON.parse(await f.text()) as Partial<AppSettings>;
    return { wifiOnly: typeof raw.wifiOnly === 'boolean' ? raw.wifiOnly : DEFAULTS.wifiOnly };
  } catch {
    return DEFAULTS;
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const f = FILE();
  if (!f.exists) f.create();
  f.write(JSON.stringify(next));
}

/** Why uploads cannot run right now, or null when they can. */
export async function uploadBlocker(): Promise<'offline' | 'wifi' | null> {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  const { wifiOnly } = await loadSettings();
  if (wifiOnly && state.type !== Network.NetworkStateType.WIFI) return 'wifi';
  return null;
}
