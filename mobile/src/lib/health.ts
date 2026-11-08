// Steps from Samsung Health via Android's Health Connect (personal Android
// build only). The native side (android/.../health/HealthSteps.kt) reads the
// phone's daily step total and keeps ONE "Samsung Health" log entry per day up
// to date — on app start, when the app comes back to the front, and hourly in
// the background. Elsewhere (web dev, iOS, other builds) everything here is a no-op.

import { registerPlugin } from '@capacitor/core';
import { isNativePlatform, getPlatform } from './native';
import { API_BASE_URL } from './api';

export interface HealthStatus {
  available: boolean;
  granted: boolean;
  background: boolean;
  lastSync?: number;
  today?: number;
}

export interface HealthSyncResult {
  ok: boolean;
  message: string;
  today: number;
  days: { date: string; steps: number }[];
}

interface HealthStepsPlugin {
  status(): Promise<HealthStatus>;
  configure(opts: { baseUrl: string; background: boolean }): Promise<void>;
  requestPermission(): Promise<HealthStatus>;
  syncNow(): Promise<HealthSyncResult>;
  addListener(event: 'synced', fn: (r: HealthSyncResult) => void): Promise<{ remove: () => Promise<void> }>;
}

const HealthSteps = registerPlugin<HealthStepsPlugin>('HealthSteps');

/** The note on the automatic entry (must match HealthSteps.NOTE on the native side). */
export const HEALTH_NOTE = 'Samsung Health';

export const healthSupported = (): boolean =>
  import.meta.env.VITE_PERSONAL_BUILD === '1' && isNativePlatform() && getPlatform() === 'android';

const listeners = new Set<(r: HealthSyncResult) => void>();

/** Screens that show steps refresh themselves when a sync wrote new numbers. */
export function onHealthSync(fn: (r: HealthSyncResult) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function healthStatus(): Promise<HealthStatus | null> {
  if (!healthSupported()) return null;
  try {
    return await HealthSteps.status();
  } catch {
    return null;
  }
}

let syncing: Promise<HealthSyncResult | null> | null = null;

export function syncHealthSteps(): Promise<HealthSyncResult | null> {
  if (!healthSupported()) return Promise.resolve(null);
  if (!syncing) {
    // Screens are told through the native "synced" event (see initHealthSync).
    syncing = HealthSteps.syncNow()
      .catch(() => null)
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
}

export async function connectHealth(): Promise<HealthStatus | null> {
  if (!healthSupported()) return null;
  const s = await HealthSteps.requestPermission();
  if (s.granted) await syncHealthSteps();
  return s;
}

/** Called once at start-up: remember the API address, start the hourly job, sync now (and natively on every return). */
export function initHealthSync(): void {
  if (!healthSupported()) return;
  HealthSteps.configure({ baseUrl: API_BASE_URL, background: true }).catch(() => {});
  void syncHealthSteps();
  // The native side also syncs every time Dashki comes back to the front, and
  // reports each successful sync here so open screens reload.
  void HealthSteps.addListener('synced', (r) => listeners.forEach((fn) => fn(r)));
}
