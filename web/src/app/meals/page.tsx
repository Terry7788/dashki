'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, UtensilsCrossed, Search, ChevronLeft, BookOpen, Pencil, X, ChevronDown } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
import { getSavedMeals, createSavedMeal, updateSavedMeal, deleteSavedMeal, addJournalEntry } from '@/lib/api';
import type { SavedMeal, Food, MealType, Unit } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { QuantityInput } from '@/components/QuantityInput';
import { nutritionFor, formatQuantity } from '@/lib/nutrition';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  // Use en-CA locale for YYYY-MM-DD in local time (not UTC like toISOString())
  return d.toLocaleString('en-CA').split(',')[0];
}

/** Build the FoodForNutrition shape from a Food object (mirrors QuantityInput pattern). */
function foodForCalc(food: Food) {
  return {
    base_amount: food.base_amount ?? food.baseAmount ?? 100,
    base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
    serving_size_g: food.serving_size_g ?? null,
    calories: food.calories ?? 0,
    protein: food.protein ?? null,
  };
}

/** Compute nutrition for a picked item; returns { calories, protein }. */
function calcItemNutrition(food: Food, quantity: number, unit: Unit) {
  try {
    return nutritionFor(foodForCalc(food), quantity, unit);
  } catch {
    // Fallback for foods missing serving_size_g — treat quantity as a multiplier
    return {
      calories: Math.round((food.calories ?? 0) * quantity),
      protein: Math.round(((food.protein as number) ?? 0) * quantity * 10) / 10,
    };
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MealSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-44 rounded-3xl" />
      ))}
    </div>
  );
}

// ─── Food Picker (for Create Meal modal) ──────────────────────────────────────

interface PickedItem {
  food: Food;
  quantity: number;
  unit: Unit;
}

interface FoodPickerForMealProps {
  items: PickedItem[];
  onAdd: (food: Food, quantity: number, unit: Unit) => void;
  onRemove: (foodId: number) => void;
  onUpdate: (foodId: number, quantity: number, unit: Unit) => void;
}

