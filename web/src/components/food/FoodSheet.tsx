'use client';

// Shared parts of the food sheets: Add food, New food and the saved-meal builder
// (Fold 8 redesign, 2026-11-12). Styles are the `.fs-*` block in globals.css.
// Phones (< 700 px): one full-height sheet, the action tray at the bottom.
// From 700 px: a two-pane panel, the side pane on the right holds the action.

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus, Search, X } from 'lucide-react';
import type { Food, MealType, Unit } from '@/lib/types';
import { convertQuantity, nutritionFor } from '@/lib/nutrition';
import { useIsNarrow } from '@/lib/useIsNarrow';

export const WIDE = 700;
export const useIsWide = () => !useIsNarrow(WIDE);

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const y = window.scrollY;
    const b = document.body.style;
    Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', overflow: 'hidden', width: '100%' });
    return () => {
      Object.assign(b, { position: '', top: '', left: '', right: '', overflow: '', width: '' });
      window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior });
    };
  }, [active]);
}

interface FoodSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Wide screens: centred in the header (e.g. the meal bar). Phones: under the title. */
  headerCenter?: ReactNode;
  /** Pinned above the scrolling list (search, tabs, chips). */
  top?: ReactNode;
  children: ReactNode;
  /** Wide screens only: the right-hand pane. */
  side?: ReactNode;
  /** Wide screens only: pinned at the bottom of the side pane. Falls back to `tray`. */
  sideFoot?: ReactNode;
  /** Phones: the floating tray at the bottom (hidden when empty). Wide: shown under the side pane if no sideFoot. */
  tray?: ReactNode;
  /** Phones: a plain footer under the list (buttons), instead of a tray. */
  foot?: ReactNode;
  sideWidth?: number;
  /** Pad the scrolling content (forms). Lists leave it off. */
  padded?: boolean;
}

