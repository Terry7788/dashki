'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, UtensilsCrossed, Search, ChevronLeft, BookOpen, Pencil, X, ChevronDown } from 'lucide-react';
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
// ─── Meal card (design-faithful: name + items + cal/protein + Log button) ─────

function MealCard({
  meal,
  selected,
  onSelect,
  onAddToJournal,
}: {
  meal: SavedMeal;
  selected: boolean;
  onSelect: () => void;
  onAddToJournal: (meal: SavedMeal) => void;
}) {
  const [hover, setHover] = useState(false);
  const items = meal.items ?? [];
  const totals = items.reduce(
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
    <div
      onClick={onSelect}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        background: 'var(--color-surface)',
        border: selected
          ? '1px solid var(--color-primary)'
          : '1px solid var(--color-border)',
        boxShadow: selected
          ? '0 0 0 1px var(--color-primary), var(--shadow-card)'
          : 'var(--shadow-card)',
        borderRadius: 12,
        padding: 18,
        cursor: 'pointer',
        transition: 'border-color 120ms, box-shadow 120ms',
        opacity: hover && !selected ? 0.95 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.2px',
            color: 'var(--color-foreground)',
          }}
        >
          {meal.name}
        </h3>
        <Pill tone="medium">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Pill>
      </div>
      {meal.description && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          {meal.description}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          marginBottom: 12,
        }}
      >
        {items.slice(0, 4).map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              fontSize: 12,
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-muted-foreground)',
                minWidth: 32,
              }}
            >
              {it.quantity ?? it.servings ?? 1}×
            </span>
            <span
              style={{
                color: 'var(--color-foreground)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {it.name}
            </span>
          </div>
        ))}
        {items.length > 4 && (
          <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
            + {items.length - 4} more
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--color-border)',
          alignItems: 'baseline',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-muted-foreground)',
            }}
          >
            Cal
          </div>
          <MonoNum size={18}>{Math.round(totals.calories)}</MonoNum>
        </div>
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-muted-foreground)',
            }}
          >
            Protein
          </div>
          <MonoNum size={18}>
            {Math.round(totals.protein)}
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
                marginLeft: 2,
              }}
            >
              g
            </span>
          </MonoNum>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <GlassButton
            variant="soft"
            size="xs"
            onClick={() => onAddToJournal(meal)}
          >
            <Plus style={{ width: 12, height: 12, strokeWidth: 2.25 }} />
            Log
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

// ─── Meal detail (right column) ──────────────────────────────────────────────

