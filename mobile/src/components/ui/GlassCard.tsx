import { ReactNode } from 'react';
import clsx from 'clsx';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Whether to apply default padding (default: true) */
  padding?: boolean;
  /** Use the warm muted surface instead of pure surface */
  muted?: boolean;
  onClick?: () => void;
}

/**
 * The Dashko "whisper card" — solid surface, thin border, gentle multi-layer
 * shadow. The class name remained `GlassCard` so callers don't need to change,
 * but visually it's no longer a translucent glass element.
 *
 * Verbatim copy of web/src/components/ui/GlassCard.tsx.
 */
export default function GlassCard({
  children,
  className,
  padding = true,
  muted = false,
  onClick,
}: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'transition-colors duration-200',
        padding && 'p-5',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        background: muted ? 'var(--color-surface-warm)' : 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: muted ? 'none' : 'var(--shadow-card)',
        color: 'var(--color-foreground)',
      }}
    >
      {children}
    </div>
  );
}