export function FoodSheet({
  isOpen, onClose, title, subtitle, headerCenter, top, children, side, sideFoot, tray, foot, sideWidth = 320, padded,
}: FoodSheetProps) {
  const wide = useIsWide();
  useScrollLock(isOpen);
  useEffect(() => {
    if (!isOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const hasSide = wide && !!side;
  return (
    <div className="fs-wrap" role="dialog" aria-modal="true" aria-labelledby="fs-title">
      <div className="fs-back" onClick={onClose} aria-hidden="true" />
      <div className="fs-panel" style={{ ['--fs-side' as string]: `${sideWidth}px` }}>
        <div className="fs-grab" />
        <div className="fs-head">
          <div style={{ minWidth: 0, flex: wide ? 'none' : 1 }}>
            <h2 id="fs-title" className="fs-title">{title}</h2>
            {subtitle && <div className="fs-sub">{subtitle}</div>}
          </div>
          {wide ? <div className="fs-headmid">{headerCenter}</div> : null}
          <button type="button" className="fs-x" onClick={onClose} aria-label="Close">
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div className={`fs-body${hasSide ? ' has-side' : ''}`}>
          <div className="fs-main">
            {(top || (!wide && headerCenter)) && (
              <div className="fs-top">
                {!wide && headerCenter}
                {top}
              </div>
            )}
            <div className={`fs-scroll${padded ? ' fs-pad' : ''}`}>{children}</div>
            {!hasSide && wide && (sideFoot || tray) && <div className="fs-side-foot" style={{ display: 'flex' }}>{sideFoot ?? tray}</div>}
            {!wide && tray && <div className="fs-tray">{tray}</div>}
            {!wide && foot && <div className="fs-foot">{foot}</div>}
            {wide && !hasSide && foot && <div className="fs-foot">{foot}</div>}
          </div>
          {hasSide && (
            <div className="fs-side">
              <div className="fs-scroll">{side}</div>
              {(sideFoot || tray || foot) && <div className="fs-side-foot">{sideFoot ?? tray ?? foot}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Seg<T extends string>({
  options, value, onChange, primary, small, label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  primary?: boolean;
  small?: boolean;
  label?: string;
}) {
  return (
    <div className={`fs-seg${primary ? ' primary' : ''}${small ? ' sm' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MealBar({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) {
  return (
    <Seg primary label="Meal" value={value} onChange={onChange}
      options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} />
  );
}

export function SearchBox({
  value, onChange, placeholder, autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Only focus on devices with a real keyboard; on phones it would pop the keyboard over the list.
    if (!autoFocus || !window.matchMedia('(hover: hover)').matches) return;
    const t = setTimeout(() => ref.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [autoFocus]);
  return (
    <div className="fs-search">
      <Search />
      <input ref={ref} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} enterKeyHint="search" />
      {value && (
        <button type="button" className="fs-clear" onClick={() => onChange('')} aria-label="Clear search">
          <X style={{ width: 16, height: 16 }} />
        </button>
      )}
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="fs-chips">
      {options.map((t) => (
        <button key={t} type="button" className={`fs-chip${t === value ? ' on' : ''}`} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}

/** A number box with a unit on the right. `big` for the headline number (calories). */
export function NumBox({
  label, value, onChange, unit, big, placeholder = '0', step = 'any', style,
}: {
  label: ReactNode; value: string; onChange: (v: string) => void; unit?: ReactNode; big?: boolean;
  placeholder?: string; step?: string; style?: React.CSSProperties;
}) {
  return (
    <label className="fs-field" style={style}>
      <span className="fs-label">{label}</span>
      <span className={`fs-num${big ? ' big' : ''}`}>
        <input type="number" inputMode="decimal" min={0} step={step} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
        {unit && <span className="u">{unit}</span>}
      </span>
    </label>
  );
}

export function TextBox({
  label, value, onChange, placeholder, autoFocus,
}: { label?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="fs-field">
      {label && <span className="fs-label">{label}</span>}
      <input className="fs-input" type="text" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`fs-toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} />;
}

/** − value + with the unit after it. Steps by `step` (0.5 serving, 10 g). */
export function Stepper({
  value, onChange, step = 1, min = 0, unit,
}: { value: number; onChange: (v: number) => void; step?: number; min?: number; unit?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === 0 ? '' : String(Math.round(value * 100) / 100));
  const set = (n: number) => onChange(Math.max(min, Math.round(n * 100) / 100));
  return (
    <span className="fs-step" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Less" disabled={value <= min} onClick={() => set(value - step)}>
        <Minus style={{ width: 16, height: 16 }} />
      </button>
      <input type="number" inputMode="decimal" min={min} step="any" value={shown} placeholder="0"
        style={{ width: Math.max(44, shown.length * 10 + 24) }}
        onFocus={(e) => { setDraft(shown); e.target.select(); }}
        onChange={(e) => { setDraft(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) onChange(n); }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {unit && <span className="u">{unit}</span>}
      <button type="button" aria-label="More" onClick={() => set(value + step)}>
        <Plus style={{ width: 16, height: 16 }} />
      </button>
    </span>
  );
}

// ─── Food amounts ───────────────────────────────────────────────────────────

export function calcFood(food: Food) {
  return {
    base_amount: food.base_amount ?? food.baseAmount ?? 100,
    base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
    serving_size_g: food.serving_size_g ?? null,
    calories: food.calories ?? 0,
    protein: food.protein ?? null,
  };
}

export function foodTotals(food: Food, quantity: number, unit: Unit) {
  try { return nutritionFor(calcFood(food), quantity, unit); } catch { return { calories: 0, protein: 0 }; }
}

export function unitsOf(food: Food) {
  return food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
}

export function defaultAmount(food: Food): { quantity: number; unit: Unit } {
  const units = unitsOf(food);
  const def = units.find((u) => u.default) ?? units[0];
  return { quantity: def.unit === 'serving' ? 1 : food.base_amount ?? food.baseAmount ?? 100, unit: def.unit };
}

/** Same rules as QuantityInput: to g/ml starts empty (they're about to weigh it), to serving keeps the converted amount. */
export function switchUnit(food: Food, quantity: number, from: Unit, to: Unit): { quantity: number; unit: Unit } {
  if (to === from) return { quantity, unit: from };
  if (to === 'g' || to === 'ml') return { quantity: 0, unit: to };
  try {
    let c = convertQuantity(calcFood(food), quantity, from, to);
    c = Math.round(c * 2) / 2;
    return { quantity: c === 0 ? 0.5 : c, unit: to };
  } catch {
    return { quantity, unit: to };
  }
}

/** Stepper + unit switch for one food (serving steps by 0.5, g/ml by 10). */
export function FoodAmount({
  food, quantity, unit, onChange, showKcal,
}: { food: Food; quantity: number; unit: Unit; onChange: (n: { quantity: number; unit: Unit }) => void; showKcal?: boolean }) {
  const units = unitsOf(food);
  const kcal = foodTotals(food, quantity, unit).calories;
  return (
    <>
      <Stepper value={quantity} step={unit === 'serving' ? 0.5 : 10} unit={unit === 'serving' ? undefined : unit}
        onChange={(q) => onChange({ quantity: q, unit })} />
      {units.length === 1 && <span className="fs-meta">{units[0].label}</span>}
      <span style={{ flex: 1 }} />
      {showKcal && <span className="fs-kcal" style={{ color: 'var(--color-primary)' }}>{Math.round(kcal)} kcal</span>}
      {units.length > 1 && (
        <div style={{ flexBasis: '100%', minWidth: 0 }}>
          <Seg small value={unit} onChange={(u) => onChange(switchUnit(food, quantity, unit, u))}
            options={units.map((u) => ({ value: u.unit, label: u.label }))} />
        </div>
      )}
    </>
  );
}
