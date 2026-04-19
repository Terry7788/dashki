'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui';
import { getSteps, updateSteps, getGoals, updateGoals } from '@/lib/api';
import type { StepEntry, Goals } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';

// ─── Step Calculator State ──────────────────────────────────────────────────

interface CalculatorState {
  time: string;
  speed: string;
  height: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  // Use en-CA locale for YYYY-MM-DD in local time (not UTC like toISOString())
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function subtractDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleString('en-CA').split(',')[0];
}

function formatDayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

const DEFAULT_GOAL = 10000;

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({
  steps,
  goal,
}: {
  steps: number;
  goal: number;
}) {
  const radius = 90;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const progress = Math.min(steps / goal, 1);
  const offset = circumference - progress * circumference;
  const pct = Math.round(progress * 100);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: radius * 2, height: radius * 2 }}>
        <svg
          width={radius * 2}
          height={radius * 2}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
          />
          {/* Progress */}
          <circle
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            fill="none"
            stroke="#818cf8"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease-in-out' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white text-2xl font-bold leading-tight">
            {steps.toLocaleString()}
          </span>
          <span className="text-white/50 text-xs mt-0.5">steps</span>
          <span className="text-indigo-400 text-sm font-semibold mt-1">{pct}%</span>
        </div>
      </div>
      <p className="text-white/40 text-xs mt-3">Goal: {goal.toLocaleString()} steps</p>
    </div>
  );
}

