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
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  Footprints,
  List,
  Calculator,
} from 'lucide-react';
import {
  GlassButton,
  GlassInput,
  GlassModal,
  CardShell,
  MicroLabel,
  MonoNum,
  ProgressBar,
} from '@/components/ui';
import {
  getSteps,
  getGoals,
  updateGoals,
  getStepLogs,
  createStepLog,
  updateStepLog,
  deleteStepLog,
} from '@/lib/api';
import type { StepEntry, StepLogEntry } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function subtractDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleString('en-CA').split(',')[0];
}

function formatDayShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatNavLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === subtractDays(1)) return 'Yesterday';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleString('en-CA').split(',')[0];
}

function formatLogTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

const DEFAULT_GOAL = 10000;

const QUICK_TIMES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

type Range = '7d' | '14d' | '30d';
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '14d': 14, '30d': 30 };

// ─── Step calculator ─────────────────────────────────────────────────────────

function StepCalculator({
  goal,
  onLog,
}: {
  goal: number;
  onLog: (steps: number, note: string) => Promise<void>;
}) {
  const [time, setTime] = useState('');
  const [speed, setSpeed] = useState('5.0');
  const [height, setHeight] = useState('183');
  const [saving, setSaving] = useState(false);

  const calculated = useMemo(() => {
    const t = parseFloat(time),
      s = parseFloat(speed),
      h = parseFloat(height);
    if (!(t > 0) || !(s > 0) || !(h > 0)) return 0;
    const distanceM = s * (t / 60) * 1000;
    const stepLengthM = (0.415 * h) / 100;
    return Math.round(distanceM / stepLengthM);
  }, [time, speed, height]);

  const goalPct =
    calculated > 0 ? Math.min(100, Math.round((calculated / goal) * 100)) : 0;

  function reset() {
    setTime('');
    setSpeed('5.0');
    setHeight('183');
  }

  async function handleLog() {
    if (calculated <= 0) return;
    setSaving(true);
    try {
      await onLog(calculated, `Calculator: ${time}min @ ${speed}km/h`);
      reset();
    } finally {
      setSaving(false);
    }
  }

  const heightPx = height ? (0.415 * parseFloat(height) || 0).toFixed(1) : '—';

  return (
    <CardShell
      title="Step calculator"
      icon={<Calculator style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
      hint={
        <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
          Estimate from a walk you didn&rsquo;t track
        </span>
      }
    >
      <div
        className="calc-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 24,
        }}
      >
        {/* LEFT — inputs */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-muted-foreground)',
              marginBottom: 8,
            }}
          >
            Quick time
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 6,
              marginBottom: 18,
            }}
          >
            {QUICK_TIMES.map((m) => {
              const active = time === String(m);
              return (
                <button
                  key={m}
                  onClick={() => setTime(String(m))}
                  className="cursor-pointer"
                  style={{
                    padding: '8px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    background: active
                      ? 'var(--color-primary)'
                      : 'var(--color-surface)',
                    color: active
                      ? 'var(--color-primary-foreground)'
                      : 'var(--color-muted-foreground)',
                    border:
                      '1px solid ' +
                      (active
                        ? 'var(--color-primary)'
                        : 'var(--color-border)'),
                    borderRadius: 4,
                  }}
                >
                  {m}m
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
            }}
          >
            <CalcField
              label="Walking time"
              suffix="min"
              value={time}
              onChange={setTime}
              placeholder="e.g. 30"
              step={0.5}
            />
            <CalcField
              label="Speed"
              suffix="km/h"
              value={speed}
              onChange={setSpeed}
              step={0.1}
            />
            <CalcField
              label="Your height"
              suffix="cm"
              value={height}
              onChange={setHeight}
              step={0.5}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-muted-foreground)',
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            Step length = 0.415 × height.{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-foreground)',
                fontWeight: 600,
              }}
            >
              {heightPx} cm
            </span>{' '}
            per step at your height.
          </div>
        </div>

        {/* RIGHT — result */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background:
              calculated > 0
                ? 'var(--color-badge-bg)'
                : 'var(--color-surface-warm)',
            border:
              '1px solid ' +
              (calculated > 0
                ? 'var(--color-primary)'
                : 'var(--color-border)'),
            borderRadius: 10,
            padding: 18,
            transition: 'background 160ms, border-color 160ms',
          }}
        >
          <MicroLabel>Estimated steps</MicroLabel>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 0',
            }}
          >
            {calculated > 0 ? (
              <MonoNum
                size={42}
                color="var(--color-primary)"
                style={{ letterSpacing: '-1.2px' }}
              >
                {calculated.toLocaleString()}
              </MonoNum>
            ) : (
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--color-muted-foreground)',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                Pick a time and a speed.
              </span>
            )}
          </div>
          {calculated > 0 ? (
            <>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-muted-foreground)',
                  marginBottom: 10,
                  textAlign: 'center',
                }}
              >
                Walking {time} min at {speed} km/h ·{' '}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-foreground)',
                    fontWeight: 600,
                  }}
                >
                  {goalPct}%
                </span>{' '}
                of today&rsquo;s goal
              </div>
              <ProgressBar
                value={calculated}
                max={goal}
                tone={calculated >= goal ? 'success' : 'primary'}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <GlassButton
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="flex-1"
                >
                  Reset
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={handleLog}
                  disabled={saving}
                  className="flex-1"
                >
                  <Plus style={{ width: 13, height: 13, strokeWidth: 2.25 }} />
                  {saving ? 'Logging…' : 'Log to today'}
                </GlassButton>
              </div>
            </>
          ) : (
            <GlassButton
              variant="outline"
              size="sm"
              onClick={reset}
              disabled
              className="flex-1"
            >
              Reset
            </GlassButton>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.calc-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </CardShell>
  );
}

