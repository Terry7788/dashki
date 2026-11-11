// Mobile app shell — adds the persistent bottom tab bar around protected
// content. Manages the scroll container so the tab bar floats above content.

import type { ReactNode } from 'react';
import BottomTabBar from './BottomTabBar';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        className="dk-main"
        style={{
          minHeight: '100vh',
          // Clear the status bar / camera cutout (edge-to-edge on Android 15+).
          paddingTop: 'calc(var(--dk-sa-t) + 8px)',
          boxSizing: 'border-box',
          // Reserve space at bottom for the tab bar (~56px) + safe area.
          paddingBottom: 'calc(56px + var(--dk-sa-b))',
        }}
      >
        <div className="dk-content">{children}</div>
      </div>
      {/* Solid strip behind the status bar so scrolled content never shows under it. */}
      <div
        aria-hidden
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--dk-sa-t)', background: '#1a1918', zIndex: 35 }}
      />
      <BottomTabBar />
    </>
  );
}
