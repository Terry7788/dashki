// Mobile home dashboard — port of web/src/app/page.tsx (today variant only).
// The web "week" variant is desktop-luxury and skipped on mobile in v1.
//
// Shows:
//   - Greeting header with Log food / Weigh in actions
//   - Today's nutrition: CalorieRing + macro bars (protein / fibre / steps / weight)
//   - Weight tile + sparkline
//   - Steps tile + progress
//   - Meal strips (breakfast / lunch / snack / dinner)
//
// Real-time updates via socket.io are TODO — for now, refetches on mount
// and after weight/steps mutations.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Scale, Footprints, Utensils, Sparkles } from 'lucide-react';
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
} from '../components/ui';
import {
  getJournalSummary,
  getSteps,
  getWeightEntries,
  addWeightEntry,
  createStepLog,
  getGoals,
  getPreferences,
  type HomeMetric,
} from '../lib/api';
import type {
  DailySummary,
  StepEntry,
  WeightEntry,
  Goals,
  JournalEntry,
  MealType,
} from '../lib/types';
import { useAuth } from '../lib/auth-context';
import PageHeader from '../components/PageHeader';

function todayISO(): string {
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

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

export default function HomeScreen() {
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const today = todayISO();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [steps, setSteps] = useState<StepEntry | null>(null);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [homeMetrics, setHomeMetrics] = useState<HomeMetric[]>([
    'protein',
    'fiber',
    'steps',
    'weight',
  ]);

  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [stepsInput, setStepsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, stepsTodayData, weightData, goalsData] =
        await Promise.allSettled([
          getJournalSummary(today),
          getSteps({ date: today }),
          getWeightEntries({ limit: 60 }),
          getGoals(),
        ]);
      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
      if (stepsTodayData.status === 'fulfilled') {
        const arr = stepsTodayData.value;
        setSteps(arr.length > 0 ? arr[0] : null);
      }
      if (weightData.status === 'fulfilled')
        setWeightHistory(weightData.value ?? []);
      if (goalsData.status === 'fulfilled') setGoals(goalsData.value);
    } finally {
      setLoading(false);
    }
  }, [today]);

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
    fetchAll();
    fetchPreferences();
  }, [fetchAll, fetchPreferences]);

  async function handleLogWeight() {
    if (!weightInput) return;
    setSaving(true);
    try {
      await addWeightEntry({ date: today, weight_kg: parseFloat(weightInput) });
      setWeightModal(false);
      setWeightInput('');
      await fetchAll();
    } catch {
      // swallow — UI will reflect lack of update
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSteps() {
    if (!stepsInput) return;
    const val = parseInt(stepsInput, 10);
    if (Number.isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      await createStepLog({ date: today, steps: val });
      setStepsModal(false);
      setStepsInput('');
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  const calories = summary ? Math.round(summary.calories) : 0;
  const protein = summary ? Math.round(summary.protein) : 0;
  const fiber = summary ? Math.round((summary.fiber ?? 0) * 10) / 10 : 0;
  const todaySteps = steps?.steps ?? 0;
  const lastWeight = weightHistory[0] ?? null;
  const prevWeight =
    weightHistory[7] ?? weightHistory[weightHistory.length - 1] ?? null;
  const weightDelta =
    lastWeight && prevWeight
      ? Number((lastWeight.weight_kg - prevWeight.weight_kg).toFixed(1))
      : null;

  const showProtein = homeMetrics.includes('protein');
  const showFiber = homeMetrics.includes('fiber');
  const showSteps = homeMetrics.includes('steps');
  const showWeight = homeMetrics.includes('weight');

  const entries = summary?.entries ?? [];
  const groups = useMemo(
    () =>
      MEALS.map((m) => ({
        ...m,
        entries: entries.filter((e) => e.meal_type === m.type),
      })),
    [entries],
  );

  const greetingName =
    displayName || user?.display_name || (status === 'guest' ? 'there' : 'you');

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader
        title={`${getGreeting()}`}
        subtitle={formatToday()}
        trailing={
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
            }}
          >
            <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontWeight: 600 }}>{greetingName}</span>
          </div>
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
        {/* Primary actions */}
        <div className="flex gap-2">
          <GlassButton
            variant="primary"
            size="md"
            onClick={() => navigate('/journal?addFood=1')}
            className="flex-1"
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            Log food
          </GlassButton>
          <GlassButton
            variant="soft"
            size="md"
            onClick={() => setWeightModal(true)}
            className="flex-1"
          >
            <Scale size={14} style={{ marginRight: 4 }} />
            Weigh in
          </GlassButton>
        </div>

        {/* Today's nutrition (CalorieRing + macros) */}
        <GlassCard>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-0.25px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Utensils size={14} style={{ color: 'var(--color-muted-foreground)' }} />
              Today's nutrition
            </h2>
            <span style={{ color: 'var(--color-muted-foreground)', fontSize: 12 }}>
              {summary ? `${entries.length} entries` : ''}
            </span>
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <CalorieRing value={calories} target={goals.calories} size={150} />
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
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
        </GlassCard>

        {/* Meal strips */}
        <GlassCard>
          <MicroLabel>Meals · {entries.length} entries</MicroLabel>
          <div className="mt-3 flex flex-col gap-2">
            {groups.map((g) => (
              <MealStrip
                key={g.type}
                name={g.name}
                entries={g.entries}
                onLog={() => navigate('/journal?addFood=1')}
              />
            ))}
          </div>
        </GlassCard>

        {/* Weight card */}
        {showWeight && (
          <CardShell
            title="Weight"
            icon={<Scale size={14} />}
          >
            {lastWeight ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                  }}
                >
                  <MonoNum size={28}>{lastWeight.weight_kg.toFixed(1)}</MonoNum>
                  <span style={{ color: 'var(--color-muted-foreground)', fontSize: 12 }}>
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
                </div>
                {weightHistory.length > 1 && (
                  <Sparkline
                    data={weightSparkData(weightHistory)}
                    stroke="var(--color-primary)"
                    height={36}
                  />
                )}
                {goals.weight_kg && (
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
              </>
            ) : (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-muted-foreground)',
                }}
              >
                Not logged yet
              </div>
            )}
          </CardShell>
        )}

        {/* Steps card */}
        {showSteps && (
          <CardShell
            title="Steps today"
            icon={<Footprints size={14} />}
            hint={
              <GlassButton variant="ghost" size="xs" onClick={() => setStepsModal(true)}>
                <Plus size={11} style={{ marginRight: 2 }} />
                Add
              </GlassButton>
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}
            >
              <MonoNum size={28}>{todaySteps.toLocaleString()}</MonoNum>
              <span style={{ color: 'var(--color-muted-foreground)', fontSize: 12 }}>
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
          </CardShell>
        )}
      </div>

      {/* Log Weight Modal */}
      <GlassModal
        isOpen={weightModal}
        onClose={() => {
          setWeightModal(false);
          setWeightInput('');
        }}
        title="Log Weight"
        size="sm"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setWeightModal(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleLogWeight}
              disabled={!weightInput || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <GlassInput
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            placeholder="75.5"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            step={0.1}
            min={0}
          />
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
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setStepsModal(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleAddSteps}
              disabled={!stepsInput || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <GlassInput
            label="Steps"
            type="number"
            inputMode="numeric"
            placeholder="8500"
            value={stepsInput}
            onChange={(e) => setStepsInput(e.target.value)}
            min={0}
          />
        </div>
      </GlassModal>
    </div>
  );
}

function MealStrip({
  name,
  entries,
  onLog,
}: {
  name: string;
  entries: JournalEntry[];
  onLog: () => void;
}) {
  if (entries.length === 0) {
    return (
      <button
        type="button"
        onClick={onLog}
        className="cursor-pointer text-left"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--color-surface-warm)',
          border: 0,
          fontFamily: 'inherit',
          color: 'var(--color-foreground)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted-foreground)' }}>
          {name}
        </span>
        <span style={{ color: 'var(--color-link)', fontSize: 12, fontWeight: 600 }}>
          + Log
        </span>
      </button>
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
          marginBottom: 4,
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
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
          lineHeight: 1.4,
        }}
      >
        {entries
          .slice(0, 4)
          .map((e) => e.food_name_snapshot)
          .join(' · ')}
        {entries.length > 4 && (
          <span style={{ fontStyle: 'italic', marginLeft: 4 }}>
            +{entries.length - 4} more
          </span>
        )}
      </div>
    </div>
  );
}
