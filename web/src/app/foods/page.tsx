'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Leaf,
  BookOpen,
  X,
  ChevronDown,
  Drumstick,
  Milk,
  Wheat,
  Apple,
  Droplet,
  Coffee,
  Cookie,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassModal,
  Pill,
  MicroLabel,
  MonoNum,
  EmptyState,
} from '@/components/ui';
import type { PillTone } from '@/components/ui';
import { getFoods, createFood, updateFood, deleteFood, addJournalEntry } from '@/lib/api';
import type { Food, MealType } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';

// ─── Types ────────────────────────────────────────────────────────────────────

type BaseUnit = 'grams' | 'ml' | 'servings';

interface FoodFormData {
  name: string;
  base_amount: string;
  base_unit: BaseUnit;
  /** Calories per (base_amount × base_unit) — NOT necessarily per 100g.
   *  Field name is legacy; the value semantics follow the current unit/amount. */
  calories_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
  serving_size_g: string;
}

/** Human-readable label for "per (amount × unit)" — used in field captions
 *  so users know what the value they're typing represents. */
function formatBaseLabel(unit: BaseUnit, amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) || 0 : amount;
  if (unit === 'servings') return n === 1 ? '1 serving' : `${n} servings`;
  if (unit === 'ml') return `${n}ml`;
  return `${n}g`;
}


const defaultForm = (): FoodFormData => ({
  name: '',
  base_amount: '100',
  base_unit: 'grams',
  calories_per_100g: '',
  protein_per_100g: '',
  carbs_per_100g: '',
  fat_per_100g: '',
  serving_size_g: '',
});

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  calories_per_100g?: string;
}

function validate(form: FoodFormData): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.calories_per_100g || isNaN(Number(form.calories_per_100g)) || Number(form.calories_per_100g) < 0) {
    errors.calories_per_100g = 'Valid calories required';
  }
  return errors;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FoodSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-3xl" />
      ))}
    </div>
  );
}

// ─── Food Form Modal ──────────────────────────────────────────────────────────

interface FoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingFood: Food | null;
  onSaved: (food: Food, isEdit: boolean) => void;
  onAddToJournal?: (food: Food, mealType: MealType, servings: number) => void;
}

