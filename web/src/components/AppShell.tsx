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
          localStorage.setItem(THEME_KEY, prefs.theme);
        }
      })
      .catch(() => {});

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
    <body
      className="min-h-screen font-sans antialiased"
      style={{
        background: 'var(--color-background)',
        color: 'var(--color-foreground)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <MobileHeader onMenuToggle={() => setSidebarOpen(true)} />

      <div className="flex min-h-screen">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
        />

        <main className="flex-1 sidebar-offset min-h-screen min-w-0">
          <div className="w-full max-w-full pt-14 md:pt-0 overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    </body>
  );
}
