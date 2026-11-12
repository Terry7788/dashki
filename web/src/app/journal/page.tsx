'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Loader2, Clock, Search, Copy, MoreHorizontal, Move, Sunrise, Sun, Cookie, Moon, X, Sparkles, BookOpen, Check } from 'lucide-react';
import Link from 'next/link';
import { FoodSheet, Seg, MealBar, SearchBox, Chips, NumBox, TextBox, Stepper, FoodAmount, foodTotals, defaultAmount, useIsWide } from '@/components/food/FoodSheet';
import { GlassCard, GlassButton, GlassInput, GlassModal, CalorieRing, MacroBar, MicroLabel, MonoNum, EmptyState, CardShell } from '@/components/ui';
import {
  FOOD_TAGS,
  inferTag,
  unitLabel,
} from '@/lib/foodTags';
import type { FoodTag } from '@/lib/foodTags';
import {
  getJournalEntries,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getSavedMeals,
  getGoals,
  updateGoals,
  estimateFood,
  createFood,
} from '@/lib/api';
import type { JournalEntry, MealType, Food, SavedMeal, SavedMealItem, Unit } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { QuantityInput } from '@/components/QuantityInput';
import { nutritionFor, formatQuantity } from '@/lib/nutrition';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GOALS = { calories: 2000, protein: 150, fiber: null as number | null };

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};
const BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  // Use en-CA locale for YYYY-MM-DD in local time (not UTC like toISOString())
  return d.toLocaleString('en-CA').split(',')[0];
}

function formatDateLabel(d: Date): string {
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  const key = toISODate(d);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}


// ─── Skeleton ─────────────────────────────────────────────────────────────────

function JournalSkeleton() {
  return (
    <div className="space-y-4">
      {MEAL_TYPES.map((m) => (
        <div key={m} className="skeleton h-24 rounded-3xl" />
      ))}
    </div>
  );
}

// ─── Add Food sheet (Fold 8 redesign, 2026-11-12) ─────────────────────────
// Folded: one full-height sheet, picked foods open their amount under the row and a
// tray at the bottom keeps the total + Add button. Unfolded: list on the left,
// "Your plate" / the chosen saved meal on the right. Parts: components/food/FoodSheet.

interface SelectedFood {
  food: Food;
  quantity: number;
  unit: Unit;
}

function useFoodSearch(query: string, enabled: boolean) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.trim();
        const res = await fetch(q ? `${BASE_URL}/api/foods?search=${encodeURIComponent(q)}` : `${BASE_URL}/api/foods`);
        if (res.ok) setFoods(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, enabled]);
  return { foods, loading };
}

/** Calories/protein of a saved meal item at a given amount, using the food's own base. */
function mealItemTotals(item: SavedMealItem, quantity: number, unit: Unit) {
  try {
    return nutritionFor(
      {
        base_amount: item.baseAmount ?? 1,
        base_unit: (item.baseUnit ?? 'serving') as Unit,
        serving_size_g: item.serving_size_g ?? null,
        calories: item.calories ?? 0,
        protein: item.protein ?? null,
      },
      quantity,
      unit
    );
  } catch {
    return { calories: (item.calories || 0) * quantity, protein: (item.protein || 0) * quantity };
  }
}

const itemQty = (item: SavedMealItem) => item.quantity ?? item.servings ?? 1;
const itemUnit = (item: SavedMealItem) => (item.unit as Unit) ?? 'serving';
const fmtQty = (q: number, u: Unit) => `${Math.round(q * 100) / 100}${u === 'serving' ? '' : ` ${u}`}`;

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: MealType;
  date: string;
  onAdded: (entry: JournalEntry) => void;
  /** Calories still left today before this log (goal − eaten); shows "after this" in the totals. */
  caloriesLeft?: number;
}

