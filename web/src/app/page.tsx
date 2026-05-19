'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Scale,
  Footprints,
  Utensils,
  Calendar as CalendarIcon,
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
  getSteps,
  getWeightEntries,
  addWeightEntry,
  createStepLog,
  getGoals,
  getPreferences,
} from '@/lib/api';
import { useSocketEvent } from '@/lib/useSocketEvent';
import type {
  DailySummary,
  StepEntry,
  WeightEntry,
  Goals,
  JournalEntry,
  MealType,
} from '@/lib/types';

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
      const [summaryData, stepsData, weightData, goalsData] = await Promise.allSettled([
        getJournalSummary(today),
        getSteps({ date: today }),
        getWeightEntries({ limit: 60 }),
        getGoals(),
      ]);
      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
      if (stepsData.status === 'fulfilled') {
        const arr = stepsData.value;
        setSteps(arr.length > 0 ? arr[0] : null);
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
        name={displayName ?? 'there'}
        onLogFood={() => {
          /* journal page handles food entry */
          window.location.href = '/journal';
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
          todaySteps={todaySteps}
          lastWeight={lastWeight}
          prevWeight={prevWeight}
          weightHistory={weightHistory}
          goals={goals}
        />
      ) : (
        <WeekVariant
          loading={loading}
          summary={summary}
          calories={calories}
          protein={protein}
          todaySteps={todaySteps}
          weightHistory={weightHistory}
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
  todaySteps,
  lastWeight,
  prevWeight,
  weightHistory,
  goals,
}: {
  loading: boolean;
  summary: DailySummary | null;
  calories: number;
  protein: number;
  todaySteps: number;
  lastWeight: WeightEntry | null;
  prevWeight: WeightEntry | null;
  weightHistory: WeightEntry[];
  goals: Goals;
}) {
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
              <MacroBar label="Protein" value={protein} target={goals.protein} />
              <MacroBar
                label="Steps"
                value={todaySteps}
                target={goals.steps}
                unit=""
                tone="success"
              />
              {lastWeight && (
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
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
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
  goals,
}: {
  loading: boolean;
  summary: DailySummary | null;
  calories: number;
  protein: number;
  todaySteps: number;
  weightHistory: WeightEntry[];
  goals: Goals;
}) {
  const entries = summary?.entries ?? [];

  // Last 7 days of weight (oldest → newest) for the trend mini.
  const weight7 = useMemo(() => {
    return [...weightHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);
  }, [weightHistory]);

  return (
    <div
      style={{
        marginTop: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <CardShell
        title="This week"
        icon={<CalendarIcon style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        hint={
          <Pill tone="medium">
            {goals.calories
              ? `${Math.round((calories / goals.calories) * 100)}% to goal`
              : ''}
          </Pill>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 14,
          }}
        >
          <BigTile
            label="Calories"
            value={calories}
            target={goals.calories}
            unit=" kcal"
          />
          <BigTile
            label="Protein"
            value={protein}
            target={goals.protein}
            unit=" g"
          />
          <BigTile
            label="Steps"
            value={todaySteps}
            target={goals.steps}
            unit=""
          />
        </div>
      </CardShell>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: '1.4fr 1fr',
        }}
        className="week-grid"
      >
        <CardShell
          title="Today"
          icon={<Utensils style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          hint={
            <span
              style={{
                color: 'var(--color-muted-foreground)',
                fontSize: 12,
              }}
            >
              {entries.length} entries
            </span>
          }
        >
          {loading ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
          ) : entries.length === 0 ? (
            <div
              style={{
                background: 'var(--color-surface-warm)',
                border: '1px dashed var(--color-border)',
                borderRadius: 12,
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--color-muted-foreground)',
                fontSize: 13,
              }}
            >
              No food logged yet today.{' '}
              <a href="/journal" style={{ color: 'var(--color-link)' }}>
                Log a meal.
              </a>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {entries.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    padding: '4px 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
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
            </div>
          )}
        </CardShell>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassCard padding={false} className="p-4">
            <MicroLabel>Weight trend</MicroLabel>
            {weight7.length > 0 ? (
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
                    {weight7[weight7.length - 1].weight_kg.toFixed(1)}
                  </MonoNum>
                  <span
                    style={{
                      color: 'var(--color-muted-foreground)',
                      fontSize: 12,
                    }}
                  >
                    kg
                  </span>
                  {weight7.length > 1 && (
                    <Pill tone="success" style={{ marginLeft: 'auto' }}>
                      {(
                        weight7[weight7.length - 1].weight_kg -
                        weight7[0].weight_kg
                      ).toFixed(1)}{' '}
                      kg
                    </Pill>
                  )}
                </div>
                <Sparkline
                  data={weight7.map((w) => w.weight_kg)}
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

          <CardShell
            title="Quick links"
            icon={
              <CalendarIcon
                style={{ width: 14, height: 14, strokeWidth: 2.25 }}
              />
            }
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {[
                { label: 'Open journal', href: '/journal' },
                { label: 'Foods database', href: '/foods' },
                { label: 'Saved meals', href: '/meals' },
                { label: 'Weight history', href: '/weight' },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  style={{
                    fontSize: 13,
                    color: 'var(--color-link)',
                    textDecoration: 'none',
                    padding: '4px 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </CardShell>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .week-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
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
      }}
    >
      <MicroLabel>{label}</MicroLabel>
      <div style={{ marginTop: 6 }}>
        <MonoNum size={26}>{value.toLocaleString()}</MonoNum>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            marginLeft: 4,
          }}
        >
          / {target.toLocaleString()}
          {unit}
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
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
