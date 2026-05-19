import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Dashki',
  description:
    'Track your nutrition, weight, and steps — all in one beautiful place.',
  manifest: '/manifest.json',
  icons: {
    icon: '/web/favicon.ico',
    apple: '/web/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dashki',
  },
};

export const viewport: Viewport = {
  themeColor: '#111111',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} dark`}
      data-sidebar="collapsed"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dashki-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
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
