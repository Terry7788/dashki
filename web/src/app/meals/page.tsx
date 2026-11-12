'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Search, Pencil, Check } from 'lucide-react';
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
import { useIsNarrow } from '@/lib/useIsNarrow';
import {
  FoodSheet,
  SearchBox,
  Chips,
  FoodAmount,
  TextBox,
  defaultAmount,
  unitsOf,
  useIsWide,
} from '@/components/food/FoodSheet';
import { FOOD_TAGS, inferTag, unitLabel, type FoodTag } from '@/lib/foodTags';
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

// ─── Saved-meal builder (Fold 8 design, 2026-11-12) ───────────────────────────
// Phones: name + "Add a food" search pinned on top; an empty search lists the
// meal's foods with steppers, typing lists matching foods with a +. Tray at the
// bottom with totals and Save meal. From 700 px: left = food search with chips
// (tick = in the meal), right = name, note, the meal's foods, totals, Save.

interface PickedItem {
  food: Food;
  quantity: number;
  unit: Unit;
  /** Built from a saved meal's item (no units/carbs/fat yet) — swapped for the full food once it loads. */
  partial?: boolean;
}

type BuilderChip = 'Recent' | FoodTag | 'All';

/** Debounced food search, same endpoint and timing as the old picker. */
function useFoodSearch(query: string, active: boolean) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = query.trim()
          ? `${BASE_URL}/api/foods?search=${encodeURIComponent(query.trim())}`
          : `${BASE_URL}/api/foods`;
        const res = await fetch(url);
        if (res.ok) setFoods(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, active]);

  return { foods, loading };
}

/** Calories from protein / carbs / fat for one item, or null if the food has no macro data. */
function macroKcal(food: Food, kcal: number) {
  const base = food.calories ?? 0;
  if (!base || food.carbs === undefined) return null;
  const s = kcal / base;
  return { p: (food.protein ?? 0) * s * 4, c: (food.carbs ?? 0) * s * 4, f: (food.fat ?? 0) * s * 9 };
}

function splitText(items: PickedItem[]): string | null {
  if (items.length === 0) return null;
  let p = 0, c = 0, f = 0;
  for (const { food, quantity, unit } of items) {
    const m = macroKcal(food, calcItemNutrition(food, quantity, unit).calories);
    if (!m) return null;
    p += m.p; c += m.c; f += m.f;
  }
  const t = p + c + f;
  if (t <= 0) return null;
  const pc = (n: number) => Math.round((n / t) * 100);
  return `P ${pc(p)}% · C ${pc(c)}% · F ${pc(f)}%`;
}

function TotalsBlock({ calories, protein, split }: { calories: number; protein: number; split: string | null }) {
  const big: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, lineHeight: 1.2 };
  const unit: React.CSSProperties = { fontSize: 12, color: 'var(--color-muted-foreground)', marginLeft: 6, fontWeight: 500 };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
      <div>
        <div className="fs-label">Total</div>
        <div style={big}>{Math.round(calories)}<span style={unit}>kcal</span></div>
      </div>
      <div>
        <div className="fs-label">Protein</div>
        <div style={big}>{Math.round(protein)}<span style={unit}>g</span></div>
      </div>
      {split && <div className="fs-meta" style={{ marginLeft: 'auto', paddingTop: 1 }}>{split}</div>}
    </div>
  );
}

