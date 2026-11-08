// Mobile steps page — port of web/src/app/steps/page.tsx (~1760 lines).
// Scoped to ~450 lines: date nav + daily total + week bars + log entries
// (multiple per day) + add/edit/delete.
// Skipped from web: recharts BarChart (replaced by inline div bars),
// goal-editing flow (lives in Settings + onboarding wizard now).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2,
} from 'lucide-react';
import {
  GlassButton,
  GlassInput,
  GlassModal,
} from '../components/ui';
import {
  getStepLogs,
  createStepLog,
  updateStepLog,
  deleteStepLog,
  getGoals,
  getSteps,
} from '../lib/api';
import type { StepLogEntry, Goals } from '../lib/types';
import { toISODate } from '../lib/nutrition';
import { FoldHead, FoldBar } from '../components/Fold';
import {
  HEALTH_NOTE,
  healthSupported,
  healthStatus,
  connectHealth,
  syncHealthSteps,
  onHealthSync,
  type HealthStatus,
} from '../lib/health';

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

function formatNavLabel(iso: string): string {
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function formatDayShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
  });
}

interface DaySummary {
  date: string;
  steps: number;
}

export default function StepsScreen() {
  const [date, setDate] = useState<Date>(new Date());
  const iso = toISODate(date);

  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [dayLogs, setDayLogs] = useState<StepLogEntry[]>([]);
  const [weekSummary, setWeekSummary] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<StepLogEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StepLogEntry | null>(null);

  // Form state
  const [stepsInput, setStepsInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Monday to Sunday of the selected day's week
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const week = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return toISODate(d);
      });
      const earliest = week[0];

      const [logsData, goalsData, weekData] = await Promise.allSettled([
        getStepLogs(iso),
        getGoals(),
        getSteps({ startDate: earliest, endDate: week[6] }),
      ]);
      if (logsData.status === 'fulfilled') setDayLogs(logsData.value);
      if (goalsData.status === 'fulfilled') setGoals(goalsData.value);
      if (weekData.status === 'fulfilled') {
        const byDate = new Map<string, number>();
        for (const s of weekData.value) byDate.set(s.date, s.steps);
        setWeekSummary(
          week.map((d) => ({ date: d, steps: byDate.get(d) ?? 0 })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [date, iso]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Samsung Health (personal Android build): reload when a sync wrote new numbers.
  useEffect(() => onHealthSync(() => void fetchAll()), [fetchAll]);

  function shiftDate(delta: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    setDate(next);
  }

  function jumpToDate(isoString: string) {
    const [y, m, d] = isoString.split('-').map(Number);
    setDate(new Date(y, m - 1, d));
  }

  // Today's total from logs
  const dayTotal = useMemo(
    () => dayLogs.reduce((a, e) => a + e.steps, 0),
    [dayLogs],
  );

  function openAdd() {
    setStepsInput('');
    setNoteInput('');
    setError(null);
    setAddOpen(true);
  }

  function openEdit(entry: StepLogEntry) {
    setStepsInput(String(entry.steps));
    setNoteInput(entry.note ?? '');
    setError(null);
    setEditEntry(entry);
  }

  async function handleAdd() {
    const val = parseInt(stepsInput, 10);
    if (!Number.isFinite(val) || val <= 0) {
      setError('Enter a positive number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createStepLog({
        date: iso,
        steps: val,
        note: noteInput.trim() || undefined,
      });
      setAddOpen(false);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editEntry) return;
    const val = parseInt(stepsInput, 10);
    if (!Number.isFinite(val) || val <= 0) {
      setError('Enter a positive number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateStepLog(editEntry.id, {
        steps: val,
        note: noteInput.trim() || null,
      });
      setEditEntry(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: StepLogEntry) {
    setSaving(true);
    try {
      await deleteStepLog(entry.id);
      await fetchAll();
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  }

  // Max for chart scaling
  const weekMax = Math.max(
    1,
    ...weekSummary.map((d) => d.steps),
    goals.steps,
  );

  return (
    <>
      <main className="fd-page">
        <FoldHead
          title="Steps"
          sub={<>{formatNavLabel(iso)}{iso === toISODate(new Date()) ? ` · ${date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}</>}
          right={<>
            <button type="button" className="fd-btn line" aria-label="Previous day" onClick={() => shiftDate(-1)}>‹</button>
            <button type="button" className="fd-btn line" aria-label="Next day" disabled={iso >= toISODate(new Date())} onClick={() => shiftDate(1)}>›</button>
            <button type="button" className="fd-btn primary" onClick={openAdd}>+ Log</button>
          </>}
        />
        <div className="fd-grid2 fd-steps-top" style={{ flex: 'none' }}>
          <section className="fd-panel" style={{ gridColumn: 'var(--fd-span)' }}>
            <span className="fd-label">DAY TOTAL</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b className="fd-mono" style={{ fontSize: 36 }}>{dayTotal.toLocaleString()}</b><span className="fd-mute" style={{ fontSize: 13, flex: 1 }}>of {goals.steps.toLocaleString()}</span><span className="fd-mute" style={{ fontSize: 13 }}>{Math.round((dayTotal / (goals.steps || 1)) * 100)}%</span></div>
            <FoldBar pct={(dayTotal / (goals.steps || 1)) * 100} />
          </section>
          {healthSupported() && iso === toISODate(new Date()) ? <SamsungHealthCard /> : null}
        </div>
        <div className="fd-3-2">
          <section className="fd-panel">
            <b className="fd-title">This week</b>
            <div style={{ flex: 1, minHeight: 110, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, alignItems: 'end' }}>
              {weekSummary.map((d) => (
                <button key={d.date} type="button" aria-label={`${formatDayShort(d.date)}: ${d.steps} steps`} onClick={() => jumpToDate(d.date)} style={{ height: `${Math.max(2, (d.steps / weekMax) * 100)}%`, minHeight: 3, borderRadius: 5, border: 0, padding: 0, cursor: 'pointer', background: d.date === iso ? '#2F7FE6' : '#3A4A63' }} />
              ))}
            </div>
            <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, fontSize: 11, textAlign: 'center' }} className="fd-mute">
              {weekSummary.map((d) => <span key={d.date}>{formatDayShort(d.date)}</span>)}
            </div>
          </section>
          <section className="fd-panel" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fd-label">ENTRIES</span><span className="fd-mute" style={{ fontSize: 12 }}>{dayLogs.length}</span></div>
            <div className="fd-meal-list">
              {dayLogs.length === 0 && <p className="fd-mute" style={{ fontSize: 13, margin: '6px 0' }}>{loading ? 'Loading…' : 'Nothing logged for this day'}</p>}
              {dayLogs.map((entry) => {
                const auto = healthSupported() && entry.note === HEALTH_NOTE;
                return (
                  <button key={entry.id} type="button" className="fd-row fd-tap" disabled={auto} onClick={() => openEdit(entry)} style={{ paddingTop: 8, paddingBottom: 8 }}>
                    <span className="fd-col"><b className="fd-mono" style={{ fontSize: 16 }}>{entry.steps.toLocaleString()} steps</b><span className="fd-row-sub">{entry.note || (entry.logged_at || '').slice(11, 16)}</span></span>
                    {auto && <span className="fd-mono fd-mute" style={{ fontSize: 11 }}>synced</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </main>


<GlassModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add step entry"
        subtitle={formatNavLabel(iso)}
        size="sm"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleAdd}
              disabled={saving || !stepsInput}
            >
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </>
        }
      >
        <StepFormFields
          stepsInput={stepsInput}
          setStepsInput={setStepsInput}
          noteInput={noteInput}
          setNoteInput={setNoteInput}
          error={error}
        />
      </GlassModal>

      {/* Edit modal */}
      <GlassModal
        isOpen={editEntry !== null}
        onClose={() => setEditEntry(null)}
        title="Edit step entry"
        size="sm"
        leadingFooter={
          editEntry && (
            <GlassButton
              variant="danger"
              onClick={() => {
                setConfirmDelete(editEntry);
                setEditEntry(null);
              }}
            >
              <Trash2 size={12} style={{ marginRight: 4 }} />
              Delete
            </GlassButton>
          )
        }
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setEditEntry(null)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleEdit}
              disabled={saving || !stepsInput}
            >
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </>
        }
      >
        <StepFormFields
          stepsInput={stepsInput}
          setStepsInput={setStepsInput}
          noteInput={noteInput}
          setNoteInput={setNoteInput}
          error={error}
        />
      </GlassModal>

      {/* Delete confirmation */}
      <GlassModal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this entry?"
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
              The {confirmDelete.steps.toLocaleString()}-step entry will be
              removed.
            </>
          )}
        </p>
      </GlassModal>
    </>
  );
}

function StepFormFields({
  stepsInput,
  setStepsInput,
  noteInput,
  setNoteInput,
  error,
}: {
  stepsInput: string;
  setStepsInput: (v: string) => void;
  noteInput: string;
  setNoteInput: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <GlassInput
        label="Steps"
        type="number"
        inputMode="numeric"
        min={0}
        value={stepsInput}
        onChange={(e) => setStepsInput(e.target.value)}
        placeholder="8500"
        autoComplete="off"
      />
      <GlassInput
        label="Note (optional)"
        value={noteInput}
        onChange={(e) => setNoteInput(e.target.value)}
        placeholder="e.g. Morning walk"
        maxLength={100}
      />
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
  );
}

/** Today's steps from Samsung Health (Health Connect): connect button, or last sync + Sync now. */
function SamsungHealthCard() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => setStatus(await healthStatus()), []);
  useEffect(() => {
    void refresh();
    return onHealthSync(() => void refresh());
  }, [refresh]);

  if (!status) return null;

  async function connect() {
    setBusy(true);
    setNote(null);
    try {
      setStatus(await connectHealth());
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open Health Connect');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setNote(null);
    const r = await syncHealthSteps();
    if (r && !r.ok) setNote(r.message);
    else if (!r) setNote('Sync failed — is the Mac mini reachable?');
    await refresh();
    setBusy(false);
  }

  const last = status.lastSync
    ? new Date(status.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <section className="fd-panel">
      <span className="fd-label">SAMSUNG HEALTH</span>
      {!status.available ? (
        <span className="fd-mute" style={{ fontSize: 13 }}>Health Connect isn't available on this phone.</span>
      ) : !status.granted ? (
        <>
          <span style={{ fontSize: 14, color: '#CFCAC2' }}>Fill in today's steps automatically.</span>
          <button type="button" className="fd-btn" style={{ alignSelf: 'flex-start' }} onClick={connect} disabled={busy}>{busy ? 'Opening…' : 'Connect Samsung Health'}</button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 14, color: '#CFCAC2' }}>{last ? <><b className="fd-mono">{(status.today ?? 0).toLocaleString()}</b> steps · synced {last}</> : 'Connected'}</span>
          <button type="button" className="fd-btn" style={{ alignSelf: 'flex-start' }} onClick={syncNow} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</button>
        </>
      )}
      {note && <span style={{ fontSize: 12, color: '#F0A46C' }}>{note}</span>}
    </section>
  );
}
