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
import { GlassButton, GlassModal, GlassInput } from '../components/ui';
import {
  getJournalSummary,
  getJournalEntries,
  getSteps,
  getWeightEntries,
  addWeightEntry,
  createStepLog,
  getGoals,
  getPreferences,
} from '../lib/api';
import type {
  DailySummary,
  StepEntry,
  WeightEntry,
  Goals,
  JournalEntry,
} from '../lib/types';
import { useAuth } from '../lib/auth-context';
import { FoldHead, FoldBar, FoldRing, PAGE_WEEK } from '../components/Fold';

function todayISO(): string {
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleString('en-CA').split(',')[0];
}

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return addDays(iso, -((d.getDay() + 6) % 7));
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
  

  const [weekEntries, setWeekEntries] = useState<JournalEntry[]>([]);
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
      getJournalEntries({ startDate: mondayOf(today), endDate: addDays(mondayOf(today), 6) }).then(setWeekEntries).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [today]);

  const fetchPreferences = useCallback(async () => {
    try {
      const prefs = await getPreferences();
      setDisplayName(prefs.display_name);
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
  const todaySteps = steps?.steps ?? 0;
  const lastWeight = weightHistory[0] ?? null;


  const entries = summary?.entries ?? [];

  const weekDays = useMemo(() => PAGE_WEEK.map((label, i) => {
    const date = addDays(mondayOf(today), i);
    return { label, date, calories: Math.round(weekEntries.filter((e) => e.date === date).reduce((a, e) => a + (e.calories_snapshot ?? 0), 0)) };
  }), [weekEntries, today]);
  const weekScale = Math.max(goals.calories * 1.2, ...weekDays.map((d) => d.calories), 1);

  const greetingName =
    displayName || user?.display_name || (import.meta.env.VITE_PERSONAL_BUILD === '1' ? 'Terry' : status === 'guest' ? 'there' : 'you');

  return (
    <>
      <main className="fd-page">
        <FoldHead
          title={<><span className="fd-wide">{getGreeting()}, {greetingName}</span><span className="fd-narrow">{getGreeting()}</span></>}
          sub={formatToday()}
          right={<button type="button" className="fd-btn primary" onClick={() => navigate('/journal?addFood=1')}><span className="fd-wide">+ Log food</span><span className="fd-narrow">+ Log</span></button>}
        />
        <div className="fd-home-top" style={{ display: undefined }}>
          <section className="fd-panel">
            <b className="fd-title fd-wide">Today's nutrition</b>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="fd-narrow"><FoldRing value={calories} goal={goals.calories} size={120} /></span>
              <span className="fd-wide"><FoldRing value={calories} goal={goals.calories} size={120} /></span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Left today</span><b className="fd-mono">{Math.max(goals.calories - calories, 0).toLocaleString()} kcal</b></div>
                  <FoldBar pct={(calories / (goals.calories || 1)) * 100} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Protein</span><b className="fd-mono">{protein} / {goals.protein} g</b></div>
                  <FoldBar pct={(protein / (goals.protein || 1)) * 100} color="#55B97A" />
                </div>
              </div>
            </div>
          </section>
          <div className="fd-grid2 fd-home-side">
            <button type="button" className="fd-panel fd-tap" onClick={() => setWeightModal(true)} style={{ gap: 2 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>Weight</b>{lastWeight && <span className="fd-mute fd-wide">{new Date(lastWeight.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}</span>
              <b className="fd-mono" style={{ fontSize: 24 }}>{lastWeight ? `${lastWeight.weight_kg.toFixed(1)} kg` : '—'}</b>
              {lastWeight && goals.weight_kg ? <span className="fd-mute" style={{ fontSize: 12 }}>{(lastWeight.weight_kg - goals.weight_kg).toFixed(1)} kg to {goals.weight_kg} kg</span> : null}
            </button>
            <button type="button" className="fd-panel fd-tap" onClick={() => navigate('/steps')} style={{ gap: 4 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>Steps</b><span className="fd-mute fd-wide">Samsung Health</span></span>
              <b className="fd-mono" style={{ fontSize: 24 }}>{todaySteps.toLocaleString()}</b>
              <FoldBar pct={(todaySteps / (goals.steps || 1)) * 100} height={6} />
            </button>
          </div>
        </div>
        <div className="fd-home-bot">
          <section className="fd-panel fd-wide fd-flex" style={{ flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b className="fd-title" style={{ fontSize: 15 }}>This week</b><span className="fd-mute" style={{ fontSize: 11 }}>Orange = over {goals.calories.toLocaleString()} kcal</span></div>
            <div className="fd-week">
              {weekDays.map((d) => (
                <div key={d.date}>
                  <b>{d.calories ? d.calories.toLocaleString() : ''}</b>
                  <i style={{ height: `${(d.calories / weekScale) * 80}%`, background: d.date === today ? '#2F7FE6' : d.calories > goals.calories ? '#C47A3C' : undefined }} />
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="fd-panel" style={{ marginTop: undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b className="fd-title" style={{ fontSize: 15 }}>Logged today</b><button type="button" className="fd-btn line fd-wide" style={{ border: 0, color: '#4D9BFF', padding: 0, fontSize: 12 }} onClick={() => navigate('/journal')}>Journal ›</button></div>
            <div className="fd-meal-list">
              {entries.length === 0 && <p className="fd-mute" style={{ fontSize: 13, margin: '6px 0' }}>{loading ? 'Loading…' : 'Nothing logged yet'}</p>}
              {entries.map((e) => (
                <button key={e.id} type="button" className="fd-row fd-tap" onClick={() => navigate('/journal')}><span className="fd-row-title" style={{ fontWeight: 400, fontSize: 13 }}>{e.food_name_snapshot}</span><b className="fd-mono" style={{ flex: 'none', fontSize: 13 }}>{Math.round(e.calories_snapshot)}</b></button>
              ))}
            </div>
          </section>
        </div>
      </main>


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
    </>
  );
}

