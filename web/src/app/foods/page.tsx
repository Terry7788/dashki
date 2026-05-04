'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Search, Leaf, BookOpen, X, ChevronDown } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
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
    const payload = {
      name: form.name.trim(),
      calories_per_100g: Number(form.calories_per_100g),
      protein_per_100g: Number(form.protein_per_100g) || 0,
      carbs_per_100g: Number(form.carbs_per_100g) || 0,
      fat_per_100g: Number(form.fat_per_100g) || 0,
      serving_size_g: form.serving_size_g ? Number(form.serving_size_g) : undefined,
    };

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

// ─── Food Row ─────────────────────────────────────────────────────────────────

interface FoodRowProps {
  food: Food;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
  onAddToJournal: (food: Food) => void;
}

function FoodRow({ food, onEdit, onDelete, onAddToJournal }: FoodRowProps) {
  const calories = food.calories ?? food.calories_per_100g ?? 0;
  const protein = food.protein ?? food.protein_per_100g ?? 0;
  const carbs = food.carbs_per_100g ?? 0;
  const fat = food.fat_per_100g ?? 0;

  return (
    <div className="flex flex-row items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 rounded-2xl sm:rounded-3xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] transition-all duration-200 group">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{food.name}</p>
        <p className="text-xs text-white/50 mt-0.5">
          per 100g · {calories} kcal · {protein}g protein
          {food.serving_size_g != null && (
            <span> · serving {food.serving_size_g}g</span>
          )}
        </p>
      </div>

      {/* Macro pills - hidden on mobile, shown on sm+ */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span className="text-xs px-2.5 py-1 rounded-xl bg-orange-500/10 border border-orange-400/20 text-orange-300">
          {carbs}g carbs
        </span>
        <span className="text-xs px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-400/20 text-blue-300">
          {fat}g fat
        </span>
      </div>

      {/* Actions - always visible on mobile */}
      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onAddToJournal(food)}
          className="p-2 rounded-xl text-white/40 hover:text-[#61bc84] hover:bg-[#2E8B57]/10 transition-all duration-200"
          title="Add to Journal"
        >
          <BookOpen className="w-4 h-4" />
        </button>
        <button
          onClick={() => onEdit(food)}
          className="p-2 rounded-xl text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all duration-200"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(food)}
          className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [deletingFood, setDeletingFood] = useState<Food | null>(null);
  const [journalFood, setJournalFood] = useState<Food | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const fetchFoods = useCallback(() => {
    getFoods()
      .then(setFoods)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  useSocketEvent('food-created', fetchFoods);
  useSocketEvent('food-updated', fetchFoods);
  useSocketEvent('food-deleted', fetchFoods);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const filteredFoods = debouncedQuery.trim()
    ? foods.filter((f) => f.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
    : foods;

  function handleOpenAdd() {
    setEditingFood(null);
    setModalOpen(true);
  }
  function handleEdit(food: Food) {
    setEditingFood(food);
    setModalOpen(true);
  }
  function handleSaved(food: Food, isEdit: boolean) {
    if (isEdit) {
      setFoods((prev) => prev.map((f) => (f.id === food.id ? food : f)));
    } else {
      setFoods((prev) => [food, ...prev]);
    }
  }
  function handleDeleted(id: number) {
    setFoods((prev) => prev.filter((f) => f.id !== id));
  }

  function handleAddToJournal(food: Food, mealType: MealType, servings: number) {
    const today = new Date().toLocaleString('en-CA').split(',')[0]; // YYYY-MM-DD in local time
    // Server computes calorie/protein snapshots when food_id is set; pass quantity
    // in 'serving' unit (this page's UI still uses the legacy serving-multiplier
    // pattern — full QuantityInput swap is not in scope here).
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
    <div className="px-3 sm:px-4 max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-fade-in w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Food Database</h1>
        <GlassButton variant="primary" onClick={handleOpenAdd} className="w-full sm:w-auto">
          <span className="flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add Food</span>
        </GlassButton>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          className="w-full pl-10 sm:pl-11 pr-10 py-2.5 sm:py-3 text-sm sm:text-base bg-black/[0.04] border border-black/[0.10] text-gray-900 placeholder-gray-400 dark:bg-white/10 dark:border-white/20 dark:text-white dark:placeholder-white/40 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-700 dark:text-white/40 dark:hover:text-white transition-colors duration-200"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Stats bar */}
      {!loading && foods.length > 0 && (
        <p className="text-xs sm:text-sm text-gray-400 dark:text-white/40">
          {filteredFoods.length} of {foods.length} food{foods.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400 text-sm">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <FoodSkeleton />
      ) : filteredFoods.length === 0 ? (
        <GlassCard className="text-center py-8 sm:py-12">
          <Leaf className="w-10 h-10 sm:w-12 sm:h-12 text-white/20 mx-auto mb-3 sm:mb-4" />
          <p className="text-white/60 font-medium">
            {query ? 'No foods match your search' : 'No foods yet'}
          </p>
          <p className="text-white/30 text-sm mt-1">
            {query ? 'Try a different search term' : 'Add your first food to get started'}
          </p>
          {!query && (
            <div className="mt-4 sm:mt-6">
              <GlassButton variant="primary" onClick={handleOpenAdd}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Food</span>
              </GlassButton>
            </div>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filteredFoods.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              onEdit={handleEdit}
              onDelete={setDeletingFood}
              onAddToJournal={setJournalFood}
            />
          ))}
        </div>
      )}

      {/* Modals */}
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
    </div>
  );
}
