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
  Stepper,
} from '@/components/ui';
import { getSavedMeals, createSavedMeal, updateSavedMeal, deleteSavedMeal, addJournalEntry } from '@/lib/api';
import type { SavedMeal, Food, MealType, Unit } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { useIsNarrow } from '@/lib/useIsNarrow';
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

  const modalTitle = editingMeal ? 'Edit meal' : 'New meal';
  const subtitle =
    items.length > 0
      ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · template`
      : 'Template';
  const buttonText = editingMeal ? 'Save changes' : 'Save meal';

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={subtitle}
      size="xl"
      mobileFullscreen
      minHeight="sm:min-h-[80vh]"
      leadingFooter={
        items.length > 0 ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
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
                Total
              </div>
              <MonoNum size={16}>
                {Math.round(totals.calories)}
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-muted-foreground)',
                    marginLeft: 2,
                  }}
                >
                  kcal
                </span>
              </MonoNum>
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
              <MonoNum size={16}>
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
          </div>
        ) : null
      }
      footer={
        <>
          <GlassButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving || items.length === 0}
          >
            {saving ? 'Saving…' : buttonText}
          </GlassButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Name + description */}
        <div>
          <FieldLabel>Name</FieldLabel>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError('');
            }}
            placeholder="e.g. Protein breakfast"
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 14,
              background: 'var(--color-surface)',
              border:
                '1px solid ' +
                (nameError
                  ? 'var(--color-critical)'
                  : 'var(--color-border)'),
              borderRadius: 4,
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
            }}
          />
          {nameError && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-critical)',
                marginTop: 4,
                paddingLeft: 2,
              }}
            >
              {nameError}
            </div>
          )}
        </div>
        <div>
          <FieldLabel>Description (optional)</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note about this meal"
            rows={1}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              resize: 'vertical',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Two-column body: items list (left) + food picker (right) */}
        <div
          className="create-meal-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 16,
          }}
        >
          {/* Items list */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <FieldLabel>Items ({items.length})</FieldLabel>
            </div>
            {items.length === 0 ? (
              <EmptyState>No items yet — pick foods on the right.</EmptyState>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: 'var(--color-surface)',
                }}
              >
                {items.map(({ food, quantity, unit }) => {
                  const { calories } = calcItemNutrition(food, quantity, unit);
                  return (
                    <li
                      key={food.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(0, 1fr) auto auto auto',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
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
                          {food.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-muted-foreground)',
                            marginTop: 1,
                          }}
                        >
                          {formatQuantity(quantity, unit)}
                        </div>
                      </div>
                      <Stepper
                        value={quantity}
                        onChange={(q) => handleUpdate(food.id, q, unit)}
                        suffix={unit === 'serving' ? '×' : ''}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 600,
                          minWidth: 56,
                          textAlign: 'right',
                        }}
                      >
                        {Math.round(calories)} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(food.id)}
                        className="cursor-pointer"
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: 'var(--color-muted-foreground)',
                          padding: 4,
                          borderRadius: 4,
                          display: 'inline-flex',
                        }}
                        aria-label="Remove"
                      >
                        <X style={{ width: 13, height: 13, strokeWidth: 2 }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Search + picker */}
          <div style={{ minWidth: 0 }}>
            <FieldLabel>Add food</FieldLabel>
            <FoodPickerForMeal
              items={items}
              onAdd={handleAddFood}
              onRemove={handleRemove}
              onUpdate={handleUpdate}
            />
          </div>
        </div>

        {error && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-critical)',
              background: 'rgba(201,28,43,0.10)',
              border: '1px solid rgba(201,28,43,0.25)',
              padding: '8px 12px',
              borderRadius: 4,
            }}
          >
            {error}
          </p>
        )}

        <style jsx>{`
          @media (max-width: 720px) {
            :global(.create-meal-grid) {
              grid-template-columns: minmax(0, 1fr) !important;
            }
          }
        `}</style>
      </div>
    </GlassModal>
  );
}

// Small label helper to match the design's FieldLabel pattern.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-muted-foreground)',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
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
// ─── Meal row (table style, matches Foods database) ─────────────────────────

function MealRow({
  meal,
  selected,
  onSelect,
  onLog,
  showProtein = true,
}: {
  meal: SavedMeal;
  selected: boolean;
  onSelect: () => void;
  onLog: (meal: SavedMeal) => void;
  showProtein?: boolean;
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
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {meal.name}
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
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {meal.description ? ' · ' + meal.description : ''}
          </div>
        </div>
      </td>
      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
        <MonoNum size={14}>{Math.round(totals.calories)}</MonoNum>
        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', marginLeft: 2 }}>
          kcal
        </span>
      </td>
      {showProtein && (
        <td style={{ ...TD_STYLE, textAlign: 'right' }}>
          <MonoNum size={14}>{Math.round(totals.protein)}</MonoNum>
          <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', marginLeft: 2 }}>
            g
          </span>
        </td>
      )}
      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLog(meal);
          }}
          className="cursor-pointer"
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: 'var(--color-primary)',
            color: 'var(--color-primary-foreground)',
            border: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
          }}
          aria-label="Log this meal"
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.5 }} />
        </button>
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
  const isNarrow = useIsNarrow();
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const [journalTarget, setJournalTarget] = useState<SavedMeal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedMeal | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

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
            gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)',
            gap: 16,
            marginTop: 24,
          }}
        >
          {/* LEFT — search + table (matches Foods database) */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              minWidth: 0,
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
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
                  placeholder="Search saved meals…"
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
            </div>

            <div
              style={{
                height: 'calc(100vh - 280px)',
                minHeight: 480,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {(() => {
                const filtered = meals.filter(
                  (m) =>
                    !query.trim() ||
                    m.name.toLowerCase().includes(query.toLowerCase())
                );
                if (filtered.length === 0) {
                  return (
                    <div style={{ padding: 24 }}>
                      <EmptyState>No meals match.</EmptyState>
                    </div>
                  );
                }
                return (
                  <table
                    style={{
                      width: '100%',
                      tableLayout: 'fixed',
                      borderCollapse: 'collapse',
                    }}
                  >
                    <colgroup>
                      <col />
                      <col style={{ width: 80 }} />
                      {!isNarrow && <col style={{ width: 72 }} />}
                      <col style={{ width: 56 }} />
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
                        <th style={TH_STYLE}>Meal</th>
                        <th style={{ ...TH_STYLE, textAlign: 'right' }}>Cal</th>
                        {!isNarrow && (
                          <th style={{ ...TH_STYLE, textAlign: 'right' }}>
                            Protein
                          </th>
                        )}
                        <th style={TH_STYLE}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m) => (
                        <MealRow
                          key={m.id}
                          meal={m}
                          selected={selectedId === m.id}
                          onSelect={() => setSelectedId(m.id)}
                          onLog={(meal) => setJournalTarget(meal)}
                          showProtein={!isNarrow}
                        />
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          {/* RIGHT — detail panel */}
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
            grid-template-columns: minmax(0, 1fr) !important;
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
