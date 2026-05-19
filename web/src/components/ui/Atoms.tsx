import { CSSProperties, ReactNode } from 'react';

// =============================================================
// Dashko design system — shared atoms
// =============================================================

// ─── Pill / Badge ────────────────────────────────────────────

export type PillTone =
  | 'neutral'
  | 'soft'
  | 'primary'
  | 'success'
  | 'warning'
  | 'critical'
  | 'teal'
  | 'pink'
  | 'medium';

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--color-surface-warm)', fg: 'var(--color-muted-foreground)' },
  soft: { bg: 'rgba(0,0,0,0.05)', fg: 'var(--color-muted-foreground)' },
  primary: { bg: 'var(--color-badge-bg)', fg: 'var(--color-badge-text)' },
  success: { bg: 'rgba(26,174,57,0.15)', fg: 'var(--color-success)' },
  warning: { bg: 'rgba(221,91,0,0.15)', fg: 'var(--color-warning)' },
  critical: { bg: 'rgba(201,28,43,0.15)', fg: 'var(--color-critical)' },
  teal: { bg: 'rgba(42,157,153,0.15)', fg: 'var(--color-teal)' },
  pink: { bg: 'rgba(255,100,200,0.15)', fg: 'var(--color-pink)' },
  medium: { bg: 'rgba(0,117,222,0.15)', fg: 'var(--color-primary)' },
};

export function Pill({
  children,
  tone = 'neutral',
  upper,
  outlined,
  dot,
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  upper?: boolean;
  outlined?: boolean;
  dot?: boolean;
  style?: CSSProperties;
}) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 9999,
        fontSize: upper ? 10 : 11,
        fontWeight: 600,
        letterSpacing: upper ? '0.06em' : 0,
        textTransform: upper ? 'uppercase' : 'none',
        background: outlined ? 'transparent' : t.bg,
        color: t.fg,
        border: outlined ? `1px solid ${t.fg}` : 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: t.fg,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  );
}

// ─── MicroLabel ──────────────────────────────────────────────

export function MicroLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-muted-foreground)',
        display: 'inline-block',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── MonoNum ─────────────────────────────────────────────────

