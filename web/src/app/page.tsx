'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Scale,
  Footprints,
  Utensils,
  Calendar as CalendarIcon,
  Search,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassModal,
  GlassInput,
  CardShell,
  Pill,
  MicroLabel,
  MonoNum,
  ProgressBar,
  CalorieRing,
  MacroBar,
  Sparkline,
} from '@/components/ui';
import {
  getJournalSummary,
  getJournalEntries,
  getSteps,
  getWeightEntries,
  addWeightEntry,
  addJournalEntry,
  createStepLog,
  getGoals,
  getPreferences,
} from '@/lib/api';
import type { HomeMetric } from '@/lib/api';
import { useSocketEvent } from '@/lib/useSocketEvent';
import type {
  DailySummary,
  StepEntry,
  WeightEntry,
  Goals,
  JournalEntry,
  MealType,
  Food,
  Unit,
} from '@/lib/types';

const BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

function defaultMealForNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayISO(): string {
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Look back N days for the small weight-trend sparkline.
function weightSparkData(entries: WeightEntry[], n = 12): number[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-n)
    .map((e) => e.weight_kg);
}

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

const MEALS: { name: string; type: MealType }[] = [
  { name: 'Breakfast', type: 'breakfast' },
  { name: 'Lunch', type: 'lunch' },
  { name: 'Snack', type: 'snack' },
  { name: 'Dinner', type: 'dinner' },
];

const VARIANT_KEY = 'dashki-dashboard-variant';
type Variant = 'today' | 'week';

// =============================================================
//  Page
// =============================================================

