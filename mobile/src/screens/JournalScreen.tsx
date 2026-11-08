// Mobile journal — port of the core flows from web/src/app/journal/page.tsx
// (3,484 lines in web, ~700 lines here). Deliberately scoped for mobile MVP:
//
// Ported:
//   - Date navigator (prev / today label / next, jump to date)
//   - Daily totals strip (kcal / protein / fibre vs goals)
//   - 4 meal sections (breakfast / lunch / snack / dinner) with per-meal totals
//   - Add Food modal: search foods, pick one, tweak quantity/unit, add
//   - Quick Add modal: name + kcal + protein for one-off entries
//   - Edit entry modal (quantity, unit, meal type)
//   - Delete entry (with confirmation)
//   - URL ?addFood=1 auto-opens the Add Food modal (lets home tile deep-link)
//
// Deferred for Phase 4 (DSHKI-62):
//   - Camera-based nutrition label scanning
//   - Voice food entry
// Deferred for Phase 3e (DSHKI-61):
//   - Inline Saved Meals integration
//   - Inline new-food creation

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Trash2,
  Search,
  Sunrise,
  Sun,
  Cookie,
  Moon,
  Loader2,
} from 'lucide-react';
import {
  GlassButton,
  GlassInput,
  GlassModal,
  Pill,
  MicroLabel,
  MonoNum,
  SegmentedControl,
  EmptyState,
} from '../components/ui';
import {
  getJournalEntries,
  getFoods,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getGoals,
} from '../lib/api';
import type {
  JournalEntry,
  MealType,
  Food,
  Unit,
  Goals,
} from '../lib/types';
import {
  nutritionFor,
  toISODate,
  defaultMealForNow,
} from '../lib/nutrition';
import { FoldHead, FoldBar, PAGE_WEEK } from '../components/Fold';

const MEAL_COLOUR: Record<MealType, string> = { breakfast: '#E3A13B', lunch: '#55B97A', snack: '#4CB5AE', dinner: '#4D9BFF' };

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

const MEAL_META: Record<
  MealType,
  { label: string; icon: typeof Sunrise; tone: 'warning' | 'success' | 'teal' | 'primary' }
> = {
  breakfast: { label: 'Breakfast', icon: Sunrise, tone: 'warning' },
  lunch: { label: 'Lunch', icon: Sun, tone: 'success' },
  snack: { label: 'Snack', icon: Cookie, tone: 'teal' },
  dinner: { label: 'Dinner', icon: Moon, tone: 'primary' },
};

const DEFAULT_GOALS: Goals = {
  id: 0,
  calories: 2000,
  protein: 150,
  carbs: null,
  fat: null,
  fiber: null,
  steps: 10000,
  weight_kg: null,
  weight_journey_start_date: null,
  tdee_calories: null,
  updated_at: '',
};

