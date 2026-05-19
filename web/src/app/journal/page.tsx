'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Loader2, Clock, Search, Copy, MoreHorizontal, Move, Sunrise, Sun, Cookie, Moon, X, Apple } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassModal, CalorieRing, MacroBar, Pill, MicroLabel, MonoNum, EmptyState, CardShell } from '@/components/ui';
import {
  FOOD_TAGS,
  TAG_TONES,
  TAG_ICONS,
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
} from '@/lib/api';
import type { JournalEntry, MealType, Food, SavedMeal, Unit } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { QuantityInput } from '@/components/QuantityInput';
import { nutritionFor, formatQuantity } from '@/lib/nutrition';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GOALS = { calories: 2000, protein: 150 };

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

// Viewport-aware switch. The modal's table layout works on desktop but
// at <640px the fixed colgroup widths starve the food-name column, so we
// fall back to a stacked card list at that breakpoint.
function useIsModalNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

function FoodPicker({ selectedFoods, setSelectedFoods }: FoodPickerProps) {
  const isNarrow = useIsModalNarrow();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<FoodTag | 'All'>('All');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Auto-focus the search input on mount on devices with hover (keyboards).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isHoverCapable = window.matchMedia('(hover: hover)').matches;
    if (isHoverCapable && searchInputRef.current) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, []);

  // Apply tag filter client-side (search already done by the API).
  const visible = useMemo(
    () => (tag === 'All' ? foods : foods.filter((f) => inferTag(f) === tag)),
    [foods, tag]
  );

  function toggleFood(food: Food) {
    const existing = selectedFoods.find((sf) => sf.food.id === food.id);
    if (existing) {
      setSelectedFoods(selectedFoods.filter((sf) => sf.food.id !== food.id));
      if (expandedId === food.id) setExpandedId(null);
    } else {
      const units = food.units ?? [
        { unit: 'serving' as Unit, label: 'serving', default: true },
      ];
      const def = units.find((u) => u.default) ?? units[0];
      const startQty =
        def.unit === 'serving'
          ? 1
          : food.base_amount ?? food.baseAmount ?? 100;
      setSelectedFoods([
        ...selectedFoods,
        { food, quantity: startQty, unit: def.unit },
      ]);
    }
  }

  function setQuantityForFood(
    foodId: number,
    next: { quantity: number; unit: Unit }
  ) {
    const clamped = { quantity: Math.max(0, next.quantity), unit: next.unit };
    setSelectedFoods(
      selectedFoods.map((sf) =>
        sf.food.id === foodId ? { ...sf, ...clamped } : sf
      )
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
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
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          style={{
            width: '100%',
            padding: '8px 32px 8px 32px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-foreground)',
            fontFamily: 'inherit',
            fontSize: 14,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            type="button"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 0,
              padding: 4,
              color: 'var(--color-muted-foreground)',
              cursor: 'pointer',
              display: 'flex',
            }}
            aria-label="Clear search"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {/* Tag chips */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {FOOD_TAGS.map((t) => {
          const active = tag === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className="cursor-pointer"
              style={{
                padding: '4px 10px',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 600,
                background: active
                  ? 'var(--color-foreground)'
                  : 'var(--color-surface-warm)',
                color: active
                  ? 'var(--color-background)'
                  : 'var(--color-muted-foreground)',
                border:
                  '1px solid ' +
                  (active ? 'var(--color-foreground)' : 'var(--color-border)'),
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Table-style list (matches Food Database page) */}
      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--color-surface)',
        }}
      >
        <div
          style={{
            maxHeight: 'calc(100vh - 420px)',
            minHeight: 320,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {loading && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
              }}
            >
              Searching…
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
              }}
            >
              No foods match.
            </div>
          )}
          {!loading && visible.length > 0 && !isNarrow && (
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
                <col style={{ width: 64 }} />
                <col style={{ width: 44 }} />
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
                  <th style={MODAL_TH}>Food</th>
                  <th style={{ ...MODAL_TH, textAlign: 'right' }}>Cal</th>
                  <th style={{ ...MODAL_TH, textAlign: 'right' }}>Protein</th>
                  <th style={MODAL_TH}>Tag</th>
                  <th style={MODAL_TH}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((food) => {
                  const selected = selectedFoods.find(
                    (sf) => sf.food.id === food.id
                  );
                  const isSelected = !!selected;
                  const isExpanded = expandedId === food.id;
                  const inferred = inferTag(food);
                  const IconCmp = inferred ? TAG_ICONS[inferred] : Apple;
                  const cal = food.calories ?? food.calories_per_100g ?? 0;
                  const protein = food.protein ?? food.protein_per_100g ?? 0;
                  return (
                    <Fragment key={food.id}>
                      <tr
                        style={{
                          background: isSelected
                            ? 'var(--color-badge-bg)'
                            : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 120ms',
                        }}
                        onClick={() => {
                          if (isSelected) {
                            // Toggle the inline editor for selected rows
                            setExpandedId(isExpanded ? null : food.id);
                          } else {
                            toggleFood(food);
                          }
                        }}
                      >
                        <td style={{ ...MODAL_TD, overflow: 'hidden' }}>
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
                                style={{
                                  width: 13,
                                  height: 13,
                                  color: 'var(--color-muted-foreground)',
                                }}
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
                        <td style={{ ...MODAL_TD, textAlign: 'right' }}>
                          <MonoNum size={13}>{cal}</MonoNum>
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--color-muted-foreground)',
                              marginLeft: 2,
                            }}
                          >
                            kcal
                          </span>
                        </td>
                        <td style={{ ...MODAL_TD, textAlign: 'right' }}>
                          <MonoNum size={13}>{protein}</MonoNum>
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--color-muted-foreground)',
                              marginLeft: 2,
                            }}
                          >
                            g
                          </span>
                        </td>
                        <td style={MODAL_TD}>
                          {inferred ? (
                            <Pill tone={TAG_TONES[inferred]}>{inferred}</Pill>
                          ) : (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'var(--color-muted-foreground)',
                              }}
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td style={{ ...MODAL_TD, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFood(food);
                            }}
                            className="cursor-pointer"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 9999,
                              background: isSelected
                                ? 'var(--color-success)'
                                : 'var(--color-primary)',
                              color: 'var(--color-primary-foreground)',
                              border: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'inherit',
                            }}
                            aria-label={isSelected ? 'Unstage' : 'Stage'}
                          >
                            {isSelected ? (
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                }}
                              >
                                ✓
                              </span>
                            ) : (
                              <Plus
                                style={{
                                  width: 14,
                                  height: 14,
                                  strokeWidth: 2.5,
                                }}
                              />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isSelected && isExpanded && selected && (
                        <tr style={{ background: 'var(--color-surface-warm)' }}>
                          <td
                            colSpan={5}
                            style={{
                              padding: '8px 12px',
                              borderBottom:
                                '1px solid var(--color-border)',
                            }}
                          >
                            <QuantityInput
                              food={food}
                              quantity={selected.quantity}
                              unit={selected.unit}
                              onChange={(next) =>
                                setQuantityForFood(food.id, next)
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Mobile card list — full food names get full width here */}
          {!loading && visible.length > 0 && isNarrow && (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {visible.map((food) => {
                const selected = selectedFoods.find(
                  (sf) => sf.food.id === food.id
                );
                const isSelected = !!selected;
                const isExpanded = expandedId === food.id;
                const inferred = inferTag(food);
                const IconCmp = inferred ? TAG_ICONS[inferred] : Apple;
                const cal = food.calories ?? food.calories_per_100g ?? 0;
                const protein = food.protein ?? food.protein_per_100g ?? 0;
                return (
                  <li
                    key={food.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: isSelected
                        ? 'var(--color-badge-bg)'
                        : 'transparent',
                      transition: 'background 120ms',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setExpandedId(isExpanded ? null : food.id);
                        } else {
                          toggleFood(food);
                        }
                      }}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: '10px 12px',
                        width: '100%',
                        background: 'transparent',
                        border: 0,
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        color: 'var(--color-foreground)',
                        cursor: 'pointer',
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
                          marginTop: 2,
                        }}
                      >
                        <IconCmp
                          style={{
                            width: 13,
                            height: 13,
                            color: 'var(--color-muted-foreground)',
                          }}
                        />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: 1.3,
                            wordBreak: 'break-word',
                          }}
                        >
                          {food.name}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 4,
                            fontSize: 11,
                            color: 'var(--color-muted-foreground)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>{unitLabel(food)}</span>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            <span
                              style={{
                                color: 'var(--color-foreground)',
                                fontWeight: 600,
                              }}
                            >
                              {cal}
                            </span>{' '}
                            kcal
                          </span>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            <span
                              style={{
                                color: 'var(--color-foreground)',
                                fontWeight: 600,
                              }}
                            >
                              {protein}
                            </span>
                            g
                          </span>
                          {inferred && <Pill tone={TAG_TONES[inferred]}>{inferred}</Pill>}
                        </div>
                      </div>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFood(food);
                        }}
                        role="button"
                        aria-label={isSelected ? 'Unstage' : 'Stage'}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9999,
                          background: isSelected
                            ? 'var(--color-success)'
                            : 'var(--color-primary)',
                          color: 'var(--color-primary-foreground)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? (
                          <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span>
                        ) : (
                          <Plus
                            style={{
                              width: 16,
                              height: 16,
                              strokeWidth: 2.5,
                            }}
                          />
                        )}
                      </span>
                    </button>

                    {isSelected && isExpanded && selected && (
                      <div
                        style={{
                          padding: '8px 12px 12px',
                          background: 'var(--color-surface-warm)',
                          borderTop: '1px solid var(--color-border)',
                        }}
                      >
                        <QuantityInput
                          food={food}
                          quantity={selected.quantity}
                          unit={selected.unit}
                          onChange={(next) =>
                            setQuantityForFood(food.id, next)
                          }
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          color: 'var(--color-muted-foreground)',
        }}
      >
        Tap a row to stage it · tap an already-staged row to tweak quantity ·
        the bottom bar shows your running total.
      </div>
    </div>
  );
}