function FoodModal({ isOpen, onClose, editingFood, onSaved, onAddToJournal }: FoodModalProps) {
  const [form, setForm] = useState<FoodFormData>(defaultForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [addToJournal, setAddToJournal] = useState(false);
  const [journalMealType, setJournalMealType] = useState<MealType>('breakfast');
  const [journalServings, setJournalServings] = useState('1');

  useEffect(() => {
    if (editingFood) {
      // Load the food's ACTUAL base — not always 'grams'/'100'. mapFood's
      // calories_per_100g alias is misnamed for non-grams foods (it returns
      // the raw per-base value when unit isn't grams), so prefer the raw
      // `calories`/`protein`/etc fields which always represent
      // "per (base_amount × base_unit)". Cast through `unknown` because
      // the Food type doesn't declare `carbs`/`fat` directly even though
      // the API returns them, and the canonical Unit doesn't include the
      // legacy DB string 'grams' which we still defensively handle.
      const f = editingFood as Food & {
        carbs?: number; fat?: number; baseUnit?: string; base_unit?: string;
      };
      const rawBaseUnit = (f.baseUnit ?? f.base_unit ?? 'g') as string;
      const dbUnit: BaseUnit =
        rawBaseUnit === 'g' || rawBaseUnit === 'grams' ? 'grams'
        : rawBaseUnit === 'ml' ? 'ml'
        : 'servings';
      const baseAmount = f.baseAmount ?? f.base_amount ?? 100;
      setForm({
        name: f.name,
        base_amount: String(baseAmount),
        base_unit: dbUnit,
        calories_per_100g: String(f.calories ?? f.calories_per_100g ?? ''),
        protein_per_100g: String(f.protein ?? f.protein_per_100g ?? ''),
        carbs_per_100g: String(f.carbs ?? f.carbs_per_100g ?? ''),
        fat_per_100g: String(f.fat ?? f.fat_per_100g ?? ''),
        serving_size_g: f.serving_size_g != null ? String(f.serving_size_g) : '',
      });
    } else {
      setForm(defaultForm());
    }
    setErrors({});
    setServerError('');
    setAddToJournal(false);
    setJournalMealType('breakfast');
    setJournalServings('1');
  }, [editingFood, isOpen]);

  function set(field: keyof FoodFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(addToJournalAfterSave: boolean = false) {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setServerError('');
    // Send base_amount/baseUnit on every save so unit toggles in the form
    // actually persist. Earlier the payload dropped these silently — the
    // food's stored base_unit never changed even when the user switched
    // it in the modal. Backend accepts either camelCase or snake_case
    // and normalises legacy 'grams'/'servings' on read via mapFood, so
    // sending the form's BaseUnit values is fine on the wire even though
    // the canonical Unit type is narrower.
    const payload = {
      name: form.name.trim(),
      baseAmount: Number(form.base_amount) || 100,
      baseUnit: form.base_unit,
      calories_per_100g: Number(form.calories_per_100g),
      protein_per_100g: Number(form.protein_per_100g) || 0,
      carbs_per_100g: Number(form.carbs_per_100g) || 0,
      fat_per_100g: Number(form.fat_per_100g) || 0,
      serving_size_g: form.serving_size_g ? Number(form.serving_size_g) : undefined,
    } as unknown as Omit<Food, 'id' | 'created_at'>;

    try {
      let food: Food;
      if (editingFood) {
        food = await updateFood(editingFood.id, payload);
        onSaved(food, true);
      } else {
        food = await createFood(payload);
        onSaved(food, false);
      }

      if (addToJournalAfterSave && onAddToJournal) {
        onAddToJournal(food, journalMealType, parseFloat(journalServings) || 1);
      }

      onClose();
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingFood ? 'Edit Food' : 'Add Food'}
      size="md"
    >
      <div className="space-y-4">
        <div className="relative">
          <GlassInput
            label="Food Name *"
            placeholder="e.g. Chicken Breast"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          {form.name && (
            <button
              type="button"
              onClick={() => set('name', '')}
              className="absolute right-3 top-9 text-white/40 hover:text-white"
            >
              ×
            </button>
          )}
        </div>
        {errors.name && <p className="text-xs text-red-400 -mt-2 pl-1">{errors.name}</p>}

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="relative">
            <GlassInput
              label="Base Amount"
              type="number"
              inputMode="decimal"
              value={form.base_amount}
              onChange={(e) => set('base_amount', e.target.value)}
              min={1}
            />
            {form.base_amount && (
              <button
                type="button"
                onClick={() => set('base_amount', '')}
                className="absolute right-3 top-9 text-white/40 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-500 dark:text-white/60 pl-1">Unit</label>
            {/* Native <select> with dark-themed dropdown panel:
                - [color-scheme:dark] tells the browser to render the native
                  dropdown chrome in dark mode (Chrome/Firefox/Edge respect this)
                - appearance-none + custom ChevronDown for a clean closed state
                - Each <option> gets explicit bg/text so options are readable
                  even in browsers that don't fully honour color-scheme */}
            <div className="relative">
              <select
                value={form.base_unit}
                onChange={(e) => {
                  const newUnit = e.target.value as BaseUnit;
                  if (newUnit === form.base_unit) return;
                  // Adjust base_amount to a sensible default for the new unit,
                  // but leave the nutrient values alone — auto-converting them
                  // mid-edit overwrites what the user is actively typing. The
                  // dynamic field labels make it clear what each value means.
                  if (newUnit === 'servings') set('base_amount', '1');
                  else if (newUnit === 'grams' || newUnit === 'ml') set('base_amount', '100');
                  set('base_unit', newUnit);
                }}
                className="w-full h-[46px] pl-3 sm:pl-4 pr-10 bg-black/[0.04] border border-black/[0.10] text-gray-900 dark:bg-white/10 dark:border-white/20 dark:text-white rounded-xl sm:rounded-2xl text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200 appearance-none [color-scheme:dark] cursor-pointer"
              >
                <option value="grams" className="bg-[#1a1a1a] text-white">Grams</option>
                <option value="ml" className="bg-[#1a1a1a] text-white">ml</option>
                <option value="servings" className="bg-[#1a1a1a] text-white">Servings</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-white/50 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="relative">
            <GlassInput
              label={`Calories (per ${formatBaseLabel(form.base_unit, form.base_amount)}) *`}
              type="number"
              inputMode="decimal"
              value={form.calories_per_100g}
              onChange={(e) => set('calories_per_100g', e.target.value)}
              min={0}
              step={0.1}
              placeholder="0"
            />
            {form.calories_per_100g && (
              <button
                type="button"
                onClick={() => set('calories_per_100g', '')}
                className="absolute right-3 top-9 text-white/40 hover:text-white"
              >
                ×
              </button>
            )}
            {errors.calories_per_100g && (
              <p className="text-xs text-red-400 mt-1 pl-1">{errors.calories_per_100g}</p>
            )}
          </div>
          <div className="relative">
            <GlassInput
              label={`Protein (per ${formatBaseLabel(form.base_unit, form.base_amount)})`}
              type="number"
              inputMode="decimal"
              value={form.protein_per_100g}
              onChange={(e) => set('protein_per_100g', e.target.value)}
              min={0}
              step={0.1}
              placeholder="0"
            />
            {form.protein_per_100g && (
              <button
                type="button"
                onClick={() => set('protein_per_100g', '')}
                className="absolute right-3 top-9 text-white/40 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="relative">
            <GlassInput
              label={`Carbs (per ${formatBaseLabel(form.base_unit, form.base_amount)})`}
              type="number"
              inputMode="decimal"
              value={form.carbs_per_100g}
              onChange={(e) => set('carbs_per_100g', e.target.value)}
              min={0}
              step={0.1}
              placeholder="0"
            />
            {form.carbs_per_100g && (
              <button
                type="button"
                onClick={() => set('carbs_per_100g', '')}
                className="absolute right-3 top-9 text-white/40 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
          <div className="relative">
            <GlassInput
              label={`Fat (per ${formatBaseLabel(form.base_unit, form.base_amount)})`}
              type="number"
              inputMode="decimal"
              value={form.fat_per_100g}
              onChange={(e) => set('fat_per_100g', e.target.value)}
              min={0}
              step={0.1}
              placeholder="0"
            />
            {form.fat_per_100g && (
              <button
                type="button"
                onClick={() => set('fat_per_100g', '')}
                className="absolute right-3 top-9 text-white/40 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <GlassInput
            label="Serving Size (g) — optional"
            type="number"
            inputMode="decimal"
            value={form.serving_size_g}
            onChange={(e) => set('serving_size_g', e.target.value)}
            min={1}
            placeholder="e.g. 30 for 1 slice"
          />
          {form.serving_size_g && (
            <button
              type="button"
              onClick={() => set('serving_size_g', '')}
              className="absolute right-3 top-9 text-white/40 hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{serverError}</p>
        )}

        {/* Add to Journal option - only for new foods */}
        {!editingFood && onAddToJournal && (
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setAddToJournal(!addToJournal)}
                className={`w-10 h-6 rounded-full transition-all duration-200 border ${
                  addToJournal
                    ? 'bg-[#2E8B57]/30 border-[#2E8B57]/50'
                    : 'bg-white/10 border-white/20'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                    addToJournal ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-sm text-white">Add to Food Journal</span>
            </label>
            {addToJournal && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-500 dark:text-white/60 pl-1">Meal</label>
                  <div className="relative">
                    <select
                      value={journalMealType}
                      onChange={(e) => setJournalMealType(e.target.value as MealType)}
                      className="w-full h-[46px] pl-3 sm:pl-4 pr-10 bg-black/[0.04] border border-black/[0.10] text-gray-900 dark:bg-white/10 dark:border-white/20 dark:text-white rounded-xl sm:rounded-2xl text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200 appearance-none [color-scheme:dark] cursor-pointer"
                    >
                      {MEAL_TYPES.map((m) => (
                        <option key={m} value={m} className="bg-[#1a1a1a] text-white">{MEAL_LABELS[m]}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-white/50 pointer-events-none" />
                  </div>
                </div>
                <GlassInput
                  label="Servings"
                  type="number"
                  inputMode="decimal"
                  value={journalServings}
                  onChange={(e) => setJournalServings(e.target.value)}
                  min={0}
                  step={0.1}
                  placeholder="1"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          {addToJournal ? (
            <GlassButton variant="primary" className="flex-1" onClick={() => handleSubmit(true)} disabled={saving}>
              {saving ? 'Saving…' : 'Add Food & Log'}
            </GlassButton>
          ) : (
            <GlassButton variant="primary" className="flex-1" onClick={() => handleSubmit(false)} disabled={saving}>
              {saving ? 'Saving…' : 'Add Food'}
            </GlassButton>
          )}
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  food: Food | null;
  onDeleted: (id: number) => void;
}

function DeleteModal({ isOpen, onClose, food, onDeleted }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!food) return;
    setDeleting(true);
    setError('');
    try {
      await deleteFood(food.id);
      onDeleted(food.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Delete Food" size="sm">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-white/70 text-sm">
          Are you sure you want to delete <span className="text-gray-900 dark:text-white font-semibold">{food?.name}</span>?
          This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="danger" className="flex-1" onClick={handleConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Add to Journal Modal ────────────────────────────────────────────────────

interface AddToJournalModalProps {
  food: Food | null;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (food: Food, mealType: MealType, servings: number) => void;
}

function AddToJournalModal({ food, isOpen, onClose, onAdd }: AddToJournalModalProps) {
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [servings, setServings] = useState('1');

  function handleAdd() {
    if (!food) return;
    const sv = parseFloat(servings) || 1;
    onAdd(food, mealType, sv);
    setServings('1');
    onClose();
  }

  const sv = parseFloat(servings) || 0;
  const calories = food ? (food.calories_per_100g ?? food.calories ?? 0) * sv : 0;
  const protein = food ? (food.protein_per_100g ?? food.protein ?? 0) * sv : 0;

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Add to Journal" size="sm">
      <div className="space-y-4">
        {food && (
          <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="font-medium text-white">{food.name}</p>
            <p className="text-xs text-white/50 mt-0.5">
              {Math.round(calories)} kcal · {protein.toFixed(1)}g protein
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-white/60 pl-1">Meal</label>
          <div className="relative">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="w-full h-[46px] pl-4 pr-10 bg-white/10 border border-white/20 text-white rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200 appearance-none [color-scheme:dark] cursor-pointer"
            >
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m} className="bg-[#1a1a1a] text-white">{MEAL_LABELS[m]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
          </div>
        </div>
        <GlassInput
          label="Servings"
          type="number"
          inputMode="decimal"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          min={0}
          step={0.1}
          placeholder="1"
        />
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={handleAdd}>
            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Add to Journal</span>
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
// ─── Tag / icon mapping ───────────────────────────────────────────────────────

type FoodTag =
  | 'Protein'
  | 'Dairy'
  | 'Grain'
  | 'Fruit'
  | 'Veg'
  | 'Fat'
  | 'Drink'
  | 'Snack';

const FOOD_TAGS: (FoodTag | 'All')[] = [
  'All',
  'Protein',
  'Dairy',
  'Grain',
  'Fruit',
  'Veg',
  'Fat',
  'Drink',
  'Snack',
];

const TAG_TONES: Record<FoodTag, PillTone> = {
  Protein: 'primary',
  Dairy: 'medium',
  Grain: 'warning',
  Fruit: 'success',
  Veg: 'success',
  Fat: 'warning',
  Drink: 'neutral',
  Snack: 'pink',
};

const TAG_ICONS: Record<FoodTag, React.ComponentType<{ style?: React.CSSProperties }>> = {
  Protein: Drumstick,
  Dairy: Milk,
  Grain: Wheat,
  Fruit: Apple,
  Veg: Leaf,
  Fat: Droplet,
  Drink: Coffee,
  Snack: Cookie,
};

// Infer a tag for a Food. The DB doesn't store one, so guess from name keywords.
// Returns null if no clear match — the row will fall back to a neutral pill.
function inferTag(food: Food): FoodTag | null {
  const name = food.name.toLowerCase();
  const baseUnit = (food.base_unit ?? food.baseUnit ?? 'g') as string;
  if (baseUnit === 'ml') return 'Drink';
  if (/coffee|tea|drink|juice|water|soda/.test(name)) return 'Drink';
  if (/milk|yogurt|yoghurt|cheese|cream|butter/.test(name)) return 'Dairy';
  if (/chicken|beef|fish|salmon|tuna|egg|whey|protein|turkey|pork|tofu|tempeh/.test(name)) return 'Protein';
  if (/oat|rice|bread|pasta|noodle|cereal|toast|wheat|flour/.test(name)) return 'Grain';
  if (/banana|apple|berry|orange|pear|grape|melon|peach|kiwi|mango|pineapple/.test(name)) return 'Fruit';
  if (/broccoli|spinach|lettuce|kale|veggie|vegetable|carrot|tomato|cucumber|salad|onion|garlic|pepper/.test(name)) return 'Veg';
  if (/oil|nut|butter|avocado|seed/.test(name)) return 'Fat';
  if (/chocolate|cookie|crisp|chip|candy|snack/.test(name)) return 'Snack';
  return null;
}

function unitLabel(food: Food): string {
  const amount = food.baseAmount ?? food.base_amount ?? 100;
  const unit = (food.baseUnit ?? food.base_unit ?? 'g') as string;
  if (unit === 'serving') return amount === 1 ? 'per 1 serving' : 'per ' + amount + ' servings';
  if (unit === 'ml') return 'per ' + amount + 'ml';
  return 'per ' + amount + 'g';
}

// ─── Food row (design-faithful: table row with icon, name, cal, protein, tag) ─

function FoodRow({
  food,
  selected,
  onSelect,
}: {
  food: Food;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const cal = food.calories ?? food.calories_per_100g ?? 0;
  const protein = food.protein ?? food.protein_per_100g ?? 0;
  const tag = inferTag(food);
  const IconCmp = tag ? TAG_ICONS[tag] : Apple;

  return (
    <tr
      onClick={onSelect}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        background: selected
          ? 'var(--color-badge-bg)'
          : hover
          ? 'var(--color-surface-warm)'
          : 'transparent',
        transition: 'background 120ms',
      }}
    >
      <td style={{ ...TD_STYLE, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--color-surface-warm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--color-border)',
              flexShrink: 0,
            }}
          >
            <IconCmp
              style={{ width: 13, height: 13, color: 'var(--color-muted-foreground)' }}
            />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {food.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
                marginTop: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {unitLabel(food)}
            </div>
          </div>
        </div>
      </td>
      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
        <MonoNum size={14}>{cal}</MonoNum>
        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', marginLeft: 2 }}>
          kcal
        </span>
      </td>
      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
        <MonoNum size={14}>{protein}</MonoNum>
        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', marginLeft: 2 }}>g</span>
      </td>
      <td style={TD_STYLE}>
        {tag ? <Pill tone={TAG_TONES[tag]}>{tag}</Pill> : <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>—</span>}
      </td>
    </tr>
  );
}

const TD_STYLE: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-border)',
  verticalAlign: 'middle',
};

const TH_STYLE: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-muted-foreground)',
  borderBottom: '1px solid var(--color-border)',
};

// ─── Detail panel (right column) ──────────────────────────────────────────────

function defaultMealForNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}

function FoodDetail({
  food,
  onAddToJournal,
  onEdit,
  onQuickLog,
}: {
  food: Food | null;
  onAddToJournal: (food: Food) => void;
  onEdit: (food: Food) => void;
  onQuickLog: (food: Food, servings: number) => Promise<void>;
}) {
  const [logging, setLogging] = useState<number | null>(null);
  const [justLogged, setJustLogged] = useState<number | null>(null);

  async function handleQuickServing(s: number) {
    if (!food) return;
    setLogging(s);
    try {
      await onQuickLog(food, s);
      setJustLogged(s);
      setTimeout(() => setJustLogged(null), 1400);
    } finally {
      setLogging(null);
    }
  }

  if (!food) {
    return (
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
          padding: 24,
          color: 'var(--color-muted-foreground)',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Pick a food to see details.
      </div>
    );
  }

  const cal = food.calories ?? food.calories_per_100g ?? 0;
  const protein = food.protein ?? food.protein_per_100g ?? 0;
  const carbs = food.carbs_per_100g ?? null;
  const fat = food.fat_per_100g ?? null;
  const tag = inferTag(food);
  const IconCmp = tag ? TAG_ICONS[tag] : Apple;

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
        padding: 24,
        position: 'sticky',
        top: 32,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: 'var(--color-surface-warm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--color-border)',
          }}
        >
          <IconCmp style={{ width: 20, height: 20, color: 'var(--color-muted-foreground)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.3px',
            }}
          >
            {food.name}
          </h2>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              marginTop: 2,
            }}
          >
            {unitLabel(food)}
          </div>
        </div>
        {tag && <Pill tone={TAG_TONES[tag]}>{tag}</Pill>}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <DetailStat label="Calories" value={cal} unit="kcal" />
        <DetailStat label="Protein" value={protein} unit="g" />
        <DetailStat
          label="Carbs"
          value={carbs ?? '~'}
          unit="g"
          muted={carbs == null}
        />
        <DetailStat
          label="Fat"
          value={fat ?? '~'}
          unit="g"
          muted={fat == null}
        />
      </div>

      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          marginTop: 16,
          paddingTop: 16,
        }}
      >
        <MicroLabel style={{ marginBottom: 8 }}>
          Quick serving · logs to {MEAL_LABELS[defaultMealForNow()]}
        </MicroLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[0.5, 1, 1.5, 2].map((s) => {
            const isLogging = logging === s;
            const isSuccess = justLogged === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleQuickServing(s)}
                disabled={logging !== null}
                className="cursor-pointer"
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: isSuccess
                    ? 'var(--color-success)'
                    : isLogging
                    ? 'var(--color-primary)'
                    : 'var(--color-surface-warm)',
                  color: isSuccess || isLogging
                    ? 'var(--color-primary-foreground)'
                    : 'var(--color-foreground)',
                  border:
                    '1px solid ' +
                    (isSuccess
                      ? 'var(--color-success)'
                      : isLogging
                      ? 'var(--color-primary)'
                      : 'var(--color-border)'),
                  borderRadius: 4,
                  fontFamily: 'inherit',
                  transition: 'background 160ms, border-color 160ms',
                  opacity: logging !== null && !isLogging ? 0.5 : 1,
                }}
              >
                {isSuccess ? '✓ ' : ''}
                {s}×{' '}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    opacity: 0.7,
                    marginLeft: 4,
                  }}
                >
                  {Math.round(cal * s)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          marginTop: 16,
          paddingTop: 16,
          display: 'flex',
          gap: 8,
        }}
      >
        <GlassButton
          variant="primary"
          size="sm"
          onClick={() => onAddToJournal(food)}
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Add to journal
        </GlassButton>
        <GlassButton variant="outline" size="sm" onClick={() => onEdit(food)}>
          <Pencil style={{ width: 14, height: 14, strokeWidth: 2 }} />
          Edit
        </GlassButton>
      </div>
    </div>
  );
}

function DetailStat({
  label,
  value,
  unit,
  muted,
}: {
  label: string;
  value: number | string;
  unit: string;
  muted?: boolean;
}) {
  return (
    <div>
      <MicroLabel>{label}</MicroLabel>
      <div style={{ marginTop: 4 }}>
        <MonoNum size={24} style={{ opacity: muted ? 0.4 : 1 }}>
          {value}
        </MonoNum>
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            marginLeft: 4,
          }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<FoodTag | 'All'>('All');
  const [sort, setSort] = useState<'name' | 'calories' | 'protein'>('name');
  const [selected, setSelected] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [deletingFood, setDeletingFood] = useState<Food | null>(null);
  const [journalFood, setJournalFood] = useState<Food | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFoods = useCallback(() => {
    getFoods()
      .then((arr) => {
        setFoods(arr);
        if (selected == null && arr.length > 0) setSelected(arr[0].id);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load')
      )
      .finally(() => setLoading(false));
  }, [selected]);

  useEffect(() => {
    fetchFoods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSocketEvent('food-created', fetchFoods);
  useSocketEvent('food-updated', fetchFoods);
  useSocketEvent('food-deleted', fetchFoods);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filtered = useMemo(() => {
    let arr = foods;
    if (tag !== 'All') arr = arr.filter((f) => inferTag(f) === tag);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      arr = arr.filter((f) => f.name.toLowerCase().includes(q));
    }
    arr = [...arr].sort((a, b) => {
      if (sort === 'calories')
        return (
          (b.calories ?? b.calories_per_100g ?? 0) -
          (a.calories ?? a.calories_per_100g ?? 0)
        );
      if (sort === 'protein')
        return (
          (b.protein ?? b.protein_per_100g ?? 0) -
          (a.protein ?? a.protein_per_100g ?? 0)
        );
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [foods, tag, debouncedQuery, sort]);

  const selectedFood =
    foods.find((f) => f.id === selected) ?? filtered[0] ?? null;

  function handleOpenAdd() {
    setEditingFood(null);
    setModalOpen(true);
  }
  function handleEdit(food: Food) {
    setEditingFood(food);
    setModalOpen(true);
  }
  function handleSaved(food: Food, isEdit: boolean) {
    if (isEdit) setFoods((prev) => prev.map((f) => (f.id === food.id ? food : f)));
    else setFoods((prev) => [food, ...prev]);
  }
  function handleDeleted(id: number) {
    setFoods((prev) => prev.filter((f) => f.id !== id));
    if (selected === id) setSelected(foods[0]?.id ?? null);
  }
  function handleAddToJournal(food: Food, mealType: MealType, servings: number) {
    const today = new Date().toLocaleString('en-CA').split(',')[0];
    addJournalEntry({
      date: today,
      meal_type: mealType,
      food_id: food.id,
      food_name_snapshot: food.name,
      quantity: servings,
      unit: 'serving',
    }).catch((e: unknown) => console.error('Failed to add to journal:', e));
  }

  return (
    <main
      className="page-mount"
      style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '24px 16px 80px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 4,
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.4px',
            margin: 0,
          }}
        >
          Foods
        </h1>
        <GlassButton variant="primary" size="sm" onClick={handleOpenAdd}>
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          New food
        </GlassButton>
      </div>
      <div
        style={{
          color: 'var(--color-muted-foreground)',
          marginTop: 4,
          fontSize: 14,
        }}
      >
        Your private food database.{' '}
        {!loading && foods.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {foods.length} entries.
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'rgba(201,28,43,0.10)',
            border: '1px solid rgba(201,28,43,0.25)',
            color: 'var(--color-critical)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div
        className="foods-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.7fr 1fr',
          gap: 16,
          marginTop: 24,
        }}
      >
        {/* LEFT — Search + tag chips + table */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 14,
                  height: 14,
                  color: 'var(--color-placeholder)',
                  strokeWidth: 1.75,
                }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search foods…"
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  color: 'var(--color-foreground)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                }}
              />
            </div>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as 'name' | 'calories' | 'protein')
              }
              style={{
                padding: '8px 10px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              <option value="name">Sort: name</option>
              <option value="calories">Sort: calories</option>
              <option value="protein">Sort: protein</option>
            </select>
          </div>

          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {FOOD_TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className="cursor-pointer"
                style={{
                  padding: '4px 10px',
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: 600,
                  background:
                    tag === t
                      ? 'var(--color-foreground)'
                      : 'var(--color-surface-warm)',
                  color:
                    tag === t
                      ? 'var(--color-background)'
                      : 'var(--color-muted-foreground)',
                  border:
                    '1px solid ' +
                    (tag === t ? 'var(--color-foreground)' : 'var(--color-border)'),
                  fontFamily: 'inherit',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div
            style={{
              height: 'calc(100vh - 280px)',
              minHeight: 480,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {loading ? (
              <div style={{ padding: 16 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton"
                    style={{ height: 44, marginBottom: 8, borderRadius: 6 }}
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState>
                  No foods match.{' '}
                  <a
                    onClick={handleOpenAdd}
                    style={{
                      color: 'var(--color-link)',
                      cursor: 'pointer',
                    }}
                  >
                    Add one.
                  </a>
                </EmptyState>
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'collapse',
                }}
              >
                <colgroup>
                  <col />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: 'var(--color-surface)',
                    zIndex: 1,
                  }}
                >
                  <tr>
                    <th style={TH_STYLE}>Food</th>
                    <th style={{ ...TH_STYLE, textAlign: 'right' }}>Cal</th>
                    <th style={{ ...TH_STYLE, textAlign: 'right' }}>Protein</th>
                    <th style={TH_STYLE}>Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <FoodRow
                      key={f.id}
                      food={f}
                      selected={f.id === selected}
                      onSelect={() => setSelected(f.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT — detail panel */}
        <FoodDetail
          food={selectedFood}
          onAddToJournal={(f) => setJournalFood(f)}
          onEdit={(f) => handleEdit(f)}
          onQuickLog={async (f, servings) => {
            const today = new Date().toLocaleString('en-CA').split(',')[0];
            await addJournalEntry({
              date: today,
              meal_type: defaultMealForNow(),
              food_id: f.id,
              food_name_snapshot: f.name,
              quantity: servings,
              unit: 'serving',
            });
          }}
        />
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.foods-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <FoodModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editingFood={editingFood}
        onSaved={handleSaved}
        onAddToJournal={handleAddToJournal}
      />
      <DeleteModal
        isOpen={!!deletingFood}
        onClose={() => setDeletingFood(null)}
        food={deletingFood}
        onDeleted={handleDeleted}
      />
      <AddToJournalModal
        food={journalFood}
        isOpen={!!journalFood}
        onClose={() => setJournalFood(null)}
        onAdd={handleAddToJournal}
      />
    </main>
  );
}
