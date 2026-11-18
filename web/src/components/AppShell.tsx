'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import BottomTabs from '@/components/BottomTabs';
import { THEME_EVENT, THEME_KEY, applyTheme, toggleTheme as flipTheme } from '@/lib/theme';
import { getPreferences } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const isDark = stored !== 'light';
    setDarkMode(isDark);
    applyTheme(isDark);

    getPreferences()
      .then((prefs) => {
        const dbIsDark = prefs.theme !== 'light';
        if (dbIsDark !== isDark) {
          setDarkMode(dbIsDark);
          applyTheme(dbIsDark);
        }
      })
      .catch(() => {});

    const socket = getSocket();
    const onPreferencesUpdated = ({ theme }: { theme: 'dark' | 'light' }) => {
      const incoming = theme !== 'light';
      setDarkMode(incoming);
      applyTheme(incoming);
    };
    socket.on('preferences-updated', onPreferencesUpdated);

    // The More page has its own theme button: keep this copy in step.
    const onThemeEvent = (e: Event) => setDarkMode(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(THEME_EVENT, onThemeEvent);

    return () => {
      socket.off('preferences-updated', onPreferencesUpdated);
      window.removeEventListener(THEME_EVENT, onThemeEvent);
    };
  }, []);

  function toggleTheme() {
    setDarkMode(flipTheme());
  }

  return (
    <body
      className="min-h-screen font-sans antialiased"
      style={{
        background: 'var(--color-background)',
        color: 'var(--color-foreground)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <MobileHeader />

      <div className="flex min-h-screen">
        <Sidebar
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
        />

        <main className="flex-1 sidebar-offset min-h-screen min-w-0">
          <div className="w-full max-w-full pt-14 md:pt-0 overflow-x-hidden has-tabs">
            {children}
          </div>
        </main>
      </div>

      <BottomTabs />
    </body>
  );
}