function AddFoodModal({ isOpen, onClose, mealType: initialMealType, date, onAdded, caloriesLeft }: AddFoodModalProps) {
  const wide = useIsWide();
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  useEffect(() => {
    if (isOpen) setMealType(initialMealType);
  }, [isOpen, initialMealType]);
  const [tab, setTab] = useState<'foods' | 'meals' | 'quick'>('foods');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Foods tab
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<FoodTag | 'All'>('All');
  const { foods, loading } = useFoodSearch(query, isOpen && tab === 'foods');
  const visible = useMemo(() => (tag === 'All' ? foods : foods.filter((f) => inferTag(f) === tag)), [foods, tag]);
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Saved meals tab
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [mealQuery, setMealQuery] = useState('');
  const [openMeal, setOpenMeal] = useState<SavedMeal | null>(null);
  const [mealAmounts, setMealAmounts] = useState<Record<number, number>>({});

  // Quick add
  const [quickName, setQuickName] = useState('');
  const [quickCalories, setQuickCalories] = useState('');
  const [quickProtein, setQuickProtein] = useState('');
  // Only filled by the AI guess; used when "Add and save to my foods" creates the Food row.
  const [quickCarbs, setQuickCarbs] = useState<number | null>(null);
  const [quickFat, setQuickFat] = useState<number | null>(null);
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<{ portion: string; reasoning: string } | null>(null);

  // Fresh start every time it opens.
  useEffect(() => {
    if (!isOpen) {
      setSelectedFoods([]);
      setExpandedId(null);
      setOpenMeal(null);
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (tab === 'meals' && savedMeals.length === 0) {
      setLoadingMeals(true);
      getSavedMeals()
        .then(setSavedMeals)
        .catch(() => { })
        .finally(() => setLoadingMeals(false));
    }
  }, [tab, savedMeals.length]);

  function toggleFood(food: Food) {
    if (selectedFoods.some((sf) => sf.food.id === food.id)) {
      setSelectedFoods(selectedFoods.filter((sf) => sf.food.id !== food.id));
      if (expandedId === food.id) setExpandedId(null);
    } else {
      setSelectedFoods([...selectedFoods, { food, ...defaultAmount(food) }]);
      setExpandedId(food.id); // amount editor opens straight away
    }
  }

  function setAmount(foodId: number, next: { quantity: number; unit: Unit }) {
    setSelectedFoods(selectedFoods.map((sf) => (sf.food.id === foodId ? { ...sf, quantity: Math.max(0, next.quantity), unit: next.unit } : sf)));
  }

  async function handleAddSelectedFoods() {
    if (selectedFoods.length === 0) return;
    setSaving(true);
    setError('');
    try {
      for (const { food, quantity, unit } of selectedFoods) {
        if (quantity <= 0) continue;
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: food.id,
          food_name_snapshot: food.name,
          quantity,
          unit,
        });
        onAdded(entry);
      }
      setSelectedFoods([]);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add entries');
    } finally {
      setSaving(false);
    }
  }

  // The list endpoint doesn't include items — fetch the full meal when it's opened or logged.
  async function fullMeal(meal: SavedMeal): Promise<SavedMeal> {
    if (meal.items) return meal;
    const res = await fetch(`${BASE_URL}/api/meals/saved/${meal.id}`);
    if (!res.ok) return meal;
    const full: SavedMeal = await res.json();
    setSavedMeals((prev) => prev.map((m) => (m.id === full.id ? full : m)));
    return full;
  }

  async function openSavedMeal(meal: SavedMeal) {
    if (openMeal?.id === meal.id && !wide) {
      setOpenMeal(null);
      return;
    }
    setOpenMeal(meal);
    setMealAmounts({});
    try {
      const full = await fullMeal(meal);
      setOpenMeal((cur) => (cur?.id === full.id ? full : cur));
    } catch { /* keep the summary */ }
  }

  /** Logs every item of a saved meal; `amounts` (item id → quantity) changes amounts for this log only. */
  async function handleAddMeal(meal: SavedMeal, amounts: Record<number, number> = {}) {
    setSaving(true);
    setError('');
    try {
      const full = await fullMeal(meal);
      if (!full.items || full.items.length === 0) {
        setError('This meal has no items');
        setSaving(false);
        return;
      }
      for (const item of full.items) {
        // Server computes snapshots when food_id is set; log in each item's native unit
        const quantity = amounts[item.id] ?? itemQty(item);
        if (quantity <= 0) continue;
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: item.foodId,
          food_name_snapshot: item.name ?? `Food ${item.foodId}`,
          quantity,
          unit: itemUnit(item),
        });
        onAdded(entry);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add meal');
    } finally {
      setSaving(false);
    }
  }

  async function handleAiGuess() {
    if (!quickName.trim() || aiEstimating) return;
    setAiEstimating(true);
    setAiError('');
    try {
      const r = await estimateFood(quickName.trim());
      setQuickCalories(String(r.calories));
      setQuickProtein(String(r.protein));
      setQuickCarbs(r.carbs);
      setQuickFat(r.fat);
      setAiResult({ portion: r.portion, reasoning: r.reasoning });
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Could not estimate this food');
    } finally {
      setAiEstimating(false);
    }
  }

  function resetQuick() {
    setQuickName('');
    setQuickCalories('');
    setQuickProtein('');
    setQuickCarbs(null);
    setQuickFat(null);
    setAiResult(null);
    setAiError('');
  }

  // "Add and save to my foods": creates a Food row (per 1 serving) from the typed/AI
  // numbers, then logs a journal entry that references it.
  async function handleQuickAddAndSave() {
    const cal = parseFloat(quickCalories);
    const pro = parseFloat(quickProtein) || 0;
    if (!quickName.trim() || !cal || cal < 0) return;
    setSaving(true);
    setError('');
    try {
      const food = await createFood({
        name: quickName.trim(),
        baseAmount: 1,
        baseUnit: 'serving',
        calories: Math.round(cal),
        protein: Math.round(pro * 10) / 10,
        carbs: quickCarbs ?? 0,
        fat: quickFat ?? 0,
      } as unknown as Omit<Food, 'id' | 'created_at'>);
      const entry = await addJournalEntry({
        date,
        meal_type: mealType,
        food_id: food.id,
        food_name_snapshot: food.name,
        quantity: 1,
        unit: 'serving',
      });
      onAdded(entry);
      resetQuick();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save food');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAdd() {
    const cal = parseFloat(quickCalories);
    const pro = parseFloat(quickProtein) || 0;
    if (!quickName.trim() || !cal || cal < 0) return;
    setSaving(true);
    setError('');
    try {
      const entry = await addJournalEntry({
        date,
        meal_type: mealType,
        food_name_snapshot: quickName.trim(),
        quantity: 1,
        unit: 'serving',
        calories_snapshot: Math.round(cal),
        protein_snapshot: Math.round(pro * 10) / 10,
      });
      onAdded(entry);
      resetQuick();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  }

  // ── Totals ──
  const plate = selectedFoods.reduce(
    (acc, sf) => {
      const t = foodTotals(sf.food, sf.quantity, sf.unit);
      return { calories: acc.calories + t.calories, protein: acc.protein + t.protein };
    },
    { calories: 0, protein: 0 }
  );
  const mealLabel = MEAL_LABELS[mealType];
  const day = new Date(date + 'T00:00:00');
  const dayLabel = formatDateLabel(day);
  const subtitle = dayLabel === 'Today' || dayLabel === 'Yesterday'
    ? `${dayLabel} · ${day.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`
    : dayLabel;
  const matchedMeals = savedMeals.filter((m) => !mealQuery || m.name.toLowerCase().includes(mealQuery.toLowerCase()));
  const mealTotals = (meal: SavedMeal, amounts: Record<number, number> = {}) =>
    (meal.items || []).reduce(
      (acc, item) => {
        const t = mealItemTotals(item, amounts[item.id] ?? itemQty(item), itemUnit(item));
        return { calories: acc.calories + t.calories, protein: acc.protein + t.protein };
      },
      { calories: 0, protein: 0 }
    );

  // ── Pieces ──
  const tabs = (
    <Seg
      label="Add from"
      small={wide}
      value={tab}
      onChange={(t) => { setTab(t); setError(''); }}
      options={[
        { value: 'foods', label: 'Foods' },
        { value: 'meals', label: 'Saved meals' },
        { value: 'quick', label: 'Quick add' },
      ]}
    />
  );
  const errorBox = error ? <div className="fs-err" style={{ margin: wide ? '0' : '0 0 4px' }}>{error}</div> : null;

  const totalsCard = (
    <div className="fs-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, flex: 1 }}>
          {Math.round(plate.calories)} <span className="fs-meta">kcal</span>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600 }}>
          {plate.protein.toFixed(1)} <span className="fs-meta">g protein</span>
        </span>
      </div>
      {caloriesLeft != null && (
        <>
          <div className="fs-bar">
            <div style={{
              width: `${Math.min(100, caloriesLeft > 0 ? (plate.calories / caloriesLeft) * 100 : 100)}%`,
              background: plate.calories > caloriesLeft ? 'var(--color-critical)' : '#FFB27A',
            }} />
          </div>
          <div className="fs-meta">
            {caloriesLeft - plate.calories >= 0
              ? `After this: ${Math.round(caloriesLeft - plate.calories).toLocaleString()} kcal left`
              : `After this: ${Math.round(plate.calories - caloriesLeft).toLocaleString()} kcal over`}
          </div>
        </>
      )}
    </div>
  );
  const addFoodsBtn = (
    <button type="button" className="fs-btn" onClick={handleAddSelectedFoods} disabled={saving || selectedFoods.length === 0}>
      {saving ? 'Adding…' : selectedFoods.length > 1 ? `Add ${selectedFoods.length} to ${mealLabel}` : `Add to ${mealLabel}`}
    </button>
  );

  function foodRow(food: Food) {
    const sel = selectedFoods.find((sf) => sf.food.id === food.id);
    const expanded = !wide && !!sel && expandedId === food.id;
    const cal = food.calories ?? food.calories_per_100g ?? 0;
    const protein = food.protein ?? food.protein_per_100g ?? 0;
    return (
      <Fragment key={food.id}>
        <div
          className={`fs-row${sel ? ' on' : ''}`}
          onClick={() => (sel && !wide ? setExpandedId(expanded ? null : food.id) : toggleFood(food))}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fs-name">{food.name}</div>
            <div className="fs-meta">{unitLabel(food)}</div>
          </div>
          {wide && <span className="fs-col" style={{ width: 64 }}>{protein} g</span>}
          <span className="fs-kcal" style={{ minWidth: 44 }}>{cal}<small>kcal</small></span>
          <button type="button" className={`fs-add${sel ? ' on' : ''}`} aria-label={sel ? 'Remove' : 'Add'}
            onClick={(e) => { e.stopPropagation(); toggleFood(food); }}>
            {sel ? <Check style={{ width: 16, height: 16, strokeWidth: 3 }} /> : <Plus style={{ width: 16, height: 16, strokeWidth: 2.5 }} />}
          </button>
        </div>
        {expanded && sel && (
          <div className="fs-rowx on fs-flash">
            <FoodAmount food={food} quantity={sel.quantity} unit={sel.unit} showKcal onChange={(n) => setAmount(food.id, n)} />
          </div>
        )}
      </Fragment>
    );
  }

  // ── Per tab ──
  let top: React.ReactNode;
  let body: React.ReactNode;
  let side: React.ReactNode;
  let sideFoot: React.ReactNode;
  let tray: React.ReactNode;
  let foot: React.ReactNode;
  let padded = false;

  if (tab === 'foods') {
    top = (
      <>
        {wide ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><SearchBox value={query} onChange={setQuery} placeholder="Search foods" autoFocus /></div>
            <div style={{ width: 280, flex: 'none' }}>{tabs}</div>
          </div>
        ) : (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search foods" autoFocus />
            {tabs}
          </>
        )}
        <Chips options={FOOD_TAGS} value={tag} onChange={setTag} />
        {errorBox}
      </>
    );
    body = (
      <>
        {wide && visible.length > 0 && (
          <div className="fs-colhead"><span style={{ flex: 1 }}>Food</span><span style={{ width: 64, textAlign: 'right' }}>Protein</span><span style={{ width: 44, textAlign: 'right' }}>kcal</span><span style={{ width: 36 }} /></div>
        )}
        {loading && foods.length === 0 && <div className="fs-empty">Searching…</div>}
        {!loading && visible.length === 0 && <div className="fs-empty">No foods match.</div>}
        {visible.map(foodRow)}
        {!wide && selectedFoods.length > 0 && <div style={{ height: 8 }} />}
      </>
    );
    side = (
      <>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Your plate</span>
          {selectedFoods.length > 0 && (
            <button type="button" onClick={() => setSelectedFoods([])} style={{ border: 0, background: 'none', color: 'var(--color-primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', font: 'inherit' }}>Clear</button>
          )}
        </div>
        {selectedFoods.length === 0 ? (
          <div className="fs-empty" style={{ padding: '40px 8px' }}>Tap + on a food to add it here.</div>
        ) : (
          selectedFoods.map((sf) => (
            <div key={sf.food.id} className="fs-flash" style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fs-name" style={{ fontSize: 14 }}>{sf.food.name}</div>
                  <div className="fs-meta">{Math.round(foodTotals(sf.food, sf.quantity, sf.unit).calories)} kcal</div>
                </div>
                <button type="button" aria-label="Remove" onClick={() => toggleFood(sf.food)} style={{ border: 0, background: 'none', color: 'var(--color-muted-foreground)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <FoodAmount food={sf.food} quantity={sf.quantity} unit={sf.unit} onChange={(n) => setAmount(sf.food.id, n)} />
              </div>
            </div>
          ))
        )}
      </>
    );
    sideFoot = <>{totalsCard}{addFoodsBtn}</>;
    if (selectedFoods.length > 0) {
      tray = (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600 }}>{Math.round(plate.calories)} kcal</span>
            <span className="fs-meta" style={{ flex: 1 }}>
              {plate.protein.toFixed(0)} g protein · {selectedFoods.length} {selectedFoods.length === 1 ? 'food' : 'foods'}
              {caloriesLeft != null && ` · ${Math.round(caloriesLeft - plate.calories).toLocaleString()} left`}
            </span>
            <button type="button" onClick={() => { setSelectedFoods([]); setExpandedId(null); }} style={{ border: 0, background: 'none', color: 'var(--color-primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', font: 'inherit' }}>Clear</button>
          </div>
          {addFoodsBtn}
        </>
      );
    }
  } else if (tab === 'meals') {
    top = (
      <>
        {wide ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><SearchBox value={mealQuery} onChange={setMealQuery} placeholder="Search saved meals" /></div>
            <div style={{ width: 280, flex: 'none' }}>{tabs}</div>
          </div>
        ) : (
          <>
            <SearchBox value={mealQuery} onChange={setMealQuery} placeholder="Search saved meals" />
            {tabs}
          </>
        )}
        {errorBox}
      </>
    );
    const newMealLink = (
      <Link href="/meals" className="fs-btn2 dashed" onClick={onClose} style={{ textDecoration: 'none' }}>
        <Plus style={{ width: 16, height: 16 }} /> New saved meal
      </Link>
    );
    const listState = loadingMeals ? (
      <div className="fs-empty"><Loader2 className="animate-spin" style={{ width: 18, height: 18, display: 'inline-block' }} /></div>
    ) : savedMeals.length === 0 ? (
      <div className="fs-empty">No saved meals yet.</div>
    ) : matchedMeals.length === 0 ? (
      <div className="fs-empty">No saved meals match.</div>
    ) : null;

    if (wide) {
      body = (
        <>
          {listState}
          {!listState && matchedMeals.map((meal) => {
            const t = mealTotals(meal);
            const on = openMeal?.id === meal.id;
            return (
              <div key={meal.id} className={`fs-row${on ? ' on' : ''}`} onClick={() => openSavedMeal(meal)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fs-name">{meal.name}</div>
                  <div className="fs-meta">
                    {meal.items ? `${meal.items.length} ${meal.items.length === 1 ? 'item' : 'items'} · ${meal.items.map((i) => i.name).join(', ')}` : meal.description || 'Saved meal'}
                  </div>
                </div>
                {meal.items && <span className="fs-col" style={{ width: 56 }}>{Math.round(t.protein)} g</span>}
                {meal.items && <span className="fs-kcal" style={{ width: 52 }}>{Math.round(t.calories)}</span>}
                <ChevronRight style={{ width: 16, height: 16, color: 'var(--color-muted-foreground)', flex: 'none' }} />
              </div>
            );
          })}
          <div style={{ padding: '14px 16px', maxWidth: 260 }}>{newMealLink}</div>
        </>
      );
      if (openMeal) {
        const t = mealTotals(openMeal, mealAmounts);
        side = (
          <>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{openMeal.name}</div>
            <div className="fs-meta" style={{ marginBottom: 6 }}>
              {openMeal.items ? `${openMeal.items.length} ${openMeal.items.length === 1 ? 'food' : 'foods'} · ${Math.round(t.calories)} kcal · ${Math.round(t.protein)} g protein` : 'Loading…'}
            </div>
            {(openMeal.items || []).map((item) => {
              const u = itemUnit(item);
              const q = mealAmounts[item.id] ?? itemQty(item);
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fs-name" style={{ fontSize: 14 }}>{item.name}</div>
                    <div className="fs-meta">{Math.round(mealItemTotals(item, q, u).calories)} kcal</div>
                  </div>
                  <Stepper value={q} step={u === 'serving' ? 0.5 : 10} unit={u === 'serving' ? undefined : u}
                    onChange={(v) => setMealAmounts({ ...mealAmounts, [item.id]: v })} />
                </div>
              );
            })}
            {openMeal.items && <div className="fs-meta" style={{ marginTop: 8, whiteSpace: 'normal' }}>Amounts changed here are for this log only.</div>}
          </>
        );
        sideFoot = (
          <button type="button" className="fs-btn" disabled={saving || !openMeal.items} onClick={() => handleAddMeal(openMeal, mealAmounts)}>
            {saving ? 'Adding…' : `Log ${Math.round(t.calories)} kcal to ${mealLabel}`}
          </button>
        );
      } else {
        side = <div className="fs-empty" style={{ padding: '60px 8px' }}>Pick a saved meal to see its foods.</div>;
      }
    } else {
      padded = true;
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          {listState}
          {!listState && matchedMeals.map((meal) => {
            const on = openMeal?.id === meal.id;
            const m = on && openMeal ? openMeal : meal;
            const t = mealTotals(m);
            return (
              <div key={meal.id} className="fs-card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => openSavedMeal(meal)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fs-name">{meal.name}</div>
                    <div className="fs-meta">
                      {m.items ? `${m.items.length} ${m.items.length === 1 ? 'item' : 'items'} · ${m.items.map((i) => i.name).join(', ')}` : meal.description || 'Tap to see what’s in it'}
                    </div>
                  </div>
                  {m.items && <span className="fs-kcal">{Math.round(t.calories)}<small>{Math.round(t.protein)} g P</small></span>}
                  {!on && (
                    <button type="button" className="fs-btn" style={{ width: 'auto', height: 36, padding: '0 14px', fontSize: 13, borderRadius: 12 }}
                      disabled={saving} onClick={(e) => { e.stopPropagation(); handleAddMeal(meal); }}>
                      Log
                    </button>
                  )}
                </div>
                {on && (
                  <div className="fs-flash" style={{ borderTop: '1px solid var(--color-border)', marginTop: 10, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {!m.items && <div className="fs-meta">Loading…</div>}
                    {(m.items || []).map((item) => (
                      <div key={item.id} style={{ display: 'flex', fontSize: 13, gap: 8 }}>
                        <span className="fs-meta" style={{ flex: 1, fontSize: 13 }}>{item.name} · {fmtQty(itemQty(item), itemUnit(item))}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(mealItemTotals(item, itemQty(item), itemUnit(item)).calories)}</span>
                      </div>
                    ))}
                    <button type="button" className="fs-btn" style={{ height: 44, fontSize: 14, marginTop: 6 }} disabled={saving || !m.items}
                      onClick={() => handleAddMeal(m)}>
                      {saving ? 'Adding…' : `Log to ${mealLabel}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
      foot = newMealLink;
    }
  } else {
    padded = true;
    top = <>{tabs}</>;
    const canAdd = !!quickName.trim() && !!quickCalories && !saving;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: wide ? 560 : undefined, paddingTop: 4 }}>
        {errorBox}
        <TextBox label="What did you eat?" value={quickName} placeholder="e.g. 2 slices of pepperoni pizza"
          onChange={(v) => { setQuickName(v); if (aiResult) setAiResult(null); if (aiError) setAiError(''); }} />
        <button type="button" className="fs-btn2 ai" onClick={handleAiGuess} disabled={!quickName.trim() || aiEstimating}>
          {aiEstimating
            ? <><Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> AI is guessing…</>
            : <><Sparkles style={{ width: 16, height: 16 }} /> Let AI guess calories and protein</>}
        </button>
        {aiError && <div className="fs-err">{aiError}</div>}
        {aiResult && !aiError && (
          <div className="fs-ai fs-flash">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
              <Sparkles style={{ width: 15, height: 15 }} /> AI guess · {aiResult.portion}
            </div>
            <div className="fs-meta">{aiResult.reasoning} Change the numbers if yours was different.</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 10 }}>
          <NumBox big label="Calories" value={quickCalories} onChange={setQuickCalories} unit="kcal" />
          <NumBox big label="Protein" value={quickProtein} onChange={setQuickProtein} unit="g" step="0.1" />
        </div>
        <div className="fs-meta" style={{ whiteSpace: 'normal' }}>Only logs it to this day. “Add and save” also keeps it in your foods.</div>
        {wide && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <button type="button" className="fs-btn2" style={{ height: 52 }} onClick={handleQuickAddAndSave} disabled={!canAdd}>
              <BookOpen style={{ width: 16, height: 16 }} /> {saving ? 'Saving…' : 'Add and save to my foods'}
            </button>
            <button type="button" className="fs-btn" onClick={handleQuickAdd} disabled={!canAdd}>{saving ? 'Adding…' : `Add to ${mealLabel}`}</button>
          </div>
        )}
      </div>
    );
    if (!wide) {
      foot = (
        <>
          <button type="button" className="fs-btn" onClick={handleQuickAdd} disabled={!canAdd}>{saving ? 'Adding…' : `Add to ${mealLabel}`}</button>
          <button type="button" className="fs-btn2" onClick={handleQuickAddAndSave} disabled={!canAdd}>
            <BookOpen style={{ width: 16, height: 16 }} /> Add and save to my foods
          </button>
        </>
      );
    }
  }

  return (
    <FoodSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Add food"
      subtitle={subtitle}
      headerCenter={<div style={{ width: wide ? 360 : '100%' }}><MealBar value={mealType} onChange={setMealType} /></div>}
      top={top}
      side={tab === 'quick' ? undefined : side}
      sideFoot={sideFoot}
      tray={tray}
      foot={foot}
      sideWidth={tab === 'meals' ? 320 : 300}
      padded={padded}
    >
      {body}
    </FoodSheet>
  );
}

// ─── Edit Entry Modal ──────────────────────────────────────────────────────

interface EditEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: JournalEntry | null;
  onUpdated: (entry: JournalEntry) => void;
}

function EditEntryModal({ isOpen, onClose, entry, onUpdated }: EditEntryModalProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('serving');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [food, setFood] = useState<Food | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When an entry opens, hydrate the form and fetch the food (if any) so we
  // know its units[]. Quick Add entries (food_id null) use a single Amount
  // field, no toggle.
  useEffect(() => {
    if (!entry) return;
    setQuantity(entry.quantity ?? entry.servings ?? 1);
    setUnit((entry.unit as Unit) ?? 'serving');
    setMealType(entry.meal_type);
    setError('');
    setFood(null);
    if (entry.food_id != null) {
      fetch(`${BASE_URL}/api/foods/${entry.food_id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((f: Food | null) => setFood(f))
        .catch(() => setFood(null));
    }
  }, [entry]);

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateJournalEntry(entry.id, {
        quantity,
        unit,
        meal_type: mealType,
      });
      onUpdated(updated);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  const isQuickAdd = entry?.food_id == null;

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Edit Entry" size="sm">
      {entry && (
        <div className="space-y-5">
          {/* Food name as a header, not a body line */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Food</p>
            <p className="text-base font-semibold text-white break-words leading-snug">{entry.food_name_snapshot}</p>
          </div>

          {/* Amount section */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40 pl-1">Amount</label>
            {isQuickAdd || !food ? (
              // Quick Add: simple single quantity input (no unit toggle)
              <input
                type="number"
                inputMode="decimal"
                value={String(quantity)}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                min={0.1}
                step={0.1}
                className="w-full px-4 py-3 bg-white/[0.06] border border-white/15 rounded-2xl text-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400/40 transition-all duration-200"
              />
            ) : (
              // Food-bound: full QuantityInput with unit toggle
              <div className="rounded-2xl bg-white/[0.04] border border-white/10">
                <QuantityInput
                  food={food}
                  quantity={quantity}
                  unit={unit}
                  onChange={(next) => { setQuantity(next.quantity); setUnit(next.unit); }}
                />
              </div>
            )}
          </div>

          {/* Meal section — pill-style segmented control replaces the native select */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40 pl-1">Meal</label>
            <div className="grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-white/[0.04] border border-white/10">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMealType(m)}
                  className={`py-2 text-xs sm:text-sm font-medium rounded-xl transition-all duration-150 ${
                    mealType === m
                      ? 'bg-indigo-500/30 border border-indigo-400 text-white shadow-sm shadow-indigo-500/20'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent'
                  }`}
                >
                  {MEAL_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
            <GlassButton variant="primary" className="flex-1" onClick={handleSave} disabled={saving || quantity <= 0}>
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassModal>
  );
}

// ─── Edit Goals Modal ─────────────────────────────────────────────────────

interface EditGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  goals: { calories: number; protein: number };
  /**
   * Returns a promise so the modal can wait on the save and surface failures
   * (rather than optimistically closing while the network call silently fails).
   */
  onSave: (goals: { calories: number; protein: number }) => Promise<void>;
}

function EditGoalsModal({ isOpen, onClose, goals, onSave }: EditGoalsModalProps) {
  const [calories, setCalories] = useState(String(goals.calories));
  const [protein, setProtein] = useState(String(goals.protein));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCalories(String(goals.calories));
    setProtein(String(goals.protein));
  }, [goals.calories, goals.protein]);

  async function handleSave() {
    setError(null);
    const cal = Number(calories);
    const pro = Number(protein);
    if (!Number.isFinite(cal) || cal < 1 || !Number.isFinite(pro) || pro < 1) {
      setError('Both goals must be positive numbers.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ calories: cal, protein: pro });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  }

  const calSuggestions = [1800, 1900, 2000, 2100, 2200, 2300];
  const proSuggestions = [120, 140, 150, 160, 180, 200];
  const calNum = Number(calories);
  const proNum = Number(protein);

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily goals"
      subtitle="Used across the dashboard"
      size="sm"
      footer={
        <>
          <GlassButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save goals'}
          </GlassButton>
        </>
      }
    >
      <div style={{ padding: 4 }}>
        {/* Calories — hero input */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-muted-foreground)',
            marginBottom: 6,
          }}
        >
          Calorie goal
        </div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type="number"
            inputMode="decimal"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            min={1}
            step={50}
            disabled={saving}
            style={{
              width: '100%',
              padding: '16px 60px 16px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.8px',
              textAlign: 'right',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-foreground)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 13,
              color: 'var(--color-muted-foreground)',
              fontWeight: 600,
            }}
          >
            kcal
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 18,
          }}
        >
          {calSuggestions.map((n) => {
            const active = n === calNum;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCalories(String(n))}
                className="cursor-pointer"
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 600,
                  background: active
                    ? 'var(--color-foreground)'
                    : 'var(--color-surface)',
                  color: active
                    ? 'var(--color-background)'
                    : 'var(--color-muted-foreground)',
                  border:
                    '1px solid ' +
                    (active ? 'var(--color-foreground)' : 'var(--color-border)'),
                  borderRadius: 6,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Protein */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-muted-foreground)',
            marginBottom: 6,
          }}
        >
          Protein goal
        </div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type="number"
            inputMode="decimal"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            min={1}
            step={5}
            disabled={saving}
            style={{
              width: '100%',
              padding: '12px 40px 12px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 18,
              fontWeight: 700,
              textAlign: 'right',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              color: 'var(--color-foreground)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              fontWeight: 600,
            }}
          >
            g
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {proSuggestions.map((n) => {
            const active = n === proNum;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setProtein(String(n))}
                className="cursor-pointer"
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  background: active
                    ? 'var(--color-foreground)'
                    : 'var(--color-surface)',
                  color: active
                    ? 'var(--color-background)'
                    : 'var(--color-muted-foreground)',
                  border:
                    '1px solid ' +
                    (active ? 'var(--color-foreground)' : 'var(--color-border)'),
                  borderRadius: 6,
                }}
              >
                {n}g
              </button>
            );
          })}
        </div>

        {/* Advisory */}
        <div
          style={{
            padding: 12,
            background: 'var(--color-surface-warm)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          Most active adults land between{' '}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-foreground)',
              fontWeight: 600,
            }}
          >
            2,000 – 2,500 kcal
          </span>{' '}
          and{' '}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-foreground)',
              fontWeight: 600,
            }}
          >
            140 – 180g protein
          </span>{' '}
          depending on size and activity. Adjust to fit your reality.
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

