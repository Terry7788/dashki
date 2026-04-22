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
  Label,
  ResponsiveContainer,
} from 'recharts';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui';
import { getWeightEntries, addWeightEntry, getGoals } from '@/lib/api';
import type { WeightEntry } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { Scale, Trash2, Target } from 'lucide-react';

// ─── Inline API helper ────────────────────────────────────────────────────────

const BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')) ||
  'http://localhost:4000';

async function deleteWeightEntry(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/weight/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  // Use en-CA locale for YYYY-MM-DD in local time (not UTC like toISOString())
  return new Date().toLocaleString('en-CA').split(',')[0];
}

function formatDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

type Range = '30' | '90' | 'all';

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="backdrop-blur-xl bg-black/70 border border-white/15 rounded-2xl px-4 py-3 shadow-xl">
      <p className="text-white/60 text-xs mb-1">{label}</p>
      <p className="text-indigo-300 font-semibold text-sm">
        {payload[0].value} kg
      </p>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="flex-1 min-w-0">
      <p className="text-white/50 text-xs font-medium mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
    </GlassCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WeightPage() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('30');
  const [date, setDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState('');
  const [logging, setLogging] = useState(false);

  // Weight goal — fetched from /api/goals so it's editable in Settings.
  // null when the user hasn't set one yet.
  const [goalWeight, setGoalWeight] = useState<number | null>(null);

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
    } catch (_) {
      // silent — chart just won't show the line
    }
  }, []);

  useEffect(() => {
    loadEntries();
    loadGoals();
  }, [loadEntries, loadGoals]);

  useSocketEvent('weight-updated', loadEntries);
  useSocketEvent('weight-deleted', loadEntries);
  useSocketEvent('goals-updated', loadGoals);

  // ── Derived stats ──
  const stats = useMemo(() => {
    if (!entries.length) return null;
    const weights = entries.map((e) => e.weight_kg);
    const current = entries[entries.length - 1].weight_kg;
    const lowest = Math.min(...weights);
    const highest = Math.max(...weights);
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
    return {
      current: `${current.toFixed(1)} kg`,
      lowest: `${lowest.toFixed(1)} kg`,
      highest: `${highest.toFixed(1)} kg`,
      avg: `${avg.toFixed(1)} kg`,
    };
  }, [entries]);

  // ── Chart data filtered by range ──
  const chartData = useMemo(() => {
    const today = new Date();
    const cutoff =
      range === 'all'
        ? null
        : new Date(today.getTime() - Number(range) * 86400000);

    const filtered = cutoff
      ? entries.filter((e) => new Date(e.date + 'T00:00:00') >= cutoff)
      : entries;

    return filtered.map((e) => ({
      date: formatDateShort(e.date),
      weight: e.weight_kg,
    }));
  }, [entries, range]);

  // ── Recent 10 entries (newest first) ──
  const recentEntries = useMemo(
    () => [...entries].reverse().slice(0, 10),
    [entries]
  );

  const handleLog = async () => {
    const kg = parseFloat(weightKg);
    if (isNaN(kg) || kg <= 0) return;
    setLogging(true);
    try {
      const entry = await addWeightEntry({ date, weight_kg: kg });
      setEntries((prev) => {
        const next = prev.filter((e) => e.date !== entry.date);
        return [...next, entry].sort((a, b) => a.date.localeCompare(b.date));
      });
      setWeightKg('');
    } catch (e: any) {
      setError(e.message || 'Failed to log weight');
    }
    setLogging(false);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteWeightEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {}
  };

  const ranges: { label: string; value: Range }[] = [
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: 'All time', value: 'all' },
  ];

  // ── Y axis domain with padding ──
  // Includes the goal weight in the calculation so the red goal line is
  // always visible on the chart, even when the user is far from it.
  const yDomain = useMemo((): [number | string, number | string] => {
    if (!chartData.length) return ['auto', 'auto'];
    const values = chartData.map((d) => d.weight);
    if (goalWeight !== null) values.push(goalWeight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.2, 1);
    return [
      parseFloat((min - pad).toFixed(1)),
      parseFloat((max + pad).toFixed(1)),
    ];
  }, [chartData, goalWeight]);

  // ── Goal proximity (for header chip) ──
  const goalProximity = useMemo(() => {
    if (goalWeight === null || !entries.length) return null;
    const current = entries[entries.length - 1].weight_kg;
    const diff = current - goalWeight;
    return {
      diff: Math.abs(diff),
      direction: diff > 0 ? 'above' : diff < 0 ? 'below' : 'on',
    };
  }, [entries, goalWeight]);

  return (
    <div className="px-4 md:px-6 py-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-white">Weight</h1>

      {/* ── Stats row ── */}
      {loading ? (
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton flex-1 h-20 rounded-3xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="flex gap-3 flex-wrap sm:flex-nowrap">
          <StatCard label="Current" value={stats.current} />
          <StatCard label="Lowest" value={stats.lowest} />
          <StatCard label="Highest" value={stats.highest} />
          <StatCard label="Average" value={stats.avg} />
        </div>
      ) : (
        <GlassCard>
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-indigo-400" />
            <p className="text-white/50 text-sm">No weight entries yet. Log your first entry below.</p>
          </div>
        </GlassCard>
      )}

      {/* ── Chart ── */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-white font-semibold">Weight Over Time</h2>
            {goalWeight !== null && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-400/30">
                <Target className="w-3 h-3 text-red-400" />
                <span className="text-xs text-red-300 font-medium">
                  Goal {goalWeight.toFixed(1)} kg
                </span>
                {goalProximity && goalProximity.direction !== 'on' && (
                  <span className="text-[10px] text-red-300/60">
                    · {goalProximity.diff.toFixed(1)} kg {goalProximity.direction}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            {ranges.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  range === r.value
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="skeleton h-64 rounded-2xl" />
        ) : chartData.length < 2 ? (
          <div className="h-64 flex items-center justify-center text-white/40 text-sm">
            Log at least two entries to see a chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Goal line — dashed red horizontal across the chart */}
              {goalWeight !== null && (
                <ReferenceLine
                  y={goalWeight}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  ifOverflow="extendDomain"
                >
                  <Label
                    value={`Goal ${goalWeight.toFixed(1)} kg`}
                    position="insideTopRight"
                    fill="#ef4444"
                    fontSize={11}
                    fontWeight={600}
                  />
                </ReferenceLine>
              )}
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#818cf8"
                strokeWidth={2.5}
                dot={{ fill: '#818cf8', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#818cf8', stroke: 'rgba(129,140,248,0.3)', strokeWidth: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </GlassCard>

      {/* ── Log form ── */}
      <GlassCard>
        <h2 className="text-white font-semibold mb-4">Log Weight</h2>
        <div className="flex gap-3 flex-wrap sm:flex-nowrap items-end">
          <GlassInput
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-44"
          />
          <GlassInput
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            placeholder="e.g. 75.5"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="w-full sm:w-40"
          />
          <GlassButton
            variant="primary"
            onClick={handleLog}
            disabled={logging || !weightKg}
            className="flex-shrink-0"
          >
            {logging ? 'Logging…' : 'Log Weight'}
          </GlassButton>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </GlassCard>

      {/* ── Recent entries ── */}
      {recentEntries.length > 0 && (
        <GlassCard>
          <h2 className="text-white font-semibold mb-4">Recent Entries</h2>
          <div className="space-y-2">
            {recentEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] transition-colors group"
              >
                <div>
                  <p className="text-white text-sm font-medium">{entry.weight_kg.toFixed(1)} kg</p>
                  <p className="text-white/40 text-xs mt-0.5">{formatDateFull(entry.date)}</p>
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all duration-150"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
