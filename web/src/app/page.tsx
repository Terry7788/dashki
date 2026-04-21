'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Scale, Footprints, Flame, Dumbbell, Plus, Check } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import GlassButton from '@/components/ui/GlassButton';
import GlassModal from '@/components/ui/GlassModal';
import GlassInput from '@/components/ui/GlassInput';
import { getJournalSummary, getSteps, getWeightEntries, getTodos, addWeightEntry, updateSteps, updateTodo, getGoals, getPreferences } from '@/lib/api';
import { useSocketEvent } from '@/lib/useSocketEvent';
import type { DailySummary, StepEntry, WeightEntry, Todo, GymSession, Goals } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayISO(): string {
  // Use en-CA locale for YYYY-MM-DD in local time (not UTC like toISOString())
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="backdrop-blur-xl bg-white/[0.04] border border-white/[0.08] rounded-3xl shadow-2xl p-6">
      <div className="skeleton h-4 w-24 mb-4" />
      <div className="skeleton h-10 w-20 mb-2" />
      <div className="skeleton h-3 w-16" />
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  unit?: string;
  iconColor: string;
  iconBg: string;
}

function StatCard({ icon: Icon, label, value, unit, iconColor, iconBg }: StatCardProps) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-2xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-white">{value}</span>
        {unit && <span className="text-sm text-white/50">{unit}</span>}
      </div>
      <p className="text-sm text-white/60 mt-1">{label}</p>
    </GlassCard>
  );
}

// ─── Todo Row with interactive tick ──────────────────────────────────────────

interface TodoRowProps {
  todo: Todo;
  onComplete: (id: number) => void;
  fading: boolean;
}

function TodoRow({ todo, onComplete, fading }: TodoRowProps) {
  const [ticked, setTicked] = useState(false);

  function handleClick() {
    if (ticked) return;
    setTicked(true);
    // Optimistic: briefly show green check, then parent removes it
    setTimeout(() => {
      onComplete(todo.id);
    }, 350);
  }

  return (
    <li
      className={`flex items-start gap-4 px-6 py-4 transition-all duration-500 ${
        fading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
    >
      <button
        onClick={handleClick}
        aria-label={`Complete: ${todo.title}`}
        className={`w-5 h-5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 cursor-pointer ${
          ticked
            ? 'bg-[#2E8B57] border-[#2E8B57]'
            : 'border-white/30 hover:border-[#2E8B57]'
        }`}
      >
        {ticked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate transition-all duration-200 ${
            ticked ? 'text-white/40 line-through' : 'text-white'
          }`}
        >
          {todo.title}
        </p>
        {todo.due_date && (
          <p className="text-xs text-white/40 mt-0.5">
            Due {formatDate(todo.due_date)}
          </p>
        )}
      </div>
    </li>
  );
}

// ─── Gym Widget ──────────────────────────────────────────────────────────────

interface GymWidgetData {
  lastSession: GymSession | null;
  nextSession: { name: string; day: string } | null;
}