// ─── Entry Action Menu (3-dot + right-click) ───────────────────────────────

// Shared styling tokens for the action menu surface and its items. Kept at
// module scope so the menu and any submenus pull from the same source.
const MENU_SURFACE_STYLE: React.CSSProperties = {
  minWidth: 180,
  padding: 4,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-deep)',
  color: 'var(--color-foreground)',
};
const MENU_ITEM_BASE =
  'w-full flex items-center gap-2.5 px-3 py-2 rounded text-left text-sm transition-colors duration-150';
const MENU_ITEM_HOVER = 'hover:bg-[color:var(--color-surface-warm)]';

// Submenu of meal types — used by both "Move to" and "Copy to". Picks a
// destination meal and fires `onPick`. Auto-flips to the left when there
// isn't enough room on the right.
interface MealSubmenuProps {
  icon: typeof Move;
  label: string;
  currentMeal: MealType;
  onPick: (target: MealType) => void;
}

function MealSubmenu({ icon: Icon, label, currentMeal, onPick }: MealSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    setFlip(rect.right + 180 + 8 > window.innerWidth);
  }, [open]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${MENU_ITEM_BASE} ${MENU_ITEM_HOVER} justify-between`}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-white/55" />
          {label}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
      </button>
      {open && (
        <div
          className={`absolute top-0 ${flip ? 'right-full mr-1' : 'left-full ml-1'}`}
          style={MENU_SURFACE_STYLE}
        >
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === currentMeal}
              onClick={() => onPick(m)}
              className={`${MENU_ITEM_BASE} ${MENU_ITEM_HOVER} disabled:text-white/25 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EntryActionMenuProps {
  anchor: { x: number; y: number };
  currentMeal: MealType;
  onEdit: () => void;
  onMove: (target: MealType) => void;
  onCopy: (target: MealType) => void;
  onDelete: () => void;
  onClose: () => void;
}