function MealDetail({
  meal,
  onLog,
  onEdit,
  onDelete,
}: {
  meal: SavedMeal | null;
  onLog: (m: SavedMeal) => void;
  onEdit: (m: SavedMeal) => void;
  onDelete: (m: SavedMeal) => void;
}) {
  if (!meal) {
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
        Pick a meal to see its details.
      </div>
    );
  }

  const items = meal.items ?? [];
  const totals = items.reduce(
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
      <div style={{ marginBottom: 14 }}>
        <Pill tone="medium" upper>
          Template
        </Pill>
        <h2
          style={{
            margin: '6px 0 4px',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.4px',
          }}
        >
          {meal.name}
        </h2>
        {meal.description && (
          <div style={{ fontSize: 13, color: 'var(--color-muted-foreground)' }}>
            {meal.description}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          padding: '14px 0',
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div>
          <MicroLabel>Calories</MicroLabel>
          <MonoNum size={26} style={{ display: 'block', marginTop: 2 }}>
            {Math.round(totals.calories)}
          </MonoNum>
        </div>
        <div>
          <MicroLabel>Protein</MicroLabel>
          <MonoNum size={26} style={{ display: 'block', marginTop: 2 }}>
            {Math.round(totals.protein)}
            <span
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                marginLeft: 2,
              }}
            >
              g
            </span>
          </MonoNum>
        </div>
      </div>

      <MicroLabel
        style={{ marginTop: 16, marginBottom: 8, display: 'block' }}
      >
        Items
      </MicroLabel>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((it, i) => (
          <li
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--color-muted-foreground)',
                width: 28,
              }}
            >
              {it.quantity ?? it.servings ?? 1}×
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted-foreground)',
                  marginTop: 1,
                }}
              >
                {formatQuantity(it.quantity ?? it.servings ?? 1, (it.unit as Unit) ?? 'serving')}
              </div>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--color-foreground)',
                fontWeight: 600,
              }}
            >
              {Math.round((it.calories ?? 0) * (it.quantity ?? it.servings ?? 1))}
            </span>
          </li>
        ))}
      </ul>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
          flexWrap: 'wrap',
        }}
      >
        <GlassButton variant="primary" size="sm" onClick={() => onLog(meal)}>
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Log meal now
        </GlassButton>
        <GlassButton variant="outline" size="sm" onClick={() => onEdit(meal)}>
          <Pencil style={{ width: 14, height: 14, strokeWidth: 2 }} />
          Edit
        </GlassButton>
        <GlassButton variant="ghost" size="sm" onClick={() => onDelete(meal)}>
          <Trash2 style={{ width: 14, height: 14, strokeWidth: 2 }} />
          Delete
        </GlassButton>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MealsPage() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const [journalTarget, setJournalTarget] = useState<SavedMeal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedMeal | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchMeals = useCallback(() => {
    getSavedMeals()
      .then((arr) => {
        setMeals(arr);
        if (selectedId == null && arr.length > 0) setSelectedId(arr[0].id);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load')
      )
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    fetchMeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSocketEvent('saved-meal-created', fetchMeals);
  useSocketEvent('saved-meal-updated', fetchMeals);
  useSocketEvent('saved-meal-deleted', fetchMeals);

  function handleCreated(meal: SavedMeal) {
    setMeals((prev) => [meal, ...prev]);
    getSavedMeals().then(setMeals).catch(console.error);
  }
  function handleDeleted(id: number) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(meals[0]?.id ?? null);
  }

  const selectedMeal = meals.find((m) => m.id === selectedId) ?? null;

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
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.4px',
              margin: 0,
              color: 'var(--color-foreground)',
            }}
          >
            Saved meals
          </h1>
          <div
            style={{
              color: 'var(--color-muted-foreground)',
              marginTop: 4,
              fontSize: 14,
            }}
          >
            Templates for meals you log over and over.{' '}
            {!loading && meals.length > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {meals.length} saved.
              </span>
            )}
          </div>
        </div>
        <GlassButton variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          New meal
        </GlassButton>
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

      {loading ? (
        <div style={{ marginTop: 24 }}>
          <MealSkeleton />
        </div>
      ) : meals.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState>
            No saved meals yet.{' '}
            <a
              onClick={() => setCreateOpen(true)}
              style={{
                color: 'var(--color-link)',
                cursor: 'pointer',
              }}
            >
              Create one.
            </a>
          </EmptyState>
        </div>
      ) : (
        <div
          className="meals-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr',
            gap: 16,
            marginTop: 24,
          }}
        >
          <div
            className="meals-card-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              alignContent: 'start',
            }}
          >
            {meals.map((m) => (
              <MealCard
                key={m.id}
                meal={m}
                selected={selectedId === m.id}
                onSelect={() => setSelectedId(m.id)}
                onAddToJournal={(meal) => setJournalTarget(meal)}
              />
            ))}
            <button
              onClick={() => setCreateOpen(true)}
              className="cursor-pointer"
              style={{
                background: 'var(--color-surface-warm)',
                border: '1px dashed var(--color-border)',
                borderRadius: 12,
                padding: '30px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: 'var(--color-muted-foreground)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                minHeight: 200,
              }}
            >
              <Plus style={{ width: 16, height: 16, strokeWidth: 2 }} />
              New meal template
            </button>
          </div>

          <MealDetail
            meal={selectedMeal}
            onLog={(m) => setJournalTarget(m)}
            onEdit={(m) => setEditingMeal(m)}
            onDelete={(m) => setDeleteTarget(m)}
          />
        </div>
      )}

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.meals-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.meals-card-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <CreateMealModal
        isOpen={createOpen || editingMeal !== null}
        onClose={() => {
          setCreateOpen(false);
          setEditingMeal(null);
        }}
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
    </main>
  );
}