/** One food in the meal: name + kcal, remove, then the amount stepper (+ unit switch). */
function MealItemRow({
  item, onChange, onRemove, inSide,
}: {
  item: PickedItem;
  onChange: (n: { quantity: number; unit: Unit }) => void;
  onRemove: () => void;
  inSide?: boolean;
}) {
  const { food, quantity, unit } = item;
  const { calories } = calcItemNutrition(food, quantity, unit);
  const units = unitsOf(food);
  // A saved meal's item may carry a unit its (partial) food doesn't list yet.
  const shownFood = units.some((u) => u.unit === unit)
    ? food
    : ({ ...food, units: [...units, { unit, label: unit === 'serving' ? 'serving' : unit, default: false }] } as Food);
  return (
    <div style={{ padding: inSide ? '10px 0' : '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fs-name">{food.name}</div>
          <div className="fs-meta">{Math.round(calories)} kcal · {formatQuantity(quantity, unit)}</div>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${food.name}`}
          style={{ width: 32, height: 32, borderRadius: 16, border: 0, background: 'transparent', color: 'var(--color-muted-foreground)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <Trash2 style={{ width: 16, height: 16, strokeWidth: 2 }} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <FoodAmount food={shownFood} quantity={quantity} unit={unit} onChange={onChange} />
      </div>
    </div>
  );
}

/** A food in the search list: tick when it's in the meal, + to add. Tapping the row toggles it. */
function FoodPickRow({ food, item, onToggle }: { food: Food; item?: PickedItem; onToggle: () => void }) {
  const on = !!item;
  const kcal = item ? calcItemNutrition(food, item.quantity, item.unit).calories : food.calories ?? food.calories_per_100g ?? 0;
  const protein = item ? calcItemNutrition(food, item.quantity, item.unit).protein : food.protein ?? food.protein_per_100g ?? 0;
  return (
    <div className={`fs-row${on ? ' on' : ''}`} onClick={onToggle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="fs-name">{food.name}</div>
        <div className="fs-meta">{item ? formatQuantity(item.quantity, item.unit) : unitLabel(food)}</div>
      </div>
      <span className="fs-col">{Math.round(protein ?? 0)} g P</span>
      <span className="fs-kcal">{Math.round(kcal)}<small>kcal</small></span>
      <button type="button" className={`fs-add${on ? ' on' : ''}`} aria-label={on ? `Remove ${food.name}` : `Add ${food.name}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        {on ? <Check style={{ width: 18, height: 18, strokeWidth: 2.5 }} /> : <Plus style={{ width: 18, height: 18, strokeWidth: 2.25 }} />}
      </button>
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
  const wide = useIsWide();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<PickedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<BuilderChip>('All');
  const { foods, loading } = useFoodSearch(query, isOpen);

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
            partial: true,
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
      setQuery('');
      setChip('All');
    }
  }, [isOpen, editingMeal]);

  // Swap a saved meal's partial foods for the full ones (units, carbs, fat) once the list has them.
  useEffect(() => {
    if (foods.length === 0) return;
    setItems((prev) => {
      if (!prev.some((i) => i.partial && foods.some((f) => f.id === i.food.id))) return prev;
      return prev.map((i) => {
        if (!i.partial) return i;
        const full = foods.find((f) => f.id === i.food.id);
        return full ? { ...i, food: full, partial: false } : i;
      });
    });
  }, [foods]);

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
    setError('');
  }
  function handleRemove(foodId: number) {
    setItems((prev) => prev.filter((i) => i.food.id !== foodId));
  }
  function handleUpdate(foodId: number, quantity: number, unit: Unit) {
    setItems((prev) => prev.map((i) => i.food.id === foodId ? { ...i, quantity, unit } : i));
  }
  function toggleFood(food: Food) {
    if (items.some((i) => i.food.id === food.id)) {
      handleRemove(food.id);
    } else {
      const d = defaultAmount(food);
      handleAddFood(food, d.quantity, d.unit);
    }
  }

  const totals = items.reduce(
    (acc, { food, quantity, unit }) => {
      const { calories, protein } = calcItemNutrition(food, quantity, unit);
      return { calories: acc.calories + calories, protein: acc.protein + protein };
    },
    { calories: 0, protein: 0 }
  );
  const split = splitText(items);

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

  const modalTitle = editingMeal ? 'Edit saved meal' : 'New saved meal';
  const buttonText = editingMeal ? 'Save changes' : 'Save meal';
  const itemById = new Map(items.map((i) => [i.food.id, i]));

  const hasRecent = foods.some((f) => f.recently_used);
  const chips: BuilderChip[] = hasRecent ? ['Recent', ...FOOD_TAGS] : [...FOOD_TAGS];
  const shownFoods = foods.filter((f) =>
    !wide || chip === 'All' ? true : chip === 'Recent' ? !!f.recently_used : inferTag(f) === chip
  );

  const nameBox = (
    <div className="fs-field">
      <input
        className="fs-input"
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setNameError(''); }}
        placeholder="e.g. Protein breakfast"
        aria-label="Meal name"
        style={{ fontSize: 17, fontWeight: 600, ...(nameError ? { borderColor: 'var(--color-critical)' } : {}) }}
      />
      {nameError && <div style={{ fontSize: 12, color: 'var(--color-critical)', paddingLeft: 4 }}>{nameError}</div>}
    </div>
  );
  const noteBox = (
    <TextBox value={description} onChange={setDescription} placeholder="Add a note (optional)" />
  );

  const searchList = (
    <>
      {loading && foods.length === 0 && <div className="fs-empty">Searching…</div>}
      {!loading && shownFoods.length === 0 && (
        <div className="fs-empty">{query.trim() ? 'No foods match.' : 'No foods here.'}</div>
      )}
      {shownFoods.map((food) => (
        <FoodPickRow key={food.id} food={food} item={itemById.get(food.id)} onToggle={() => toggleFood(food)} />
      ))}
    </>
  );

  const mealList = (inSide: boolean) =>
    items.length === 0 ? (
      <div className="fs-empty">
        {wide ? 'No foods yet. Pick them on the left.' : 'No foods yet. Search above to add some.'}
      </div>
    ) : (
      items.map((item) => (
        <MealItemRow
          key={item.food.id}
          item={item}
          inSide={inSide}
          onChange={({ quantity, unit }) => handleUpdate(item.food.id, quantity, unit)}
          onRemove={() => handleRemove(item.food.id)}
        />
      ))
    );

  const saveButton = (
    <button type="button" className="fs-btn" onClick={handleSave} disabled={saving || items.length === 0}>
      {saving ? 'Saving…' : buttonText}
    </button>
  );

  const countLabel = (
    <div className="fs-label" style={{ padding: wide ? '4px 0 2px' : '6px 14px 4px' }}>
      {items.length} {items.length === 1 ? 'food' : 'foods'}
    </div>
  );

  if (wide) {
    return (
      <FoodSheet
        isOpen={isOpen}
        onClose={onClose}
        title={modalTitle}
        subtitle="Log it in one tap later"
        sideWidth={340}
        top={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search foods to add" autoFocus={!editingMeal} />
            <Chips options={chips} value={chip} onChange={setChip} />
          </>
        }
        side={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nameBox}
            {noteBox}
            {countLabel}
            <div>{mealList(true)}</div>
          </div>
        }
        sideFoot={
          <>
            {error && <div className="fs-err">{error}</div>}
            <div className="fs-card" style={{ padding: '12px 14px' }}>
              <TotalsBlock calories={totals.calories} protein={totals.protein} split={split} />
            </div>
            {saveButton}
          </>
        }
      >
        {searchList}
      </FoodSheet>
    );
  }

  const searching = query.trim().length > 0;
  return (
    <FoodSheet
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle="Log it in one tap later"
      top={
        <>
          {nameBox}
          <SearchBox value={query} onChange={setQuery} placeholder="Add a food to this meal" />
        </>
      }
      tray={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div className="fs-err">{error}</div>}
          <TotalsBlock calories={totals.calories} protein={totals.protein} split={split} />
          {saveButton}
        </div>
      }
    >
      {searching ? (
        searchList
      ) : (
        <>
          {countLabel}
          {mealList(false)}
          <div style={{ padding: '14px 14px 8px' }}>{noteBox}</div>
        </>
      )}
    </FoodSheet>
  );
}