function EntryActionMenu({ anchor, currentMeal, onEdit, onMove, onCopy, onDelete, onClose }: EntryActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp anchor so the menu stays inside the viewport.
  const menuW = 200;
  const menuH = 196;
  const x = typeof window !== 'undefined' ? Math.min(anchor.x, window.innerWidth - menuW - 8) : anchor.x;
  const y = typeof window !== 'undefined' ? Math.min(anchor.y, window.innerHeight - menuH - 8) : anchor.y;

  // Portal to document.body so the menu escapes any ancestor that creates a
  // containing block for `position: fixed` (the GlassCard parent uses
  // `backdrop-filter: blur`, which makes fixed children position relative to
  // the card instead of the viewport).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: Math.max(8, x),
        top: Math.max(8, y),
        zIndex: 50,
        ...MENU_SURFACE_STYLE,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onEdit}
        className={`${MENU_ITEM_BASE} ${MENU_ITEM_HOVER}`}
      >
        <Pencil className="w-4 h-4 text-white/55" />
        Edit
      </button>

      <MealSubmenu icon={Move} label="Move to" currentMeal={currentMeal} onPick={onMove} />
      <MealSubmenu icon={Copy} label="Copy to" currentMeal={currentMeal} onPick={onCopy} />

      <div className="my-1 mx-2 border-t border-white/[0.08]" />

      <button
        type="button"
        onClick={onDelete}
        className={`${MENU_ITEM_BASE} text-red-300 hover:bg-red-500/15 hover:text-red-200`}
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>
    </div>,
    document.body,
  );
}

