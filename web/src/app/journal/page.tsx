'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Loader2, Clock, Search, Copy, MoreHorizontal, Move } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
import {
  getJournalEntries,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getSavedMeals,
  getGoals,
  updateGoals,
} from '@/lib/api';
import type { JournalEntry, MealType, Food, SavedMeal, Unit } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { QuantityInput } from '@/components/QuantityInput';
import { nutritionFor } from '@/lib/nutrition';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GOALS = { calories: 2000, protein: 150 };

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
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
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ value, max, size = 64, stroke = 5, color = '#6366f1' }: {
  value: number; max: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
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

// ─── Food Picker (shared between Foods tab & Meals) ────────────────────────

interface SelectedFood {
  food: Food;
  quantity: number;
  unit: Unit;
}

interface FoodPickerProps {
  /**
   * Selected foods are state-of-the-modal, owned by the parent so the
   * sticky bottom bar can render the summary + Add button across the
   * whole modal panel (not just inside the picker).
   */
  selectedFoods: SelectedFood[];
  setSelectedFoods: (next: SelectedFood[]) => void;
}

function FoodPicker({ selectedFoods, setSelectedFoods }: FoodPickerProps) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load all foods on mount, then filter by search
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

  // Auto-focus the search input on mount, but only on devices with a real
  // hover capability (keyboards). Touch devices skip this so opening the
  // modal doesn't immediately pop the on-screen keyboard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isHoverCapable = window.matchMedia('(hover: hover)').matches;
    if (isHoverCapable && searchInputRef.current) {
      // Delay slightly so the modal scale-in animation finishes first.
      const t = setTimeout(() => searchInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, []);

  function toggleFood(food: Food) {
    const existing = selectedFoods.find((sf) => sf.food.id === food.id);
    if (existing) {
      setSelectedFoods(selectedFoods.filter((sf) => sf.food.id !== food.id));
    } else {
      // Pick the food's default unit + sensible starting quantity
      const units = food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
      const def = units.find((u) => u.default) ?? units[0];
      const startQty =
        def.unit === 'serving' ? 1 :
        (food.base_amount ?? food.baseAmount ?? 100);
      setSelectedFoods([...selectedFoods, { food, quantity: startQty, unit: def.unit }]);
    }
  }

  function setQuantityForFood(foodId: number, next: { quantity: number; unit: Unit }) {
    const clamped = { quantity: Math.max(0, next.quantity), unit: next.unit };
    setSelectedFoods(selectedFoods.map((sf) =>
      sf.food.id === foodId ? { ...sf, ...clamped } : sf
    ));
  }

  function getSelectedFood(foodId: number): SelectedFood | undefined {
    return selectedFoods.find((sf) => sf.food.id === foodId);
  }

  return (
    <div className="space-y-3">
      {/* Search bar — bigger, with icon prefix and clear button */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          className="w-full pl-10 pr-10 py-3.5 text-base sm:text-sm bg-white/[0.06] border border-white/[0.12] rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400/40 transition-all duration-200"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10"
            aria-label="Clear search"
          >
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        )}
      </div>

      {/* Food list — bigger touch targets */}
      <div className="space-y-2 pr-1">
        {loading && <p className="text-center text-white/40 text-sm py-6">Searching…</p>}
        {!loading && foods.length === 0 && (
          <p className="text-center text-white/40 text-sm py-6">No foods found</p>
        )}
        {foods.map((food, idx) => {
          const selected = getSelectedFood(food.id);
          const isSelected = !!selected;

          // Section dividers (recently used / all foods) — only when not searching.
          const isFirst = idx === 0;
          const prevWasRecent = idx > 0 ? foods[idx - 1].recently_used : false;
          const showRecentHeader =
            !query.trim() && isFirst && food.recently_used === true;
          const showAllHeader =
            !query.trim() && prevWasRecent === true && food.recently_used !== true;

          return (
            <Fragment key={food.id}>
              {showRecentHeader && (
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 px-1 pt-1 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Recently used
                </div>
              )}
              {showAllHeader && (
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 px-1 pt-3">
                  All foods
                </div>
              )}
              <div
                className={`rounded-2xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-indigo-500/20 border-indigo-400/60 shadow-sm shadow-indigo-500/10'
                    : 'bg-white/5 hover:bg-white/10 border-white/10'
                }`}
              >
                <button
                  onClick={() => toggleFood(food)}
                  className="w-full flex items-start justify-between gap-3 px-4 py-4 text-left"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Bigger checkbox: 24px (was 20px) for easier tapping */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isSelected ? 'border-indigo-400 bg-indigo-400' : 'border-white/30'
                    }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm font-medium text-white break-words leading-snug">
                      {food.name}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0 text-xs text-white/50 leading-snug tabular-nums">
                    <span>{food.calories ?? food.calories_per_100g ?? 0} kcal</span>
                    <span>{food.protein ?? food.protein_per_100g ?? 0}g pro</span>
                  </div>
                </button>

                {isSelected && (
                  <QuantityInput
                    food={food}
                    quantity={selected.quantity}
                    unit={selected.unit}
                    onChange={(next) => setQuantityForFood(food.id, next)}
                  />
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add Food Modal ────────────────────────────────────────────────────────

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: MealType;
  date: string;
  onAdded: (entry: JournalEntry) => void;
}

function AddFoodModal({ isOpen, onClose, mealType, date, onAdded }: AddFoodModalProps) {
  const [tab, setTab] = useState<'foods' | 'meals' | 'quick'>('foods');
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mealQuery, setMealQuery] = useState('');

  // Quick Add state
  const [quickName, setQuickName] = useState('');
  const [quickCalories, setQuickCalories] = useState('');
  const [quickProtein, setQuickProtein] = useState('');

  // Lifted from FoodPicker so the sticky bottom bar (rendered as the modal's
  // footer) can show the running total + Add button across the whole panel
  // rather than below the food list.
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([]);
  // Reset selection whenever the modal closes so re-opening starts fresh.
  useEffect(() => {
    if (!isOpen) setSelectedFoods([]);
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

  async function handleAddMeal(meal: SavedMeal) {
    setSaving(true);
    setError('');
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
        setError('This meal has no items');
        setSaving(false);
        return;
      }

      for (const item of fullMeal.items) {
        // Server computes snapshots when food_id is set; pass quantity in 'serving' unit
        const quantity = item.quantity ?? item.servings ?? 1;
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: item.foodId,
          food_name_snapshot: item.name ?? `Food ${item.foodId}`,
          quantity,
          unit: 'serving',
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
      setQuickName('');
      setQuickCalories('');
      setQuickProtein('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add entry');
    } finally {
      setSaving(false);
    }
  }

  const tabClass = (t: typeof tab) =>
    `flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
      tab === t
        ? 'bg-white/15 text-white border border-white/20'
        : 'text-white/50 hover:text-white'
    }`;

  // Selection summary for the sticky footer
  const footerTotals = selectedFoods.reduce(
    (acc, sf) => {
      try {
        const foodForCalc = {
          base_amount: sf.food.base_amount ?? sf.food.baseAmount ?? 100,
          base_unit: (sf.food.base_unit ?? sf.food.baseUnit ?? 'serving') as Unit,
          serving_size_g: sf.food.serving_size_g ?? null,
          calories: sf.food.calories ?? 0,
          protein: sf.food.protein ?? null,
        };
        const r = nutritionFor(foodForCalc, sf.quantity, sf.unit);
        return { calories: acc.calories + r.calories, protein: acc.protein + r.protein };
      } catch {
        return acc;
      }
    },
    { calories: 0, protein: 0 }
  );
  const totalCalories = footerTotals.calories;
  const totalProtein = footerTotals.protein;

  // Sticky bottom bar — only meaningful for the foods tab. Meals add inline
  // on tap; quick-add has its own button. So footer is null for those tabs
  // and the modal renders without the bottom band.
  const footer = tab === 'foods' && selectedFoods.length > 0
    ? (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white tabular-nums">
            {selectedFoods.length} selected · {Math.round(totalCalories)} kcal
          </p>
          <p className="text-xs text-white/50 tabular-nums">
            {totalProtein.toFixed(1)}g protein
          </p>
        </div>
        <GlassButton
          variant="primary"
          onClick={handleAddSelectedFoods}
          disabled={saving}
        >
          {saving
            ? 'Adding…'
            : `Add to ${MEAL_LABELS[mealType]}`}
        </GlassButton>
      </div>
    )
    : null;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add to ${MEAL_LABELS[mealType]}`}
      size="lg"
      mobileFullscreen
      // Floor the modal at ~80% of the viewport on tablet+ so it doesn't
      // visibly shrink when search filters the food list down to a couple
      // of rows. Mobile-fullscreen handles the same goal differently
      // (forced height) — see GlassModal.
      minHeight="sm:min-h-[80vh]"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Tabs — shorter labels so they don't crowd on narrow screens */}
        <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
          <button className={tabClass('foods')} onClick={() => setTab('foods')}>
            <span aria-hidden>🍎</span> Foods
          </button>
          <button className={tabClass('meals')} onClick={() => setTab('meals')}>
            <span aria-hidden>🍽️</span> Meals
          </button>
          <button className={tabClass('quick')} onClick={() => setTab('quick')}>
            <span aria-hidden>⚡</span> Quick
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
        )}

        {tab === 'foods' && (
          <FoodPicker
            selectedFoods={selectedFoods}
            setSelectedFoods={setSelectedFoods}
          />
        )}

        {tab === 'quick' && (
          <div className="space-y-4">
            <p className="text-xs text-white/40">
              Log calories without adding to your food database — great for one-off items.
            </p>
            <GlassInput
              label="Food name"
              placeholder="e.g. Slice of birthday cake"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <GlassInput
                label="Calories (kcal)"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 350"
                value={quickCalories}
                onChange={(e) => setQuickCalories(e.target.value)}
                min={0}
              />
              <GlassInput
                label="Protein (g) — optional"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 8"
                value={quickProtein}
                onChange={(e) => setQuickProtein(e.target.value)}
                min={0}
                step={0.1}
              />
            </div>
            <GlassButton
              variant="primary"
              className="w-full justify-center"
              onClick={handleQuickAdd}
              disabled={!quickName.trim() || !quickCalories || saving}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {saving ? 'Adding…' : 'Add to Journal'}
              </span>
            </GlassButton>
          </div>
        )}

        {tab === 'meals' && (
          <div className="space-y-2">
            {/* Meal search */}
            <div className="relative">
              <input
                type="text"
                value={mealQuery}
                onChange={(e) => setMealQuery(e.target.value)}
                placeholder="Search saved meals…"
                className="w-full pl-4 pr-9 py-2.5 text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400/40 transition-all duration-200"
              />
              {mealQuery && (
                <button
                  onClick={() => setMealQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors duration-200"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {loadingMeals && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            )}
            {!loadingMeals && savedMeals.length === 0 && (
              <p className="text-center text-white/40 text-sm py-4">No saved meals yet</p>
            )}
            {!loadingMeals && savedMeals.length > 0 && mealQuery && savedMeals.filter((m) => m.name.toLowerCase().includes(mealQuery.toLowerCase())).length === 0 && (
              <p className="text-center text-white/40 text-sm py-4">No meals match your search</p>
            )}
            {savedMeals.filter((m) => !mealQuery || m.name.toLowerCase().includes(mealQuery.toLowerCase())).map((meal) => {
              // Calculate totals from items
              const totals = (meal.items || []).reduce(
                (acc, item) => {
                  const qty = item.quantity ?? item.servings ?? 1;
                  return {
                    calories: acc.calories + (item.calories || 0) * qty,
                    protein: acc.protein + (item.protein || 0) * qty,
                  };
                },
                { calories: 0, protein: 0 }
              );
              return (
                <button
                  key={meal.id}
                  onClick={() => handleAddMeal(meal)}
                  disabled={saving}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 text-left disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{meal.name}</p>
                    <p className="text-xs text-white/50">
                      {meal.items?.length ?? 0} items · {Math.round(totals.calories)} cal · {totals.protein.toFixed(1)}g protein
                    </p>
                  </div>
                  <Plus className="w-4 h-4 text-indigo-400 shrink-0" />
                </button>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </GlassModal>
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
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setServings(String(entry.servings));
      setMealType(entry.meal_type);
      setError('');
    }
  }, [entry]);

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setError('');
    try {
      const sv = parseFloat(servings) || 1;
      // Recalculate snapshots proportionally
      const originalQty = entry.quantity ?? entry.servings ?? 1;
      const ratio = sv / originalQty;
      const updated = await updateJournalEntry(entry.id, {
        quantity: sv,
        unit: 'serving',
        meal_type: mealType,
        calories_snapshot: Math.round(entry.calories_snapshot * ratio),
        protein_snapshot: Math.round(entry.protein_snapshot * ratio * 10) / 10,
      });
      onUpdated(updated);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Edit Entry" size="sm">
      {entry && (
        <div className="space-y-4">
          <p className="font-medium text-white">{entry.food_name_snapshot}</p>
          <GlassInput
            label="Servings"
            type="number"
            inputMode="decimal"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            min={0.1}
            step={0.1}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/60 pl-1">Meal</label>
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="w-full px-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400/60 transition-all duration-200"
            >
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m} className="bg-slate-900">{MEAL_LABELS[m]}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
            <GlassButton variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
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

  // Sync when goals change externally
  useEffect(() => {
    setCalories(String(goals.calories));
    setProtein(String(goals.protein));
  }, [goals.calories, goals.protein]);

  async function handleSave() {
    setError(null);
    // Use Number (not parseInt) so decimal goals like 1850.5 aren't silently
    // truncated to 1850 now that the inputs accept decimal entry.
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

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Edit Daily Goals" size="sm">
      <div className="space-y-4">
        <GlassInput
          label="Calorie Goal (kcal)"
          type="number"
          inputMode="decimal"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          min={1}
          step={50}
          disabled={saving}
        />
        <GlassInput
          label="Protein Goal (g)"
          type="number"
          inputMode="decimal"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          min={1}
          step={5}
          disabled={saving}
        />
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose} disabled={saving}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Goals'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Entry Action Menu (3-dot + right-click) ───────────────────────────────

// Shared styling tokens for the action menu surface and its items. Kept at
// module scope so the menu and any submenus pull from the same source.
const MENU_SURFACE_CLASS =
  'min-w-[180px] p-1 rounded-2xl bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40';
const MENU_ITEM_BASE =
  'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm text-white transition-colors duration-150';
const MENU_ITEM_HOVER = 'hover:bg-white/[0.08]';

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
          className={`absolute top-0 ${
            flip ? 'right-full mr-1' : 'left-full ml-1'
          } ${MENU_SURFACE_CLASS}`}
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
      style={{ position: 'fixed', left: Math.max(8, x), top: Math.max(8, y), zIndex: 50 }}
      className={MENU_SURFACE_CLASS}
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

// ─── Entry Row ─────────────────────────────────────────────────────────────

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

  function openMenuFromButton() {
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

  return (
    <div
      draggable={pointerCapable}
      onDragStart={pointerCapable ? handleDragStart : undefined}
      onDragEnd={pointerCapable ? handleDragEnd : undefined}
      onContextMenu={handleContextMenu}
      className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 group transition-opacity ${
        dragging ? 'opacity-40' : ''
      } ${pointerCapable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <button
        type="button"
        onClick={() => onEdit(entry)}
        className="flex-1 text-left min-w-0 cursor-pointer"
      >
        <p className="text-sm font-medium text-white truncate">{entry.food_name_snapshot}</p>
        <p className="text-xs text-white/50">
          {entry.servings} serving{entry.servings !== 1 ? 's' : ''} · {entry.calories_snapshot} kcal · {entry.protein_snapshot}g protein
        </p>
      </button>

      {/* 3-dot icon → opens action menu (Edit / Copy to ▸ / Delete) */}
      <button
        ref={threeDotRef}
        type="button"
        onClick={openMenuFromButton}
        disabled={deleting}
        className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200 opacity-60 group-hover:opacity-100 disabled:opacity-30"
        aria-label="More actions"
        title="More actions"
      >
        {deleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MoreHorizontal className="w-4 h-4" />
        )}
      </button>

      {menuAnchor && (
        <EntryActionMenu
          anchor={menuAnchor}
          currentMeal={entry.meal_type}
          onEdit={() => { setMenuAnchor(null); onEdit(entry); }}
          onMove={(target) => { handleMove(target); }}
          onCopy={(target) => { handleCopy(target); }}
          onDelete={() => { setMenuAnchor(null); handleDelete(); }}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  );
}

// ─── Meal Section ──────────────────────────────────────────────────────────

interface MealSectionProps {
  type: MealType;
  entries: JournalEntry[];
  pointerCapable: boolean;
  onDeleted: (id: number) => void;
  onEditRequest: (entry: JournalEntry) => void;
  onRequestAdd: (mealType: MealType) => void;
  onCopyEntry: (entry: JournalEntry, target: MealType) => Promise<void> | void;
  onMoveEntry: (id: number, target: MealType) => Promise<void> | void;
  /** Set true while ANY drag is active so other sections can highlight on hover */
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
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const totalCal = entries.reduce((a, e) => a + e.calories_snapshot, 0);
  const totalPro = entries.reduce((a, e) => a + e.protein_snapshot, 0);

  async function handleDelete(id: number) {
    try {
      await deleteJournalEntry(id);
      onDeleted(id);
    } catch { /* ignore */ }
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

  return (
    <GlassCard
      padding={false}
      className={`overflow-hidden transition-all duration-150 ${
        dragOver
          ? 'ring-2 ring-indigo-400/70 bg-indigo-500/5'
          : draggingActive
            ? 'ring-1 ring-white/15'
            : ''
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-white">{MEAL_LABELS[type]}</span>
          {entries.length > 0 && (
            <span className="text-xs text-white/40 font-normal">
              {Math.round(totalCal)} kcal · {Math.round(totalPro * 10) / 10}g protein
            </span>
          )}
        </div>
        <ChevronRight
          className={`w-4 h-4 text-white/40 transition-transform duration-300 ${collapsed ? '' : 'rotate-90'}`}
        />
      </button>

      {!collapsed && (
        <div
          className="px-5 pb-4 space-y-2"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {entries.length === 0 && (
            <p className="text-sm text-white/30 text-center py-2">
              {dragOver ? `Drop to move here` : 'Nothing logged yet'}
            </p>
          )}

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

          <button
            onClick={() => onRequestAdd(type)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-white/20 text-sm text-white/50 hover:text-white hover:border-indigo-400/50 hover:bg-white/5 transition-all duration-300"
          >
            <Plus className="w-4 h-4" /> Add Food
          </button>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  // Detect hover-capable input (mouse/trackpad) to gate drag-and-drop.
  // Touch devices fall back to the 3-dot menu / copy button.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPointerCapable(window.matchMedia('(hover: hover)').matches);
  }, []);

  // Load goals from API
  useEffect(() => {
    getGoals()
      .then((g) => setGoals({ calories: g.calories, protein: g.protein }))
      .catch(() => {}); // keep defaults on failure
  }, []);

  async function handleSaveGoals(newGoals: { calories: number; protein: number }) {
    // No optimistic update — wait for the backend to confirm so the modal
    // can surface failures rather than closing on a fire-and-forget save
    // that silently dropped the user's input.
    const updated = await updateGoals(newGoals);
    setGoals({ calories: updated.calories, protein: updated.protein });
  }

  const dateStr = toISODate(currentDate);

  const fetchEntries = useCallback(() => {
    setLoading(true);
    setError('');
    getJournalEntries({ date: dateStr })
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [dateStr]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useSocketEvent('journal-entry-created', fetchEntries);
  useSocketEvent('journal-entry-updated', fetchEntries);
  useSocketEvent('journal-entry-deleted', fetchEntries);

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

  // Duplicate an entry into another meal on the same day.
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

  // Move an entry to a different meal section (drag/drop).
  // Optimistic update with rollback on failure.
  async function handleEntryMove(id: number, target: MealType) {
    const current = entries.find((e) => e.id === id);
    if (!current || current.meal_type === target) return;
    const previous = current;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, meal_type: target } : e)));
    try {
      const updated = await updateJournalEntry(id, { meal_type: target });
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (e: unknown) {
      setEntries((prev) => prev.map((entry) => (entry.id === id ? previous : entry)));
      setError(e instanceof Error ? e.message : 'Failed to move entry');
    }
  }

  // Totals
  const totalCalories = entries.reduce((a, e) => a + e.calories_snapshot, 0);
  const totalProtein = entries.reduce((a, e) => a + e.protein_snapshot, 0);

  // Group
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

  return (
    <div className="space-y-6 animate-fade-in w-full max-w-full overflow-x-hidden px-3 sm:px-4">
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Food Journal</h1>
      </div>

      {/* Date Navigation */}
      <GlassCard padding={false}>
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={handlePrevDay}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowDateInput(true)}
              className="flex items-center gap-2 text-white font-semibold hover:text-indigo-300 transition-colors duration-200"
            >
              {formatDateLabel(currentDate)}
              <Pencil className="w-3.5 h-3.5 text-white/40" />
            </button>
            {showDateInput && (
              <input
                ref={dateInputRef}
                type="date"
                value={dateStr}
                onChange={handleDateChange}
                onBlur={() => setShowDateInput(false)}
                className="absolute opacity-0 w-0 h-0"
              />
            )}
          </div>

          <button
            onClick={handleNextDay}
            disabled={isToday}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </GlassCard>

      {/* Daily Totals */}
      <GlassCard>
        {(() => {
        const caloriesOver = totalCalories > goals.calories;
        const caloriesOverBy = Math.round(totalCalories - goals.calories);
        return (
        <>
        <div className="flex items-center gap-6">
          {/* Calories ring */}
          <div className="relative shrink-0">
            <ProgressRing
              value={totalCalories}
              max={goals.calories}
              size={72}
              stroke={6}
              color={caloriesOver ? '#ef4444' : '#6366f1'}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold leading-tight">{Math.round(totalCalories)}</span>
              <span className="text-[10px] text-gray-400 dark:text-white/40">kcal</span>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            {/* Calories */}
            <div>
              <div className="flex items-end justify-between mb-1">
                <span className="text-sm text-gray-500 dark:text-white/60">Calories</span>
                <span className="text-base font-bold">
                  {Math.round(totalCalories)} <span className="text-gray-400 dark:text-white/40 font-normal">/ {goals.calories}</span>
                  {caloriesOver && (
                    <span className="ml-1.5 text-red-500 dark:text-red-400 font-semibold text-sm">
                      +{caloriesOverBy} over
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    caloriesOver
                      ? 'bg-gradient-to-r from-red-500 to-rose-500'
                      : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                  }`}
                  style={{ width: `${Math.min((totalCalories / goals.calories) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Protein */}
            <div>
              <div className="flex items-end justify-between mb-1">
                <span className="text-sm text-gray-500 dark:text-white/60">Protein</span>
                <span className="text-base font-bold">
                  {Math.round(totalProtein * 10) / 10}g <span className="text-gray-400 dark:text-white/40 font-normal">/ {goals.protein}g</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((totalProtein / goals.protein) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Remaining + Edit Goals */}
        <div className="mt-4 pt-4 border-t border-black/[0.06] dark:border-white/10 flex gap-4 text-sm items-center">
          <div className="flex-1 text-center">
            <p className="text-gray-400 dark:text-white/40 text-xs mb-0.5">Remaining</p>
            <p className={`font-semibold ${totalCalories > goals.calories ? 'text-red-500 dark:text-red-400' : ''}`}>
              {Math.max(goals.calories - Math.round(totalCalories), 0)} kcal
            </p>
          </div>
          <div className="w-px bg-black/[0.06] dark:bg-white/10 self-stretch" />
          <div className="flex-1 text-center">
            <p className="text-gray-400 dark:text-white/40 text-xs mb-0.5">Protein left</p>
            <p className={`font-semibold ${totalProtein >= goals.protein ? 'text-emerald-500 dark:text-emerald-400' : ''}`}>
              {totalProtein >= goals.protein ? '✓ Goal met' : `${Math.round((goals.protein - totalProtein) * 10) / 10}g`}
            </p>
          </div>
          <div className="w-px bg-black/[0.06] dark:bg-white/10 self-stretch" />
          <div className="flex-1 text-center">
            <button
              onClick={() => setGoalsModalOpen(true)}
              className="text-xs text-[#2E8B57] hover:text-[#61bc84] font-medium transition-colors duration-200"
            >
              ✏ Edit Goals
            </button>
          </div>
        </div>
        </>
        );
        })()}
      </GlassCard>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Meals */}
      {loading ? (
        <JournalSkeleton />
      ) : (
        <div className="space-y-4">
          {MEAL_TYPES.map((mealType) => (
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
          ))}
        </div>
      )}

      {/* Add Food Modal — rendered at page level so it escapes the card overflow */}
      <AddFoodModal
        isOpen={addMealType !== null}
        onClose={() => setAddMealType(null)}
        mealType={addMealType ?? 'breakfast'}
        date={dateStr}
        onAdded={handleEntryAdded}
      />

      {/* Edit Entry Modal */}
      <EditEntryModal
        isOpen={!!editEntry}
        onClose={() => setEditEntry(null)}
        entry={editEntry}
        onUpdated={handleEntryUpdated}
      />

      {/* Edit Goals Modal */}
      <EditGoalsModal
        isOpen={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        goals={goals}
        onSave={handleSaveGoals}
      />
    </div>
  );
}
