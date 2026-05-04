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

  const commitCustom = () => {
    const n = parseFloat(customDraft);
    if (Number.isFinite(n) && n >= 0) onChange({ quantity: n, unit });
    setEditingCustom(false);
  };

  const switchUnit = (toUnit: Unit) => {
    if (toUnit === unit) return;
    try {
      const foodForCalc = {
        base_amount: food.base_amount ?? food.baseAmount ?? 100,
        base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
        serving_size_g: food.serving_size_g ?? null,
        calories: food.calories ?? 0,
        protein: food.protein ?? null,
      };
      let converted = convertQuantity(foodForCalc, quantity, unit, toUnit);
      // Round per the spec: serving → integer-friendly, g/ml → integer
      if (toUnit === 'serving') {
        converted = Math.round(converted * 2) / 2; // nearest 0.5
        if (converted === 0) converted = 0.5;       // never round to zero
      } else {
        converted = Math.round(converted);
        if (converted === 0) converted = 1;
      }
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
    <div className="px-4 pb-3 flex items-center gap-3 flex-wrap" onClick={stop}>
      <span className="text-xs text-white/50 shrink-0">Amount</span>

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
                onChange={(e) => setCustomDraft(e.target.value)}
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
            onFocus={() => { setCustomDraft(String(quantity)); setEditingCustom(true); }}
            onChange={(e) => setCustomDraft(e.target.value)}
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
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/5 border border-white/10">
          {units.map((opt) => (
            <button
              key={opt.unit}
              type="button"
              onClick={(e) => { stop(e); switchUnit(opt.unit); }}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                opt.unit === unit
                  ? 'bg-indigo-500/20 border border-indigo-400/60 text-white font-medium'
                  : 'text-white/60 hover:text-white border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-xs text-white/50">{units[0].label}</span>
      )}

      <span className="text-xs text-indigo-300 ml-auto tabular-nums">
        {kcalPreview != null ? `${kcalPreview} kcal` : '—'}
      </span>
    </div>
  );
}
