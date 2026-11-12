// Personal-build update check (Terry's own APK, VITE_PERSONAL_BUILD=1).
// The Mac mini's dashboard lists the newest APK of each of Terry's Android
// apps; it's only reachable over Tailscale, so off the tailnet this quietly
// does nothing. "Later" hides that version for a day.

import { Capacitor } from '@capacitor/core';

const LIST = 'https://terrys-mac-mini.tail4abd3b.ts.net:3000/api/android/apps';

export async function checkForUpdate(appKey: string): Promise<void> {
  if (import.meta.env.VITE_PERSONAL_BUILD !== '1' || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const current = Number(import.meta.env.VITE_APP_VERSION_CODE || 0);
  try {
    const later = JSON.parse(localStorage.getItem('update.later') || 'null');
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(LIST, { signal: ctl.signal, cache: 'no-store' });
    const info = (await res.json())?.apps?.[appKey];
    if (!info || !(info.versionCode > current)) return;
    if (later && later.code === info.versionCode && Date.now() - later.at < 86_400_000) return;
    const msg = `Dashki ${info.versionName} is ready${info.notes ? `:\n\n${info.notes}` : '.'}\n\nInstall it now?`;
    if (window.confirm(`Update available\n\n${msg}`)) {
      // Home's App updates screen installs it (Home 1.12+). Going through the browser would make the
      // browser the installer and switch off the silent updates Home does after each new build.
      window.location.href = 'terryhome://updates';
    } else {
      localStorage.setItem('update.later', JSON.stringify({ code: info.versionCode, at: Date.now() }));
    }
  } catch {
    /* off the tailnet / Mac mini unreachable */
  }
}
