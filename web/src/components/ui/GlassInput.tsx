import { InputHTMLAttributes, ChangeEvent, KeyboardEvent } from 'react';
import clsx from 'clsx';

interface GlassInputProps {
  label?: string;
  placeholder?: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  type?: InputHTMLAttributes<HTMLInputElement>['type'];
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  className?: string;
  name?: string;
  id?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}

export default function GlassInput({
  label,
  placeholder,
  value,
  onChange,
  onKeyDown,
  type = 'text',
  inputMode,
  className,
  name,
  id,
  min,
  max,
  step,
  maxLength,
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
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-muted-foreground)',
            paddingLeft: 2,
          }}
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
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className="w-full transition-colors duration-150"
        style={{
          padding: '8px 12px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          color: 'var(--color-foreground)',
          fontFamily: 'inherit',
          fontSize: 14,
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  );
}