// ─── Entry row (design-faithful: grid with food, cals, protein, more) ──────────

interface EntryRowProps {
  entry: JournalEntry;
  pointerCapable: boolean;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (id: number) => Promise<void> | void;
  onCopy: (entry: JournalEntry, target: MealType) => Promise<void> | void;
  onMove: (id: number, target: MealType) => Promise<void> | void;
  onDragStartEntry: () => void;
  onDragEndEntry: () => void;
}

function EntryRow({
  entry,
  pointerCapable,
  onEdit,
  onDelete,
  onCopy,
  onMove,
  onDragStartEntry,
  onDragEndEntry,
}: EntryRowProps) {
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const threeDotRef = useRef<HTMLButtonElement>(null);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', String(entry.id));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
    onDragStartEntry();
  }
  function handleDragEnd() {
    setDragging(false);
    onDragEndEntry();
  }
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenuAnchor({ x: e.clientX, y: e.clientY });
  }
  function openMenuFromButton(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = threeDotRef.current?.getBoundingClientRect();
    if (rect) setMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  }
  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(entry.id);
    } finally {
      setDeleting(false);
    }
  }
  async function handleCopy(target: MealType) {
    setMenuAnchor(null);
    await onCopy(entry, target);
  }
  async function handleMove(target: MealType) {
    setMenuAnchor(null);
    await onMove(entry.id, target);
  }

  const qty = entry.quantity ?? entry.servings ?? 1;
  const unit = (entry.unit as Unit) ?? 'serving';

  return (
    <li
      draggable={pointerCapable}
      onDragStart={pointerCapable ? handleDragStart : undefined}
      onDragEnd={pointerCapable ? handleDragEnd : undefined}
      onContextMenu={handleContextMenu}
      onClick={() => onEdit(entry)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
        alignItems: 'center',
        gap: 14,
        padding: '8px 12px',
        margin: '0 -12px',
        borderBottom: '1px solid var(--color-border)',
        cursor: pointerCapable ? 'grab' : 'pointer',
        opacity: dragging ? 0.4 : 1,
        background: hovered ? 'var(--color-surface-warm)' : 'transparent',
        transition: 'background 120ms ease-out',
      }}
    >
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
          {entry.food_name_snapshot}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            marginTop: 2,
          }}
        >
          {formatQuantity(qty, unit)}
        </div>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
          textAlign: 'right',
          minWidth: 64,
        }}
      >
        <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>
          {Math.round(entry.calories_snapshot)}
        </span>{' '}
        kcal
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
          textAlign: 'right',
          minWidth: 56,
        }}
      >
        <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>
          {Math.round(entry.protein_snapshot * 10) / 10}
        </span>
        g P
      </span>
      <button
        ref={threeDotRef}
        type="button"
        onClick={openMenuFromButton}
        disabled={deleting}
        className="cursor-pointer"
        style={{
          background: 'transparent',
          border: 0,
          color: 'var(--color-muted-foreground)',
          padding: 4,
          borderRadius: 4,
        }}
        aria-label="More actions"
      >
        {deleting ? (
          <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
        ) : (
          <MoreHorizontal style={{ width: 14, height: 14, strokeWidth: 1.75 }} />
        )}
      </button>

      {menuAnchor && (
        <EntryActionMenu
          anchor={menuAnchor}
          currentMeal={entry.meal_type}
          onEdit={() => {
            setMenuAnchor(null);
            onEdit(entry);
          }}
          onMove={handleMove}
          onCopy={handleCopy}
          onDelete={() => {
            setMenuAnchor(null);
            handleDelete();
          }}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </li>
  );
}

