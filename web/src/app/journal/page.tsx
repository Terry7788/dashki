'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassModal } from '@/components/ui';
import {
  getJournalEntries,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getSavedMeals,
} from '@/lib/api';
import type { JournalEntry, MealType, Food, SavedMeal } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUTRITION_GOALS_KEY = 'dashki-nutrition-goals';
const DEFAULT_GOALS = { calories: 2000, protein: 150 };

function loadGoals(): { calories: number; protein: number } {
  if (typeof window === 'undefined') return DEFAULT_GOALS;
  try {
    const raw = localStorage.getItem(NUTRITION_GOALS_KEY);
    if (!raw) return DEFAULT_GOALS;
    const parsed = JSON.parse(raw);
    return {
      calories: Number(parsed.calories) || DEFAULT_GOALS.calories,
      protein: Number(parsed.protein) || DEFAULT_GOALS.protein,
    };
  } catch {
    return DEFAULT_GOALS;
  }
}

function saveGoals(goals: { calories: number; protein: number }) {
  localStorage.setItem(NUTRITION_GOALS_KEY, JSON.stringify(goals));
}

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

/**
 * Calculate nutrition for a food + servings.
 *
 * The API returns food objects with:
 *   - calories  (kcal per base_amount of base_unit)
 *   - protein   (g per base_amount)
 *   - base_amount (e.g. 100)
 *   - base_unit  (e.g. "grams")
 *
 * 1 serving = 1 × base_amount units.
 * So for `servings` servings we just multiply directly.
 */
function calcNutrition(food: Food, servings: number) {
  // Prefer the direct API field names (calories / protein).
  // Fall back to the legacy per-100g fields if those aren't present.
  const caloriesPerServing =
    food.calories ??
    (food.calories_per_100g != null
      ? food.serving_size_g
        ? (food.calories_per_100g * food.serving_size_g) / 100
        : food.calories_per_100g
      : 0);

  const proteinPerServing =
    food.protein ??
    (food.protein_per_100g != null
      ? food.serving_size_g
        ? (food.protein_per_100g * food.serving_size_g) / 100
        : food.protein_per_100g
      : 0);

  return {
    calories: Math.round(caloriesPerServing * servings),
    protein: Math.round(proteinPerServing * servings * 10) / 10,
  };
}

/** Get the display calories value from a food, regardless of field name */
function foodCalories(food: Food): number {
  return food.calories ?? food.calories_per_100g ?? 0;
}