function CalcField({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  step = 1,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: number;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-muted-foreground)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '8px 40px 8px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 600,
            textAlign: 'right',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-foreground)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
          }}
        >
          {suffix}
        </span>
      </div>
    </div>
  );
}

// ─── Hero stat tile ──────────────────────────────────────────────────────────

function HeroStat({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'primary';
}) {
  const color =
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'primary'
      ? 'var(--color-primary)'
      : 'var(--color-foreground)';
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
        padding: 18,
      }}
    >
      <MicroLabel>{label}</MicroLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          marginTop: 6,
        }}
      >
        <MonoNum size={28} color={color}>
          {value}
        </MonoNum>
        {unit && (
          <span style={{ fontSize: 13, color: 'var(--color-muted-foreground)' }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '8px 12px',
        boxShadow: 'var(--shadow-deep)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-muted-foreground)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-primary)',
        }}
      >
        {payload[0].value.toLocaleString()} steps
      </div>
    </div>
  );
}

// ─── Log steps modal ─────────────────────────────────────────────────────────

function LogStepsModal({
  isOpen,
  onClose,
  date,
  onLogged,
}: {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  onLogged: () => void;
}) {
  const [steps, setSteps] = useState('');
  const [logDate, setLogDate] = useState(date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLogDate(date);
      setSteps('');
      setError('');
    }
  }, [isOpen, date]);

  async function handleLog() {
    const v = parseInt(steps, 10);
    if (isNaN(v) || v <= 0) return;
    setSaving(true);
    setError('');
    try {
      await createStepLog({ date: logDate, steps: v });
      onLogged();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to log steps');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Log steps" size="sm">
      <div className="space-y-4">
        <GlassInput
          label="Date"
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
        />
        <GlassInput
          label="Steps"
          type="number"
          inputMode="numeric"
          min={1}
          step={100}
          placeholder="e.g. 3000"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
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
        <div style={{ display: 'flex', gap: 8 }}>
          <GlassButton
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleLog}
            disabled={saving || !steps}
          >
            {saving ? 'Logging…' : 'Log steps'}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StepsPage() {
  const [entries, setEntries] = useState<StepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showDateInput, setShowDateInput] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState<Range>('14d');
  const [goal, setGoal] = useState<number>(DEFAULT_GOAL);
  const [logs, setLogs] = useState<StepLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  // Load goals
  useEffect(() => {
    getGoals()
      .then((g) => {
        if (g.steps) setGoal(g.steps);
      })
      .catch(() => {});
  }, []);

  const today = todayISO();
  const isSelectedToday = selectedDate === today;

  // Load enough history to cover today + the chart's range.
  const rangeStart = useMemo(() => subtractDays(30), []);

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

  useEffect(() => {
    loadData();
  }, [loadData]);
  useSocketEvent('steps-updated', loadData);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      setLogs(await getStepLogs(selectedDate));
    } catch {
      setLogs([]);
    }
    setLogsLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);
  useSocketEvent('steps-updated', loadLogs);

  useEffect(() => {
    if (showDateInput && dateInputRef.current) {
      dateInputRef.current.focus();
      dateInputRef.current.showPicker?.();
    }
  }, [showDateInput]);

  // Derived stats
  const todayEntry = useMemo(
    () => entries.find((e) => e.date === today),
    [entries, today]
  );
  const todaySteps = todayEntry?.steps ?? 0;
  const selectedEntry = useMemo(
    () => entries.find((e) => e.date === selectedDate),
    [entries, selectedDate]
  );

  const last7 = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const iso = subtractDays(6 - i);
        return entries.find((e) => e.date === iso)?.steps ?? 0;
      }),
    [entries]
  );
  const avg7 =
    last7.reduce((a, s) => a + s, 0) / Math.max(1, last7.filter((s) => s > 0).length);
  const hitDays = last7.filter((s) => s >= goal).length;
  const best = useMemo(
    () => entries.reduce((m, s) => (s.steps > (m?.steps ?? 0) ? s : m), entries[0] ?? null),
    [entries]
  );

  // Range data for the bar chart (relative to today)
  const days = RANGE_DAYS[range];
  const chartData = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const iso = subtractDays(days - 1 - i);
        const entry = entries.find((e) => e.date === iso);
        return {
          day: days <= 14 ? formatDayShort(iso) : new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
          date: iso,
          steps: entry?.steps ?? 0,
          isToday: iso === today,
        };
      }),
    [entries, days, today]
  );

  // Last N days list (newest first)
  const recent = useMemo(() => {
    return [...entries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14);
  }, [entries]);

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

  async function handleCalcLog(stepsToAdd: number, note: string) {
    await createStepLog({ date: selectedDate, steps: stepsToAdd, note });
  }

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
    const v = parseInt(editingDraft, 10);
    if (isNaN(v) || v <= 0) {
      setError('Steps must be a positive whole number');
      return;
    }
    setError(null);
    setEditingSaving(true);
    try {
      const updated = await updateStepLog(editingLogId, { steps: v });
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

  // ─── Render ────────────────────────────────────────────────────────────────

  const dailyTotal = logs.reduce((a, l) => a + l.steps, 0) || selectedEntry?.steps || 0;

  return (
    <main
      className="page-mount"
      style={{
        maxWidth: 1120,
        margin: '0 auto',
        padding: '24px 16px 80px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.4px',
              margin: 0,
              color: 'var(--color-foreground)',
            }}
          >
            Steps
          </h1>
          <div
            style={{
              color: 'var(--color-muted-foreground)',
              marginTop: 4,
              fontSize: 14,
            }}
          >
            Daily steps. Your goal is{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-foreground)',
                fontWeight: 600,
              }}
            >
              {goal.toLocaleString()}
            </span>
            .
          </div>
        </div>
        <GlassButton variant="primary" size="sm" onClick={() => setLogOpen(true)}>
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Log steps
        </GlassButton>
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

      {/* Hero stats */}
      <div
        className="steps-hero"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 12,
          marginTop: 24,
        }}
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 86, borderRadius: 12 }}
            />
          ))
        ) : (
          <>
            <HeroStat
              label="Today (so far)"
              value={todaySteps.toLocaleString()}
              unit="steps"
              hint={Math.round((todaySteps / goal) * 100) + '% of goal'}
              tone={todaySteps >= goal ? 'success' : 'primary'}
            />
            <HeroStat
              label="7-day average"
              value={Math.round(avg7).toLocaleString()}
              hint="steps per day"
            />
            <HeroStat
              label="Goal hit"
              value={`${hitDays}/7`}
              hint="this week"
              tone={hitDays >= 5 ? 'success' : 'warning'}
            />
            <HeroStat
              label="Best day"
              value={best ? best.steps.toLocaleString() : '—'}
              hint={best ? formatDateFull(best.date) : ''}
            />
          </>
        )}
      </div>

      {/* Step calculator */}
      <div style={{ marginTop: 16 }}>
        <StepCalculator goal={goal} onLog={handleCalcLog} />
      </div>

      {/* Date nav + day total */}
      <div
        style={{
          marginTop: 16,
          padding: '14px 16px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
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
            disabled={isSelectedToday}
          >
            <ChevronRight style={{ width: 14, height: 14 }} />
          </GlassButton>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDateInput(true)}
              className="cursor-pointer"
              style={{
                margin: '0 4px',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.25px',
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
              {formatNavLabel(selectedDate)}
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
                value={selectedDate}
                max={today}
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <MonoNum size={20}>{dailyTotal.toLocaleString()}</MonoNum>
          <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
            steps
          </span>
        </div>
      </div>

      {/* Chart + recent list */}
      <div
        className="steps-grid"
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
        }}
      >
        <CardShell
          title="Daily steps"
          icon={<Footprints style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          hint={
            <div style={{ display: 'flex', gap: 4 }}>
              {(['7d', '14d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className="cursor-pointer"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      range === r
                        ? 'var(--color-foreground)'
                        : 'transparent',
                    color:
                      range === r
                        ? 'var(--color-background)'
                        : 'var(--color-muted-foreground)',
                    border:
                      '1px solid ' +
                      (range === r
                        ? 'var(--color-foreground)'
                        : 'var(--color-border)'),
                    fontFamily: 'inherit',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <div className="skeleton" style={{ height: 220, borderRadius: 8 }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v)
                  }
                />
                <Tooltip
                  content={<BarTooltip />}
                  cursor={{ fill: 'var(--color-surface-warm)' }}
                />
                <Bar
                  dataKey="steps"
                  radius={[3, 3, 0, 0]}
                  onClick={(entry: any) => {
                    if (entry?.date) setSelectedDate(entry.date);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={'cell-' + index}
                      fill={
                        entry.isToday
                          ? 'var(--color-primary-hover)'
                          : entry.steps >= goal
                          ? 'var(--color-success)'
                          : 'var(--color-primary)'
                      }
                      opacity={entry.steps > 0 ? 1 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div
            style={{
              display: 'flex',
              gap: 14,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--color-border)',
              fontSize: 11,
              color: 'var(--color-muted-foreground)',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  background: 'var(--color-primary)',
                  borderRadius: 2,
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              Under goal
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  background: 'var(--color-success)',
                  borderRadius: 2,
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              Goal reached
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  background: 'var(--color-primary-hover)',
                  borderRadius: 2,
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              Today
            </span>
          </div>
        </CardShell>

        <CardShell
          title="Last 14 days"
          icon={<List style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        >
          {loading ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
          ) : recent.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                textAlign: 'center',
                padding: '16px 0',
              }}
            >
              Nothing logged yet.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              {recent.map((s) => {
                const pct = Math.min(1, s.steps / goal);
                const isToday = s.date === today;
                return (
                  <li
                    key={s.date}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-muted-foreground)',
                        width: 42,
                        fontWeight: isToday ? 700 : 500,
                      }}
                    >
                      {isToday ? 'Today' : formatDayShort(s.date)}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 9999,
                        background: 'var(--color-surface-warm)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: pct * 100 + '%',
                          background:
                            pct >= 1
                              ? 'var(--color-success)'
                              : 'var(--color-primary)',
                          borderRadius: 9999,
                        }}
                      />
                    </div>
                    <MonoNum size={12}>
                      {(s.steps / 1000).toFixed(1)}k
                    </MonoNum>
                  </li>
                );
              })}
            </ul>
          )}
        </CardShell>
      </div>

      {/* Today's individual log entries */}
      <div style={{ marginTop: 16 }}>
        <CardShell
          title={'Entries for ' + formatNavLabel(selectedDate)}
          hint={
            <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </span>
          }
        >
          {logsLoading ? (
            <div
              className="skeleton"
              style={{ height: 64, borderRadius: 8 }}
            />
          ) : logs.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                textAlign: 'center',
                padding: '16px 0',
              }}
            >
              No entries yet for this day.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {logs.map((log) => {
                const isEditing = editingLogId === log.id;
                return (
                  <li
                    key={log.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-muted-foreground)',
                        width: 64,
                      }}
                    >
                      {formatLogTime(log.logged_at)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={100}
                            value={editingDraft}
                            onChange={(e) =>
                              setEditingDraft(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditingLog();
                              if (e.key === 'Escape') cancelEditingLog();
                            }}
                            autoFocus
                            style={{
                              width: 100,
                              padding: '4px 8px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 14,
                              fontWeight: 600,
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-primary)',
                              borderRadius: 4,
                              color: 'var(--color-foreground)',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--color-muted-foreground)',
                            }}
                          >
                            steps
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 6,
                          }}
                        >
                          <MonoNum size={14}>
                            {log.steps.toLocaleString()}
                          </MonoNum>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--color-muted-foreground)',
                            }}
                          >
                            steps
                          </span>
                          {log.note && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--color-muted-foreground)',
                                marginLeft: 8,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              — {log.note}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={commitEditingLog}
                            disabled={editingSaving}
                            className="cursor-pointer"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--color-success)',
                              padding: 4,
                              borderRadius: 4,
                            }}
                          >
                            <Check style={{ width: 14, height: 14 }} />
                          </button>
                          <button
                            onClick={cancelEditingLog}
                            className="cursor-pointer"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--color-muted-foreground)',
                              padding: 4,
                              borderRadius: 4,
                            }}
                          >
                            <X style={{ width: 14, height: 14 }} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditingLog(log)}
                            className="cursor-pointer"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--color-muted-foreground)',
                              padding: 4,
                              borderRadius: 4,
                            }}
                            aria-label="Edit"
                          >
                            <Pencil
                              style={{ width: 13, height: 13, strokeWidth: 1.75 }}
                            />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            disabled={deletingId === log.id}
                            className="cursor-pointer"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--color-muted-foreground)',
                              padding: 4,
                              borderRadius: 4,
                            }}
                            aria-label="Delete"
                          >
                            <Trash2
                              style={{ width: 13, height: 13, strokeWidth: 1.75 }}
                            />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardShell>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.steps-hero) {
            grid-template-columns: 1fr 1fr !important;
          }
          :global(.steps-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <LogStepsModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        date={selectedDate}
        onLogged={() => {
          loadData();
          loadLogs();
        }}
      />
    </main>
  );
}