// ─── Meal section (design-faithful: CardShell with totals hint + Add) ──────────

interface MealSectionProps {
  type: MealType;
  entries: JournalEntry[];
  pointerCapable: boolean;
  onDeleted: (id: number) => void;
  onEditRequest: (entry: JournalEntry) => void;
  onRequestAdd: (mealType: MealType) => void;
  onCopyEntry: (entry: JournalEntry, target: MealType) => Promise<void> | void;
  onMoveEntry: (id: number, target: MealType) => Promise<void> | void;
  draggingActive: boolean;
  onDragStartEntry: () => void;
  onDragEndEntry: () => void;
}

function MealSection({
  type,
  entries,
  pointerCapable,
  onDeleted,
  onEditRequest,
  onRequestAdd,
  onCopyEntry,
  onMoveEntry,
  draggingActive,
  onDragStartEntry,
  onDragEndEntry,
}: MealSectionProps) {
  const isNarrow = useIsNarrow();
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const totals = entries.reduce(
    (a, e) => {
      a.cal += e.calories_snapshot;
      a.protein += e.protein_snapshot;
      return a;
    },
    { cal: 0, protein: 0 }
  );

  async function handleDelete(id: number) {
    try {
      await deleteJournalEntry(id);
      onDeleted(id);
    } catch {
      /* ignore */
    }
  }
  function handleDragOver(e: React.DragEvent) {
    if (!pointerCapable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function handleDragEnter(e: React.DragEvent) {
    if (!pointerCapable) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragOver(true);
  }
  function handleDragLeave() {
    if (!pointerCapable) return;
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragOver(false);
  }
  async function handleDrop(e: React.DragEvent) {
    if (!pointerCapable) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isFinite(id)) {
      await onMoveEntry(id, type);
    }
  }

  const mealIconName =
    type === 'breakfast' ? 'Sunrise' : type === 'lunch' ? 'Sun' : type === 'snack' ? 'Cookie' : 'Moon';
  const IconCmp =
    type === 'breakfast'
      ? Sunrise
      : type === 'lunch'
      ? Sun
      : type === 'snack'
      ? Cookie
      : Moon;

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        outline: dragOver
          ? '2px solid var(--color-primary)'
          : draggingActive
          ? '1px dashed var(--color-border)'
          : 'none',
        outlineOffset: 2,
        borderRadius: 12,
        transition: 'outline-color 120ms ease-out',
      }}
    >
      <CardShell
        title={MEAL_LABELS[type]}
        icon={<IconCmp style={{ width: 14, height: 14, strokeWidth: 2.25 }} aria-label={mealIconName} />}
        hint={
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              flexShrink: 0,
            }}
          >
            {entries.length > 0 && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: isNarrow ? 11 : 12,
                  color: 'var(--color-muted-foreground)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    color: 'var(--color-foreground)',
                    fontWeight: 600,
                  }}
                >
                  {Math.round(totals.cal)}
                </span>{' '}
                kcal ·{' '}
                <span
                  style={{
                    color: 'var(--color-foreground)',
                    fontWeight: 600,
                  }}
                >
                  {Math.round(totals.protein)}g
                </span>
                {!isNarrow && ' P'}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRequestAdd(type)}
              className="cursor-pointer"
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--color-link)',
                fontSize: 12,
                fontWeight: 600,
                padding: 0,
              }}
            >
              + Add
            </button>
          </div>
        }
      >
        {entries.length === 0 ? (
          <EmptyState>
            {dragOver
              ? 'Drop to move here'
              : `No ${MEAL_LABELS[type].toLowerCase()} logged.`}
          </EmptyState>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
          >
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                pointerCapable={pointerCapable}
                onEdit={onEditRequest}
                onDelete={handleDelete}
                onCopy={onCopyEntry}
                onMove={onMoveEntry}
                onDragStartEntry={onDragStartEntry}
                onDragEndEntry={onDragEndEntry}
              />
            ))}
          </ul>
        )}
      </CardShell>
    </div>
  );
}

