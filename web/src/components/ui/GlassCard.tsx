import { ReactNode } from 'react';
import clsx from 'clsx';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Whether to apply default padding (default: true) */
  padding?: boolean;
  onClick?: () => void;
}

export default function GlassCard({
  children,
  className,
  padding = true,
  onClick,
}: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        // Base — light mode
        'rounded-3xl transition-all duration-300 ease-out',
        'bg-[#fffefb] border border-[#cccbc8]/50 text-[#1d1c1c] shadow-sm',
        'hover:border-[#b6ccd8] hover:-translate-y-0.5 hover:shadow-md',
        // Dark mode overrides
        'dark:backdrop-blur-xl dark:shadow-2xl dark:bg-white/[0.04] dark:border-white/[0.08] dark:text-white',
        'dark:hover:border-white/20 dark:hover:shadow-2xl',
        padding && 'p-6',
        onClick && 'cursor-pointer hover:bg-[#d4eaf7]/40 dark:hover:bg-white/[0.07]',
        className
      )}
    >
      {children}
    </div>
  );
}
