// Thin wrappers around Capacitor native plugins.
//
// Each function gracefully no-ops or falls back when running in a browser
// (npm run dev), so the same screens work in both contexts. The native
// behavior kicks in once the app is running inside the Capacitor WebView
// on a real device.
//
// Phase 4 (DSHKI-62) scope: camera label scanning.
// Push notifications, biometric auth, and HealthKit are stubbed out below
// — they need real credentials from Apple/Google dev accounts (DSHKI-50)
// and will be wired in a follow-up commit.

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();
export const getPlatform = (): string => Capacitor.getPlatform();

// ─── Camera ──────────────────────────────────────────────────────────────

/**
 * Capture a nutrition label photo. On native devices uses Capacitor's
 * Camera plugin with rear camera + reasonable defaults. In browser dev
 * (`npm run dev`) opens an `<input type="file" accept="image/*" capture>`
 * fallback that triggers the OS camera/file picker.
 *
 * Returns the image as a base64 data URL ready to POST to /api/ai/scan-label.
 * Returns null if the user cancels.
 */
export async function captureLabel(): Promise<string | null> {
  if (isNativePlatform()) {
    try {
      const photo = await Camera.getPhoto({
        quality: 75,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        // The CornerStone of label scanning UX — start with rear camera, no
        // gallery prompt (label scan is always "take a photo right now").
        saveToGallery: false,
        correctOrientation: true,
        width: 1600,
        // Capacitor 6 ignores presentation style on non-iOS; safe to set.
        presentationStyle: 'fullscreen',
      });
      return photo.dataUrl ?? null;
    } catch (err) {
      // User cancellation throws — convert to null so callers can react.
      const message = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(message) || /User/i.test(message)) return null;
      throw err;
    }
  }

  // Browser fallback — works in Chrome on iOS for `<input capture>`.
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // The `capture` attribute hints to mobile browsers to open the camera
    // directly. Desktop browsers will show a file picker.
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    // If the dialog is dismissed without a file selection on some browsers,
    // we never hear about it. Detect via `focus` returning to window.
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          window.removeEventListener('focus', onFocus);
          resolve(null);
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus, { once: true });

    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      try {
        document.body.removeChild(input);
      } catch {
        /* removed already */
      }
    }, 60_000);
  });
}

// ─── Stubs for credentialled plugins (Phase 4 follow-up) ─────────────────

/**
 * Register for push notifications. Currently a no-op stub.
 *
 * TODO_CREDENTIALS:
 *   - iOS: needs APNs auth key from Apple Developer account (DSHKI-50)
 *   - Android: needs FCM Server Key from Google Cloud (DSHKI-50)
 *   - Both: needs the @capacitor/push-notifications plugin installed and
 *     server-side handler to broker tokens
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!isNativePlatform()) return;
  // eslint-disable-next-line no-console
  console.info('[native] push notifications not yet implemented — see DSHKI-50');
}

/**
 * Prompt the user to unlock with biometric (Face ID / Touch ID / fingerprint).
 * Currently a no-op stub. Wire @capacitor-community/biometric-auth once Apple
 * Developer account is active.
 */
export async function biometricUnlock(_reason: string): Promise<boolean> {
  if (!isNativePlatform()) return false;
  // eslint-disable-next-line no-console
  console.info('[native] biometric unlock not yet implemented — see DSHKI-62');
  return false;
}

/**
 * Read recent weight + step samples from HealthKit / Google Fit.
 * Currently a no-op stub.
 *
 * TODO_CREDENTIALS:
 *   - iOS: needs HealthKit entitlement enabled in Apple Developer portal
 *   - Android: needs Health Connect API key + user consent
 */
export interface HealthSamples {
  weight_kg: { date: string; value: number }[];
  steps: { date: string; value: number }[];
}
export async function readHealthSamples(_days = 30): Promise<HealthSamples> {
  if (!isNativePlatform()) return { weight_kg: [], steps: [] };
  // eslint-disable-next-line no-console
  console.info('[native] HealthKit / Google Fit read not yet implemented');
  return { weight_kg: [], steps: [] };
}
