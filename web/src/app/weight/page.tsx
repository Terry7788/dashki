'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import {
  GlassButton,
  GlassInput,
  GlassModal,
  CardShell,
  MicroLabel,
  MonoNum,
  Pill,
} from '@/components/ui';
import {
  getWeightEntries,
  addWeightEntry,
  getGoals,
  getWeightJourney,
} from '@/lib/api';
import type { WeightEntry, WeightJourney } from '@/lib/types';
import { JourneyCard } from '@/components/JourneyCard';
import { useSocketEvent } from '@/lib/useSocketEvent';
import {
  TrendingDown,
  List,
  Trash2,
  Plus,
  Calendar as CalendarIcon,
  Target,
} from 'lucide-react';

const BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')) ||
  'http://localhost:4000';

async function deleteWeightEntry(id: number): Promise<void> {
  const res = await fetch(BASE_URL + '/api/weight/' + id, { method: 'DELETE' });
  if (!res.ok) throw new Error('API error ' + res.status);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function formatDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

type Range = '14d' | '30d' | '60d' | 'all';

const RANGES: { label: string; value: Range; days: number | null }[] = [
  { label: '14d', value: '14d', days: 14 },
  { label: '30d', value: '30d', days: 30 },
  { label: '60d', value: '60d', days: 60 },
  { label: 'All', value: 'all', days: null },
];

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload.find((p: any) => p.value != null);
  if (!point) return null;
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
        {point.value} kg
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
        <MonoNum size={30} color={color}>
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

// ─── Log weight modal ────────────────────────────────────────────────────────

function LogWeightModal({
  isOpen,
  onClose,
  date,
  prevWeight,
  goalWeight,
  streak,
  onLogged,
}: {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  prevWeight: number | null;
  goalWeight: number | null;
  streak: number;
  onLogged: (entry: WeightEntry) => void;
}) {
  const [weight, setWeight] = useState('');
  const [logDate, setLogDate] = useState(date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLogDate(date);
      setWeight('');
      setError('');
      setPickerOpen(false);
    }
  }, [isOpen, date]);

  async function handleLog() {
    const kg = parseFloat(weight);
    if (isNaN(kg) || kg <= 0) return;
    setSaving(true);
    setError('');
    try {
      const entry = await addWeightEntry({ date: logDate, weight_kg: kg });
      onLogged(entry);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to log weight');
    } finally {
      setSaving(false);
    }
  }

  const today = todayISO();

  const kgNum = parseFloat(weight);
  const diff =
    !isNaN(kgNum) && prevWeight != null
      ? Math.round((kgNum - prevWeight) * 10) / 10
      : null;
  const toGoal =
    !isNaN(kgNum) && goalWeight != null
      ? Math.round((kgNum - goalWeight) * 10) / 10
      : null;

  const subtitle = new Date(logDate + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Log weight"
      subtitle={subtitle}
      size="sm"
      footer={
        <>
          <GlassButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleLog}
            disabled={saving || !weight}
          >
            {saving ? 'Saving…' : 'Save'}
          </GlassButton>
        </>
      }
    >
      <div
        style={{
          padding: 4,
          /* Lock total body height so toggling the date picker / showing
             the diff hint doesn't shift the modal vertically. */
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Hero number input */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-muted-foreground)',
            marginBottom: 6,
          }}
        >
          Today&rsquo;s weight
        </div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="—"
            style={{
              width: '100%',
              padding: '16px 50px 16px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: '-1px',
              textAlign: 'right',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              color: 'var(--color-foreground)',
            }}
            autoFocus
          />
          <span
            style={{
              position: 'absolute',
              right: 18,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 14,
              color: 'var(--color-muted-foreground)',
              fontWeight: 600,
            }}
          >
            kg
          </span>
        </div>

        {/* Diff hint row — reserve fixed height so the modal doesn't grow
            when a value is entered. */}
        <div
          style={{
            height: 24,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
          }}
        >
          {diff !== null && prevWeight != null ? (
            <>
              <Pill
                tone={diff < 0 ? 'success' : diff > 0 ? 'warning' : 'neutral'}
                dot
              >
                {diff > 0 ? '+' : ''}
                {diff} kg
              </Pill>
              <span>from previous ({prevWeight.toFixed(1)} kg)</span>
            </>
          ) : (
            <span style={{ color: 'var(--color-placeholder)' }}>
              Type a weight to see the change from last log.
            </span>
          )}
        </div>

        {/* Date adjust */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-muted-foreground)',
            marginBottom: 6,
          }}
        >
          Date
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => {
              setLogDate(today);
              setPickerOpen(false);
            }}
            className="cursor-pointer"
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: logDate === today ? 600 : 500,
              background:
                logDate === today
                  ? 'var(--color-primary)'
                  : 'var(--color-surface)',
              color:
                logDate === today
                  ? 'var(--color-primary-foreground)'
                  : 'var(--color-muted-foreground)',
              border: logDate === today ? '0' : '1px solid var(--color-border)',
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="cursor-pointer"
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 500,
              background:
                logDate !== today
                  ? 'var(--color-primary)'
                  : 'var(--color-surface)',
              color:
                logDate !== today
                  ? 'var(--color-primary-foreground)'
                  : 'var(--color-muted-foreground)',
              border:
                logDate !== today ? '0' : '1px solid var(--color-border)',
              borderRadius: 6,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <CalendarIcon style={{ width: 12, height: 12, strokeWidth: 2 }} />
            {logDate !== today
              ? new Date(logDate + 'T00:00:00').toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                })
              : 'Pick a date'}
          </button>
        </div>
        {/* Date picker — overlay (absolutely positioned) so the modal body
            height stays fixed whether it's open or closed. */}
        <div style={{ position: 'relative', height: pickerOpen ? 46 : 0 }}>
          {pickerOpen && (
            <input
              type="date"
              value={logDate}
              max={today}
              onChange={(e) => setLogDate(e.target.value)}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                padding: '8px 12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                fontSize: 14,
              }}
              autoFocus
            />
          )}
        </div>

        {/* Goal + streak — reserve enough space for the line whether
            present or not. */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
            marginTop: pickerOpen ? 12 : 0,
            minHeight: 32,
          }}
        >
          {goalWeight != null && (
            <>
              Goal{' '}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-foreground)',
                  fontWeight: 600,
                }}
              >
                {goalWeight.toFixed(1)} kg
              </span>
              {toGoal != null && (
                <>
                  {' · '}
                  {Math.abs(toGoal).toFixed(1)} kg{' '}
                  {toGoal > 0 ? 'to go' : toGoal < 0 ? 'past' : 'reached'}
                </>
              )}
              {streak > 0 && ` · ${streak}-day logging streak.`}
            </>
          )}
        </div>

        {/* Error row reserved (slim, only flashes on error) */}
        {error && (
          <p
            style={{
              marginTop: 12,
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
      </div>
    </GlassModal>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WeightPage() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('30d');
  const [goalWeight, setGoalWeight] = useState<number | null>(null);
  const [journey, setJourney] = useState<WeightJourney | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWeightEntries();
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
      setEntries(sorted);
    } catch (e: any) {
      setError(e.message || 'Failed to load weight data');
    }
    setLoading(false);
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      const g = await getGoals();
      setGoalWeight(g.weight_kg ?? null);
    } catch {
      /* silent */
    }
  }, []);

  const loadJourney = useCallback(async () => {
    try {
      setJourney(await getWeightJourney());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    loadEntries();
    loadGoals();
    loadJourney();
  }, [loadEntries, loadGoals, loadJourney]);

  useSocketEvent('weight-updated', () => {
    loadEntries();
    loadJourney();
  });
  useSocketEvent('weight-deleted', () => {
    loadEntries();
    loadJourney();
  });
  useSocketEvent('goals-updated', () => {
    loadGoals();
    loadJourney();
  });

  function handleLogged(entry: WeightEntry) {
    setEntries((prev) => {
      const next = prev.filter((e) => e.date !== entry.date);
      return [...next, entry].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  async function handleDelete(id: number) {
    try {
      await deleteWeightEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      /* swallow */
    }
  }

  // Hero stats
  const last = entries[entries.length - 1];
  const windowDays =
    RANGES.find((r) => r.value === range)?.days ?? entries.length;
  const startEntry =
    windowDays && entries.length > windowDays
      ? entries[entries.length - windowDays - 1] ?? entries[0]
      : entries[0];
  const delta = last && startEntry ? last.weight_kg - startEntry.weight_kg : 0;
  const toGoal = last && goalWeight != null ? last.weight_kg - goalWeight : null;

  // Streak — count consecutive days from latest with a logged weight.
  const streak = useMemo(() => {
    if (!entries.length) return 0;
    const set = new Set(entries.map((e) => e.date));
    let count = 0;
    const cursor = new Date(last.date + 'T00:00:00');
    while (set.has(cursor.toLocaleString('en-CA').split(',')[0])) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [entries, last]);

  // Chart data filtered by range
  const chartData = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days ?? null;
    const cutoff = days
      ? new Date(Date.now() - days * 86400000)
      : null;
    return entries
      .filter((e) =>
        cutoff ? new Date(e.date + 'T00:00:00') >= cutoff : true
      )
      .map((e) => ({
        date: formatDateShort(e.date),
        weight: e.weight_kg,
      }));
  }, [entries, range]);

  const yDomain = useMemo((): [number | string, number | string] => {
    if (!chartData.length) return ['auto', 'auto'];
    const values = chartData.map((d) => d.weight);
    if (goalWeight != null) values.push(goalWeight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.2, 0.6);
    return [
      parseFloat((min - pad).toFixed(1)),
      parseFloat((max + pad).toFixed(1)),
    ];
  }, [chartData, goalWeight]);

  const recentEntries = useMemo(
    () => [...entries].reverse().slice(0, 12),
    [entries]
  );

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
            Weight
          </h1>
          <div
            style={{
              color: 'var(--color-muted-foreground)',
              marginTop: 4,
              fontSize: 14,
            }}
          >
            Trend over time.{' '}
            {goalWeight != null ? (
              <>
                Your goal is{' '}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-foreground)',
                    fontWeight: 600,
                  }}
                >
                  {goalWeight.toFixed(1)} kg
                </span>
                .
              </>
            ) : (
              'Set a goal in Settings.'
            )}
          </div>
        </div>
        <GlassButton variant="primary" size="sm" onClick={() => setLogOpen(true)}>
          <Plus style={{ width: 14, height: 14, strokeWidth: 2.25 }} />
          Log weight
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
        className="weight-hero"
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
        ) : last ? (
          <>
            <HeroStat
              label="Latest"
              value={last.weight_kg.toFixed(1)}
              unit="kg"
              hint={formatDateFull(last.date)}
            />
            <HeroStat
              label={'Change · ' + range}
              value={(delta > 0 ? '+' : '') + delta.toFixed(1)}
              unit="kg"
              tone={delta < 0 ? 'success' : delta > 0 ? 'warning' : 'neutral'}
              hint={
                startEntry && startEntry.date !== last.date
                  ? 'since ' + formatDateShort(startEntry.date)
                  : 'window'
              }
            />
            <HeroStat
              label="From goal"
              value={toGoal != null ? (toGoal > 0 ? '+' : '') + toGoal.toFixed(1) : '—'}
              unit={toGoal != null ? 'kg' : ''}
              tone={
                toGoal == null
                  ? 'neutral'
                  : Math.abs(toGoal) < 1
                  ? 'success'
                  : 'primary'
              }
              hint={goalWeight != null ? 'goal ' + goalWeight.toFixed(1) + ' kg' : 'no goal set'}
            />
            <HeroStat
              label="Streak"
              value={streak}
              unit={streak === 1 ? 'day' : 'days'}
              hint="logged in a row"
            />
          </>
        ) : (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: 32,
              textAlign: 'center',
              color: 'var(--color-muted-foreground)',
              background: 'var(--color-surface-warm)',
              border: '1px dashed var(--color-border)',
              borderRadius: 12,
            }}
          >
            No weight entries yet.{' '}
            <a
              onClick={() => setLogOpen(true)}
              style={{
                color: 'var(--color-link)',
                cursor: 'pointer',
              }}
            >
              Log your first.
            </a>
          </div>
        )}
      </div>

      <JourneyCard journey={journey} />

      {/* Chart + recent */}
      <div
        className="weight-grid"
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
        }}
      >
        <CardShell
          title="Trend"
          icon={<TrendingDown style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          hint={
            <div style={{ display: 'flex', gap: 4 }}>
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className="cursor-pointer"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      range === r.value
                        ? 'var(--color-foreground)'
                        : 'transparent',
                    color:
                      range === r.value
                        ? 'var(--color-background)'
                        : 'var(--color-muted-foreground)',
                    border:
                      '1px solid ' +
                      (range === r.value
                        ? 'var(--color-foreground)'
                        : 'var(--color-border)'),
                    fontFamily: 'inherit',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          {loading ? (
            <div
              className="skeleton"
              style={{ height: 220, borderRadius: 8 }}
            />
          ) : chartData.length < 2 ? (
            <div
              style={{
                height: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-muted-foreground)',
                fontSize: 13,
              }}
            >
              Log at least two entries to see a chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                {goalWeight != null && (
                  <ReferenceLine
                    y={goalWeight}
                    stroke="var(--color-success)"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-primary)', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: 'var(--color-primary)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardShell>

        <CardShell
          title="Recent entries"
          icon={<List style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        >
          <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div
              className="skeleton"
              style={{ height: 200, borderRadius: 8 }}
            />
          ) : recentEntries.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                textAlign: 'center',
                padding: '16px 0',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
              {recentEntries.map((entry, idx) => {
                const prev = recentEntries[idx + 1];
                const diff = prev ? entry.weight_kg - prev.weight_kg : null;
                return (
                  <li
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {entry.date === todayISO()
                          ? 'Today'
                          : formatDateFull(entry.date)}
                      </div>
                    </div>
                    <MonoNum size={14}>{entry.weight_kg.toFixed(1)}</MonoNum>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--color-muted-foreground)',
                      }}
                    >
                      kg
                    </span>
                    {diff !== null && diff !== 0 ? (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          fontWeight: 600,
                          minWidth: 38,
                          textAlign: 'right',
                          color:
                            diff < 0
                              ? 'var(--color-success)'
                              : 'var(--color-warning)',
                        }}
                      >
                        {diff > 0 ? '+' : ''}
                        {diff.toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ minWidth: 38 }} />
                    )}
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="cursor-pointer"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'var(--color-muted-foreground)',
                        padding: 4,
                        borderRadius: 4,
                      }}
                      aria-label="Delete entry"
                    >
                      <Trash2
                        style={{ width: 13, height: 13, strokeWidth: 1.75 }}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </CardShell>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.weight-hero) {
            grid-template-columns: 1fr 1fr !important;
          }
          :global(.weight-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <LogWeightModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        date={todayISO()}
        prevWeight={last?.weight_kg ?? null}
        goalWeight={goalWeight}
        streak={streak}
        onLogged={handleLogged}
      />
    </main>
  );
}
