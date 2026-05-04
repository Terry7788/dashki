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

  // ─── Stepper variant (servings) ─────────────────────────────────────────────
  const isServingMode = unit === 'serving';

  return (
    <div className="px-4 py-3 flex items-center gap-3 flex-wrap" onClick={stop}>
      <div className="flex items-center gap-2">
        {isServingMode ? (
          <>
            <button
              type="button"
              onClick={(e) => { stop(e); onChange({ quantity: Math.max(0, quantity - 0.5), unit }); }}
              aria-label="Decrease"
              disabled={quantity <= 0}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-4 h-4" />
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
                className="w-16 px-2 py-1 text-sm bg-white/10 border border-indigo-400/60 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-400/40 tabular-nums"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => { stop(e); setCustomDraft(String(quantity)); setEditingCustom(true); }}
                className="min-w-[3.5rem] px-2 py-1 text-sm font-semibold text-white tabular-nums hover:bg-white/10 rounded-lg transition-colors"
              >
                {quantity === 0 ? '—' : Number.isInteger(quantity) ? quantity : quantity.toFixed(1)}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => { stop(e); onChange({ quantity: quantity + 0.5, unit }); }}
              aria-label="Increase"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
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
            className="w-20 px-2 py-1 text-sm bg-white/10 border border-white/15 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-400/40 tabular-nums"
            placeholder="0"
          />
        )}
      </div>

      {/* Unit pills (or plain label if only one option) */}
      {showToggle ? (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/10">
          {units.map((opt) => (
            <button
              key={opt.unit}
              type="button"
              onClick={(e) => { stop(e); switchUnit(opt.unit); }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-150 ${
                opt.unit === unit
                  ? 'bg-indigo-500/30 border border-indigo-400 text-white font-semibold shadow-sm shadow-indigo-500/20'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-sm text-white/60 px-2">{units[0].label}</span>
      )}

      <span className="text-sm font-semibold text-indigo-300 ml-auto tabular-nums">
        {kcalPreview != null ? `${kcalPreview} kcal` : '—'}
      </span>
    </div>
  );
}