const MODAL_TH: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-muted-foreground)',
  borderBottom: '1px solid var(--color-border)',
};

const MODAL_TD: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--color-border)',
  verticalAlign: 'middle',
};

// ─── Add Food Modal ────────────────────────────────────────────────────────

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: MealType;
  date: string;
  onAdded: (entry: JournalEntry) => void;
}

function AddFoodModal({ isOpen, onClose, mealType: initialMealType, date, onAdded }: AddFoodModalProps) {
  const isNarrow = useIsModalNarrow();
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  useEffect(() => {
    if (isOpen) setMealType(initialMealType);
  }, [isOpen, initialMealType]);
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
        // Server computes snapshots when food_id is set; log in each item's native unit
        const quantity = item.quantity ?? item.servings ?? 1;
        const unit = (item.unit as Unit) ?? 'serving';
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: item.foodId,
          food_name_snapshot: item.name ?? `Food ${item.foodId}`,
          quantity,
          unit,
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

  // Chip-row tab button — matches the design's foreground-inverted active state.
  function chipStyle(active: boolean): React.CSSProperties {
    return {
      padding: '4px 12px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      background: active ? 'var(--color-foreground)' : 'var(--color-surface)',
      color: active
        ? 'var(--color-background)'
        : 'var(--color-muted-foreground)',
      border:
        '1px solid ' +
        (active ? 'var(--color-foreground)' : 'var(--color-border)'),
      cursor: 'pointer',
      fontFamily: 'inherit',
    };
  }

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

  // Leading footer slot — running total when foods are selected.
  const leadingFooter =
    tab === 'foods' && selectedFoods.length > 0 ? (
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {selectedFoods.length} staged · {Math.round(totalCalories)} kcal
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {totalProtein.toFixed(1)}g protein
        </div>
      </div>
    ) : null;

  const footerActions =
    tab === 'foods' ? (
      <>
        <GlassButton variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </GlassButton>
        <GlassButton
          variant="primary"
          size="sm"
          onClick={handleAddSelectedFoods}
          disabled={saving || selectedFoods.length === 0}
        >
          {saving ? 'Adding…' : `Add to ${MEAL_LABELS[mealType]}`}
        </GlassButton>
      </>
    ) : tab === 'quick' ? null : (
      <GlassButton variant="ghost" size="sm" onClick={onClose}>
        Cancel
      </GlassButton>
    );

  // Subtitle uses Melbourne-friendly day label so the user always sees
  // the destination day + meal.
  const subtitle = `Logging to ${MEAL_LABELS[mealType]} · ${formatDateLabel(
    new Date(date + 'T00:00:00')
  )}`;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add food"
      subtitle={subtitle}
      size="lg"
      mobileFullscreen
      minHeight="sm:min-h-[80vh]"
      footer={footerActions}
      leadingFooter={leadingFooter}
      headerTrailing={
        <div style={{ display: 'flex', gap: 0, padding: 3, background: 'var(--color-surface-warm)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          {MEAL_TYPES.map((m) => {
            const active = m === mealType;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMealType(m)}
                className="cursor-pointer"
                style={{
                  padding: '4px 10px',
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
    >
      <div className="space-y-4">
        {/* Chip-row tabs matching the design */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setTab('foods')}
            style={chipStyle(tab === 'foods')}
          >
            Foods
          </button>
          <button
            type="button"
            onClick={() => setTab('meals')}
            style={chipStyle(tab === 'meals')}
          >
            Saved meals
          </button>
          <button
            type="button"
            onClick={() => setTab('quick')}
            style={chipStyle(tab === 'quick')}
          >
            Quick add
          </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
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
                type="text"
                value={mealQuery}
                onChange={(e) => setMealQuery(e.target.value)}
                placeholder="Search saved meals…"
                style={{
                  width: '100%',
                  padding: '8px 32px 8px 32px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  color: 'var(--color-foreground)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                }}
              />
              {mealQuery && (
                <button
                  onClick={() => setMealQuery('')}
                  type="button"
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 0,
                    padding: 4,
                    color: 'var(--color-muted-foreground)',
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                  aria-label="Clear search"
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            {/* Table-style saved meal picker */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--color-surface)',
              }}
            >
              <div
                style={{
                  maxHeight: 'calc(100vh - 420px)',
                  minHeight: 320,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                {loadingMeals ? (
                  <div
                    style={{
                      padding: 32,
                      textAlign: 'center',
                      color: 'var(--color-muted-foreground)',
                    }}
                  >
                    <Loader2
                      style={{ width: 18, height: 18, display: 'inline-block' }}
                      className="animate-spin"
                    />
                  </div>
                ) : savedMeals.length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      fontSize: 13,
                      color: 'var(--color-muted-foreground)',
                    }}
                  >
                    No saved meals yet.
                  </div>
                ) : (() => {
                  const matched = savedMeals.filter(
                    (m) =>
                      !mealQuery ||
                      m.name.toLowerCase().includes(mealQuery.toLowerCase())
                  );
                  if (matched.length === 0) {
                    return (
                      <div
                        style={{
                          padding: 24,
                          textAlign: 'center',
                          fontSize: 13,
                          color: 'var(--color-muted-foreground)',
                        }}
                      >
                        No meals match your search.
                      </div>
                    );
                  }
                  if (isNarrow) {
                    return (
                      <ul
                        style={{
                          listStyle: 'none',
                          padding: 0,
                          margin: 0,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {matched.map((meal) => {
                          const totals = (meal.items || []).reduce(
                            (acc, item) => {
                              const qty = item.quantity ?? item.servings ?? 1;
                              return {
                                calories:
                                  acc.calories + (item.calories || 0) * qty,
                                protein:
                                  acc.protein + (item.protein || 0) * qty,
                              };
                            },
                            { calories: 0, protein: 0 }
                          );
                          const count = meal.items?.length ?? 0;
                          return (
                            <li
                              key={meal.id}
                              style={{
                                borderBottom: '1px solid var(--color-border)',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => !saving && handleAddMeal(meal)}
                                disabled={saving}
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'flex-start',
                                  padding: '10px 12px',
                                  width: '100%',
                                  background: 'transparent',
                                  border: 0,
                                  textAlign: 'left',
                                  fontFamily: 'inherit',
                                  color: 'var(--color-foreground)',
                                  cursor: saving ? 'wait' : 'pointer',
                                  opacity: saving ? 0.6 : 1,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 500,
                                      lineHeight: 1.3,
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {meal.name}
                                  </div>
                                  {meal.description && (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color:
                                          'var(--color-muted-foreground)',
                                        marginTop: 2,
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {meal.description}
                                    </div>
                                  )}
                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: 6,
                                      marginTop: 4,
                                      fontSize: 11,
                                      color:
                                        'var(--color-muted-foreground)',
                                      flexWrap: 'wrap',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    <span>{count} items</span>
                                    <span style={{ opacity: 0.4 }}>·</span>
                                    <span>
                                      <span
                                        style={{
                                          color: 'var(--color-foreground)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {Math.round(totals.calories)}
                                      </span>{' '}
                                      kcal
                                    </span>
                                    <span style={{ opacity: 0.4 }}>·</span>
                                    <span>
                                      <span
                                        style={{
                                          color: 'var(--color-foreground)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {Math.round(totals.protein)}
                                      </span>
                                      g
                                    </span>
                                  </div>
                                </div>
                                <span
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 9999,
                                    background: 'var(--color-primary)',
                                    color: 'var(--color-primary-foreground)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                  aria-label="Log this meal"
                                >
                                  <Plus
                                    style={{
                                      width: 16,
                                      height: 16,
                                      strokeWidth: 2.5,
                                    }}
                                  />
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
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
                        <col style={{ width: 60 }} />
                        <col style={{ width: 70 }} />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 44 }} />
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
                          <th style={MODAL_TH}>Meal</th>
                          <th style={{ ...MODAL_TH, textAlign: 'right' }}>
                            Items
                          </th>
                          <th style={{ ...MODAL_TH, textAlign: 'right' }}>
                            Cal
                          </th>
                          <th style={{ ...MODAL_TH, textAlign: 'right' }}>
                            Protein
                          </th>
                          <th style={MODAL_TH}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {matched.map((meal) => {
                          const totals = (meal.items || []).reduce(
                            (acc, item) => {
                              const qty =
                                item.quantity ?? item.servings ?? 1;
                              return {
                                calories:
                                  acc.calories +
                                  (item.calories || 0) * qty,
                                protein:
                                  acc.protein +
                                  (item.protein || 0) * qty,
                              };
                            },
                            { calories: 0, protein: 0 }
                          );
                          const count = meal.items?.length ?? 0;
                          return (
                            <tr
                              key={meal.id}
                              onClick={() =>
                                !saving && handleAddMeal(meal)
                              }
                              style={{
                                cursor: saving ? 'wait' : 'pointer',
                                opacity: saving ? 0.6 : 1,
                                transition: 'background 120ms',
                              }}
                            >
                              <td
                                style={{ ...MODAL_TD, overflow: 'hidden' }}
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
                                    {meal.name}
                                  </div>
                                  {meal.description && (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color:
                                          'var(--color-muted-foreground)',
                                        marginTop: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {meal.description}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td
                                style={{
                                  ...MODAL_TD,
                                  textAlign: 'right',
                                }}
                              >
                                <MonoNum size={13}>{count}</MonoNum>
                              </td>
                              <td
                                style={{
                                  ...MODAL_TD,
                                  textAlign: 'right',
                                }}
                              >
                                <MonoNum size={13}>
                                  {Math.round(totals.calories)}
                                </MonoNum>
                                <span
                                  style={{
                                    fontSize: 10,
                                    color:
                                      'var(--color-muted-foreground)',
                                    marginLeft: 2,
                                  }}
                                >
                                  kcal
                                </span>
                              </td>
                              <td
                                style={{
                                  ...MODAL_TD,
                                  textAlign: 'right',
                                }}
                              >
                                <MonoNum size={13}>
                                  {Math.round(totals.protein)}
                                </MonoNum>
                                <span
                                  style={{
                                    fontSize: 10,
                                    color:
                                      'var(--color-muted-foreground)',
                                    marginLeft: 2,
                                  }}
                                >
                                  g
                                </span>
                              </td>
                              <td
                                style={{
                                  ...MODAL_TD,
                                  textAlign: 'right',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddMeal(meal);
                                  }}
                                  disabled={saving}
                                  className="cursor-pointer"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 9999,
                                    background: 'var(--color-primary)',
                                    color:
                                      'var(--color-primary-foreground)',
                                    border: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: saving ? 0.5 : 1,
                                  }}
                                  aria-label="Log this meal"
                                >
                                  <Plus
                                    style={{
                                      width: 14,
                                      height: 14,
                                      strokeWidth: 2.5,
                                    }}
                                  />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
              }}
            >
              Tap a row to log the full meal — items get added to{' '}
              {MEAL_LABELS[mealType]} immediately.
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
        gridTemplateColumns: '1fr auto auto auto',
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
            }}
          >
            {entries.length > 0 && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--color-muted-foreground)',
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
                </span>{' '}
                P
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
  entries,
  goals,
}: {
  calories: number;
  protein: number;
  entries: number;
  goals: { calories: number; protein: number };
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPointerCapable(window.matchMedia('(hover: hover)').matches);
  }, []);

  useEffect(() => {
    getGoals()
      .then((g) => setGoals({ calories: g.calories, protein: g.protein }))
      .catch(() => {});
  }, []);

  async function handleSaveGoals(newGoals: {
    calories: number;
    protein: number;
  }) {
    const updated = await updateGoals(newGoals);
    setGoals({ calories: updated.calories, protein: updated.protein });
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
          gridTemplateColumns: '1.6fr 1fr',
          gap: 16,
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
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
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <AddFoodModal
        isOpen={addMealType !== null}
        onClose={() => setAddMealType(null)}
        mealType={addMealType ?? 'breakfast'}
        date={dateStr}
        onAdded={handleEntryAdded}
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
