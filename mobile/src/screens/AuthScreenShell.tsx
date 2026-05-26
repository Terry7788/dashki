// Shared layout for sign-in / sign-up / password reset screens.
// Centered card, safe-area aware, Dashki branding at top.

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { GlassCard } from '../components/ui';

export function AuthScreenShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'var(--color-background)',
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      }}
    >
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Sparkles size={22} style={{ color: 'var(--color-primary)' }} aria-hidden />
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.5px',
              color: 'var(--color-foreground)',
            }}
          >
            Dashki
          </span>
        </div>

        <GlassCard>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: 'var(--color-foreground)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: '6px 0 0 0',
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-4">{children}</div>
        </GlassCard>
      </div>
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'rgba(201,28,43,0.08)',
        border: '1px solid rgba(201,28,43,0.3)',
        borderRadius: 6,
        fontSize: 13,
        color: 'var(--color-critical)',
        lineHeight: 1.4,
      }}
      role="alert"
    >
      {message}
    </div>
  );
}
