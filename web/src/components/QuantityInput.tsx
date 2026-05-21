'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { Food, Unit } from '@/lib/types';
import { nutritionFor, convertQuantity } from '@/lib/nutrition';

interface QuantityInputProps {
  food: Food;
  quantity: number;
  unit: Unit;
  onChange: (next: { quantity: number; unit: Unit }) => void;
}

export function QuantityInput({ food, quantity, unit, onChange }: QuantityInputProps) {
  const [editingCustom, setEditingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState(String(quantity));

  const units = food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
  const showToggle = units.length > 1;

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  // Fires on each keystroke while the input is focused — keeps parent state
  // (and the live kcal preview) in sync with what the user is typing.
  // Empty / unparseable values don't propagate (parent keeps its last good
  // quantity), so the preview shows the previous valid number rather than 0.
  const updateDraft = (next: string) => {
    setCustomDraft(next);
    const n = parseFloat(next);
    if (Number.isFinite(n) && n >= 0) onChange({ quantity: n, unit });
  };

  const commitCustom = () => {
    const n = parseFloat(customDraft);
    if (Number.isFinite(n) && n >= 0) onChange({ quantity: n, unit });
    setEditingCustom(false);
  };

  const switchUnit = (toUnit: Unit) => {
    if (toUnit === unit) return;

    // Switching to g or ml: clear the field so the user types a fresh
    // weighed amount (the converted-from-servings number is rarely what
    // they want — they're about to put the food on a scale). 0 is allowed
    // as a transient empty state; the "Add" button validates non-zero
    // before committing the entry.
    if (toUnit === 'g' || toUnit === 'ml') {
      onChange({ quantity: 0, unit: toUnit });
      setCustomDraft('');
      return;
    }

    // Switching to serving: keep the converted value as a starting point
    // (a useful round-to-.5 estimate the user can nudge from). 0 still
    // not allowed for serving — bumped to 0.5 so the field has a value.
    try {
      const foodForCalc = {
        base_amount: food.base_amount ?? food.baseAmount ?? 100,
        base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
        serving_size_g: food.serving_size_g ?? null,
        calories: food.calories ?? 0,
        protein: food.protein ?? null,
      };
      let converted = convertQuantity(foodForCalc, quantity, unit, toUnit);
      converted = Math.round(converted * 2) / 2; // nearest 0.5
      if (converted === 0) converted = 0.5;
      onChange({ quantity: converted, unit: toUnit });
      setCustomDraft(String(converted));
    } catch {
      // Conversion impossible → just switch unit, keep quantity
      onChange({ quantity, unit: toUnit });
    }
  };

  // Live macro preview
  let kcalPreview: number | null = null;
  try {
    const foodForCalc = {
      base_amount: food.base_amount ?? food.baseAmount ?? 100,
      base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
      serving_size_g: food.serving_size_g ?? null,
      calories: food.calories ?? 0,
      protein: food.protein ?? null,
    };
    kcalPreview = nutritionFor(foodForCalc, quantity, unit).calories;
  } catch { /* ignore — invalid combo */ }

  const isServingMode = unit === 'serving';

  // ─── Dashko-tokenised inline styles ─────────────────────────
  const stepperBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    background: 'var(--color-surface-warm)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-foreground)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background-color 120ms',
  };

  const fieldStyle: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: 'var(--color-foreground)',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
    outline: 'none',
  };

  return (
    <div
      onClick={stop}
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isServingMode ? (
          <>
            <button
              type="button"
              onClick={(e) => { stop(e); onChange({ quantity: Math.max(0, quantity - 0.5), unit }); }}
              aria-label="Decrease"
              disabled={quantity <= 0}
              style={{ ...stepperBtnStyle, opacity: quantity <= 0 ? 0.4 : 1, cursor: quantity <= 0 ? 'not-allowed' : 'pointer' }}
            >
              <Minus style={{ width: 14, height: 14 }} />
            </button>

            {editingCustom ? (
              <input
                type="number" inputMode="decimal" min={0} step={0.1} autoFocus
                value={customDraft}
                onChange={(e) => updateDraft(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCustom();
                  if (e.key === 'Escape') { setCustomDraft(String(quantity)); setEditingCustom(false); }
                }}
                onClick={stop}
                style={{ ...fieldStyle, width: 64, borderColor: 'var(--color-primary)' }}
                className="tabular-nums"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => { stop(e); setCustomDraft(String(quantity)); setEditingCustom(true); }}
                style={{
                  minWidth: 56,
                  padding: '6px 10px',
                  background: 'transparent',
                  border: 0,
                  borderRadius: 4,
                  color: 'var(--color-foreground)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                className="tabular-nums"
              >
                {quantity === 0 ? '—' : Number.isInteger(quantity) ? quantity : quantity.toFixed(1)}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => { stop(e); onChange({ quantity: quantity + 0.5, unit }); }}
              aria-label="Increase"
              style={stepperBtnStyle}
            >
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </>
        ) : (
          // g / ml mode — single tap-to-type field, no stepper
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={editingCustom ? customDraft : (quantity === 0 ? '' : String(quantity))}
            // When quantity is 0 (i.e. the field is showing the placeholder),
            // focus into an empty draft so the first keystroke is the user's
            // own digit — not the cursor sitting after a pre-filled "0".
            onFocus={() => { setCustomDraft(quantity === 0 ? '' : String(quantity)); setEditingCustom(true); }}
            onChange={(e) => updateDraft(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
              if (e.key === 'Escape') { setCustomDraft(String(quantity)); setEditingCustom(false); }
            }}
            onClick={stop}
            style={{ ...fieldStyle, width: 80 }}
            className="tabular-nums"
            placeholder="0"
          />
        )}
      </div>

      {/* Unit pills (or plain label if only one option) */}
      {showToggle ? (
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
          {units.map((opt) => {
            const active = opt.unit === unit;
            return (
              <button
                key={opt.unit}
                type="button"
                onClick={(e) => { stop(e); switchUnit(opt.unit); }}
                className="cursor-pointer"
                style={{
                  padding: '5px 10px',
                  borderRadius: 4,
                  background: active ? 'var(--color-surface)' : 'transparent',
                  color: active ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                  border: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--color-muted-foreground)', padding: '0 4px' }}>
          {units[0].label}
        </span>
      )}

      <span
        style={{
          marginLeft: 'auto',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-primary)',
          fontFamily: 'var(--font-mono)',
        }}
        className="tabular-nums"
      >
        {kcalPreview != null ? `${kcalPreview} kcal` : '—'}
      </span>
    </div>
  );
}