// ─── Add to Journal Modal ──────────────────────────────────────────────────────

interface AddToJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  meal: SavedMeal | null;
}

function AddToJournalModal({ isOpen, onClose, meal }: AddToJournalModalProps) {
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [logDate, setLogDate] = useState(toISODate(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fullMeal, setFullMeal] = useState<SavedMeal | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSuccess(false);
    setPickerOpen(false);
    setLogDate(toISODate(new Date()));
    // Pick a default meal type based on the time of day.
    const h = new Date().getHours();
    setMealType(
      h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner'
    );
    // Resolve the full meal (the list endpoint omits items).
    if (meal) {
      if (meal.items) {
        setFullMeal(meal);
      } else {
        fetch(`${BASE_URL}/api/meals/saved/${meal.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((m) => setFullMeal(m ?? meal))
          .catch(() => setFullMeal(meal));
      }
    }
  }, [isOpen, meal]);

  async function handleAdd() {
    if (!meal || !fullMeal) return;
    setSaving(true);
    setError('');
    try {
      if (!fullMeal.items || fullMeal.items.length === 0) {
        setError('Meal has no items');
        setSaving(false);
        return;
      }
      for (const item of fullMeal.items) {
        const quantity = item.quantity ?? item.servings ?? 1;
        const unit = (item.unit as Unit) ?? 'serving';
        await addJournalEntry({
          date: logDate,
          meal_type: mealType,
          food_id: item.foodId,
          food_name_snapshot: item.name ?? `Food ${item.foodId}`,
          quantity,
          unit,
        });
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add to journal');
    } finally {
      setSaving(false);
    }
  }

  // Compute totals for the summary preview.
  const totals = (fullMeal?.items ?? []).reduce(
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

  const today = toISODate(new Date());
  const subtitle = meal ? meal.name : '';

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Log meal"
      subtitle={subtitle}
      size="sm"
      headerTrailing={
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
          {MEAL_TYPES.map((m) => {
            const active = m === mealType;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMealType(m)}
                className="cursor-pointer"
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: active ? 'var(--color-surface)' : 'transparent',
                  color: active
                    ? 'var(--color-foreground)'
                    : 'var(--color-muted-foreground)',
                  border: 0,
                  fontFamily: 'inherit',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {MEAL_LABELS[m]}
              </button>
            );
          })}
        </div>
      }
      footer={
        <>
          <GlassButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={saving || success || !fullMeal?.items?.length}
          >
            {success ? '✓ Logged' : saving ? 'Logging…' : 'Add to journal'}
          </GlassButton>
        </>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 220,
        }}
      >
        {/* Summary card */}
        <div
          style={{
            padding: 12,
            background: 'var(--color-badge-bg)',
            border: '1px solid var(--color-primary)',
            borderRadius: 8,
            display: 'flex',
            gap: 18,
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
              Items
            </div>
            <MonoNum size={20}>{fullMeal?.items?.length ?? 0}</MonoNum>
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
              Calories
            </div>
            <MonoNum size={20}>
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
            <MonoNum size={20}>
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

        {/* Date selector */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--color-muted-foreground)',
              marginBottom: 6,
            }}
          >
            Date
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                setLogDate(today);
                setPickerOpen(false);
              }}
              className="cursor-pointer"
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: logDate === today ? 600 : 500,
                background:
                  logDate === today
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
                color:
                  logDate === today
                    ? 'var(--color-primary-foreground)'
                    : 'var(--color-muted-foreground)',
                border:
                  logDate === today ? '0' : '1px solid var(--color-border)',
                borderRadius: 6,
                fontFamily: 'inherit',
              }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="cursor-pointer"
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 500,
                background:
                  logDate !== today
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
                color:
                  logDate !== today
                    ? 'var(--color-primary-foreground)'
                    : 'var(--color-muted-foreground)',
                border:
                  logDate !== today ? '0' : '1px solid var(--color-border)',
                borderRadius: 6,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {logDate !== today
                ? new Date(logDate + 'T00:00:00').toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'Pick a date'}
            </button>
          </div>
          {pickerOpen && (
            <input
              type="date"
              value={logDate}
              max={today}
              onChange={(e) => setLogDate(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                fontSize: 14,
                marginTop: 8,
              }}
            />
          )}
        </div>

        {/* Hint */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          Logs all{' '}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-foreground)',
              fontWeight: 600,
            }}
          >
            {fullMeal?.items?.length ?? 0}
          </span>{' '}
          items into{' '}
          <span
            style={{
              color: 'var(--color-foreground)',
              fontWeight: 600,
            }}
          >
            {MEAL_LABELS[mealType]}
          </span>
          .
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

  useEffect(() => {
    if (isOpen) setError('');
  }, [isOpen]);

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

  const itemCount = meal?.items?.length ?? 0;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="sm"
      showCloseButton={false}
      footer={
        <>
          <GlassButton variant="ghost" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="danger"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 style={{ width: 13, height: 13, strokeWidth: 2 }} />
            {deleting ? 'Deleting…' : 'Delete meal'}
          </GlassButton>
        </>
      }
    >
      <div style={{ padding: 4 }}>
        {/* Danger icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 9999,
            background: 'rgba(201,28,43,0.12)',
            color: 'var(--color-critical)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <Trash2 style={{ width: 18, height: 18, strokeWidth: 2 }} />
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.2px',
            marginBottom: 6,
            color: 'var(--color-foreground)',
          }}
        >
          Delete &ldquo;{meal?.name}&rdquo;?
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          This permanently removes the meal template
          {itemCount > 0 && (
            <>
              , including all{' '}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-foreground)',
                  fontWeight: 600,
                }}
              >
                {itemCount}
              </span>{' '}
              {itemCount === 1 ? 'item' : 'items'}
            </>
          )}
          . Logged journal entries that used it stay where they are.{' '}
          <strong style={{ color: 'var(--color-foreground)' }}>
            Cannot be undone.
          </strong>
        </div>
        {error && (
          <p
            style={{
              marginTop: 12,
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