export default function JournalScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Date state — mobile-friendly: prev/next + native date input
  const [date, setDate] = useState<Date>(new Date());
  const iso = toISODate(date);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);

  // Modals
  const [addFoodOpen, setAddFoodOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [defaultMeal, setDefaultMeal] = useState<MealType>(defaultMealForNow());
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [weekCalories, setWeekCalories] = useState<Record<string, number>>({});

  // Monday to Sunday of the selected day, for the day strip
  const weekOf = useMemo(() => {
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return PAGE_WEEK.map((name, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { iso: toISODate(d), label: `${name} ${d.getDate()}` };
    });
  }, [date]);

  // Fetch entries for selected date
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesData, goalsData] = await Promise.allSettled([
        getJournalEntries({ date: iso }),
        getGoals(),
      ]);
      if (entriesData.status === 'fulfilled') setEntries(entriesData.value);
      if (goalsData.status === 'fulfilled') setGoals(goalsData.value);
      getJournalEntries({ startDate: weekOf[0].iso, endDate: weekOf[6].iso }).then((list) => {
        const by: Record<string, number> = {};
        for (const e of list) by[e.date] = (by[e.date] ?? 0) + (e.calories_snapshot ?? 0);
        for (const k of Object.keys(by)) by[k] = Math.round(by[k]);
        setWeekCalories(by);
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [iso, weekOf]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ?date=YYYY-MM-DD opens that day (from the Calendar)
  useEffect(() => {
    const d = searchParams.get('date');
    if (d) {
      const [y, m, day] = d.split('-').map(Number);
      setDate(new Date(y, m - 1, day));
      const next = new URLSearchParams(searchParams);
      next.delete('date');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ?addFood=1 in URL opens the Add Food modal (home-tile deep link)
  useEffect(() => {
    if (searchParams.get('addFood') === '1') {
      setAddFoodOpen(true);
      // Strip it so refreshing doesn't reopen.
      const next = new URLSearchParams(searchParams);
      next.delete('addFood');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function shiftDate(delta: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    setDate(next);
  }

  function jumpToDate(isoString: string) {
    const [y, m, d] = isoString.split('-').map(Number);
    setDate(new Date(y, m - 1, d));
  }

  // Totals
  const totals = useMemo(() => {
    let cal = 0;
    let pro = 0;
    let fib = 0;
    for (const e of entries) {
      cal += e.calories_snapshot ?? 0;
      pro += e.protein_snapshot ?? 0;
      fib += e.fiber_snapshot ?? 0;
    }
    return {
      calories: Math.round(cal),
      protein: Math.round(pro),
      fiber: Math.round(fib * 10) / 10,
    };
  }, [entries]);

  const grouped = useMemo(() => {
    const map: Record<MealType, JournalEntry[]> = {
      breakfast: [],
      lunch: [],
      snack: [],
      dinner: [],
    };
    for (const e of entries) {
      if (map[e.meal_type]) map[e.meal_type].push(e);
    }
    // Newest first within each meal
    for (const k of MEAL_TYPES) {
      map[k].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
    }
    return map;
  }, [entries]);

  async function handleCopyYesterday() {
    setCopying(true);
    try {
      const y = new Date(date);
      y.setDate(y.getDate() - 1);
      const list = await getJournalEntries({ date: toISODate(y) });
      for (const e of list) {
        await addJournalEntry({
          date: iso,
          meal_type: e.meal_type,
          food_id: e.food_id ?? undefined,
          food_name_snapshot: e.food_name_snapshot,
          quantity: e.quantity,
          unit: e.unit,
          calories_snapshot: e.calories_snapshot,
          protein_snapshot: e.protein_snapshot,
        });
      }
      setCopyOpen(false);
      await fetchAll();
    } finally {
      setCopying(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteJournalEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  function handleStartAdd(meal: MealType) {
    setDefaultMeal(meal);
    setAddFoodOpen(true);
  }

  return (
    <>
      <main className="fd-page">
        <FoldHead
          title="Journal"
          sub={date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          right={<>
            <button type="button" className="fd-btn line" aria-label="Previous week" onClick={() => shiftDate(-7)}>‹</button>
            <button type="button" className="fd-btn line" aria-label="Next week" onClick={() => shiftDate(7)}>›</button>
            <button type="button" className="fd-btn line fd-wide" onClick={() => setQuickAddOpen(true)}>Quick add</button>
            <button type="button" className="fd-btn line fd-wide" onClick={() => setCopyOpen(true)}>Copy yesterday</button>
            <button type="button" className="fd-btn primary fd-narrow" onClick={() => { setDefaultMeal(defaultMealForNow()); setAddFoodOpen(true); }}>+ Add</button>
          </>}
        />
        <div className="fd-days" style={{ flex: 'none' }}>
          {weekOf.map((d) => (
            <button key={d.iso} type="button" className={`fd-day${d.iso === iso ? ' on' : ''}`} onClick={() => jumpToDate(d.iso)}>
              <span>{d.label}</span><b className="fd-mono" style={{ fontSize: 12 }}>{(weekCalories[d.iso] ?? 0).toLocaleString()}</b>
            </button>
          ))}
        </div>
        <section className="fd-panel" style={{ flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 'none' }}><b className="fd-mono" style={{ fontSize: 24 }}>{totals.calories.toLocaleString()}</b><span className="fd-mute" style={{ fontSize: 12 }}>of {goals.calories.toLocaleString()}</span></div>
            <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 3 }}><FoldBar pct={(totals.calories / (goals.calories || 1)) * 100} height={6} /><span className="fd-mute" style={{ fontSize: 11 }}>{Math.max(goals.calories - totals.calories, 0).toLocaleString()} kcal left</span></div>
            <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 3 }}><FoldBar pct={(totals.protein / (goals.protein || 1)) * 100} color="#55B97A" height={6} /><span className="fd-mute" style={{ fontSize: 11 }}>Protein {totals.protein} / {goals.protein} g</span></div>
          </div>
        </section>
        <div className="fd-meals fd-meal-stack">
          {MEAL_TYPES.map((meal) => {
            const list = grouped[meal];
            const total = Math.round(list.reduce((a, e) => a + (e.calories_snapshot ?? 0), 0));
            return (
              <section key={meal} className="fd-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 'none' }}><b style={{ fontSize: 16, color: MEAL_COLOUR[meal] }}>{MEAL_META[meal].label}</b><span className="fd-mono fd-mute" style={{ fontSize: 13 }}>{total}</span></div>
                <div className="fd-meal-list">
                  {list.length === 0 && <div className="fd-mute" style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid #34312E' }}>{loading ? 'Loading…' : 'Nothing logged yet'}</div>}
                  {list.map((e) => (
                    <button key={e.id} type="button" className="fd-row fd-tap" onClick={() => setEditEntry(e)} style={{ display: 'block', padding: '8px 0' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{e.food_name_snapshot}</span>
                      <span style={{ display: 'block', fontSize: 12, marginTop: 3 }} className="fd-mute"><b className="fd-mono">{Math.round(e.calories_snapshot)} kcal</b> · {Math.round(e.protein_snapshot ?? 0)} g protein</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="fd-btn line" style={{ width: '100%', borderStyle: 'dashed', flex: 'none' }} onClick={() => handleStartAdd(meal)}>+ Add food</button>
              </section>
            );
          })}
        </div>
      </main>

      <GlassModal isOpen={copyOpen} onClose={() => setCopyOpen(false)} title="Copy yesterday" size="sm" footer={<>
        <GlassButton variant="ghost" onClick={() => setCopyOpen(false)}>Cancel</GlassButton>
        <GlassButton variant="primary" disabled={copying} onClick={handleCopyYesterday}>{copying ? 'Copying…' : 'Copy'}</GlassButton>
      </>}>
        <p style={{ fontSize: 14, margin: 0 }}>Add everything you logged the day before to {date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}?</p>
      </GlassModal>


<AddFoodModal
        isOpen={addFoodOpen}
        onClose={() => setAddFoodOpen(false)}
        date={iso}
        initialMeal={defaultMeal}
        onAdded={async () => {
          setAddFoodOpen(false);
          await fetchAll();
        }}
      />

      {/* Quick Add modal */}
      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        date={iso}
        initialMeal={defaultMeal}
        onAdded={async () => {
          setQuickAddOpen(false);
          await fetchAll();
        }}
      />

      {/* Edit modal */}
      <EditEntryModal
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSaved={async () => {
          setEditEntry(null);
          await fetchAll();
        }}
        onDelete={(id) => {
          setEditEntry(null);
          setConfirmDeleteId(id);
        }}
      />

      {/* Delete confirmation */}
      <GlassModal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete this entry?"
        size="sm"
        leadingFooter={
          <GlassButton
            variant="danger"
            onClick={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
          >
            Delete
          </GlassButton>
        }
        footer={
          <GlassButton variant="ghost" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </GlassButton>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          The entry will be removed from this day's journal. The food itself
          stays in your database.
        </p>
      </GlassModal>

      {/* Backdrop nav exit (consumed by ScrollToTop on route change) */}
      <button hidden onClick={() => navigate('/')} />
    </>
  );
}

// ─── Total chip ───────────────────────────────────────────────────────────

function AddFoodModal({
  isOpen,
  onClose,
  date,
  initialMeal,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  initialMeal: MealType;
  onAdded: () => void;
}) {
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickedFood, setPickedFood] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('serving');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when reopened
  useEffect(() => {
    if (isOpen) {
      setMeal(initialMeal);
      setQuery('');
      setPickedFood(null);
      setQuantity(1);
      setUnit('serving');
      setError(null);
    }
  }, [isOpen, initialMeal]);

  // Debounced food search
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const all = await getFoods();
        const q = query.trim().toLowerCase();
        const filtered = q
          ? all.filter((f) => f.name.toLowerCase().includes(q))
          : all.slice(0, 60);
        setFoods(filtered);
      } catch {
        setFoods([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  // When a food is picked, set quantity to its default unit
  useEffect(() => {
    if (!pickedFood) return;
    const units = pickedFood.units ?? [
      { unit: 'serving' as Unit, label: 'serving', default: true },
    ];
    const def = units.find((u) => u.default) ?? units[0];
    setUnit(def.unit);
    setQuantity(
      def.unit === 'serving'
        ? 1
        : pickedFood.base_amount ?? pickedFood.baseAmount ?? 100,
    );
  }, [pickedFood]);

  const preview = useMemo(() => {
    if (!pickedFood) return null;
    try {
      return nutritionFor(
        {
          base_amount:
            pickedFood.base_amount ?? pickedFood.baseAmount ?? 100,
          base_unit:
            (pickedFood.base_unit ?? pickedFood.baseUnit ?? 'g') as Unit,
          serving_size_g: pickedFood.serving_size_g ?? null,
          calories:
            pickedFood.calories ?? pickedFood.calories_per_100g ?? 0,
          protein: pickedFood.protein ?? pickedFood.protein_per_100g ?? 0,
          fiber: pickedFood.fiber ?? pickedFood.fiber_per_100g ?? 0,
        },
        quantity,
        unit,
      );
    } catch {
      return null;
    }
  }, [pickedFood, quantity, unit]);

  async function handleAdd() {
    if (!pickedFood) return;
    setError(null);
    setSaving(true);
    try {
      await addJournalEntry({
        date,
        meal_type: meal,
        food_id: pickedFood.id,
        food_name_snapshot: pickedFood.name,
        quantity,
        unit,
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={pickedFood ? pickedFood.name : 'Log food'}
      subtitle={pickedFood ? 'Adjust portion' : 'Search your food database'}
      size="md"
      mobileFullscreen
      headerTrailing={
        pickedFood && (
          <button
            type="button"
            onClick={() => setPickedFood(null)}
            className="cursor-pointer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: 'transparent',
              border: 0,
              color: 'var(--color-link)',
              fontFamily: 'inherit',
            }}
          >
            Change
          </button>
        )
      }
      footer={
        pickedFood && (
          <>
            <GlassButton variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleAdd}
              disabled={saving || quantity <= 0}
            >
              {saving ? 'Adding…' : `Add to ${MEAL_META[meal].label}`}
            </GlassButton>
          </>
        )
      }
    >
      {!pickedFood ? (
        <div className="flex flex-col gap-3">
          <MicroLabel>Add to</MicroLabel>
          <SegmentedControl<MealType>
            value={meal}
            options={MEAL_TYPES.map((m) => ({
              value: m,
              label: MEAL_META[m].label,
            }))}
            onChange={setMeal}
          />
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-placeholder)',
              }}
            />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                color: 'var(--color-muted-foreground)',
              }}
            >
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : foods.length === 0 ? (
            <EmptyState>
              No matching foods.{' '}
              {query.trim() && (
                <>
                  Try{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      // Hand off to Foods tab where they can create one
                      // — for now stays open as a placeholder hint.
                    }}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'var(--color-link)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    quick add
                  </button>{' '}
                  instead.
                </>
              )}
            </EmptyState>
          ) : (
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
              {foods.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setPickedFood(f)}
                    className="cursor-pointer text-left w-full"
                    style={{
                      padding: '10px 12px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                      fontFamily: 'inherit',
                      color: 'var(--color-foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-muted-foreground)',
                          marginTop: 2,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {Math.round(f.calories ?? f.calories_per_100g ?? 0)} kcal · {(f.protein ?? f.protein_per_100g ?? 0).toFixed(0)}g protein
                        {' · per '}
                        {f.base_amount ?? f.baseAmount ?? 100}
                        {' '}
                        {f.base_unit ?? f.baseUnit ?? 'g'}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <PortionEditor
          food={pickedFood}
          quantity={quantity}
          unit={unit}
          onQuantity={setQuantity}
          onUnit={setUnit}
          meal={meal}
          onMeal={setMeal}
          preview={preview}
          error={error}
        />
      )}
    </GlassModal>
  );
}

function PortionEditor({
  food,
  quantity,
  unit,
  onQuantity,
  onUnit,
  meal,
  onMeal,
  preview,
  error,
}: {
  food: Food;
  quantity: number;
  unit: Unit;
  onQuantity: (n: number) => void;
  onUnit: (u: Unit) => void;
  meal: MealType;
  onMeal: (m: MealType) => void;
  preview: { calories: number; protein: number; fiber: number } | null;
  error: string | null;
}) {
  const units = food.units ?? [
    { unit: 'serving' as Unit, label: 'serving', default: true },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <MicroLabel>Meal</MicroLabel>
        <div className="mt-2">
          <SegmentedControl<MealType>
            value={meal}
            options={MEAL_TYPES.map((m) => ({
              value: m,
              label: MEAL_META[m].label,
            }))}
            onChange={onMeal}
          />
        </div>
      </div>

      <div>
        <MicroLabel>Portion</MicroLabel>
        <div className="mt-2 flex items-center gap-2">
          <GlassInput
            value={quantity}
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            onChange={(e) => onQuantity(Number(e.target.value) || 0)}
            className="flex-1"
          />
          {units.length > 1 ? (
            <SegmentedControl<Unit>
              value={unit}
              options={units.map((u) => ({ value: u.unit, label: u.label }))}
              onChange={onUnit}
            />
          ) : (
            <Pill tone="neutral">{units[0].label}</Pill>
          )}
        </div>
      </div>

      {preview && (
        <div
          style={{
            background: 'var(--color-surface-warm)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <MicroLabel>Preview</MicroLabel>
          <div className="mt-2 flex items-baseline gap-4">
            <div>
              <MonoNum size={22}>{preview.calories}</MonoNum>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted-foreground)',
                  marginLeft: 4,
                }}
              >
                kcal
              </span>
            </div>
            <div>
              <MonoNum size={16}>{preview.protein}</MonoNum>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted-foreground)',
                  marginLeft: 4,
                }}
              >
                g protein
              </span>
            </div>
            {preview.fiber > 0 && (
              <div>
                <MonoNum size={16}>{preview.fiber}</MonoNum>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-muted-foreground)',
                    marginLeft: 4,
                  }}
                >
                  g fibre
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 10px',
            background: 'rgba(201,28,43,0.08)',
            border: '1px solid rgba(201,28,43,0.3)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--color-critical)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Quick Add modal ──────────────────────────────────────────────────────

function QuickAddModal({
  isOpen,
  onClose,
  date,
  initialMeal,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  initialMeal: MealType;
  onAdded: () => void;
}) {
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMeal(initialMeal);
      setName('');
      setKcal('');
      setProtein('');
      setError(null);
    }
  }, [isOpen, initialMeal]);

  async function doSubmit() {
    if (!name.trim() || !kcal) return;
    setSaving(true);
    setError(null);
    try {
      await addJournalEntry({
        date,
        meal_type: meal,
        food_name_snapshot: name.trim(),
        quantity: 1,
        unit: 'serving',
        calories_snapshot: Number(kcal),
        protein_snapshot: Number(protein || 0),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void doSubmit();
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick add"
      subtitle="One-off entry without saving a food"
      size="sm"
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={() => void doSubmit()}
            disabled={saving || !name.trim() || !kcal}
          >
            {saving ? 'Adding…' : 'Add'}
          </GlassButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <MicroLabel>Meal</MicroLabel>
          <div className="mt-2">
            <SegmentedControl<MealType>
              value={meal}
              options={MEAL_TYPES.map((m) => ({
                value: m,
                label: MEAL_META[m].label,
              }))}
              onChange={setMeal}
            />
          </div>
        </div>
        <GlassInput
          label="What did you eat?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Two slices of toast"
          required
        />
        <div className="flex gap-2">
          <GlassInput
            label="Calories (kcal)"
            type="number"
            inputMode="numeric"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder="200"
            className="flex-1"
            required
          />
          <GlassInput
            label="Protein (g)"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder="0"
            className="flex-1"
          />
        </div>
        {error && (
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(201,28,43,0.08)',
              border: '1px solid rgba(201,28,43,0.3)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-critical)',
            }}
          >
            {error}
          </div>
        )}
      </form>
    </GlassModal>
  );
}

// ─── Edit entry modal ─────────────────────────────────────────────────────

function EditEntryModal({
  entry,
  onClose,
  onSaved,
  onDelete,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('serving');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setMeal(entry.meal_type);
      setQuantity(entry.quantity ?? entry.servings ?? 1);
      setUnit(entry.unit ?? 'serving');
      setError(null);
    }
  }, [entry]);

  if (!entry) {
    return (
      <GlassModal isOpen={false} onClose={onClose} title="">
        <span />
      </GlassModal>
    );
  }

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      await updateJournalEntry(entry.id, {
        meal_type: meal,
        quantity,
        unit,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      isOpen={!!entry}
      onClose={onClose}
      title={entry.food_name_snapshot}
      subtitle="Edit entry"
      size="md"
      leadingFooter={
        <GlassButton variant="danger" onClick={() => onDelete(entry.id)}>
          <Trash2 size={12} style={{ marginRight: 4 }} />
          Delete
        </GlassButton>
      }
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={handleSave}
            disabled={saving || quantity <= 0}
          >
            {saving ? 'Saving…' : 'Save'}
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <MicroLabel>Meal</MicroLabel>
          <div className="mt-2">
            <SegmentedControl<MealType>
              value={meal}
              options={MEAL_TYPES.map((m) => ({
                value: m,
                label: MEAL_META[m].label,
              }))}
              onChange={setMeal}
            />
          </div>
        </div>
        <div>
          <MicroLabel>Portion</MicroLabel>
          <div className="mt-2 flex items-center gap-2">
            <GlassInput
              value={quantity}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              className="flex-1"
            />
            <SegmentedControl<Unit>
              value={unit}
              options={
                entry.food_units && entry.food_units.length > 0
                  ? entry.food_units.map((u) => ({
                      value: u.unit,
                      label: u.label,
                    }))
                  : [
                      { value: 'serving' as Unit, label: 'serving' },
                      { value: 'g' as Unit, label: 'g' },
                      { value: 'ml' as Unit, label: 'ml' },
                    ]
              }
              onChange={setUnit}
            />
          </div>
        </div>
        {error && (
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(201,28,43,0.08)',
              border: '1px solid rgba(201,28,43,0.3)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-critical)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </GlassModal>
  );
}
