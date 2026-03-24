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
        'backdrop-blur-xl rounded-3xl shadow-2xl transition-all duration-300 ease-out',
        'bg-white/70 border border-black/[0.06] text-gray-900',
        'hover:shadow-lg hover:border-black/10 hover:-translate-y-0.5',
        // Dark mode overrides
        'dark:bg-white/[0.04] dark:border-white/[0.08] dark:text-white',
        'dark:hover:border-white/20',
        padding && 'p-6',
        onClick && 'cursor-pointer hover:bg-white/80 dark:hover:bg-white/[0.07]',
        className
      )}
    >
      {children}
    </div>
  );
}
