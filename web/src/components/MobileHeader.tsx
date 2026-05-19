'use client';

import { Menu } from 'lucide-react';

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export default function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-4"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <button
        onClick={onMenuToggle}
        className="cursor-pointer"
        style={{
          padding: 8,
          background: 'transparent',
          border: 0,
          color: 'var(--color-muted-foreground)',
          borderRadius: 4,
        }}
        aria-label="Open navigation menu"
      >
        <Menu style={{ width: 20, height: 20 }} />
      </button>

      <div className="flex-1 flex items-center justify-center gap-2">
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            overflow: 'hidden',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/web/icon-192.png"
            alt="Dashki"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.3px',
            color: 'var(--color-foreground)',
          }}
        >
          Dashki
        </span>
      </div>

      <div className="w-9" aria-hidden="true" />
    </header>
  );
}
