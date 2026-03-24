import { ReactNode, ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'default' | 'primary' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface GlassButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  className?: string;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
}

const variantClasses: Record<Variant, string> = {
  default:
    // Light
    'bg-black/[0.06] hover:bg-black/[0.10] border border-black/[0.12] text-gray-800 ' +
    // Dark
    'dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:border-white/[0.12] dark:text-white',
  primary:
    'bg-gradient-to-r from-[#2E8B57] to-[#345e37] hover:from-[#61bc84] hover:to-[#2E8B57] border border-[#2E8B57]/30 text-white shadow-lg shadow-[#2E8B57]/25 hover:shadow-[0_4px_20px_rgba(46,139,87,0.25)]',
  danger:
    'bg-red-500/10 hover:bg-red-500/20 border border-red-400/30 text-red-600 hover:text-red-700 ' +
    'dark:bg-red-500/15 dark:hover:bg-red-500/25 dark:text-red-300 dark:hover:text-red-200',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-5 py-2.5 text-sm rounded-2xl',
  lg: 'px-7 py-3.5 text-base rounded-2xl',
};

export default function GlassButton({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled = false,
  className,
  type = 'button',
}: GlassButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'font-medium transition-all duration-300 active:scale-95 select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </button>
  );
}
