import { updatePreferences } from '@/lib/api';

export const THEME_KEY = 'dashki-theme';
/** Fired on `window` whenever the theme changes, so every toggle button stays in step. */
export const THEME_EVENT = 'dashki-theme-change';

export function isDarkNow(): boolean {
  return typeof document === 'undefined' ? true : document.documentElement.classList.contains('dark');
}

/** Applies the theme to the page and remembers it on this device. */
export function applyTheme(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: isDark }));
}

/** Flips the theme and saves the choice to the server. */
export function toggleTheme(): boolean {
  const next = !isDarkNow();
  applyTheme(next);
  updatePreferences({ theme: next ? 'dark' : 'light' }).catch(() => {});
  return next;
}