// ─── Day summary card (right column) ───────────────────────────────────────────

function JournalSummaryCard({
  calories,
  protein,
  fiber,
  entries,
  goals,
}: {
  calories: number;
  protein: number;
  fiber: number;
  entries: number;
  goals: { calories: number; protein: number; fiber: number | null };
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
        padding: 20,
      }}
    >
      <MicroLabel>Day summary</MicroLabel>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: 12,
        }}
      >
        <CalorieRing
          value={Math.round(calories)}
          target={goals.calories}
          size={140}
          stroke={12}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 16,
        }}
      >
        <MacroBar
          label="Protein"
          value={Math.round(protein)}
          target={goals.protein}
          unit="g"
          tone={protein >= goals.protein ? 'success' : 'primary'}
        />
        {goals.fiber != null && (
          <MacroBar
            label="Fibre"
            value={Math.round(fiber * 10) / 10}
            target={goals.fiber}
            unit="g"
            tone={fiber >= goals.fiber ? 'success' : 'primary'}
          />
        )}
        {goals.fiber == null && fiber > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <MicroLabel>Fibre today</MicroLabel>
            <MonoNum size={14}>{Math.round(fiber * 10) / 10}g</MonoNum>
          </div>
        )}
      </div>
      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          marginTop: 16,
          paddingTop: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <MicroLabel>Entries</MicroLabel>
          <MonoNum size={18}>{entries}</MonoNum>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginTop: 6,
          }}
        >
          <MicroLabel>Calories remaining</MicroLabel>
          <MonoNum
            size={18}
            color={
              calories > goals.calories
                ? 'var(--color-critical)'
                : 'var(--color-success)'
            }
          >
            {calories > goals.calories
              ? '+' + (calories - goals.calories).toLocaleString()
              : (goals.calories - calories).toLocaleString()}
          </MonoNum>
        </div>
      </div>
    </div>
  );
}

// ─── Quick add panel ──────────────────────────────────────────────────────────