export function MonoNum({
  children,
  size = 16,
  color,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontFeatureSettings: '"tnum" 1',
        fontWeight: 700,
        letterSpacing: '-0.5px',
        fontSize: size,
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── EmptyState ──────────────────────────────────────────────

export function EmptyState({
  children,
  dashed = true,
}: {
  children: ReactNode;
  dashed?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-warm)',
        border: `1px ${dashed ? 'dashed' : 'solid'} var(--color-border)`,
        borderRadius: 12,
        padding: '28px 20px',
        textAlign: 'center',
        color: 'var(--color-muted-foreground)',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

// ─── CardShell ───────────────────────────────────────────────
// A whisper card with a title+icon+optional-hint header.

export function CardShell({
  title,
  icon,
  hint,
  children,
  className,
  style,
  padding = 20,
  muted = false,
}: {
  title: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: number;
  muted?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        background: muted ? 'var(--color-surface-warm)' : 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: muted ? 'none' : 'var(--shadow-card)',
        padding,
        color: 'var(--color-foreground)',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.25px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {icon ? (
            <span
              style={{
                color: 'var(--color-muted-foreground)',
                display: 'inline-flex',
              }}
            >
              {icon}
            </span>
          ) : null}
          {title}
        </h2>
        {hint ? (
          typeof hint === 'string' ? (
            <span
              style={{
                color: 'var(--color-muted-foreground)',
                fontSize: 12,
              }}
            >
              {hint}
            </span>
          ) : (
            hint
          )
        ) : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────

export function ProgressBar({
  value,
  max,
  tone = 'primary',
  height = 6,
}: {
  value: number;
  max: number;
  tone?: 'primary' | 'success' | 'warning' | 'critical';
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const color =
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'critical'
      ? 'var(--color-critical)'
      : 'var(--color-primary)';
  return (
    <div
      style={{
        height,
        borderRadius: 9999,
        background: 'var(--color-surface-warm)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 9999,
          transition: 'width 240ms ease-out',
        }}
      />
    </div>
  );
}

// ─── CalorieRing ─────────────────────────────────────────────

export function CalorieRing({
  value,
  target,
  size = 168,
  stroke = 14,
}: {
  value: number;
  target: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / target);
  const dash = c * pct;
  const scale = size / 168;
  const numSize = Math.max(18, Math.round(28 * scale));
  const subSize = Math.max(9, Math.round(11 * scale));
  const leftSize = Math.max(9, Math.round(10 * scale));
  const showLeftLine = size >= 140;
  const over = value > target;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-warm)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--color-critical)' : 'var(--color-primary)'}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 8px',
        }}
      >
        <MonoNum size={numSize} style={{ letterSpacing: '-1px', lineHeight: 1 }}>
          {value.toLocaleString()}
        </MonoNum>
        <div
          style={{
            fontSize: subSize,
            color: 'var(--color-muted-foreground)',
            marginTop: 3,
            lineHeight: 1.1,
          }}
        >
          of {target.toLocaleString()} kcal
        </div>
        {showLeftLine && (
          <div
            style={{
              fontSize: leftSize,
              fontWeight: 600,
              color: over ? 'var(--color-critical)' : 'var(--color-success)',
              marginTop: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {over
              ? `${(value - target).toLocaleString()} over`
              : `${Math.max(0, target - value).toLocaleString()} left`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MacroBar ────────────────────────────────────────────────

export function MacroBar({
  label,
  value,
  target,
  unit = 'g',
  tone,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  tone?: 'primary' | 'success' | 'warning' | 'critical';
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <MicroLabel>{label}</MicroLabel>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
          }}
        >
          <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>
            {value}
          </span>
          <span>
            {' '}
            / {target}
            {unit}
          </span>
        </span>
      </div>
      <ProgressBar value={value} max={target} tone={tone} />
    </div>
  );
}

// ─── Stepper — ±step numeric input (used in modals) ─────────

export function Stepper({
  value,
  onChange,
  min = 0.25,
  max = 99,
  step = 0.25,
  suffix = '×',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const dec = () =>
    onChange(Math.max(min, Math.round((value - step) * 100) / 100));
  const inc = () =>
    onChange(Math.min(max, Math.round((value + step) * 100) / 100));
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={dec}
        type="button"
        className="cursor-pointer"
        style={{
          width: 36,
          height: 36,
          background: 'transparent',
          border: 0,
          color: 'var(--color-foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 600,
        }}
        aria-label="Decrease"
      >
        −
      </button>
      <div
        style={{
          minWidth: 56,
          padding: '0 8px',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontWeight: 700,
          borderLeft: '1px solid var(--color-border)',
          borderRight: '1px solid var(--color-border)',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value}
        {suffix}
      </div>
      <button
        onClick={inc}
        type="button"
        className="cursor-pointer"
        style={{
          width: 36,
          height: 36,
          background: 'transparent',
          border: 0,
          color: 'var(--color-foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 600,
        }}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

// ─── SegmentedControl — radio-like pill row ──────────────────

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
}) {
  const padY = size === 'xs' ? '4px' : '6px';
  const fz = size === 'xs' ? 11 : 12;
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        padding: 3,
        background: 'var(--color-surface-warm)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="cursor-pointer"
            style={{
              flex: 1,
              padding: `${padY} 10px`,
              borderRadius: 4,
              background: active ? 'var(--color-surface)' : 'transparent',
              color: active
                ? 'var(--color-foreground)'
                : 'var(--color-muted-foreground)',
              border: 0,
              fontSize: fz,
              fontWeight: 600,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sparkline ───────────────────────────────────────────────

export function Sparkline({
  data,
  stroke = 'var(--color-primary)',
  height = 32,
  fill = false,
}: {
  data: number[];
  stroke?: string;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length < 2) {
    return <div style={{ height, marginTop: 8 }} />;
  }
  const w = 220;
  const h = height;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (data.length - 1);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
    .join(' ');
  const dFill =
    d + ` L ${pts[pts.length - 1][0]} ${h} L ${pts[0][0]} ${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, marginTop: 8, display: 'block' }}
    >
      {fill && <path d={dFill} fill={stroke} opacity="0.08" />}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
