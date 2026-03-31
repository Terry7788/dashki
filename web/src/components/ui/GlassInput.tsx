import { InputHTMLAttributes, ChangeEvent } from 'react';
import clsx from 'clsx';

interface GlassInputProps {
  label?: string;
  placeholder?: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: InputHTMLAttributes<HTMLInputElement>['type'];
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
  name?: string;
  id?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}

export default function GlassInput({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  inputMode,
  className,
  name,
  id,
  min,
  max,
  step,
  required,
  disabled,
  autoComplete,
}: GlassInputProps) {
  const inputId = id || name || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[#313d44] dark:text-white/60 pl-1"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className={clsx(
          'w-full px-4 py-3 rounded-2xl transition-all duration-200',
          // Light mode
          'bg-[#f5f4f1] border border-[#cccbc8] text-[#1d1c1c] placeholder-[#313d44]/45',
          'focus:outline-none focus:ring-2 focus:ring-[#71c4ef]/40 focus:border-[#00668c]/60',
          // Dark mode
          'dark:bg-white/[0.06] dark:border-white/[0.12] dark:text-white dark:placeholder-white/40',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      />
    </div>
  );
}