function QuickAddPanel({
  date,
  defaultMeal,
  onAdded,
}: {
  date: string;
  defaultMeal: MealType;
  onAdded: (entry: JournalEntry) => void;
}) {
  const [q, setQ] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = q.trim()
          ? BASE_URL + '/api/foods?search=' + encodeURIComponent(q.trim())
          : BASE_URL + '/api/foods';
        const res = await fetch(url);
        if (res.ok) setFoods((await res.json()) as Food[]);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  async function addOne(food: Food) {
    setAdding(food.id);
    try {
      const units = food.units ?? [
        { unit: 'serving' as Unit, label: 'serving', default: true },
      ];
      const def = units.find((u) => u.default) ?? units[0];
      const startQty =
        def.unit === 'serving'
          ? 1
          : (food.base_amount ?? food.baseAmount ?? 100);
      const entry = await addJournalEntry({
        date,
        meal_type: defaultMeal,
        food_id: food.id,
        food_name_snapshot: food.name,
        quantity: startQty,
        unit: def.unit,
      });
      onAdded(entry);
    } catch {
      /* swallow */
    } finally {
      setAdding(null);
    }
  }

  const visible = foods.slice(0, 8);

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
        padding: 20,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '-0.25px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Search
          style={{
            width: 14,
            height: 14,
            color: 'var(--color-muted-foreground)',
          }}
        />
        Quick add
      </h2>
      <div style={{ position: 'relative', marginTop: 12, marginBottom: 12 }}>
        <Search
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
            color: 'var(--color-placeholder)',
          }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a food…"
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
      {loading && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          Searching…
        </div>
      )}
      {!loading && visible.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          No foods match.
        </div>
      )}
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {visible.map((f) => {
          const cal = f.calories ?? f.calories_per_100g ?? 0;
          return (
            <li
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--color-muted-foreground)',
                }}
              >
                {cal} kcal
              </span>
              <button
                onClick={() => addOne(f)}
                disabled={adding === f.id}
                className="cursor-pointer"
                style={{
                  background: 'var(--color-soft)',
                  border: 0,
                  borderRadius: 4,
                  padding: '3px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--color-foreground)',
                  opacity: adding === f.id ? 0.5 : 1,
                }}
              >
                {adding === f.id ? (
                  <Loader2
                    style={{ width: 12, height: 12 }}
                    className="animate-spin"
                  />
                ) : (
                  <Plus
                    style={{ width: 12, height: 12, strokeWidth: 2.25 }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MealStackSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {MEAL_TYPES.map((m) => (
        <div
          key={m}
          className="skeleton"
          style={{ height: 110, borderRadius: 12 }}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [showDateInput, setShowDateInput] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [addMealType, setAddMealType] = useState<MealType | null>(null);
  const [pointerCapable, setPointerCapable] = useState(false);
  const [draggingActive, setDraggingActive] = useState(false);

  // Auto-open the Add Food modal when arriving from the home page's
  // "Log food" button (which navigates here with ?addFood=1). Strip the
  // param afterwards so reloads / back-navigation don't re-open the modal.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('addFood') === '1') {
      const h = new Date().getHours();
      const meal: MealType =
        h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner';
      setAddMealType(meal);
      params.delete('addFood');
      const newSearch = params.toString();
      const newUrl =
        window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPointerCapable(window.matchMedia('(hover: hover)').matches);
  }, []);

  useEffect(() => {
    getGoals()
      .then((g) =>
        setGoals({ calories: g.calories, protein: g.protein, fiber: g.fiber ?? null })
      )
      .catch(() => {});
  }, []);

  async function handleSaveGoals(newGoals: {
    calories: number;
    protein: number;
  }) {
    const updated = await updateGoals(newGoals);
    setGoals({
      calories: updated.calories,
      protein: updated.protein,
      fiber: updated.fiber ?? null,
    });
  }

  const dateStr = toISODate(currentDate);

  const fetchEntries = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      getJournalEntries({ date: dateStr })
        .then(setEntries)
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : 'Failed to load')
        )
        .finally(() => setLoading(false));
    },
    [dateStr]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const silentRefetch = useCallback(() => fetchEntries(true), [fetchEntries]);
  useSocketEvent('journal-entry-created', silentRefetch);
  useSocketEvent('journal-entry-updated', silentRefetch);
  useSocketEvent('journal-entry-deleted', silentRefetch);

  useEffect(() => {
    if (showDateInput) dateInputRef.current?.showPicker?.();
  }, [showDateInput]);

  function handlePrevDay() {
    setCurrentDate((d) => new Date(d.getTime() - 86400000));
  }
  function handleNextDay() {
    setCurrentDate((d) => new Date(d.getTime() + 86400000));
  }
  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) {
      const [y, m, day] = e.target.value.split('-').map(Number);
      setCurrentDate(new Date(y, m - 1, day));
    }
    setShowDateInput(false);
  }

  function handleEntryAdded(entry: JournalEntry) {
    setEntries((prev) => [...prev, entry]);
  }
  function handleEntryDeleted(id: number) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function handleEntryUpdated(updated: JournalEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditEntry(null);
  }

  async function handleEntryCopy(entry: JournalEntry, target: MealType) {
    setError('');
    try {
      const newEntry = await addJournalEntry({
        date: entry.date,
        meal_type: target,
        food_id: entry.food_id ?? undefined,
        food_name_snapshot: entry.food_name_snapshot,
        quantity: entry.quantity ?? entry.servings ?? 1,
        unit: 'serving',
        calories_snapshot: entry.calories_snapshot,
        protein_snapshot: entry.protein_snapshot,
      });
      handleEntryAdded(newEntry);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to copy entry');
    }
  }

  async function handleEntryMove(id: number, target: MealType) {
    const current = entries.find((e) => e.id === id);
    if (!current || current.meal_type === target) return;
    const previous = current;
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, meal_type: target } : e))
    );
    try {
      const updated = await updateJournalEntry(id, { meal_type: target });
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (e: unknown) {
      setEntries((prev) =>
        prev.map((entry) => (entry.id === id ? previous : entry))
      );
      setError(e instanceof Error ? e.message : 'Failed to move entry');
    }
  }

  const totalCalories = entries.reduce((a, e) => a + e.calories_snapshot, 0);
  const totalProtein = entries.reduce((a, e) => a + e.protein_snapshot, 0);
  const totalFiber = entries.reduce((a, e) => a + (e.fiber_snapshot ?? 0), 0);

  const byMeal: Record<MealType, JournalEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const entry of entries) {
    byMeal[entry.meal_type]?.push(entry);
  }

  const isToday = dateStr === toISODate(new Date());

  function defaultMealForNow(): MealType {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 17) return 'snack';
    return 'dinner';
  }

  return (
    <main
      className="page-mount"
      style={{
        maxWidth: 1120,
        margin: '0 auto',
        padding: '24px 16px 80px',
      }}
    >
      {/* Date bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlassButton variant="outline" size="sm" onClick={handlePrevDay}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </GlassButton>
          <GlassButton
            variant="outline"
            size="sm"
            onClick={handleNextDay}
            disabled={isToday}
          >
            <ChevronRight style={{ width: 14, height: 14 }} />
          </GlassButton>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDateInput(true)}
              className="cursor-pointer"
              style={{
                margin: '0 4px',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.4px',
                background: 'transparent',
                border: 0,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {formatDateLabel(currentDate)}
              <Pencil
                style={{
                  width: 12,
                  height: 12,
                  color: 'var(--color-muted-foreground)',
                }}
              />
            </button>
            {showDateInput && (
              <input
                ref={dateInputRef}
                type="date"
                value={dateStr}
                onChange={handleDateChange}
                onBlur={() => setShowDateInput(false)}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: 0,
                  height: 0,
                }}
              />
            )}
          </div>
        </div>
        <GlassButton
          variant="primary"
          size="sm"
          onClick={() => setAddMealType(defaultMealForNow())}
        >
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Log food
        </GlassButton>
      </div>
      <div
        style={{
          color: 'var(--color-muted-foreground)',
          marginTop: 4,
          fontSize: 14,
        }}
      >
        Logged across the day. Tap any entry to edit.
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
        className="journal-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
          gap: 16,
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
          }}
        >
          {loading ? (
            <MealStackSkeleton />
          ) : (
            MEAL_TYPES.map((mealType) => (
              <MealSection
                key={mealType}
                type={mealType}
                entries={byMeal[mealType]}
                pointerCapable={pointerCapable}
                onDeleted={handleEntryDeleted}
                onEditRequest={setEditEntry}
                onRequestAdd={(type) => setAddMealType(type)}
                onCopyEntry={handleEntryCopy}
                onMoveEntry={handleEntryMove}
                draggingActive={draggingActive}
                onDragStartEntry={() => setDraggingActive(true)}
                onDragEndEntry={() => setDraggingActive(false)}
              />
            ))
          )}
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <JournalSummaryCard
            calories={totalCalories}
            protein={totalProtein}
            fiber={totalFiber}
            entries={entries.length}
            goals={goals}
          />
          <QuickAddPanel
            date={dateStr}
            defaultMeal={defaultMealForNow()}
            onAdded={handleEntryAdded}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={() => setGoalsModalOpen(true)}
              className="cursor-pointer"
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--color-link)',
                fontSize: 12,
                fontWeight: 600,
                padding: 0,
              }}
            >
              Edit goals
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.journal-grid) {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>

      <AddFoodModal
        isOpen={addMealType !== null}
        onClose={() => setAddMealType(null)}
        mealType={addMealType ?? 'breakfast'}
        date={dateStr}
        onAdded={handleEntryAdded}
        caloriesLeft={goals.calories - totalCalories}
      />
      <EditEntryModal
        isOpen={!!editEntry}
        onClose={() => setEditEntry(null)}
        entry={editEntry}
        onUpdated={handleEntryUpdated}
      />
      <EditGoalsModal
        isOpen={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        goals={goals}
        onSave={handleSaveGoals}
      />
    </main>
  );
}