/** Get the display protein value from a food, regardless of field name */
function foodProtein(food: Food): number {
  return food.protein ?? food.protein_per_100g ?? 0;
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

interface FoodPickerProps {
  onAdd: (food: Food, servings: number) => void;
}

function FoodPicker({ onAdd }: FoodPickerProps) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleConfirm() {
    if (!selected) return;
    const sv = parseFloat(servings) || 1;
    onAdd(selected, sv);
    setSelected(null);
    setServings('1');
    setQuery('');
  }

  if (selected) {
    const { calories, protein } = calcNutrition(selected, parseFloat(servings) || 1);
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to search
        </button>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
          <p className="font-semibold text-white">{selected.name}</p>
          <p className="text-sm text-white/50">
            {calories} kcal · {protein}g protein per serving
          </p>
        </div>
        <GlassInput
          label="Servings"
          type="number"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          min={0.1}
          step={0.1}
        />
        <GlassButton variant="primary" className="w-full" onClick={handleConfirm}>
          Add to Journal
        </GlassButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GlassInput
        placeholder="Search foods…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
        {loading && <p className="text-center text-white/40 text-sm py-4">Searching…</p>}
        {!loading && foods.length === 0 && (
          <p className="text-center text-white/40 text-sm py-4">No foods found</p>
        )}
        {foods.map((food) => (
          <button
            key={food.id}
            onClick={() => setSelected(food)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 text-left"
          >
            <span className="text-sm font-medium text-white truncate">{food.name}</span>
            <span className="text-xs text-white/50 ml-3 shrink-0">
              {foodCalories(food)} kcal · {foodProtein(food)}g pro
            </span>
          </button>
        ))}
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
  const [tab, setTab] = useState<'foods' | 'meals'>('foods');
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (tab === 'meals' && savedMeals.length === 0) {
      setLoadingMeals(true);
      getSavedMeals()
        .then(setSavedMeals)
        .catch(() => { })
        .finally(() => setLoadingMeals(false));
    }
  }, [tab, savedMeals.length]);

  async function handleAddFood(food: Food, servings: number) {
    setSaving(true);
    setError('');
    const { calories, protein } = calcNutrition(food, servings);
    try {
      const entry = await addJournalEntry({
        date,
        meal_type: mealType,
        food_id: food.id,
        food_name_snapshot: food.name,
        servings,
        calories_snapshot: calories,
        protein_snapshot: protein,
      });
      onAdded(entry);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add entry');
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
        // Fetch food details for calorie/protein calculation
        const res = await fetch(`${BASE_URL}/api/foods/${item.foodId}`);
        if (!res.ok) continue;
        const food: Food = await res.json();
        const { calories, protein } = calcNutrition(food, item.servings);
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: food.id,
          food_name_snapshot: food.name,
          servings: item.servings,
          calories_snapshot: calories,
          protein_snapshot: protein,
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

  const tabClass = (t: typeof tab) =>
    `flex-1 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
      tab === t
        ? 'bg-white/15 text-white border border-white/20'
        : 'text-white/50 hover:text-white'
    }`;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add to ${MEAL_LABELS[mealType]}`}
      size="lg"
    >
      <div className="space-y-4" style={{ maxHeight: '85vh' }}>
        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-2xl bg-white/5 border border-white/10">
          <button className={tabClass('foods')} onClick={() => setTab('foods')}>🍎 Foods</button>
          <button className={tabClass('meals')} onClick={() => setTab('meals')}>🍽️ Saved Meals</button>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
        )}

        {saving && (
          <p className="text-sm text-indigo-400 text-center">Saving…</p>
        )}

        {tab === 'foods' && <FoodPicker onAdd={handleAddFood} />}

        {tab === 'meals' && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {loadingMeals && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            )}
            {!loadingMeals && savedMeals.length === 0 && (
              <p className="text-center text-white/40 text-sm py-4">No saved meals yet</p>
            )}
            {savedMeals.map((meal) => {
              // Calculate totals from items
              const totals = (meal.items || []).reduce(
                (acc, item) => ({
                  calories: acc.calories + (item.calories || 0) * item.servings,
                  protein: acc.protein + (item.protein || 0) * item.servings,
                }),
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
      const ratio = sv / entry.servings;
      const updated = await updateJournalEntry(entry.id, {
        servings: sv,
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
  onSave: (goals: { calories: number; protein: number }) => void;
}

function EditGoalsModal({ isOpen, onClose, goals, onSave }: EditGoalsModalProps) {
  const [calories, setCalories] = useState(String(goals.calories));
  const [protein, setProtein] = useState(String(goals.protein));

  // Sync when goals change externally
  useEffect(() => {
    setCalories(String(goals.calories));
    setProtein(String(goals.protein));
  }, [goals.calories, goals.protein]);

  function handleSave() {
    const cal = parseInt(calories, 10);
    const pro = parseInt(protein, 10);
    if (!cal || !pro || cal < 1 || pro < 1) return;
    onSave({ calories: cal, protein: pro });
    onClose();
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Edit Daily Goals" size="sm">
      <div className="space-y-4">
        <GlassInput
          label="Calorie Goal (kcal)"
          type="number"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          min={1}
          step={50}
        />
        <GlassInput
          label="Protein Goal (g)"
          type="number"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          min={1}
          step={5}
        />
        <div className="flex gap-3">
          <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={handleSave}>Save Goals</GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Meal Section ──────────────────────────────────────────────────────────

interface MealSectionProps {
  type: MealType;
  entries: JournalEntry[];
  date: string;
  onAdded: (entry: JournalEntry) => void;
  onDeleted: (id: number) => void;
  onEditRequest: (entry: JournalEntry) => void;
  onRequestAdd: (mealType: MealType) => void;
}

function MealSection({ type, entries, date, onAdded, onDeleted, onEditRequest, onRequestAdd }: MealSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const totalCal = entries.reduce((a, e) => a + e.calories_snapshot, 0);
  const totalPro = entries.reduce((a, e) => a + e.protein_snapshot, 0);

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await deleteJournalEntry(id);
      onDeleted(id);
    } catch { /* ignore */ } finally {
      setDeleting(null);
    }
  }

  return (
    <GlassCard padding={false} className="overflow-hidden">
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
        <div className="px-5 pb-4 space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-white/30 text-center py-2">Nothing logged yet</p>
          )}

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 group"
            >
              <button
                onClick={() => onEditRequest(entry)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm font-medium text-white truncate">{entry.food_name_snapshot}</p>
                <p className="text-xs text-white/50">
                  {entry.servings} serving{entry.servings !== 1 ? 's' : ''} · {entry.calories_snapshot} kcal · {entry.protein_snapshot}g protein
                </p>
              </button>
              <button
                onClick={() => handleDelete(entry.id)}
                disabled={deleting === entry.id}
                className="p-1.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                {deleting === entry.id ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}

          <button
            onClick={() => onRequestAdd(type)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-white/20 text-sm text-white/50 hover:text-white hover:border-indigo-400/50 hover:bg-white/5 transition-all duration-300"
          >
            <Plus className="w-4 h-4" /> Add Food
          </button>
        </div>
      )}

      {/* REMOVED: AddFoodModal was here - now rendered at page level */}
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

  // Load goals from localStorage
  useEffect(() => {
    setGoals(loadGoals());
  }, []);

  function handleSaveGoals(newGoals: { calories: number; protein: number }) {
    saveGoals(newGoals);
    setGoals(newGoals);
  }

  const dateStr = toISODate(currentDate);

  useEffect(() => {
    setLoading(true);
    setError('');
    getJournalEntries({ date: dateStr })
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [dateStr]);

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
        <div className="flex items-center gap-6">
          {/* Calories ring */}
          <div className="relative shrink-0">
            <ProgressRing value={totalCalories} max={goals.calories} size={72} stroke={6} color="#6366f1" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-bold leading-tight">{Math.round(totalCalories)}</span>
              <span className="text-[10px] text-gray-400 dark:text-white/40">kcal</span>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            {/* Calories */}
            <div>
              <div className="flex items-end justify-between mb-1">
                <span className="text-sm text-gray-500 dark:text-white/60">Calories</span>
                <span className="text-sm font-semibold">
                  {Math.round(totalCalories)} <span className="text-gray-400 dark:text-white/40 font-normal">/ {goals.calories}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((totalCalories / goals.calories) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Protein */}
            <div>
              <div className="flex items-end justify-between mb-1">
                <span className="text-sm text-gray-500 dark:text-white/60">Protein</span>
                <span className="text-sm font-semibold">
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
              date={dateStr}
              onAdded={handleEntryAdded}
              onDeleted={handleEntryDeleted}
              onEditRequest={setEditEntry}
              onRequestAdd={(type) => setAddMealType(type)}
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