// ─── Custom Bar Tooltip ───────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="backdrop-blur-xl bg-black/70 border border-white/15 rounded-2xl px-4 py-3 shadow-xl">
      <p className="text-white/60 text-xs mb-1">{label}</p>
      <p className="text-indigo-300 font-semibold text-sm">
        {payload[0].value.toLocaleString()} steps
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StepsPage() {
  const [entries, setEntries] = useState<StepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [stepsInput, setStepsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCalc, setSavingCalc] = useState(false); // For calculator "Log as Today"

  // Goal state (from API)
  const [goal, setGoal] = useState<number>(DEFAULT_GOAL);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  // Step Calculator state
  const [calc, setCalc] = useState<CalculatorState>({
    time: '',
    speed: '5.0',
    height: '183',
  });
  const [calculatedSteps, setCalculatedSteps] = useState(0);

  // Step calculator logic (same formula as Calorie Assistant)
  useEffect(() => {
    const timeNum = parseFloat(calc.time);
    const speedNum = parseFloat(calc.speed);
    const heightNum = parseFloat(calc.height);

    if (timeNum > 0 && speedNum > 0 && heightNum > 0) {
      const timeInHours = timeNum / 60;
      const distanceKm = speedNum * timeInHours;
      const distanceM = distanceKm * 1000;
      const stepLengthCm = 0.415 * heightNum;
      const stepLengthM = stepLengthCm / 100;
      const steps = distanceM / stepLengthM;
      setCalculatedSteps(Math.round(steps));
    } else {
      setCalculatedSteps(0);
    }
  }, [calc]);

  // Load goals from API
  useEffect(() => {
    async function loadGoals() {
      try {
        const data = await getGoals();
        if (data.steps) {
          setGoal(data.steps);
        }
      } catch (e) {
        console.error('Failed to load goals:', e);
      } finally {
        setGoalsLoading(false);
      }
    }
    loadGoals();
  }, []);

  const today = todayISO();
  const weekStart = subtractDays(6);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSteps({ startDate: weekStart });
      setEntries(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load steps');
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { loadData(); }, [loadData]);
  useSocketEvent('steps-updated', loadData);

  // Today's steps
  const todayEntry = useMemo(
    () => entries.find((e) => e.date === today),
    [entries, today]
  );
  const todaySteps = todayEntry?.steps ?? 0;

  // Weekly bar chart data — fill in missing days
  const weekData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const iso = subtractDays(6 - i);
      const entry = entries.find((e) => e.date === iso);
      return {
        day: formatDayLabel(iso),
        date: iso,
        steps: entry?.steps ?? 0,
        isToday: iso === today,
      };
    });
    return days;
  }, [entries, today]);

  const handleUpdateSteps = async () => {
    const val = parseInt(stepsInput, 10);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      // Always add to existing steps for this date
      const existingEntry = entries.find((e) => e.date === date);
      const finalSteps = existingEntry ? existingEntry.steps + val : val;
      
      const entry = await updateSteps({ date, steps: finalSteps });
      setEntries((prev) => {
        const next = prev.filter((e) => e.date !== entry.date);
        return [...next, entry];
      });
      setStepsInput('');
    } catch (e: any) {
      setError(e.message || 'Failed to update steps');
    }
    setSaving(false);
  };

  const handleLogAsToday = async () => {
    if (calculatedSteps <= 0) return;
    setSavingCalc(true);
    try {
      const today = todayISO();
      const existingEntry = entries.find((e) => e.date === today);
      const finalSteps = existingEntry ? existingEntry.steps + calculatedSteps : calculatedSteps;
      
      const entry = await updateSteps({ date: today, steps: finalSteps });
      setEntries((prev) => {
        const next = prev.filter((e) => e.date !== entry.date);
        return [...next, entry];
      });
      // Reset calculator
      setCalc({ time: '', speed: '5.0', height: '183' });
    } catch (e: any) {
      setError(e.message || 'Failed to log steps');
    }
    setSavingCalc(false);
  };

  const handleSaveGoal = async () => {
    const val = parseInt(goalInput, 10);
    if (!isNaN(val) && val > 0) {
      try {
        const updated = await updateGoals({ steps: val });
        setGoal(updated.steps);
      } catch (e) {
        console.error('Failed to save goal:', e);
        // Fallback to local state
        setGoal(val);
      }
    }
    setEditingGoal(false);
    setGoalInput('');
  };

  return (
    <div className="px-4 md:px-6 py-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Steps</h1>
        <button
          onClick={() => { setEditingGoal(true); setGoalInput(String(goal)); }}
          className="text-indigo-400 text-xs hover:text-indigo-300 underline transition-colors"
        >
          Change Goal
        </button>
      </div>

      {/* Goal Edit Inline */}
      {editingGoal && (
        <GlassCard className="animate-slide-up">
          <p className="text-white/60 text-sm mb-3">Daily step goal</p>
          <div className="flex gap-3 items-end">
            <GlassInput
              label="Goal (steps)"
              type="number"
              inputMode="numeric"
              min={100}
              step={500}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="flex-1"
            />
            <GlassButton variant="primary" onClick={handleSaveGoal}>
              Save
            </GlassButton>
            <GlassButton onClick={() => setEditingGoal(false)}>
              Cancel
            </GlassButton>
          </div>
        </GlassCard>
      )}

      {/* ── Step Calculator ── */}
      <GlassCard>
        <h2 className="text-white font-semibold mb-4">Calculate Steps</h2>
        
        {/* Quick Time Buttons */}
        <div className="mb-4">
          <p className="text-white/50 text-xs mb-2">Quick Time</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((minutes) => (
              <button
                key={minutes}
                onClick={() => setCalc((prev) => ({ ...prev, time: String(minutes) }))}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  calc.time === String(minutes)
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>

        {/* Input Fields */}
        <div className="space-y-4">
          <GlassInput
            label="Walking Time (minutes)"
            type="number"
            inputMode="numeric"
            placeholder="Enter time in minutes"
            value={calc.time}
            onChange={(e) => setCalc((prev) => ({ ...prev, time: e.target.value }))}
            min={0}
            step={1}
          />
          <GlassInput
            label="Walking Speed (km/h)"
            type="number"
            inputMode="decimal"
            placeholder="Enter speed"
            value={calc.speed}
            onChange={(e) => setCalc((prev) => ({ ...prev, speed: e.target.value }))}
            min={0}
            step={0.1}
          />
          <GlassInput
            label="Height (cm)"
            type="number"
            inputMode="numeric"
            placeholder="Enter height"
            value={calc.height}
            onChange={(e) => setCalc((prev) => ({ ...prev, height: e.target.value }))}
            min={0}
            step={1}
          />
        </div>

        {/* Calculated Result */}
        {calculatedSteps > 0 && (
          <div className="mt-4 p-4 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
            <p className="text-white/60 text-xs mb-1 text-center">Estimated Steps</p>
            <p className="text-white text-2xl font-bold text-center">
              {calculatedSteps.toLocaleString()}
            </p>
            <p className="text-white/40 text-xs text-center mt-1">
              Walking {calc.time} min at {calc.speed} km/h
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <GlassButton
            variant="primary"
            onClick={() => {
              setCalc({ time: '', speed: '5.0', height: '183' });
            }}
            className="flex-1"
          >
            Reset
          </GlassButton>
          {calculatedSteps > 0 && (
            <GlassButton
              variant="primary"
              onClick={handleLogAsToday}
              disabled={savingCalc}
              className="flex-1"
            >
              {savingCalc ? 'Adding...' : 'Log as Today'}
            </GlassButton>
          )}
        </div>
      </GlassCard>

      {/* ── Progress Ring ── */}
      <GlassCard>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="skeleton w-44 h-44 rounded-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center py-4">
            <ProgressRing steps={todaySteps} goal={goal} />
            <p className="text-white/40 text-xs mt-4">
              {today} · {formatDateFull(today)}
            </p>
          </div>
        )}
      </GlassCard>

      {/* ── Log Steps Form ── */}
      <GlassCard>
        <h2 className="text-white font-semibold mb-4">Update Steps</h2>
        <div className="flex gap-3 flex-wrap sm:flex-nowrap items-end">
          <GlassInput
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-44"
          />
          <GlassInput
            label="Steps to add"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            placeholder="e.g. 3000"
            value={stepsInput}
            onChange={(e) => setStepsInput(e.target.value)}
            className="flex-1"
          />
          <GlassButton
            variant="primary"
            onClick={handleUpdateSteps}
            disabled={saving || !stepsInput}
            className="flex-shrink-0"
          >
            {saving ? 'Saving…' : 'Add Steps'}
          </GlassButton>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </GlassCard>

      {/* ── Weekly Bar Chart ── */}
      <GlassCard>
        <h2 className="text-white font-semibold mb-4">Last 7 Days</h2>
        {loading ? (
          <div className="skeleton h-48 rounded-2xl" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="steps" radius={[6, 6, 0, 0]}>
                {weekData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isToday
                        ? '#818cf8'
                        : entry.steps >= goal
                        ? '#34d399'
                        : 'rgba(129,140,248,0.35)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex gap-4 mt-3 justify-end">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
            <span className="text-white/40 text-xs">Today</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-white/40 text-xs">Goal met</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
