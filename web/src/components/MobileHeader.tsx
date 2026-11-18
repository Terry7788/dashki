'use client';

// Phone header (under 768 px): just the logo. Navigation is the tab bar at the bottom.
export default function MobileHeader() {
  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-center gap-2 px-4"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
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
    </header>
  );
}