function GymWidget({ data, loading }: { data: GymWidgetData | null; loading: boolean }) {
  return (
    <div className="animate-fade-in-up" style={{ animationDelay: '180ms' }}>
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
        Gym
      </h2>
      <GlassCard>
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        ) : !data?.lastSession && !data?.nextSession ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Dumbbell className="w-8 h-8 text-white/20" />
            <p className="text-white/40 text-sm text-center">No workout data yet.</p>
            <Link
              href="/gym"
              className="text-[#61bc84] text-sm hover:underline"
            >
              Log a session →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Icon row */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-[#2E8B57]/20 flex items-center justify-center flex-shrink-0">
                <Dumbbell className="w-5 h-5 text-[#61bc84]" />
              </div>
              <span className="text-sm font-semibold text-white/80">Workout Tracker</span>
            </div>

            {data?.lastSession && (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Last Session</p>
                <p className="text-sm font-medium text-white">{data.lastSession.name}</p>
                <p className="text-xs text-white/50 mt-0.5">{formatDate(data.lastSession.date)}</p>
              </div>
            )}

            {data?.nextSession && (
              <>
                {data?.lastSession && <div className="h-px bg-white/[0.07]" />}
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Next Session</p>
                  <p className="text-sm font-medium text-white">{data.nextSession.name}</p>
                  <p className="text-xs text-white/50 mt-0.5">{data.nextSession.day}</p>
                </div>
              </>
            )}

            <Link href="/gym" className="text-[#61bc84] text-xs hover:underline block mt-1">
              View all sessions →
            </Link>
          </div>
        )}
      </GlassCard>
    </div>
  );
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = todayISO();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [steps, setSteps] = useState<StepEntry | null>(null);
  const [latestWeight, setLatestWeight] = useState<WeightEntry | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [goals, setGoals] = useState<Goals>({ id: 0, calories: 2000, protein: 150, carbs: null, fat: null, steps: 10000, weight_kg: null, updated_at: '' });
  const [fadingIds, setFadingIds] = useState<Set<number>>(new Set());

  // Display name (read-only on dashboard; edited in /settings)
  const [displayName, setDisplayName] = useState<string | null>(null);

  // Gym widget
  const [gymLoading, setGymLoading] = useState(true);
  const [gymData, setGymData] = useState<GymWidgetData | null>(null);

  // Modal state
  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [stepsInput, setStepsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, stepsData, weightData, todosData, goalsData] = await Promise.allSettled([
        getJournalSummary(today),
        getSteps({ date: today }),
        getWeightEntries({ limit: 1 }),
        getTodos({ upcoming: true }),
        getGoals(),
      ]);

      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
      if (stepsData.status === 'fulfilled') {
        const arr = stepsData.value;
        setSteps(arr.length > 0 ? arr[0] : null);
      }
      if (weightData.status === 'fulfilled') {
        const arr = weightData.value;
        setLatestWeight(arr.length > 0 ? arr[0] : null);
      }
      if (todosData.status === 'fulfilled') {
        setTodos(todosData.value.slice(0, 5));
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
  useSocketEvent('journal-entry-deleted', fetchAll);
  useSocketEvent('steps-updated', fetchAll);
  useSocketEvent('weight-updated', fetchAll);
  useSocketEvent('weight-deleted', fetchAll);
  useSocketEvent('todo-created', fetchAll);
  useSocketEvent('todo-updated', fetchAll);
  useSocketEvent('todo-deleted', fetchAll);
  useSocketEvent('goals-updated', fetchAll);

  // Display name — fetch on load, refetch when prefs are updated in /settings
  const fetchPreferences = useCallback(async () => {
    try {
      const prefs = await getPreferences();
      setDisplayName(prefs.display_name);
    } catch (_) {
      // silent — falls back to generic greeting
    }
  }, []);
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);
  useSocketEvent('preferences-updated', fetchPreferences);

  // Fetch gym data separately so it doesn't block the main dashboard
  useEffect(() => {
    async function fetchGym() {
      setGymLoading(true);
      try {
        const BASE_URL =
          (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

        const [lastRes, nextRes] = await Promise.allSettled([
          fetch(`${BASE_URL}/api/gym/sessions?limit=1`),
          fetch(`${BASE_URL}/api/gym/routine/next`),
        ]);

        let lastSession: GymSession | null = null;
        let nextSession: { name: string; day: string } | null = null;

        if (lastRes.status === 'fulfilled' && lastRes.value.ok) {
          const arr: GymSession[] = await lastRes.value.json();
          lastSession = arr.length > 0 ? arr[0] : null;
        }

        if (nextRes.status === 'fulfilled' && nextRes.value.ok) {
          const data = await nextRes.value.json();
          if (data && data.workout_name) {
            nextSession = { name: data.workout_name, day: data.date || '' };
          }
        }

        setGymData({ lastSession, nextSession });
      } catch {
        setGymData({ lastSession: null, nextSession: null });
      } finally {
        setGymLoading(false);
      }
    }
    fetchGym();
  }, []);

  // Complete a todo — optimistic removal with fade
  function handleCompleteTodo(id: number) {
    // Start fade
    setFadingIds((prev) => new Set(prev).add(id));
    // Remove from list after fade
    setTimeout(() => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      setFadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 500);
    // Fire API in background
    updateTodo(id, { completed: true }).catch(() => {
      // If it fails, restore todo by re-fetching
      getTodos({ upcoming: true })
        .then((data) => setTodos(data.slice(0, 5)))
        .catch(() => {});
    });
  }

  async function handleLogWeight() {
    if (!weightInput) return;
    setSaving(true);
    try {
      const entry = await addWeightEntry({ date: today, weight_kg: parseFloat(weightInput) });
      setLatestWeight(entry);
      setWeightModal(false);
      setWeightInput('');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSteps() {
    if (!stepsInput) return;
    setSaving(true);
    try {
      const entry = await updateSteps({ date: today, steps: parseInt(stepsInput, 10) });
      setSteps(entry);
      setStepsModal(false);
      setStepsInput('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>

      {/* ── Greeting ─────────────────────────────────────────── */}
      <div
        className="mb-8 animate-fade-in-up"
        style={{ animationDelay: '0ms' }}
      >
        <h1 className="text-3xl font-bold text-white">
          {displayName ? `${getGreeting()}, ${displayName} 👋` : `${getGreeting()} 👋`}
        </h1>
        <p className="text-white/50 mt-1 text-sm">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Two-column layout on large screens ───────────────── */}
      <div className="lg:grid lg:grid-cols-3 xl:grid-cols-[2fr_1fr] lg:gap-6 xl:gap-8 space-y-6 lg:space-y-0">

        {/* ── LEFT COLUMN (lg: 2/3 width) ─────────────────────── */}
        <div className="lg:col-span-2 xl:col-span-1 space-y-6">

          {/* Stats — 2 cols mobile, 4 cols xl */}
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: '100ms' }}
          >
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Today&rsquo;s Summary
            </h2>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {loading ? (
                <>
                  <StatSkeleton />
                  <StatSkeleton />
                  <StatSkeleton />
                  <StatSkeleton />
                </>
              ) : (
                <>
                  <StatCard
                    icon={Flame}
                    label="Calories Today"
                    value={summary ? Math.round(summary.calories) : 0}
                    unit="kcal"
                    iconColor="text-orange-300"
                    iconBg="bg-orange-500/20"
                  />
                  <StatCard
                    icon={Dumbbell}
                    label="Protein Today"
                    value={summary ? Math.round(summary.protein) : 0}
                    unit="g"
                    iconColor="text-[#61bc84]"
                    iconBg="bg-[#2E8B57]/20"
                  />
                  <StatCard
                    icon={Footprints}
                    label="Steps Today"
                    value={steps ? steps.steps.toLocaleString() : 0}
                    iconColor="text-[#61bc84]"
                    iconBg="bg-[#2E8B57]/20"
                  />
                  <StatCard
                    icon={Scale}
                    label="Latest Weight"
                    value={latestWeight ? latestWeight.weight_kg.toFixed(1) : '—'}
                    unit={latestWeight ? 'kg' : ''}
                    iconColor="text-[#61bc84]"
                    iconBg="bg-[#2E8B57]/20"
                  />
                </>
              )}
            </div>
          </div>

          {/* Today's Journal / Food log preview */}
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: '200ms' }}
          >
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Today&rsquo;s Journal
            </h2>
            <GlassCard>
              {loading ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="skeleton w-16 h-16 rounded-full shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-1.5 w-full rounded-full" />
                      <div className="skeleton h-4 w-1/2" />
                      <div className="skeleton h-1.5 w-full rounded-full" />
                    </div>
                  </div>
                </div>
              ) : summary ? (() => {
                const caloriesOver = summary.calories > goals.calories;
                const caloriesOverBy = Math.round(summary.calories - goals.calories);
                return (
                <div className="flex items-center gap-5">
                  {/* Calories ring */}
                  <div className="relative shrink-0">
                    <ProgressRing
                      value={summary.calories}
                      max={goals.calories}
                      size={68}
                      stroke={6}
                      color={caloriesOver ? '#ef4444' : '#6366f1'}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold leading-tight">{Math.round(summary.calories)}</span>
                      <span className="text-[9px] text-white/40">kcal</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    {/* Calories bar */}
                    <div>
                      <div className="flex items-end justify-between mb-1">
                        <span className="text-sm text-white/60">Calories</span>
                        <span className="text-sm font-bold text-white">
                          {Math.round(summary.calories)} <span className="text-white/40 font-normal">/ {goals.calories}</span>
                          {caloriesOver && (
                            <span className="ml-1.5 text-red-400 font-semibold">
                              +{caloriesOverBy} over
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            caloriesOver
                              ? 'bg-gradient-to-r from-red-500 to-rose-500'
                              : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                          }`}
                          style={{ width: `${Math.min((summary.calories / goals.calories) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    {/* Protein bar */}
                    <div>
                      <div className="flex items-end justify-between mb-1">
                        <span className="text-sm text-white/60">Protein</span>
                        <span className="text-sm font-bold text-white">
                          {Math.round(summary.protein)}g <span className="text-white/40 font-normal">/ {goals.protein}g</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((summary.protein / goals.protein) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                );
              })() : (
                <p className="text-white/40 text-sm text-center py-2">
                  No food logged today yet.
                </p>
              )}
            </GlassCard>
          </div>

          {/* Gym Widget — below journal, left column */}
          <GymWidget data={gymData} loading={gymLoading} />

        </div>

        {/* ── RIGHT COLUMN (lg: 1/3 width) ────────────────────── */}
        <div className="lg:col-span-1 space-y-6">

          {/* Upcoming Todos — interactive */}
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: '150ms' }}
          >
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Upcoming To-Dos
            </h2>
            {loading ? (
              <GlassCard>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="skeleton w-5 h-5 rounded-full" />
                      <div className="flex-1">
                        <div className="skeleton h-4 w-3/4 mb-2" />
                        <div className="skeleton h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ) : todos.length === 0 ? (
              <GlassCard>
                <p className="text-white/40 text-sm text-center py-4">
                  No upcoming todos — you&rsquo;re all clear! 🎉
                </p>
              </GlassCard>
            ) : (
              <GlassCard padding={false}>
                <ul className="divide-y divide-white/[0.07]">
                  {todos.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onComplete={handleCompleteTodo}
                      fading={fadingIds.has(todo.id)}
                    />
                  ))}
                </ul>
              </GlassCard>
            )}
          </div>

          {/* Quick Actions */}
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: '250ms' }}
          >
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Quick Actions
            </h2>
            <GlassCard>
              <div className="flex flex-col gap-3">
                <GlassButton
                  variant="primary"
                  onClick={() => setWeightModal(true)}
                  className="w-full justify-center"
                >
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Log Weight
                  </span>
                </GlassButton>
                <GlassButton
                  variant="default"
                  onClick={() => setStepsModal(true)}
                  className="w-full justify-center"
                >
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add Steps
                  </span>
                </GlassButton>
              </div>
            </GlassCard>
          </div>

        </div>
      </div>

      {/* ── Log Weight Modal ──────────────────────────────────── */}
      <GlassModal
        isOpen={weightModal}
        onClose={() => { setWeightModal(false); setWeightInput(''); }}
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

      {/* ── Add Steps Modal ───────────────────────────────────── */}
      <GlassModal
        isOpen={stepsModal}
        onClose={() => { setStepsModal(false); setStepsInput(''); }}
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
    </div>
  );
}
