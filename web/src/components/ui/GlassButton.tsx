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
    'bg-[#f5f4f1] hover:bg-[#d4eaf7] border border-[#cccbc8] text-[#1d1c1c] ' +
    // Dark
    'dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:border-white/[0.12] dark:text-white',
  primary:
    // Light — use text-[#ffffff] not text-white to bypass the global light-mode text override
    'bg-gradient-to-r from-[#00668c] to-[#004d6e] hover:from-[#0077a3] hover:to-[#00668c] border border-[#00668c]/30 text-[#ffffff] shadow-md shadow-[#00668c]/20 hover:shadow-[0_4px_16px_rgba(0,102,140,0.25)] ' +
    // Dark
    'dark:from-[#2E8B57] dark:to-[#345e37] dark:hover:from-[#61bc84] dark:hover:to-[#2E8B57] dark:border-[#2E8B57]/30 dark:shadow-[#2E8B57]/25 dark:hover:shadow-[0_4px_20px_rgba(46,139,87,0.25)]',
  danger:
    'bg-red-500/10 hover:bg-red-500/20 border border-red-400/30 text-red-700 hover:text-red-800 ' +
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
