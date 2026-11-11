// Steps from Samsung Health via Android's Health Connect (personal Android
// build only). The native side (android/.../health/HealthSteps.kt) reads the
// phone's daily step total and keeps ONE "Samsung Health" log entry per day up
// to date — on app start, when the app comes back to the front, and hourly in
// the background. Elsewhere (web dev, iOS, other builds) everything here is a no-op.

import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from './config';

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
  addListener(event: 'route', fn: (r: { route: string }) => void): Promise<{ remove: () => Promise<void> }>;
  takeRoute(): Promise<{ route?: string }>;
  setTheme(opts: { dark: boolean }): Promise<void>;
}

const HealthSteps = registerPlugin<HealthStepsPlugin>('HealthSteps');

/** The note on the automatic entry (must match HealthSteps.NOTE on the native side). */
export const HEALTH_NOTE = 'Samsung Health';

export const healthSupported = (): boolean =>
  import.meta.env.VITE_PERSONAL_BUILD === '1' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

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

/** Pages opened from Dashki's home-screen widgets, both when already running and on a cold start. */
export function initWidgetRoutes(go: (route: string) => void): void {
  if (!healthSupported()) return;
  void HealthSteps.takeRoute().then((r) => r.route && go(r.route)).catch(() => {});
  void HealthSteps.addListener('route', (r) => go(r.route));
}

/** Keep Android's status/gesture bar strips the colour of the page (the website switches light/dark on <html class="dark">). */
export function initThemeBars(): void {
  if (!healthSupported()) return;
  const html = document.documentElement;
  let last: boolean | null = null;
  const apply = () => {
    const dark = html.classList.contains('dark');
    if (dark === last) return;
    last = dark;
    HealthSteps.setTheme({ dark }).catch(() => {});
  };
  apply();
  new MutationObserver(apply).observe(html, { attributes: true, attributeFilter: ['class'] });
}
