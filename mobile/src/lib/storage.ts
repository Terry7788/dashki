// Cross-platform key/value storage.
// Uses Capacitor Preferences when running in the native shell (iOS Keychain,
// Android EncryptedSharedPreferences); falls back to localStorage for browser
// dev (`npm run dev`).

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export async function storageGet(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return Promise.resolve(localStorage.getItem(key));
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function storageRemove(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}

// ─── Well-known keys ──────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'dashki.auth.token',
  AUTH_EXPIRES_AT: 'dashki.auth.expires_at',
  AUTH_GUEST_MODE: 'dashki.auth.guest_mode',
} as const;
