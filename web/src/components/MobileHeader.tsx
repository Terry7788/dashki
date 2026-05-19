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
            background:
              'linear-gradient(135deg, var(--color-primary) 0%, var(--color-teal) 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.2)',
          }}
        >
          <svg viewBox="0 0 32 32" width={18} height={18} aria-hidden>
            <g
              stroke="#ffffff"
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            >
              <line x1="16" y1="16" x2="16" y2="7" />
              <line x1="16" y1="16" x2="25" y2="16" />
              <line x1="16" y1="16" x2="16" y2="25" />
              <line x1="16" y1="16" x2="7" y2="16" />
            </g>
            <g fill="#ffffff">
              <circle cx="16" cy="16" r="2.8" />
              <circle cx="16" cy="6" r="1.9" />
              <circle cx="26" cy="16" r="1.9" />
              <circle cx="16" cy="26" r="1.9" />
              <circle cx="6" cy="16" r="1.9" />
            </g>
          </svg>
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
