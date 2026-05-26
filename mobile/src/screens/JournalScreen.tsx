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
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Search,
  Sunrise,
  Sun,
  Cookie,
  Moon,
  Loader2,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassModal,
  Pill,
  MicroLabel,
  MonoNum,
  ProgressBar,
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
  formatQuantity,
  toISODate,
  formatDateLabel,
  defaultMealForNow,
} from '../lib/nutrition';
import PageHeader from '../components/PageHeader';

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
    } finally {
      setLoading(false);
    }
  }, [iso]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader
        title="Journal"
        subtitle={formatDateLabel(date)}
        trailing={
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => {
              setDefaultMeal(defaultMealForNow());
              setAddFoodOpen(true);
            }}
          >
            <Plus size={14} style={{ marginRight: 2 }} />
            Add
          </GlassButton>
        }
      />

      <div
        style={{
          padding: '0 1rem 1rem 1rem',
          maxWidth: 480,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Date navigator */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Previous day"
            className="cursor-pointer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              background: 'var(--color-soft)',
              border: 0,
              color: 'var(--color-foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={iso}
            onChange={(e) => jumpToDate(e.target.value)}
            max={toISODate(new Date())}
            style={{
              flex: 1,
              padding: '8px 10px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
              fontSize: 14,
              textAlign: 'center',
            }}
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            aria-label="Next day"
            disabled={iso >= toISODate(new Date())}
            className="cursor-pointer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              background: 'var(--color-soft)',
              border: 0,
              color: 'var(--color-foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: iso >= toISODate(new Date()) ? 0.4 : 1,
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Daily totals */}
        <GlassCard muted>
          <div className="flex items-center justify-between mb-3">
            <MicroLabel>Daily totals</MicroLabel>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {entries.length} entries
            </span>
          </div>
          <div className="flex items-end gap-4 mb-2">
            <div>
              <MonoNum size={28}>{totals.calories.toLocaleString()}</MonoNum>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted-foreground)',
                  marginLeft: 4,
                }}
              >
                / {goals.calories} kcal
              </span>
            </div>
          </div>
          <ProgressBar
            value={totals.calories}
            max={goals.calories}
            tone={totals.calories >= goals.calories ? 'success' : 'primary'}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 10,
            }}
          >
            <TotalChip
              label="Protein"
              value={totals.protein}
              target={goals.protein}
              unit="g"
            />
            {goals.fiber != null ? (
              <TotalChip
                label="Fibre"
                value={totals.fiber}
                target={goals.fiber}
                unit="g"
              />
            ) : (
              <TotalChip label="Fibre" value={totals.fiber} unit="g" />
            )}
          </div>
        </GlassCard>

        {/* Meals */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {MEAL_TYPES.map((m) => (
              <div
                key={m}
                className="skeleton"
                style={{ height: 80, borderRadius: 12 }}
              />
            ))}
          </div>
        ) : (
          MEAL_TYPES.map((meal) => (
            <MealSection
              key={meal}
              meal={meal}
              entries={grouped[meal]}
              onAdd={() => handleStartAdd(meal)}
              onEdit={(entry) => setEditEntry(entry)}
              onDelete={(id) => setConfirmDeleteId(id)}
            />
          ))
        )}

        {/* Quick add link */}
        <div style={{ textAlign: 'center', paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="cursor-pointer"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-link)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Quick add (no food in database) →
          </button>
        </div>
      </div>

      {/* Add Food modal */}
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
    </div>
  );
}

// ─── Total chip ───────────────────────────────────────────────────────────

function TotalChip({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : null;
  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <MicroLabel>{label}</MicroLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          marginTop: 4,
        }}
      >
        <MonoNum size={16}>{value}</MonoNum>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
          }}
        >
          {target != null ? `/ ${target}${unit}` : unit}
        </span>
        {pct != null && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--color-muted-foreground)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
          >
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Meal section ────────────────────────────────────────────────────────

function MealSection({
  meal,
  entries,
  onAdd,
  onEdit,
  onDelete,
}: {
  meal: MealType;
  entries: JournalEntry[];
  onAdd: () => void;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (id: number) => void;
}) {
  const meta = MEAL_META[meal];
  const Icon = meta.icon;
  const total = entries.reduce(
    (acc, e) => acc + (e.calories_snapshot ?? 0),
    0,
  );

  return (
    <GlassCard padding={false}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 14px 8px 14px',
          gap: 10,
        }}
      >
        <Pill tone={meta.tone}>
          <Icon size={11} style={{ marginRight: 4 }} />
          {meta.label}
        </Pill>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            marginLeft: 'auto',
          }}
        >
          <span
            style={{
              color: 'var(--color-foreground)',
              fontWeight: 700,
            }}
          >
            {Math.round(total)}
          </span>{' '}
          kcal
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="cursor-pointer"
          aria-label={`Add to ${meta.label}`}
          style={{
            width: 26,
            height: 26,
            borderRadius: 4,
            background: 'var(--color-soft)',
            border: 0,
            color: 'var(--color-foreground)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: '0 14px 14px 14px' }}>
          <button
            type="button"
            onClick={onAdd}
            className="cursor-pointer text-left w-full"
            style={{
              background: 'var(--color-surface-warm)',
              border: '1px dashed var(--color-border)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              fontFamily: 'inherit',
            }}
          >
            + Log {meta.label.toLowerCase()}
          </button>
        </div>
      ) : (
        <div style={{ padding: '0 4px 6px 4px' }}>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onEdit={() => onEdit(entry)}
              onDelete={() => onDelete(entry.id)}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: JournalEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const time = (entry.logged_at || '').slice(11, 16); // HH:MM
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 10px',
        borderRadius: 6,
      }}
    >
      <button
        type="button"
        onClick={onEdit}
        className="cursor-pointer text-left"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 0,
          padding: 0,
          fontFamily: 'inherit',
          color: 'var(--color-foreground)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.food_name_snapshot}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'baseline',
            marginTop: 2,
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>
            {formatQuantity(entry.quantity ?? entry.servings ?? 1, entry.unit ?? 'serving')}
          </span>
          {time && <span>· {time}</span>}
          <span style={{ marginLeft: 'auto' }}>
            <span style={{ color: 'var(--color-foreground)', fontWeight: 700 }}>
              {Math.round(entry.calories_snapshot)}
            </span>{' '}
            kcal · {Math.round(entry.protein_snapshot ?? 0)}g protein
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit"
        className="cursor-pointer"
        style={{
          width: 26,
          height: 26,
          borderRadius: 4,
          background: 'transparent',
          border: 0,
          color: 'var(--color-muted-foreground)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        className="cursor-pointer"
        style={{
          width: 26,
          height: 26,
          borderRadius: 4,
          background: 'transparent',
          border: 0,
          color: 'var(--color-muted-foreground)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Add Food modal ───────────────────────────────────────────────────────

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
