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
          // Reserve space at bottom for the tab bar (~56px) + safe area.
          paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="dk-content">{children}</div>
      </div>
      <BottomTabBar />
    </>
  );
}
