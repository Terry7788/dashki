// Mobile weight page — port of web/src/app/weight/page.tsx (~1060 lines).
// Scoped to ~400 lines: latest weight + sparkline trend + entry list + add/delete.
// Skipped from web: recharts complex chart, full WeightJourney TDEE card
// (filed for later if needed — Sparkline + delta carries most of the value).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp, Plus, Trash2, Target, Scale } from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassModal,
  CardShell,
  Pill,
  MicroLabel,
  MonoNum,
  Sparkline,
  SegmentedControl,
  EmptyState,
} from '../components/ui';
import {
  getWeightEntries,
  addWeightEntry,
  deleteWeightEntry,
  getGoals,
  getLatestWeight,
} from '../lib/api';
import type { WeightEntry, Goals } from '../lib/types';
import { toISODate } from '../lib/nutrition';
import PageHeader from '../components/PageHeader';

type Range = '14d' | '30d' | '60d' | 'all';

const RANGE_DAYS: Record<Range, number | null> = {
  '14d': 14,
  '30d': 30,
  '60d': 60,
  all: null,
};

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

export default function WeightScreen() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [latest, setLatest] = useState<WeightEntry | null>(null);
  const [range, setRange] = useState<Range>('30d');
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(toISODate(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<WeightEntry | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesData, goalsData, latestData] = await Promise.allSettled([
        getWeightEntries({ limit: 365 }),
        getGoals(),
        getLatestWeight(),
      ]);
      if (entriesData.status === 'fulfilled') setEntries(entriesData.value);
      if (goalsData.status === 'fulfilled') setGoals(goalsData.value);
      if (latestData.status === 'fulfilled') setLatest(latestData.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Filter entries by range (entries are newest-first from API)
  const filteredEntries = useMemo(() => {
    if (range === 'all') return entries;
    const days = RANGE_DAYS[range];
    if (!days) return entries;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = toISODate(cutoff);
    return entries.filter((e) => e.date >= cutoffStr);
  }, [entries, range]);

  // Sparkline data — oldest to newest
  const sparkData = useMemo(() => {
    return [...filteredEntries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.weight_kg);
  }, [filteredEntries]);

  // Delta over the visible range
  const delta = useMemo(() => {
    if (sparkData.length < 2) return null;
    return Number((sparkData[sparkData.length - 1] - sparkData[0]).toFixed(1));
  }, [sparkData]);

  // Stats
  const min = sparkData.length ? Math.min(...sparkData) : null;
  const max = sparkData.length ? Math.max(...sparkData) : null;
  const avg =
    sparkData.length > 0
      ? Number(
          (sparkData.reduce((a, b) => a + b, 0) / sparkData.length).toFixed(1),
        )
      : null;

  // Goal delta
  const goalDelta =
    latest && goals.weight_kg
      ? Number((latest.weight_kg - goals.weight_kg).toFixed(1))
      : null;

  async function handleAddWeight() {
    if (!weightInput) return;
    const val = parseFloat(weightInput);
    if (!Number.isFinite(val) || val <= 0) {
      setError('Enter a valid weight');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addWeightEntry({ date: dateInput, weight_kg: val });
      setAddOpen(false);
      setWeightInput('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save weight');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: WeightEntry) {
    setSaving(true);
    try {
      await deleteWeightEntry(entry.id);
      await fetchAll();
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader
        title="Weight"
        subtitle={
          latest
            ? `Last logged: ${formatDateShort(latest.date)}`
            : 'No entries yet'
        }
        trailing={
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => {
              setDateInput(toISODate(new Date()));
              setWeightInput(latest ? latest.weight_kg.toString() : '');
              setAddOpen(true);
            }}
          >
            <Plus size={14} style={{ marginRight: 2 }} />
            Log
          </GlassButton>
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
        {/* Latest weight hero */}
        <GlassCard>
          <MicroLabel>
            <Scale size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
            Current
          </MicroLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginTop: 8,
            }}
          >
            {latest ? (
              <>
                <MonoNum size={36}>{latest.weight_kg.toFixed(1)}</MonoNum>
                <span style={{ color: 'var(--color-muted-foreground)', fontSize: 13 }}>
                  kg
                </span>
                {delta !== null && delta !== 0 && (
                  <Pill
                    tone={delta < 0 ? 'success' : 'warning'}
                    style={{ marginLeft: 'auto' }}
                  >
                    {delta < 0 ? (
                      <TrendingDown size={10} style={{ marginRight: 2 }} />
                    ) : (
                      <TrendingUp size={10} style={{ marginRight: 2 }} />
                    )}
                    {delta > 0 ? '+' : ''}
                    {delta} kg · {range}
                  </Pill>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--color-muted-foreground)', fontSize: 14 }}>
                Tap Log to record your first weight
              </span>
            )}
          </div>

          {/* Range selector */}
          <div style={{ marginTop: 14 }}>
            <SegmentedControl<Range>
              value={range}
              options={[
                { value: '14d', label: '14d' },
                { value: '30d', label: '30d' },
                { value: '60d', label: '60d' },
                { value: 'all', label: 'All' },
              ]}
              onChange={setRange}
            />
          </div>

          {/* Sparkline */}
          {sparkData.length > 1 ? (
            <div style={{ marginTop: 6 }}>
              <Sparkline
                data={sparkData}
                stroke="var(--color-primary)"
                height={64}
                fill
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--color-muted-foreground)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: 2,
                }}
              >
                <span>{min != null && `min ${min.toFixed(1)}`}</span>
                <span>{avg != null && `avg ${avg.toFixed(1)}`}</span>
                <span>{max != null && `max ${max.toFixed(1)}`}</span>
              </div>
            </div>
          ) : sparkData.length === 1 ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--color-muted-foreground)',
                textAlign: 'center',
              }}
            >
              Log more weights to see your trend
            </div>
          ) : null}
        </GlassCard>

        {/* Goal card */}
        {goals.weight_kg && latest && (
          <CardShell title="Goal" icon={<Target size={14} />}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}
            >
              <MonoNum size={20}>{goals.weight_kg.toFixed(1)}</MonoNum>
              <span style={{ color: 'var(--color-muted-foreground)', fontSize: 12 }}>
                kg target
              </span>
              {goalDelta !== null && (
                <Pill
                  tone={goalDelta <= 0 ? 'success' : 'medium'}
                  style={{ marginLeft: 'auto' }}
                >
                  {goalDelta > 0
                    ? `${goalDelta.toFixed(1)} kg to go`
                    : goalDelta < 0
                      ? `${Math.abs(goalDelta).toFixed(1)} kg under`
                      : 'At goal'}
                </Pill>
              )}
            </div>
          </CardShell>
        )}

        {/* Entries list */}
        <GlassCard padding={false}>
          <div
            style={{
              padding: '12px 14px',
              borderBottom:
                filteredEntries.length > 0
                  ? '1px solid var(--color-border)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <MicroLabel>Recent entries</MicroLabel>
            <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
              {filteredEntries.length} in {range}
            </span>
          </div>

          {loading ? (
            <div
              style={{
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ height: 44, borderRadius: 6 }}
                />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ padding: 14 }}>
              <EmptyState>No weights logged in this range yet.</EmptyState>
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: '4px 6px 6px 6px',
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {filteredEntries.map((entry, idx) => {
                const prev = filteredEntries[idx + 1];
                const entryDelta = prev
                  ? Number((entry.weight_kg - prev.weight_kg).toFixed(1))
                  : null;
                return (
                  <li key={entry.id}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 10px',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {formatDateFull(entry.date)}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 4,
                        }}
                      >
                        <MonoNum size={15}>{entry.weight_kg.toFixed(1)}</MonoNum>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--color-muted-foreground)',
                          }}
                        >
                          kg
                        </span>
                      </div>
                      {entryDelta !== null && entryDelta !== 0 && (
                        <Pill tone={entryDelta < 0 ? 'success' : 'warning'}>
                          {entryDelta > 0 ? '+' : ''}
                          {entryDelta.toFixed(1)}
                        </Pill>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(entry)}
                        aria-label="Delete entry"
                        className="cursor-pointer"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 4,
                          background: 'transparent',
                          border: 0,
                          color: 'var(--color-muted-foreground)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Add weight modal */}
      <GlassModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Log weight"
        size="sm"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleAddWeight}
              disabled={saving || !weightInput}
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
            step="0.1"
            min={0}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="75.5"
            autoComplete="off"
          />
          <div>
            <MicroLabel>Date</MicroLabel>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              max={toISODate(new Date())}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                fontSize: 14,
                marginTop: 6,
              }}
            />
          </div>
          {error && (
            <div
              style={{
                padding: '8px 10px',
                background: 'rgba(201,28,43,0.08)',
                border: '1px solid rgba(201,28,43,0.3)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--color-critical)',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </GlassModal>

      {/* Delete confirmation */}
      <GlassModal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this weight?"
        size="sm"
        leadingFooter={
          <GlassButton
            variant="danger"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            disabled={saving}
          >
            {saving ? 'Deleting…' : 'Delete'}
          </GlassButton>
        }
        footer={
          <GlassButton variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </GlassButton>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          {confirmDelete && (
            <>
              The {confirmDelete.weight_kg.toFixed(1)} kg entry on{' '}
              {formatDateFull(confirmDelete.date)} will be permanently removed.
            </>
          )}
        </p>
      </GlassModal>
    </div>
  );
}
