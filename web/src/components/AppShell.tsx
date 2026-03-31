'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import { getPreferences, updatePreferences } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const THEME_KEY = 'dashki-theme';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  function applyTheme(isDark: boolean) {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Load persisted theme on mount, sync from DB, and listen for cross-device changes
  useEffect(() => {
    // 1. Apply localStorage theme immediately (anti-flash, same as inline script)
    const stored = localStorage.getItem(THEME_KEY);
    const isDark = stored !== 'light';
    setDarkMode(isDark);
    applyTheme(isDark);

    // 2. Sync from DB (may differ if another device changed the theme)
    getPreferences()
      .then((prefs) => {
        const dbIsDark = prefs.theme !== 'light';
        if (dbIsDark !== isDark) {
          setDarkMode(dbIsDark);
          applyTheme(dbIsDark);
          localStorage.setItem(THEME_KEY, prefs.theme);
        }
      })
      .catch(() => {
        // Server unavailable — localStorage value is fine
      });

    // 3. Listen for real-time theme changes from other devices
    const socket = getSocket();
    const onPreferencesUpdated = ({ theme }: { theme: 'dark' | 'light' }) => {
      const incoming = theme !== 'light';
      setDarkMode(incoming);
      applyTheme(incoming);
      localStorage.setItem(THEME_KEY, theme);
    };
    socket.on('preferences-updated', onPreferencesUpdated);

    return () => {
      socket.off('preferences-updated', onPreferencesUpdated);
    };
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    const themeVal: 'dark' | 'light' = next ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, themeVal);
    applyTheme(next);
    updatePreferences({ theme: themeVal }).catch(() => {});
  }

  return (
    <body className="min-h-screen font-sans antialiased" style={{ color: 'var(--text-100)' }}>

      {/* ── Animated Background ───────────────────────────── */}
      <div
        className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-[#111111] dark:via-[#1a1a1a] dark:to-[#111111] bg-gradient-to-br from-[#fffefb] via-[#f5f4f1] to-[#fffefb]"
        aria-hidden="true"
      >
        {/* Blobs — dark mode: dark grey; light mode: soft grey */}
        <div
          className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full blur-3xl animate-blob-1 dark:opacity-[0.08] opacity-[0.07]"
          style={{ backgroundColor: darkMode ? '#2d2d2d' : '#b6ccd8' }}
        />
        <div
          className="absolute -bottom-40 -right-32 w-[700px] h-[700px] rounded-full blur-3xl animate-blob-2 dark:opacity-[0.08] opacity-[0.07]"
          style={{ backgroundColor: darkMode ? '#2d2d2d' : '#b6ccd8' }}
        />
        <div
          className="absolute top-1/2 right-1/4 w-[500px] h-[500px] rounded-full blur-3xl animate-blob-3 dark:opacity-[0.06] opacity-[0.05]"
          style={{ backgroundColor: darkMode ? '#2d2d2d' : '#b6ccd8' }}
        />
      </div>

      {/* ── Mobile Header ─────────────────────────────────── */}
      <MobileHeader onMenuToggle={() => setSidebarOpen(true)} />

      {/* ── Layout Shell ─────────────────────────────────── */}
      <div className="flex min-h-screen">

        {/* Sidebar (desktop collapsible + mobile drawer) */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
        />

        {/* Main content area — offset managed via CSS sidebar-offset class */}
        <main className="flex-1 sidebar-offset pb-6 md:pb-0 min-h-screen min-w-0 animate-fade-in">
          <div className="w-full max-w-full px-4 sm:px-6 lg:px-8 py-6 pt-16 md:pt-6 overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>

    </body>
  );
}
