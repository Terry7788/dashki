// Mobile weight page — port of web/src/app/weight/page.tsx (~1060 lines).
// Scoped to ~400 lines: latest weight + sparkline trend + entry list + add/delete.
// Skipped from web: recharts complex chart, full WeightJourney TDEE card
// (filed for later if needed — Sparkline + delta carries most of the value).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GlassButton,
  GlassInput,
  GlassModal,
  MicroLabel,
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
import { FoldHead, FoldPager, paged } from '../components/Fold';

type Range = '14d' | '30d' | '60d' | '90d' | 'all';

const RANGE_DAYS: Record<Range, number | null> = {
  '14d': 14,
  '30d': 30,
  '60d': 60,
  '90d': 90,
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
  const [range, setRange] = useState<Range>('all');
  const [, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(toISODate(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<WeightEntry | null>(null);
  const [page, setPage] = useState(0);

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


  // Stats
  const min = sparkData.length ? Math.min(...sparkData) : null;
  const max = sparkData.length ? Math.max(...sparkData) : null;

  // Goal delta
  const goalDelta =
    latest && goals.weight_kg
      ? Number((latest.weight_kg - goals.weight_kg).toFixed(1))
      : null;

  const rows = paged(entries, page, 8);
  const allMin = entries.length ? Math.min(...entries.map((e) => e.weight_kg)) : 0;
  const allMax = entries.length ? Math.max(...entries.map((e) => e.weight_kg)) : 0;
  const lastChange = entries.length > 1 ? entries[0].weight_kg - entries[1].weight_kg : null;

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
    <>
      <main className="fd-page">
        <FoldHead
          title="Weight"
          sub={<><span className="fd-wide">{entries.length} entries{entries.length ? ` since ${formatDateShort(entries[entries.length - 1].date)}` : ''}</span><span className="fd-narrow">{goalDelta !== null ? `${goalDelta.toFixed(1)} kg to your ${goals.weight_kg} kg goal` : ''}</span></>}
          right={<button type="button" className="fd-btn primary" onClick={() => { setDateInput(toISODate(new Date())); setError(null); setAddOpen(true); }}><span className="fd-wide">+ Log weight</span><span className="fd-narrow">+ Log</span></button>}
        />
        <div className="fd-grid3 fd-wide" style={{ flex: 'none' }}>
          <section className="fd-panel" style={{ gap: 1 }}><span className="fd-mute" style={{ fontSize: 12 }}>Latest{latest ? ` · ${formatDateShort(latest.date)}` : ''}</span><b className="fd-mono" style={{ fontSize: 24 }}>{latest ? `${latest.weight_kg.toFixed(1)} kg` : '—'}</b><span style={{ fontSize: 12, color: lastChange !== null && lastChange <= 0 ? '#55B97A' : '#A8A39B' }}>{lastChange !== null ? `${lastChange <= 0 ? '↓' : '↑'} ${Math.abs(lastChange).toFixed(1)} kg since ${formatDateShort(entries[1].date)}` : ' '}</span></section>
          <section className="fd-panel" style={{ gap: 1 }}><span className="fd-mute" style={{ fontSize: 12 }}>Goal</span><b className="fd-mono" style={{ fontSize: 24 }}>{goals.weight_kg ? `${goals.weight_kg.toFixed(1)} kg` : '—'}</b><span className="fd-mute" style={{ fontSize: 12 }}>{goalDelta !== null ? `${goalDelta.toFixed(1)} kg to go` : ' '}</span></section>
          <section className="fd-panel" style={{ gap: 1 }}><span className="fd-mute" style={{ fontSize: 12 }}>Lowest logged</span><b className="fd-mono" style={{ fontSize: 24 }}>{entries.length ? `${allMin.toFixed(1)} kg` : '—'}</b><span className="fd-mute" style={{ fontSize: 12 }}>{entries.length ? `Highest ${allMax.toFixed(1)} kg` : ' '}</span></section>
        </div>
        <div className="fd-2-1">
          <section className="fd-panel">
            <b className="fd-mono fd-narrow" style={{ fontSize: 32 }}>{latest ? `${latest.weight_kg.toFixed(1)} kg` : '—'}</b>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}><b className="fd-title fd-wide" style={{ fontSize: 15 }}>Trend</b><div className="fd-chips">
              {(['30d', '90d', 'all'] as Range[]).map((r) => <button key={r} type="button" className={`fd-chip${range === r ? ' on' : ''}`} onClick={() => setRange(r)}>{r === '30d' ? '1M' : r === '90d' ? '3M' : 'All'}</button>)}
            </div></div>
            <svg role="img" aria-label="Weight trend" viewBox="0 0 600 200" preserveAspectRatio="none" style={{ width: '100%', flex: 1, minHeight: 150, display: 'block' }}>
              {sparkData.length > 1 && <polyline fill="none" stroke="#2F7FE6" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={sparkData.map((v, i) => `${(i / (sparkData.length - 1)) * 600},${190 - ((v - (min ?? v)) / ((max ?? v) - (min ?? v) || 1)) * 180}`).join(' ')} />}
            </svg>
          </section>
          <section className="fd-panel" style={{ overflow: 'hidden' }}>
            <b className="fd-title" style={{ fontSize: 15 }}>Recent</b>
            <div className="fd-list">
              {rows.slice.map((e) => (
                <button key={e.id} type="button" className="fd-row fd-tap" aria-label={`Delete weight on ${formatDateFull(e.date)}`} onClick={() => setConfirmDelete(e)}><span style={{ fontSize: 13 }}>{new Date(e.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span><b className="fd-mono" style={{ fontSize: 13 }}>{e.weight_kg.toFixed(1)}</b></button>
              ))}
            </div>
            <FoldPager page={rows.page} pages={rows.pages} total={entries.length} from={rows.from} to={rows.to} onPage={setPage} />
          </section>
        </div>
      </main>


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
    </>
  );
}