export default function DashboardPage() {
  const today = todayISO();
  const [variant, setVariant] = useState<Variant>('today');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [steps, setSteps] = useState<StepEntry | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [displayName, setDisplayName] = useState<string | null>(null);
  // Which optional metric tiles render on the dashboard. Calories is always
  // shown. Defaults match server's DEFAULT_HOME_METRICS so first paint
  // (before preferences hydrate) matches the saved config for the common case.
  const [homeMetrics, setHomeMetrics] = useState<HomeMetric[]>([
    'protein',
    'steps',
    'weight',
  ]);
  const [weekJournal, setWeekJournal] = useState<
    { date: string; cal: number; protein: number; partial?: boolean }[]
  >([]);
  const [weekSteps, setWeekSteps] = useState<{ date: string; steps: number }[]>(
    []
  );

  // Modals
  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [stepsInput, setStepsInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Restore dashboard variant choice on mount.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VARIANT_KEY);
      if (v === 'week' || v === 'today') setVariant(v);
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  function chooseVariant(v: Variant) {
    setVariant(v);
    try {
      localStorage.setItem(VARIANT_KEY, v);
    } catch {
      /* ignore */
    }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Last 7 days inclusive of today, oldest first.
      const week = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleString('en-CA').split(',')[0];
      });
      const earliest = week[0];

      const [
        summaryData,
        stepsTodayData,
        weekStepsData,
        weekJournalData,
        weightData,
        goalsData,
      ] = await Promise.allSettled([
        getJournalSummary(today),
        getSteps({ date: today }),
        getSteps({ startDate: earliest, endDate: today }),
        getJournalEntries({ startDate: earliest, endDate: today }),
        getWeightEntries({ limit: 60 }),
        getGoals(),
      ]);
      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
      if (stepsTodayData.status === 'fulfilled') {
        const arr = stepsTodayData.value;
        setSteps(arr.length > 0 ? arr[0] : null);
      }
      if (weekStepsData.status === 'fulfilled') {
        const byDate = new Map<string, number>();
        for (const s of weekStepsData.value) byDate.set(s.date, s.steps);
        setWeekSteps(week.map((d) => ({ date: d, steps: byDate.get(d) ?? 0 })));
      }
      if (weekJournalData.status === 'fulfilled') {
        const byDate = new Map<string, { cal: number; protein: number }>();
        for (const e of weekJournalData.value) {
          const cur = byDate.get(e.date) ?? { cal: 0, protein: 0 };
          cur.cal += e.calories_snapshot ?? 0;
          cur.protein += e.protein_snapshot ?? 0;
          byDate.set(e.date, cur);
        }
        setWeekJournal(
          week.map((d) => ({
            date: d,
            cal: byDate.get(d)?.cal ?? 0,
            protein: byDate.get(d)?.protein ?? 0,
            partial: d === today,
          }))
        );
      }
      if (weightData.status === 'fulfilled') {
        setWeightHistory(weightData.value ?? []);
      }
      if (goalsData.status === 'fulfilled') setGoals(goalsData.value);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useSocketEvent('journal-entry-created', fetchAll);
  useSocketEvent('journal-entry-updated', fetchAll);
  useSocketEvent('journal-entry-deleted', fetchAll);
  useSocketEvent('steps-updated', fetchAll);
  useSocketEvent('weight-updated', fetchAll);
  useSocketEvent('weight-deleted', fetchAll);
  useSocketEvent('goals-updated', fetchAll);

  const fetchPreferences = useCallback(async () => {
    try {
      const prefs = await getPreferences();
      setDisplayName(prefs.display_name);
      if (prefs.home_metrics) setHomeMetrics(prefs.home_metrics);
    } catch {
      /* silent */
    }
  }, []);
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);
  useSocketEvent('preferences-updated', fetchPreferences);

  async function handleLogWeight() {
    if (!weightInput) return;
    setSaving(true);
    try {
      await addWeightEntry({ date: today, weight_kg: parseFloat(weightInput) });
      setWeightModal(false);
      setWeightInput('');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSteps() {
    if (!stepsInput) return;
    const val = parseInt(stepsInput, 10);
    if (isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      await createStepLog({ date: today, steps: val });
      setStepsModal(false);
      setStepsInput('');
    } finally {
      setSaving(false);
    }
  }

  const calories = summary ? Math.round(summary.calories) : 0;
  const protein = summary ? Math.round(summary.protein) : 0;
  const fiber = summary ? Math.round((summary.fiber ?? 0) * 10) / 10 : 0;
  const todaySteps = steps?.steps ?? 0;
  const lastWeight = weightHistory[0] ?? null; // API returns newest first
  const prevWeight = weightHistory[7] ?? weightHistory[weightHistory.length - 1] ?? null;

  return (
    <main
      className="page-mount"
      style={{
        maxWidth: 1120,
        margin: '0 auto',
        padding: '24px 16px 80px',
      }}
    >
      <GreetingHeader
        name={displayName ?? 'Terry'}
        onLogFood={() => {
          // Hand off to journal page with a flag — the journal page's
          // mount effect reads ?addFood=1 and opens the Add Food modal
          // automatically. Saves a click vs. landing on the page and
          // then having to hit "+ Add".
          window.location.href = '/journal?addFood=1';
        }}
        onWeighIn={() => setWeightModal(true)}
      />

      {/* Variant switcher */}
      <div
        style={{
          marginTop: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Layout
        </span>
        <div
          style={{
            display: 'flex',
            background: 'var(--color-surface-warm)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: 2,
          }}
        >
          {(['today', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => chooseVariant(v)}
              className="cursor-pointer"
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: variant === v ? 'var(--color-surface)' : 'transparent',
                color:
                  variant === v
                    ? 'var(--color-foreground)'
                    : 'var(--color-muted-foreground)',
                border: 0,
                borderRadius: 3,
                textTransform: 'capitalize',
                fontFamily: 'inherit',
                boxShadow: variant === v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {variant === 'today' ? (
        <TodayVariant
          loading={loading}
          summary={summary}
          calories={calories}
          protein={protein}
          fiber={fiber}
          todaySteps={todaySteps}
          lastWeight={lastWeight}
          prevWeight={prevWeight}
          weightHistory={weightHistory}
          goals={goals}
          homeMetrics={homeMetrics}
        />
      ) : (
        <WeekVariant
          loading={loading}
          summary={summary}
          calories={calories}
          protein={protein}
          todaySteps={todaySteps}
          weightHistory={weightHistory}
          weekJournal={weekJournal}
          weekSteps={weekSteps}
          goals={goals}
        />
      )}

      {/* Log Weight Modal */}
      <GlassModal
        isOpen={weightModal}
        onClose={() => {
          setWeightModal(false);
          setWeightInput('');
        }}
        title="Log Weight"
        size="sm"
      >
        <div className="space-y-4">
          <GlassInput
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            placeholder="e.g. 75.5"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            step={0.1}
            min={0}
          />
          <GlassButton
            variant="primary"
            onClick={handleLogWeight}
            disabled={!weightInput || saving}
            className="w-full justify-center"
          >
            {saving ? 'Saving…' : 'Save'}
          </GlassButton>
        </div>
      </GlassModal>

      {/* Add Steps Modal */}
      <GlassModal
        isOpen={stepsModal}
        onClose={() => {
          setStepsModal(false);
          setStepsInput('');
        }}
        title="Add Steps"
        size="sm"
      >
        <div className="space-y-4">
          <GlassInput
            label="Steps today"
            type="number"
            inputMode="numeric"
            placeholder="e.g. 8500"
            value={stepsInput}
            onChange={(e) => setStepsInput(e.target.value)}
            min={0}
          />
          <GlassButton
            variant="primary"
            onClick={handleAddSteps}
            disabled={!stepsInput || saving}
            className="w-full justify-center"
          >
            {saving ? 'Saving…' : 'Save'}
          </GlassButton>
        </div>
      </GlassModal>
    </main>
  );
}

// ─── Greeting header ────────────────────────────────────────────────────────

function GreetingHeader({
  name,
  onLogFood,
  onWeighIn,
}: {
  name: string;
  onLogFood: () => void;
  onWeighIn: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.7px',
            margin: 0,
            color: 'var(--color-foreground)',
          }}
        >
          {getGreeting()}, {name}
        </h1>
        <div
          style={{
            color: 'var(--color-muted-foreground)',
            marginTop: 4,
            fontSize: 14,
          }}
        >
          {formatToday()}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <GlassButton variant="primary" size="sm" onClick={onLogFood}>
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Log food
        </GlassButton>
        <GlassButton variant="soft" size="sm" onClick={onWeighIn}>
          <Scale style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Weigh in
        </GlassButton>
      </div>
    </div>
  );
}

// =============================================================
//  Variant: Today
// =============================================================

function TodayVariant({
  loading,
  summary,
  calories,
  protein,
  fiber,
  todaySteps,
  lastWeight,
  prevWeight,
  weightHistory,
  goals,
  homeMetrics,
}: {
  loading: boolean;
  summary: DailySummary | null;
  calories: number;
  protein: number;
  fiber: number;
  todaySteps: number;
  lastWeight: WeightEntry | null;
  prevWeight: WeightEntry | null;
  weightHistory: WeightEntry[];
  goals: Goals;
  homeMetrics: HomeMetric[];
}) {
  const showProtein = homeMetrics.includes('protein');
  const showFiber = homeMetrics.includes('fiber');
  const showSteps = homeMetrics.includes('steps');
  const showWeight = homeMetrics.includes('weight');
  const entries = summary?.entries ?? [];
  const weightDelta =
    lastWeight && prevWeight
      ? Number((lastWeight.weight_kg - prevWeight.weight_kg).toFixed(1))
      : null;

  const groups = useMemo(
    () =>
      MEALS.map((m) => ({
        ...m,
        entries: entries.filter((e) => e.meal_type === m.type),
      })),
    [entries]
  );

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: '2fr 1fr',
        marginTop: 24,
      }}
      className="dashboard-grid"
    >
      {/* LEFT — Today */}
      <GlassCard padding={false} className="p-6">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 18,
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
            <Utensils
              style={{
                width: 14,
                height: 14,
                strokeWidth: 2.25,
                color: 'var(--color-muted-foreground)',
              }}
            />
            Today&rsquo;s nutrition
          </h2>
          <span style={{ color: 'var(--color-muted-foreground)', fontSize: 12 }}>
            {summary ? `${entries.length} entries` : ''}
          </span>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 24,
              alignItems: 'center',
            }}
          >
            <CalorieRing value={calories} target={goals.calories} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {showProtein && (
                <MacroBar label="Protein" value={protein} target={goals.protein} />
              )}
              {showFiber && (
                <MacroBar
                  label="Fibre"
                  value={fiber}
                  target={goals.fiber ?? 30}
                  unit="g"
                />
              )}
              {showSteps && (
                <MacroBar
                  label="Steps"
                  value={todaySteps}
                  target={goals.steps}
                  unit=""
                  tone="success"
                />
              )}
              {showWeight && lastWeight && (
                <MacroBar
                  label="Weight"
                  value={lastWeight.weight_kg}
                  target={goals.weight_kg ?? lastWeight.weight_kg}
                  unit=" kg"
                />
              )}
            </div>
          </div>
        )}

        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            marginTop: 20,
            paddingTop: 18,
          }}
        >
          <MicroLabel style={{ marginBottom: 10 }}>
            Meals · {entries.length} entries
          </MicroLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => (
              <MealStrip key={g.type} name={g.name} entries={g.entries} />
            ))}
          </div>
        </div>
      </GlassCard>

      {/* RIGHT — side rail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {showWeight && (
        <GlassCard padding={false} className="p-4">
          <MicroLabel>
            <Scale
              style={{
                width: 12,
                height: 12,
                strokeWidth: 2.25,
                marginRight: 4,
                verticalAlign: '-2px',
              }}
            />
            Weight
          </MicroLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginTop: 6,
            }}
          >
            {lastWeight ? (
              <>
                <MonoNum size={32}>{lastWeight.weight_kg.toFixed(1)}</MonoNum>
                <span
                  style={{
                    color: 'var(--color-muted-foreground)',
                    fontSize: 12,
                  }}
                >
                  kg
                </span>
                {weightDelta !== null && weightDelta !== 0 && (
                  <Pill
                    tone={weightDelta < 0 ? 'success' : 'warning'}
                    style={{ marginLeft: 'auto' }}
                  >
                    {weightDelta > 0 ? '+' : ''}
                    {weightDelta} kg
                  </Pill>
                )}
              </>
            ) : (
              <span
                style={{
                  color: 'var(--color-muted-foreground)',
                  fontSize: 13,
                }}
              >
                Not logged yet
              </span>
            )}
          </div>
          {weightHistory.length > 1 && (
            <Sparkline
              data={weightSparkData(weightHistory)}
              stroke="var(--color-primary)"
              height={36}
            />
          )}
          {goals.weight_kg && lastWeight && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
                marginTop: 6,
              }}
            >
              {(lastWeight.weight_kg - goals.weight_kg).toFixed(1)} kg from your{' '}
              {goals.weight_kg} kg goal
            </div>
          )}
        </GlassCard>
        )}

        {showSteps && (
        <GlassCard padding={false} className="p-4">
          <MicroLabel>
            <Footprints
              style={{
                width: 12,
                height: 12,
                strokeWidth: 2.25,
                marginRight: 4,
                verticalAlign: '-2px',
              }}
            />
            Steps today
          </MicroLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginTop: 6,
            }}
          >
            <MonoNum size={32}>{todaySteps.toLocaleString()}</MonoNum>
            <span
              style={{
                color: 'var(--color-muted-foreground)',
                fontSize: 12,
              }}
            >
              of {goals.steps.toLocaleString()}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar
              value={todaySteps}
              max={goals.steps}
              tone={todaySteps >= goals.steps ? 'success' : 'primary'}
            />
          </div>
        </GlassCard>
        )}

        {showProtein && (
        <CardShell
          title="Today's protein"
          icon={
            <Utensils
              style={{ width: 14, height: 14, strokeWidth: 2.25 }}
            />
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
            }}
          >
            <MonoNum size={28}>{protein}</MonoNum>
            <span
              style={{
                color: 'var(--color-muted-foreground)',
                fontSize: 12,
              }}
            >
              of {goals.protein}g · {Math.round((protein / goals.protein) * 100)}%
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar
              value={protein}
              max={goals.protein}
              tone={protein >= goals.protein ? 'success' : 'primary'}
            />
          </div>
        </CardShell>
        )}

        {showFiber && (
        <CardShell
          title="Today's fibre"
          icon={
            <Utensils style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          }
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <MonoNum size={28}>{fiber}</MonoNum>
            <span
              style={{
                color: 'var(--color-muted-foreground)',
                fontSize: 12,
              }}
            >
              {goals.fiber
                ? `of ${goals.fiber}g · ${Math.round((fiber / goals.fiber) * 100)}%`
                : 'g today'}
            </span>
          </div>
          {goals.fiber != null && (
            <div style={{ marginTop: 10 }}>
              <ProgressBar
                value={fiber}
                max={goals.fiber}
                tone={fiber >= goals.fiber ? 'success' : 'primary'}
              />
            </div>
          )}
        </CardShell>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

function MealStrip({ name, entries }: { name: string; entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--color-surface-warm)',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-muted-foreground)',
          }}
        >
          {name}
        </span>
        <a
          href="/journal"
          style={{
            color: 'var(--color-link)',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Log {name.toLowerCase()}
        </a>
      </div>
    );
  }
  const totalCal = entries.reduce((a, e) => a + (e.calories_snapshot ?? 0), 0);
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--color-surface-warm)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
          }}
        >
          <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>
            {Math.round(totalCal)}
          </span>{' '}
          kcal
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {entries.slice(0, 6).map((e, i) => (
          <span
            key={e.id}
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
            }}
          >
            {e.food_name_snapshot}
            {i < entries.slice(0, 6).length - 1 ? '  ·' : ''}
          </span>
        ))}
        {entries.length > 6 && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              fontStyle: 'italic',
            }}
          >
            +{entries.length - 6} more
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================
//  Variant: Week
// =============================================================

function WeekVariant({
  loading,
  summary,
  calories,
  protein,
  todaySteps,
  weightHistory,
  weekJournal,
  weekSteps,
  goals,
}: {
  loading: boolean;
  summary: DailySummary | null;
  calories: number;
  protein: number;
  todaySteps: number;
  weightHistory: WeightEntry[];
  weekJournal: { date: string; cal: number; protein: number; partial?: boolean }[];
  weekSteps: { date: string; steps: number }[];
  goals: Goals;
}) {
  const todayEntries = summary?.entries ?? [];
  const today = todayISO();

  // Selected day — drives the right-column panel. Default = today.
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // Reset selection when the week-window changes underneath us
  // (e.g. after socket-driven refetch).
  useEffect(() => {
    if (!weekJournal.find((d) => d.date === selectedDate)) {
      setSelectedDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekJournal, today]);

  // Per-day journal entries (fetched on demand for non-today days).
  const [dayEntries, setDayEntries] = useState<JournalEntry[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (selectedDate === today) {
      setDayEntries(todayEntries);
      return;
    }
    setDayLoading(true);
    getJournalEntries({ date: selectedDate })
      .then((arr) => {
        if (!cancelled) setDayEntries(arr);
      })
      .catch(() => {
        if (!cancelled) setDayEntries([]);
      })
      .finally(() => {
        if (!cancelled) setDayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, today, todayEntries]);

  // 7-day average (excludes today's partial)
  const avg7 = useMemo(() => {
    const past = weekJournal.filter((d) => !d.partial && d.cal > 0);
    if (past.length === 0) return null;
    return Math.round(past.reduce((a, d) => a + d.cal, 0) / past.length);
  }, [weekJournal]);

  // Stats for the currently selected day
  const selectedJournal = weekJournal.find((d) => d.date === selectedDate);
  const selectedSteps = weekSteps.find((d) => d.date === selectedDate);
  const selectedCal = selectedJournal?.cal ?? 0;
  const selectedProtein = selectedJournal?.protein ?? 0;
  const selectedStepCount = selectedSteps?.steps ?? 0;

  // Weight: most-recent (60d limit) — show last 30 in sparkline
  const weight30 = useMemo(() => {
    return [...weightHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }, [weightHistory]);

  // Week window label (oldest → newest)
  const weekRangeLabel = useMemo(() => {
    if (weekJournal.length < 2) return '';
    const start = new Date(weekJournal[0].date + 'T00:00:00');
    const end = new Date(weekJournal[weekJournal.length - 1].date + 'T00:00:00');
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekJournal]);

  return (
    <div
      style={{
        marginTop: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* This week — vertical DayStack viz with steps row beneath */}
      <CardShell
        title="This week"
        icon={<CalendarIcon style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        hint={
          weekRangeLabel ? (
            <span style={{ color: 'var(--color-muted-foreground)', fontSize: 12 }}>
              {weekRangeLabel}
              {avg7 != null && (
                <>
                  {' '}
                  · 7-day average{' '}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-foreground)',
                      fontWeight: 600,
                    }}
                  >
                    {avg7.toLocaleString()} kcal
                  </span>
                </>
              )}
            </span>
          ) : undefined
        }
      >
        {loading || weekJournal.length === 0 ? (
          <div className="skeleton" style={{ height: 180, borderRadius: 8 }} />
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 8,
              }}
            >
              {weekJournal.map((d) => (
                <DayStack
                  key={d.date}
                  day={d}
                  isToday={d.date === today}
                  isSelected={d.date === selectedDate}
                  goal={goals.calories}
                  onSelect={() => setSelectedDate(d.date)}
                />
              ))}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 8,
                marginTop: 8,
              }}
            >
              {weekSteps.map((d) => (
                <div
                  key={d.date}
                  style={{ textAlign: 'center', paddingTop: 4 }}
                >
                  <Footprints
                    style={{
                      width: 11,
                      height: 11,
                      strokeWidth: 2,
                      color: 'var(--color-muted-foreground)',
                      display: 'inline-block',
                    }}
                  />
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--color-muted-foreground)',
                      marginTop: 2,
                    }}
                  >
                    {(d.steps / 1000).toFixed(1)}k
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardShell>

      {/* Today + side rail */}
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: '1.4fr 1fr',
        }}
        className="week-grid"
      >
        <CardShell
          title={
            selectedDate === today
              ? 'Today'
              : new Date(selectedDate + 'T00:00:00').toLocaleDateString(
                  'en-AU',
                  { weekday: 'long', day: 'numeric', month: 'short' }
                )
          }
          icon={<Utensils style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          hint={
            <Pill tone="medium">
              {goals.calories
                ? `${Math.round((selectedCal / goals.calories) * 100)}% to goal`
                : ''}
            </Pill>
          }
        >
          {/* Fixed-height inner body so the card doesn't shrink when there's
              no data for a different day. */}
          <div style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 14,
              }}
            >
              <BigTile
                label="Calories"
                value={Math.round(selectedCal)}
                target={goals.calories}
                unit=" kcal"
              />
              <BigTile
                label="Protein"
                value={Math.round(selectedProtein)}
                target={goals.protein}
                unit=" g"
              />
              <BigTile
                label="Steps"
                value={selectedStepCount}
                target={goals.steps}
                unit=""
              />
            </div>

            {loading || dayLoading ? (
              <div
                className="skeleton"
                style={{ flex: 1, minHeight: 140, borderRadius: 8, marginTop: 16 }}
              />
            ) : dayEntries.length === 0 ? (
              <div
                style={{
                  background: 'var(--color-surface-warm)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 12,
                  padding: '20px 16px',
                  textAlign: 'center',
                  color: 'var(--color-muted-foreground)',
                  fontSize: 13,
                  marginTop: 16,
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selectedDate === today
                  ? 'No food logged yet today.'
                  : 'Nothing logged on this day.'}{' '}
                <a
                  href="/journal"
                  style={{ color: 'var(--color-link)', marginLeft: 4 }}
                >
                  Open journal
                </a>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                }}
              >
                {dayEntries.slice(0, 10).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      padding: '6px 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-muted-foreground)',
                        width: 38,
                      }}
                    >
                      {(e.logged_at || '').slice(11, 16)}
                    </span>
                    <Pill
                      tone={
                        e.meal_type === 'breakfast'
                          ? 'warning'
                          : e.meal_type === 'lunch'
                          ? 'success'
                          : e.meal_type === 'snack'
                          ? 'teal'
                          : 'primary'
                      }
                      upper
                    >
                      {e.meal_type}
                    </Pill>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.food_name_snapshot}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-muted-foreground)',
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--color-foreground)',
                          fontWeight: 600,
                        }}
                      >
                        {Math.round(e.calories_snapshot)}
                      </span>{' '}
                      kcal
                    </span>
                  </div>
                ))}
                {dayEntries.length > 10 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted-foreground)',
                      marginTop: 6,
                    }}
                  >
                    +{dayEntries.length - 10} more ·{' '}
                    <a href="/journal" style={{ color: 'var(--color-link)' }}>
                      open journal
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardShell>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassCard padding={false} className="p-4">
            <MicroLabel>Weight trend · 30 days</MicroLabel>
            {weight30.length > 0 ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <MonoNum size={28}>
                    {weight30[weight30.length - 1].weight_kg.toFixed(1)}
                  </MonoNum>
                  <span
                    style={{
                      color: 'var(--color-muted-foreground)',
                      fontSize: 12,
                    }}
                  >
                    kg
                  </span>
                  {weight30.length > 1 && (
                    <Pill
                      tone={
                        weight30[weight30.length - 1].weight_kg <
                        weight30[0].weight_kg
                          ? 'success'
                          : 'warning'
                      }
                      style={{ marginLeft: 'auto' }}
                    >
                      {(
                        weight30[weight30.length - 1].weight_kg -
                        weight30[0].weight_kg
                      ).toFixed(1)}{' '}
                      kg
                    </Pill>
                  )}
                </div>
                <Sparkline
                  data={weight30.map((w) => w.weight_kg)}
                  stroke="var(--color-primary)"
                  height={48}
                  fill
                />
              </>
            ) : (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: 'var(--color-muted-foreground)',
                }}
              >
                Log a weight to see your trend.
              </div>
            )}
          </GlassCard>

          <QuickAddFoodPanel />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.week-grid) {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Quick add food panel (shared on the dashboard's side rail) ──────────────

function QuickAddFoodPanel() {
  const [q, setQ] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [adding, setAdding] = useState<number | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = q.trim()
          ? BASE_URL + '/api/foods?search=' + encodeURIComponent(q.trim())
          : BASE_URL + '/api/foods';
        const res = await fetch(url);
        if (res.ok) setFoods((await res.json()) as Food[]);
      } catch {
        /* ignore */
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
      const today = new Date().toLocaleString('en-CA').split(',')[0];
      await addJournalEntry({
        date: today,
        meal_type: defaultMealForNow(),
        food_id: food.id,
        food_name_snapshot: food.name,
        quantity: startQty,
        unit: def.unit,
      });
      setJustAdded(food.id);
      setTimeout(() => setJustAdded(null), 1400);
    } catch {
      /* swallow */
    } finally {
      setAdding(null);
    }
  }

  const visible = foods.slice(0, 6);
  const mealLabel = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    snack: 'Snack',
    dinner: 'Dinner',
  }[defaultMealForNow()];

  return (
    <CardShell
      title="Quick add"
      icon={<Search style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
      hint={
        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
          → {mealLabel}
        </span>
      }
    >
      <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
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
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            flex: 1,
          }}
        >
          {visible.length === 0 ? (
            <li
              style={{
                fontSize: 12,
                color: 'var(--color-muted-foreground)',
                textAlign: 'center',
                padding: '12px 0',
              }}
            >
              {q.trim() ? 'No foods match.' : 'Loading…'}
            </li>
          ) : (
            visible.map((f) => {
              const cal = f.calories ?? f.calories_per_100g ?? 0;
              const isAdding = adding === f.id;
              const isAdded = justAdded === f.id;
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
                    type="button"
                    onClick={() => addOne(f)}
                    disabled={adding !== null}
                    className="cursor-pointer"
                    style={{
                      background: isAdded
                        ? 'var(--color-success)'
                        : 'var(--color-soft)',
                      border: 0,
                      borderRadius: 4,
                      padding: '3px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      color: isAdded
                        ? 'var(--color-primary-foreground)'
                        : 'var(--color-foreground)',
                      opacity: isAdding ? 0.5 : 1,
                      transition: 'background 160ms',
                    }}
                    aria-label={isAdded ? 'Added' : 'Add to journal'}
                  >
                    {isAdded ? (
                      <span style={{ fontSize: 11, fontWeight: 700 }}>✓</span>
                    ) : (
                      <Plus
                        style={{ width: 12, height: 12, strokeWidth: 2.25 }}
                      />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </CardShell>
  );
}

// ─── DayStack — vertical bar showing one day's calorie load vs goal ──────────

function DayStack({
  day,
  isToday,
  isSelected,
  goal,
  onSelect,
}: {
  day: { date: string; cal: number; protein: number; partial?: boolean };
  isToday: boolean;
  isSelected: boolean;
  goal: number;
  onSelect: () => void;
}) {
  const pct = goal > 0 ? Math.min(1, day.cal / goal) : 0;
  const d = new Date(day.date + 'T00:00:00');
  const fill = day.partial
    ? 'var(--color-warning)'
    : pct >= 0.95
    ? 'var(--color-success)'
    : 'var(--color-primary)';
  const borderColor = isSelected
    ? 'var(--color-primary)'
    : isToday
    ? 'var(--color-primary)'
    : 'var(--color-border)';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="cursor-pointer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: 0,
        padding: 0,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: isSelected
            ? 'var(--color-primary)'
            : 'var(--color-muted-foreground)',
          fontWeight: isToday || isSelected ? 700 : 500,
        }}
      >
        {d.toLocaleDateString('en-AU', { weekday: 'short' })}
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 120,
          borderRadius: 8,
          background: isSelected
            ? 'var(--color-badge-bg)'
            : 'var(--color-surface-warm)',
          overflow: 'hidden',
          border: '1px solid ' + borderColor,
          boxShadow: isSelected
            ? '0 0 0 1px var(--color-primary)'
            : 'none',
          transition: 'background 120ms, box-shadow 120ms',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${pct * 100}%`,
            background: fill,
            opacity: 0.85,
            transition: 'height 240ms ease-out',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 4,
            height: 1,
            borderTop: '1px dashed var(--color-warm-gray-300)',
          }}
        />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          color:
            isToday || isSelected
              ? 'var(--color-primary)'
              : 'var(--color-foreground)',
        }}
      >
        {day.cal === 0 ? '—' : (day.cal / 1000).toFixed(1) + 'k'}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--color-muted-foreground)',
          marginTop: -3,
        }}
      >
        {day.protein > 0 ? `${Math.round(day.protein)}g` : ''}
      </div>
    </button>
  );
}

function BigTile({
  label,
  value,
  target,
  unit = '',
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--color-surface-warm)',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 110,
      }}
    >
      <MicroLabel>{label}</MicroLabel>
      {/* Big value on its own line so the target never wraps mid-row.
          This keeps every tile the same shape on narrow screens. */}
      <div style={{ marginTop: 6 }}>
        <MonoNum size={26}>{value.toLocaleString()}</MonoNum>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-muted-foreground)',
          fontFamily: 'var(--font-mono)',
          marginTop: 2,
        }}
      >
        / {target.toLocaleString()}
        {unit}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
        <ProgressBar
          value={value}
          max={target}
          tone={value >= target ? 'success' : 'primary'}
          height={4}
        />
      </div>
    </div>
  );
}
