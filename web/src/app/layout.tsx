import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Dashki — Personal Life Dashboard',
  description:
    'Track your nutrition, fitness, todos, and more — all in one beautiful place.',
  manifest: '/manifest.json',
  icons: {
    icon: '/web/favicon.ico',
    apple: '/web/apple-touch-icon.png',
  },
  // iOS PWA: when added to home screen, render in standalone mode with a
  // translucent status bar so the page background bleeds underneath.
  // Combined with the dark themeColor below, the status bar area looks
  // seamlessly continuous with the dark dashboard background.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dashki',
  },
};

export const viewport: Viewport = {
  // Matches --bg-100 in dark mode (web/src/app/globals.css). When iOS adds
  // the site to the home screen, this controls the colour of the status bar
  // background and any system chrome around the PWA frame.
  themeColor: '#111111',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * Default classes:
     *  - "dark"            → dark mode enabled by default (overridden by inline script if user chose light)
     *  - data-sidebar="collapsed" → sidebar collapsed by default (overridden by Sidebar component on mount)
     */
    <html lang="en" className={`${inter.variable} dark`} data-sidebar="collapsed">
      {/* Inline scripts run before first paint to prevent flash */}
      <head>
        {/* Restore theme preference */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dashki-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Restore sidebar collapsed preference (default: collapsed) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('dashki-sidebar-collapsed');var collapsed=(s!==null?s==='true':true);if(collapsed){document.documentElement.setAttribute('data-sidebar','collapsed')}else{document.documentElement.removeAttribute('data-sidebar')}}catch(e){}})()`,
          }}
        />
      </head>
      <AppShell>{children}</AppShell>
    </html>
  );
}
