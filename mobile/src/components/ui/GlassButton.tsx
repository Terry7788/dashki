// Copied from web/src/components/ui/GlassButton.tsx — 'use client' directive
// stripped since it's a Next.js-specific marker and a no-op in Vite.
import { ReactNode, ButtonHTMLAttributes, useState } from 'react';
import clsx from 'clsx';

type Variant = 'default' | 'primary' | 'danger' | 'outline' | 'ghost' | 'soft';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface GlassButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  className?: string;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  title?: string;
}

const SIZES: Record<Size, { padding: string; font: number }> = {
  xs: { padding: '4px 10px', font: 11 },
  sm: { padding: '6px 12px', font: 13 },
  md: { padding: '8px 16px', font: 14 },
  lg: { padding: '10px 20px', font: 15 },
};

interface VariantStyle {
  bg: string;
  color: string;
  border: string;
  hoverBg: string;
}

const VARIANTS: Record<Variant, VariantStyle> = {
  primary: {
    bg: 'var(--color-primary)',
    color: 'var(--color-primary-foreground)',
    border: '1px solid transparent',
    hoverBg: 'var(--color-primary-hover)',
  },
  default: {
    bg: 'var(--color-soft)',
    color: 'var(--color-foreground)',
    border: '1px solid transparent',
    hoverBg: 'var(--color-soft-strong)',
  },
  soft: {
    bg: 'var(--color-soft)',
    color: 'var(--color-foreground)',
    border: '1px solid transparent',
    hoverBg: 'var(--color-soft-strong)',
  },
  outline: {
    bg: 'var(--color-surface)',
    color: 'var(--color-foreground)',
    border: '1px solid var(--color-border)',
    hoverBg: 'var(--color-surface-warm)',
  },
  ghost: {
    bg: 'transparent',
    color: 'var(--color-foreground)',
    border: '1px solid transparent',
    hoverBg: 'var(--color-soft)',
  },
  danger: {
    bg: 'rgba(201,28,43,0.12)',
    color: 'var(--color-critical)',
    border: '1px solid transparent',
    hoverBg: 'rgba(201,28,43,0.22)',
  },
};

export default function GlassButton({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled = false,
  className,
  type = 'button',
  title,
}: GlassButtonProps) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  const v = VARIANTS[variant] ?? VARIANTS.default;
  const s = SIZES[size] ?? SIZES.md;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 select-none',
        'font-semibold',
        disabled && 'cursor-not-allowed',
        !disabled && 'cursor-pointer',
        className,
      )}
      style={{
        padding: s.padding,
        fontSize: s.font,
        borderRadius: 4,
        background: hover && !disabled ? v.hoverBg : v.bg,
        color: v.color,
        border: v.border,
        opacity: disabled ? 0.5 : 1,
        transform: pressed && !disabled ? 'scale(0.97)' : 'none',
        transition: 'background 120ms ease-out, transform 80ms ease-out',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
