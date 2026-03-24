import type { Metadata } from 'next';
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
  icons: {
    icon: '/favicon.ico',
  },
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
