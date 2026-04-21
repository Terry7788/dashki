'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { ChevronLeft, ChevronRight, Pencil, Trash2, Check, X } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui';
import {
  getSteps,
  getGoals,
  updateGoals,
  getStepLogs,
  createStepLog,
  updateStepLog,
  deleteStepLog,
} from '@/lib/api';
import type { StepEntry, StepLogEntry, Goals } from '@/lib/types';
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

function formatDateNavLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  const yesterday = subtractDays(1);
  if (iso === yesterday) return 'Yesterday';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleString('en-CA').split(',')[0];
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

  // The whole page is contextualised to this date, matching the Journal pattern.
  // Start on today; ChevronLeft/Right + the inline date picker change it.
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showDateInput, setShowDateInput] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [stepsInput, setStepsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCalc, setSavingCalc] = useState(false);

  // Individual log entries for the selected day (multiple rows — edit/delete)
  const [logs, setLogs] = useState<StepLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
  const isSelectedToday = selectedDate === today;
  // Load enough history to cover: selected day + the last 7 days for the chart.
  // If the user navigates far back in time we just extend the range.
  const rangeStart = useMemo(() => {
    const weekStart = subtractDays(6);
    return selectedDate < weekStart ? selectedDate : weekStart;
  }, [selectedDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSteps({ startDate: rangeStart });
      setEntries(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load steps');
    }
    setLoading(false);
  }, [rangeStart]);

  useEffect(() => { loadData(); }, [loadData]);
  useSocketEvent('steps-updated', loadData);

  // Selected date's steps (drives the big ring and the Update Steps form)
  const selectedEntry = useMemo(
    () => entries.find((e) => e.date === selectedDate),
    [entries, selectedDate]
  );
  const selectedSteps = selectedEntry?.steps ?? 0;

  // Weekly bar chart — last 7 days relative to TODAY (always). Highlight the
  // selected day if it falls in range.
  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = subtractDays(6 - i);
      const entry = entries.find((e) => e.date === iso);
      return {
        day: formatDayLabel(iso),
        date: iso,
        steps: entry?.steps ?? 0,
        isToday: iso === today,
        isSelected: iso === selectedDate,
      };
    });
  }, [entries, today, selectedDate]);

  // Date navigation helpers
  function handlePrevDay() {
    setSelectedDate((d) => addDays(d, -1));
  }
  function handleNextDay() {
    if (isSelectedToday) return;
    setSelectedDate((d) => addDays(d, 1));
  }
  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) setSelectedDate(e.target.value);
    setShowDateInput(false);
  }
  useEffect(() => {
    if (showDateInput && dateInputRef.current) {
      dateInputRef.current.focus();
      dateInputRef.current.showPicker?.();
    }
  }, [showDateInput]);

  // ── Fetch today's log entries whenever the selected day changes ──────────
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await getStepLogs(selectedDate);
      setLogs(data);
    } catch (e: any) {
      console.error('Failed to load step logs', e);
      setLogs([]);
    }
    setLogsLoading(false);
  }, [selectedDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useSocketEvent('steps-updated', loadLogs);

  // Both "add" paths now create a NEW log entry rather than overwriting the
  // day's total. Backend POST /api/steps/logs inserts the row, then emits
  // 'steps-updated' which triggers loadData + loadLogs to refresh.
  async function addLogForSelectedDate(stepsToAdd: number, note?: string) {
    const entry = await createStepLog({
      date: selectedDate,
      steps: stepsToAdd,
      note,
    });
    // Optimistically append so the list updates without waiting for the socket
    setLogs((prev) => [...prev, entry]);
  }

  const handleUpdateSteps = async () => {
    const val = parseInt(stepsInput, 10);
    if (isNaN(val) || val <= 0) return;
    setError(null);
    setSaving(true);
    try {
      await addLogForSelectedDate(val);
      setStepsInput('');
    } catch (e: any) {
      setError(e.message || 'Failed to add steps');
    }
    setSaving(false);
  };

  const handleLogCalculator = async () => {
    if (calculatedSteps <= 0) return;
    setError(null);
    setSavingCalc(true);
    try {
      await addLogForSelectedDate(calculatedSteps,
        `Calculator: ${calc.time}min @ ${calc.speed}km/h`);
      setCalc({ time: '', speed: '5.0', height: '183' });
    } catch (e: any) {
      setError(e.message || 'Failed to log steps');
    }
    setSavingCalc(false);
  };

  // ── Log entry CRUD handlers ──────────────────────────────────────────────
  function startEditingLog(log: StepLogEntry) {
    setEditingLogId(log.id);
    setEditingDraft(String(log.steps));
  }

  function cancelEditingLog() {
    setEditingLogId(null);
    setEditingDraft('');
  }

  async function commitEditingLog() {
    if (editingLogId === null) return;
    const val = parseInt(editingDraft, 10);
    if (isNaN(val) || val <= 0) {
      setError('Steps must be a positive whole number');
      return;
    }
    setError(null);
    setEditingSaving(true);
    try {
      const updated = await updateStepLog(editingLogId, { steps: val });
      setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      cancelEditingLog();
    } catch (e: any) {
      setError(e.message || 'Failed to update log entry');
    }
    setEditingSaving(false);
  }

  async function handleDeleteLog(id: number) {
    setError(null);
    setDeletingId(id);
    try {
      await deleteStepLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (e: any) {
      setError(e.message || 'Failed to delete log entry');
    }
    setDeletingId(null);
  }

  function formatLogTime(iso: string): string {
    // iso is "YYYY-MM-DDTHH:MM:SS" in local time (no tz suffix)
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return iso;
    }
  }

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

      {/* ── Date Navigation (matches Journal page pattern) ─────────────── */}
      <GlassCard padding={false}>
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={handlePrevDay}
            aria-label="Previous day"
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowDateInput(true)}
              className="flex items-center gap-2 text-white font-semibold hover:text-indigo-300 transition-colors duration-200"
            >
              {formatDateNavLabel(selectedDate)}
              <Pencil className="w-3.5 h-3.5 text-white/40" />
            </button>
            {showDateInput && (
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                max={today}
                onChange={handleDateChange}
                onBlur={() => setShowDateInput(false)}
                className="absolute opacity-0 w-0 h-0"
              />
            )}
          </div>

          <button
            onClick={handleNextDay}
            disabled={isSelectedToday}
            aria-label="Next day"
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </GlassCard>

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
            inputMode="decimal"
            placeholder="Enter time in minutes"
            value={calc.time}
            onChange={(e) => setCalc((prev) => ({ ...prev, time: e.target.value }))}
            min={0}
            step={0.5}
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
            inputMode="decimal"
            placeholder="Enter height"
            value={calc.height}
            onChange={(e) => setCalc((prev) => ({ ...prev, height: e.target.value }))}
            min={0}
            step={0.5}
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
              onClick={handleLogCalculator}
              disabled={savingCalc}
              className="flex-1"
            >
              {savingCalc
                ? 'Adding…'
                : `Log to ${formatDateNavLabel(selectedDate)}`}
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
            <ProgressRing steps={selectedSteps} goal={goal} />
            <p className="text-white/40 text-xs mt-4">
              {selectedDate} · {formatDateFull(selectedDate)}
            </p>
          </div>
        )}
      </GlassCard>

      {/* ── Log Steps Form ── */}
      <GlassCard>
        <h2 className="text-white font-semibold mb-2">
          Add entry for {formatDateNavLabel(selectedDate)}
        </h2>
        <p className="text-white/40 text-xs mb-4">
          Creates a new entry for this day. The day's total is the sum of all
          entries — edit or delete any of them below.
        </p>
        <div className="flex gap-3 items-end">
          <GlassInput
            label="Steps"
            type="number"
            inputMode="numeric"
            min={1}
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
            {saving ? 'Adding…' : 'Add Entry'}
          </GlassButton>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </GlassCard>

      {/* ── Entries List ── */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">
            Entries for {formatDateNavLabel(selectedDate)}
          </h2>
          <span className="text-white/40 text-xs">
            {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {logsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">
            No entries yet for this day.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {logs.map((log) => {
              const isEditing = editingLogId === log.id;
              return (
                <li
                  key={log.id}
                  className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  {/* Time */}
                  <span className="text-xs text-white/40 tabular-nums w-16 shrink-0">
                    {formatLogTime(log.logged_at)}
                  </span>

                  {/* Steps value (editable) */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={100}
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEditingLog();
                            if (e.key === 'Escape') cancelEditingLog();
                          }}
                          autoFocus
                          className="w-24 px-2 py-1 rounded-lg bg-white/[0.08] border border-indigo-400/60 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
                        />
                        <span className="text-white/40 text-xs">steps</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-white font-semibold">
                          {log.steps.toLocaleString()}
                        </span>
                        <span className="text-white/40 text-xs">steps</span>
                        {log.note && (
                          <span className="text-white/30 text-xs truncate ml-2">
                            — {log.note}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={commitEditingLog}
                          disabled={editingSaving}
                          aria-label="Save"
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditingLog}
                          disabled={editingSaving}
                          aria-label="Cancel"
                          className="p-1.5 rounded-lg text-white/40 hover:bg-white/5 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEditingLog(log)}
                          aria-label="Edit"
                          className="p-1.5 rounded-lg text-white/30 hover:text-indigo-300 hover:bg-indigo-400/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          disabled={deletingId === log.id}
                          aria-label="Delete"
                          className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
              <Bar
                dataKey="steps"
                radius={[6, 6, 0, 0]}
                onClick={(entry: any) => {
                  if (entry?.date) setSelectedDate(entry.date);
                }}
                style={{ cursor: 'pointer' }}
              >
                {weekData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isSelected
                        ? '#a78bfa'            // selected day — brighter indigo
                        : entry.isToday
                        ? '#818cf8'            // today (when not selected)
                        : entry.steps >= goal
                        ? '#34d399'            // over goal
                        : 'rgba(129,140,248,0.35)'
                    }
                    stroke={entry.isSelected ? '#ffffff' : undefined}
                    strokeWidth={entry.isSelected ? 1.5 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex gap-4 mt-3 justify-end flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />
            <span className="text-white/40 text-xs">Selected</span>
          </div>
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