function FoodPickerForMeal({ items, onAdd, onRemove, onUpdate }: FoodPickerForMealProps) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerUnit, setPickerUnit] = useState<Unit>('serving');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = query.trim()
          ? `${BASE_URL}/api/foods?search=${encodeURIComponent(query.trim())}`
          : `${BASE_URL}/api/foods`;
        const res = await fetch(url);
        if (res.ok) setFoods(await res.json());
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function handleSelect(food: Food) {
    // Initialise picker quantity from the food's default unit
    const units = food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
    const def = units.find((u) => u.default) ?? units[0];
    const startQty =
      def.unit === 'serving' ? 1 : (food.base_amount ?? food.baseAmount ?? 100);
    setPickerQty(startQty);
    setPickerUnit(def.unit);
    setSelected(food);
  }

  function handleConfirm() {
    if (!selected) return;
    onAdd(selected, pickerQty, pickerUnit);
    setSelected(null);
    setPickerQty(1);
    setPickerUnit('serving');
    setQuery('');
  }

  return (
    <div className="space-y-4">
      {/* Food picker */}
      {selected ? (
        <div className="space-y-3 p-4 rounded-2xl bg-white/5 border border-white/10">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <p className="font-medium text-white">{selected.name}</p>
          <QuantityInput
            food={selected}
            quantity={pickerQty}
            unit={pickerUnit}
            onChange={({ quantity, unit }) => { setPickerQty(quantity); setPickerUnit(unit); }}
          />
          <GlassButton variant="primary" className="w-full" onClick={handleConfirm}>
            Add to Meal
          </GlassButton>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods to add…"
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400/60 transition-all duration-200"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
            {loading && <p className="text-center text-white/40 text-xs py-3">Searching…</p>}
            {!loading && foods.length === 0 && (
              <p className="text-center text-white/40 text-xs py-3">No foods found</p>
            )}
            {foods.filter((f) => !items.find((i) => i.food.id === f.id)).map((food) => {
              const calories = food.calories ?? food.calories_per_100g ?? 0;
              return (
                <button
                  key={food.id}
                  onClick={() => handleSelect(food)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 text-left"
                >
                  <span className="text-sm text-white truncate">{food.name}</span>
                  <span className="text-xs text-white/40 ml-2 shrink-0">
                    {calories} kcal
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Meal Modal ─────────────────────────────────────────────────────────

interface CreateMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (meal: SavedMeal) => void;
  editingMeal?: SavedMeal | null;
}

function CreateMealModal({ isOpen, onClose, onCreated, editingMeal }: CreateMealModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<PickedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editingMeal) {
        // Editing mode - pre-populate
        setName(editingMeal.name);
        setDescription(editingMeal.description || '');
        setItems(
          (editingMeal.items || []).map((item) => ({
            food: {
              id: item.foodId,
              name: item.name,
              baseAmount: item.baseAmount,
              baseUnit: item.baseUnit,
              calories: item.calories,
              protein: item.protein,
              serving_size_g: item.serving_size_g,
            } as Food,
            quantity: item.quantity ?? item.servings ?? 1,
            unit: (item.unit as Unit) ?? 'serving',
          }))
        );
      } else {
        // Create mode
        setName('');
        setDescription('');
        setItems([]);
      }
      setError('');
      setNameError('');
    }
  }, [isOpen, editingMeal]);

  function handleAddFood(food: Food, quantity: number, unit: Unit) {
    setItems((prev) => {
      const exists = prev.find((i) => i.food.id === food.id);
      if (exists) {
        // Merge: add quantity if same unit; otherwise replace (mixing units in one item is undefined)
        return prev.map((i) =>
          i.food.id === food.id
            ? i.unit === unit
              ? { ...i, quantity: i.quantity + quantity }
              : { ...i, quantity, unit }
            : i
        );
      }
      return [...prev, { food, quantity, unit }];
    });
  }
  function handleRemove(foodId: number) {
    setItems((prev) => prev.filter((i) => i.food.id !== foodId));
  }
  function handleUpdate(foodId: number, quantity: number, unit: Unit) {
    setItems((prev) => prev.map((i) => i.food.id === foodId ? { ...i, quantity, unit } : i));
  }

  const totals = items.reduce(
    (acc, { food, quantity, unit }) => {
      const { calories, protein } = calcItemNutrition(food, quantity, unit);
      return { calories: acc.calories + calories, protein: acc.protein + protein };
    },
    { calories: 0, protein: 0 }
  );

  async function handleSave() {
    if (!name.trim()) { setNameError('Meal name is required'); return; }
    if (items.length === 0) { setError('Add at least one food'); return; }

    setSaving(true);
    setError('');
    try {
      const mealData = {
        name: name.trim(),
        items: items.map(({ food, quantity, unit }) => ({
          food_id: food.id,
          quantity,
          unit,
        })),
      };

      let meal: SavedMeal;
      if (editingMeal) {
        meal = await updateSavedMeal(editingMeal.id, mealData);
      } else {
        meal = await createSavedMeal(mealData);
      }
      onCreated(meal);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save meal');
    } finally {
      setSaving(false);
    }
  }

  const modalTitle = editingMeal ? 'Edit Saved Meal' : 'Create Saved Meal';
  const buttonText = editingMeal ? 'Save Changes' : 'Create Meal';

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl">
      <div className="space-y-4">
        <GlassInput
          label="Meal Name *"
          placeholder="e.g. Protein Breakfast"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError(''); }}
        />
        {nameError && <p className="text-xs text-red-400 -mt-2 pl-1">{nameError}</p>}

        <GlassInput
          label="Description (optional)"
          placeholder="Short note about this meal"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Totals */}
        {items.length > 0 && (
          <div className="flex gap-4 px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-center flex-1">
              <p className="text-xs text-white/40">Calories</p>
              <p className="font-bold text-white">{Math.round(totals.calories)}</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center flex-1">
              <p className="text-xs text-white/40">Protein</p>
              <p className="font-bold text-white">{Math.round(totals.protein * 10) / 10}g</p>
            </div>
          </div>
        )}

        {/* Two-column layout on larger screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Added foods list */}
          <div>
            <p className="text-sm font-medium text-white/60 pl-1 mb-2">Added Foods ({items.length})</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex-1 overflow-y-auto space-y-2 min-h-0">
              {items.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-8">No foods added yet</p>
              ) : (
                items.map(({ food, quantity, unit }) => {
                  const { calories, protein } = calcItemNutrition(food, quantity, unit);
                  return (
                    <div
                      key={food.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-400/20"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{food.name}</p>
                        <p className="text-xs text-white/50">
                          {formatQuantity(quantity, unit)} · {calories} kcal · {protein}g pro
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemove(food.id)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Search and add foods */}
          <div>
            <p className="text-sm font-medium text-white/60 pl-1 mb-2">Search & Add Foods</p>
            <FoodPickerForMeal
              items={items}
              onAdd={handleAddFood}
              onRemove={handleRemove}
              onUpdate={handleUpdate}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={handleSave} disabled={saving || items.length === 0}>
            {saving ? 'Saving…' : buttonText}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Add to Journal Modal ──────────────────────────────────────────────────────

interface AddToJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  meal: SavedMeal | null;
}

function AddToJournalModal({ isOpen, onClose, meal }: AddToJournalModalProps) {
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) { setError(''); setSuccess(false); }
  }, [isOpen]);

  async function handleAdd() {
    if (!meal) return;
    setSaving(true);
    setError('');
    const today = toISODate(new Date());
    try {
      // The list endpoint doesn't include items — fetch the full meal detail first
      let fullMeal = meal;
      if (!meal.items) {
        const res = await fetch(`${BASE_URL}/api/meals/saved/${meal.id}`);
        if (res.ok) {
          fullMeal = await res.json();
        }
      }

      if (!fullMeal.items || fullMeal.items.length === 0) {
        setError('Meal has no items');
        setSaving(false);
        return;
      }

      for (const item of fullMeal.items) {
        // Log each item in its native unit
        const quantity = item.quantity ?? item.servings ?? 1;
        const unit = (item.unit as Unit) ?? 'serving';
        await addJournalEntry({
          date: today,
          meal_type: mealType,
          food_id: item.foodId,
          food_name_snapshot: item.name ?? `Food ${item.foodId}`,
          quantity,
          unit,
        });
      }
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add to journal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Add to Journal" size="sm">
      <div className="space-y-4">
        {meal && (
          <p className="text-gray-900 dark:text-white font-medium">{meal.name}</p>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-500 dark:text-white/60 pl-1">Meal</label>
          <div className="relative">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="w-full pl-4 pr-10 py-3 bg-black/[0.04] border border-black/[0.10] text-gray-900 dark:bg-white/10 dark:border-white/20 dark:text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/40 focus:border-[#2E8B57]/60 transition-all duration-200 appearance-none [color-scheme:dark] cursor-pointer"
            >
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m} className="bg-[#1a1a1a] text-white">{MEAL_LABELS[m]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-white/50 pointer-events-none" />
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-400 text-center">✓ Added to journal!</p>
        )}
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={handleAdd} disabled={saving || success}>
            {saving ? 'Adding…' : 'Add to Today'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Delete Confirm ────────────────────────────────────────────────────────────

interface DeleteMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  meal: SavedMeal | null;
  onDeleted: (id: number) => void;
}

function DeleteMealModal({ isOpen, onClose, meal, onDeleted }: DeleteMealModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (!meal) return;
    setDeleting(true);
    try {
      await deleteSavedMeal(meal.id);
      onDeleted(meal.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Delete Meal" size="sm">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-white/70 text-sm">
          Delete <span className="text-gray-900 dark:text-white font-semibold">{meal?.name}</span>? This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="danger" className="flex-1" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Meal Card ─────────────────────────────────────────────────────────────────

interface MealCardProps {
  meal: SavedMeal;
  onAddToJournal: (meal: SavedMeal) => void;
  onDelete: (meal: SavedMeal) => void;
  onEdit: (meal: SavedMeal) => void;
}

function MealCard({ meal, onAddToJournal, onDelete, onEdit }: MealCardProps) {
  const itemCount = meal.items?.length ?? 0;

  // Calculate totals using unit-aware nutritionFor where possible
  const totals = (meal.items || []).reduce(
    (acc, item) => {
      const quantity = item.quantity ?? item.servings ?? 1;
      const unit = (item.unit as Unit) ?? 'serving';
      const food: Food = {
        id: item.foodId,
        name: item.name,
        baseAmount: item.baseAmount,
        baseUnit: item.baseUnit,
        calories: item.calories,
        protein: item.protein,
        serving_size_g: item.serving_size_g,
      } as Food;
      const { calories, protein } = calcItemNutrition(food, quantity, unit);
      return { calories: acc.calories + calories, protein: acc.protein + protein };
    },
    { calories: 0, protein: 0 }
  );

  return (
    <GlassCard className="flex flex-col gap-4 h-full">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white text-base">{meal.name}</h3>
            {meal.description && (
              <p className="text-sm text-white/50 mt-0.5">{meal.description}</p>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onEdit(meal)}
              className="p-2 rounded-xl text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all duration-200 shrink-0"
              title="Edit meal"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(meal)}
              className="p-2 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 shrink-0"
              title="Delete meal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Calories & Protein */}
        <div className="mt-3 flex gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-[#2E8B57]/20 border border-[#2E8B57]/30">
            <span className="text-xs text-[#61bc84]">{Math.round(totals.calories)}</span>
            <span className="text-xs text-[#61bc84]/60 ml-1">kcal</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#2E8B57]/20 border border-[#2E8B57]/30">
            <span className="text-xs text-[#61bc84]">{Math.round(totals.protein * 10) / 10}</span>
            <span className="text-xs text-[#61bc84]/60 ml-1">g protein</span>
          </div>
        </div>

        {/* Food items list */}
        <div className="mt-3 space-y-1.5 max-h-24 overflow-y-auto">
          {meal.items && meal.items.length > 0 ? (
            meal.items.slice(0, 5).map((item, idx) => {
              const quantity = item.quantity ?? item.servings ?? 1;
              const unit = (item.unit as Unit) ?? 'serving';
              return (
                <div key={item.foodId || idx} className="flex items-center justify-between text-xs text-white/60 px-2 py-1 rounded-lg bg-white/5">
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0 ml-2 text-white/40">{formatQuantity(quantity, unit)}</span>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-white/30 px-2">No items</p>
          )}
          {itemCount > 5 && (
            <p className="text-xs text-white/40 px-2">+{itemCount - 5} more</p>
          )}
        </div>
      </div>

      <GlassButton
        variant="primary"
        className="w-full"
        onClick={() => onAddToJournal(meal)}
      >
        <span className="flex items-center justify-center gap-2">
          <BookOpen className="w-4 h-4" /> Add to Journal
        </span>
      </GlassButton>
    </GlassCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MealsPage() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const [journalTarget, setJournalTarget] = useState<SavedMeal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedMeal | null>(null);

  // Form state for the create/edit panel
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<PickedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Initialize form when editing
  useEffect(() => {
    if (editingMeal) {
      setName(editingMeal.name);
      setDescription(editingMeal.description || '');
      setItems(
        (editingMeal.items || []).map((item) => ({
          food: {
            id: item.foodId,
            name: item.name,
            baseAmount: item.baseAmount,
            baseUnit: item.baseUnit,
            calories: item.calories,
            protein: item.protein,
            serving_size_g: item.serving_size_g,
          } as Food,
          quantity: item.quantity ?? item.servings ?? 1,
          unit: (item.unit as Unit) ?? 'serving',
        }))
      );
    } else if (createOpen) {
      setName('');
      setDescription('');
      setItems([]);
    }
    setNameError('');
    setError('');
  }, [createOpen, editingMeal]);

  function handleAddFood(food: Food, quantity: number, unit: Unit) {
    setItems((prev) => {
      const exists = prev.find((i) => i.food.id === food.id);
      if (exists) {
        // Merge: add quantity if same unit; otherwise replace (mixing units in one item is undefined)
        return prev.map((i) =>
          i.food.id === food.id
            ? i.unit === unit
              ? { ...i, quantity: i.quantity + quantity }
              : { ...i, quantity, unit }
            : i
        );
      }
      return [...prev, { food, quantity, unit }];
    });
  }

  function handleRemove(foodId: number) {
    setItems((prev) => prev.filter((i) => i.food.id !== foodId));
  }

  function handleUpdate(foodId: number, quantity: number, unit: Unit) {
    setItems((prev) =>
      prev.map((i) => (i.food.id === foodId ? { ...i, quantity, unit } : i))
    );
  }

  const totals = items.reduce(
    (acc, { food, quantity, unit }) => {
      const { calories, protein } = calcItemNutrition(food, quantity, unit);
      return { calories: acc.calories + calories, protein: acc.protein + protein };
    },
    { calories: 0, protein: 0 }
  );

  async function handleSave() {
    if (!name.trim()) { setNameError('Meal name is required'); return; }
    if (items.length === 0) { setError('Add at least one food'); return; }

    setSaving(true);
    setError('');
    try {
      const mealData = {
        name: name.trim(),
        items: items.map(({ food, quantity, unit }) => ({
          food_id: food.id,
          quantity,
          unit,
        })),
      };

      let meal: SavedMeal;
      if (editingMeal) {
        meal = await updateSavedMeal(editingMeal.id, mealData);
      } else {
        meal = await createSavedMeal(mealData);
      }
      setMeals((prev) => [meal, ...prev]);
      getSavedMeals().then(setMeals).catch(console.error);
      setCreateOpen(false);
      setEditingMeal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save meal');
    } finally {
      setSaving(false);
    }
  }

  const fetchMeals = useCallback(() => {
    getSavedMeals()
      .then(setMeals)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  useSocketEvent('saved-meal-created', fetchMeals);
  useSocketEvent('saved-meal-updated', fetchMeals);
  useSocketEvent('saved-meal-deleted', fetchMeals);

  function handleCreated(meal: SavedMeal) {
    setMeals((prev) => [meal, ...prev]);
    // Refresh to get the full meal with items
    getSavedMeals().then(setMeals).catch(console.error);
  }
  function handleDeleted(id: number) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  // If create or edit modal is open, show split-panel modal
  if (createOpen || editingMeal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
        {/* No backdrop - app stays visible */}

        {/* Modal - responsive: full width mobile, 60% desktop */}
        <div className="relative w-full sm:w-[90%] sm:max-w-[78%] h-[95vh] sm:h-[90vh] bg-[#fffefb] dark:bg-[#1a1a1a]/95 dark:backdrop-blur-xl border border-[#cccbc8]/50 dark:border-white/10 rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row overflow-hidden shadow-sm dark:shadow-2xl">
          {/* Close button */}
          <button
            onClick={() => { setCreateOpen(false); setEditingMeal(null); }}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-xl text-[#313d44]/50 hover:text-[#1d1c1c] hover:bg-[#d4eaf7]/50 dark:text-white/40 dark:hover:text-white dark:hover:bg-white/10 z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Left: Meal Details - 70% on desktop, full width on mobile */}
          <div className="w-full sm:w-[70%] p-4 sm:p-6 border-b sm:border-b-0 sm:border-r border-[#cccbc8]/50 dark:border-white/10 overflow-y-auto">
            <h2 className="text-xl font-bold text-[#1d1c1c] dark:text-white mb-6">
              {editingMeal ? 'Edit Meal' : 'Create Meal'}
            </h2>

            <div className="space-y-4">
              <GlassInput
                label="Meal Name *"
                placeholder="e.g. Protein Breakfast"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
              />
              {nameError && <p className="text-xs text-red-400 -mt-2 pl-1">{nameError}</p>}

              <GlassInput
                label="Description (optional)"
                placeholder="Short note about this meal"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              {/* Totals */}
              {items.length > 0 && (
                <div className="flex gap-4 px-4 py-3 rounded-2xl bg-[#f5f4f1] dark:bg-white/5 border border-[#cccbc8]/50 dark:border-white/10">
                  <div className="text-center flex-1">
                    <p className="text-xs text-[#313d44]/60 dark:text-white/40">Calories</p>
                    <p className="font-bold text-[#1d1c1c] dark:text-white">{Math.round(totals.calories)}</p>
                  </div>
                  <div className="w-px bg-[#cccbc8]/50 dark:bg-white/10" />
                  <div className="text-center flex-1">
                    <p className="text-xs text-[#313d44]/60 dark:text-white/40">Protein</p>
                    <p className="font-bold text-[#1d1c1c] dark:text-white">{Math.round(totals.protein * 10) / 10}g</p>
                  </div>
                </div>
              )}

              {/* Added Foods List */}
              <div className="flex-1 min-h-0">
                <p className="text-sm font-medium text-[#313d44]/60 dark:text-white/60 pl-1 mb-2">Added Foods ({items.length})</p>
                <div className="bg-[#f5f4f1] dark:bg-white/5 border border-[#cccbc8]/50 dark:border-white/10 rounded-2xl p-4 h-full overflow-y-auto space-y-2">
                  {items.length === 0 ? (
                    <p className="text-[#313d44]/40 dark:text-white/40 text-sm text-center py-6">No foods added yet</p>
                  ) : (
                    items.map(({ food, quantity, unit }) => {
                      const { calories, protein } = calcItemNutrition(food, quantity, unit);
                      return (
                        <div
                          key={food.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-400/20"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1d1c1c] dark:text-white truncate">{food.name}</p>
                            <p className="text-xs text-[#313d44]/50 dark:text-white/50">
                              {formatQuantity(quantity, unit)} · {calories} kcal · {protein}g
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemove(food.id)}
                            className="p-1 rounded-lg text-[#313d44]/30 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{error}</p>
              )}

              {/* Mobile only: Search & Add Foods */}
              <div className="sm:hidden">
                <p className="text-sm font-medium text-[#313d44]/60 dark:text-white/60 pl-1 mb-2">Search & Add Foods</p>
                <div className="mb-4">
                  <FoodPickerForMeal
                    items={items}
                    onAdd={handleAddFood}
                    onRemove={handleRemove}
                    onUpdate={handleUpdate}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <GlassButton variant="default" className="flex-1" onClick={() => { setCreateOpen(false); setEditingMeal(null); }}>
                  Cancel
                </GlassButton>
                <GlassButton variant="primary" className="flex-1" onClick={handleSave} disabled={saving || items.length === 0}>
                  {saving ? 'Saving…' : editingMeal ? 'Save' : 'Create'}
                </GlassButton>
              </div>
            </div>
          </div>

          {/* Right: Search & Add Foods - only shown on desktop */}
          <div className="hidden sm:block sm:w-[30%] p-6 bg-[#f5f4f1] dark:bg-[#111111] flex flex-col h-full">
            <h3 className="text-lg font-semibold text-[#1d1c1c] dark:text-white mb-4 shrink-0">Search & Add Foods</h3>
            <div className="flex-1 overflow-y-auto min-h-0">
              <FoodPickerForMeal
                items={items}
                onAdd={handleAddFood}
                onRemove={handleRemove}
                onUpdate={handleUpdate}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Saved Meals</h1>
        <GlassButton variant="primary" onClick={() => setCreateOpen(true)}>
          <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Meal</span>
        </GlassButton>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400 text-sm">{error}</div>
      )}

      {/* List */}
      {loading ? (
        <MealSkeleton />
      ) : meals.length === 0 ? (
        <GlassCard className="text-center py-16">
          <UtensilsCrossed className="w-14 h-14 text-white/20 mx-auto mb-4" />
          <p className="text-white/60 font-medium text-lg">No saved meals yet</p>
          <p className="text-white/30 text-sm mt-2 max-w-xs mx-auto">
            Create a meal from your favourite foods so you can log it in one tap.
          </p>
          <div className="mt-6">
            <GlassButton variant="primary" onClick={() => setCreateOpen(true)}>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Meal</span>
            </GlassButton>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              onAddToJournal={setJournalTarget}
              onDelete={setDeleteTarget}
              onEdit={setEditingMeal}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateMealModal
        isOpen={createOpen || editingMeal !== null}
        onClose={() => { setCreateOpen(false); setEditingMeal(null); }}
        onCreated={handleCreated}
        editingMeal={editingMeal}
      />
      <AddToJournalModal
        isOpen={!!journalTarget}
        onClose={() => setJournalTarget(null)}
        meal={journalTarget}
      />
      <DeleteMealModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        meal={deleteTarget}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
