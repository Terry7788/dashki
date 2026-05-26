// Mobile steps page — port of web/src/app/steps/page.tsx (~1760 lines).
// Scoped to ~450 lines: date nav + daily total + week bars + log entries
// (multiple per day) + add/edit/delete.
// Skipped from web: recharts BarChart (replaced by inline div bars),
// goal-editing flow (lives in Settings + onboarding wizard now).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Footprints,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  GlassModal,
  CardShell,
  MicroLabel,
  MonoNum,
  ProgressBar,
  EmptyState,
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
import PageHeader from '../components/PageHeader';

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
      // Last 7 days inclusive of selected date
      const week = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(date);
        d.setDate(d.getDate() - (6 - i));
        return toISODate(d);
      });
      const earliest = week[0];

      const [logsData, goalsData, weekData] = await Promise.allSettled([
        getStepLogs(iso),
        getGoals(),
        getSteps({ startDate: earliest, endDate: iso }),
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
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader
        title="Steps"
        subtitle={formatNavLabel(iso)}
        trailing={
          <GlassButton variant="primary" size="sm" onClick={openAdd}>
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
        {/* Date navigator */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Previous day"
            className="cursor-pointer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              background: 'var(--color-soft)',
              border: 0,
              color: 'var(--color-foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={iso}
            onChange={(e) => jumpToDate(e.target.value)}
            max={toISODate(new Date())}
            style={{
              flex: 1,
              padding: '8px 10px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
              fontSize: 14,
              textAlign: 'center',
            }}
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            disabled={iso >= toISODate(new Date())}
            aria-label="Next day"
            className="cursor-pointer"
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              background: 'var(--color-soft)',
              border: 0,
              color: 'var(--color-foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: iso >= toISODate(new Date()) ? 0.4 : 1,
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day total card */}
        <GlassCard>
          <MicroLabel>
            <Footprints
              size={11}
              style={{ marginRight: 4, verticalAlign: '-1px' }}
            />
            Day total
          </MicroLabel>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginTop: 8,
            }}
          >
            <MonoNum size={32}>{dayTotal.toLocaleString()}</MonoNum>
            <span style={{ color: 'var(--color-muted-foreground)', fontSize: 13 }}>
              of {goals.steps.toLocaleString()}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
                fontWeight: 600,
              }}
            >
              {Math.round((dayTotal / goals.steps) * 100)}%
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar
              value={dayTotal}
              max={goals.steps}
              tone={dayTotal >= goals.steps ? 'success' : 'primary'}
            />
          </div>
        </GlassCard>

        {/* Week bar chart */}
        <CardShell title="This week">
          {loading ? (
            <div
              className="skeleton"
              style={{ height: 120, borderRadius: 8 }}
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 6,
                alignItems: 'end',
                marginTop: 4,
              }}
            >
              {weekSummary.map((d) => {
                const pct = (d.steps / weekMax) * 100;
                const isSelected = d.date === iso;
                const isAtGoal = d.steps >= goals.steps;
                const fill = isAtGoal
                  ? 'var(--color-success)'
                  : 'var(--color-primary)';
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => jumpToDate(d.date)}
                    className="cursor-pointer"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: isSelected
                          ? 'var(--color-primary)'
                          : 'var(--color-muted-foreground)',
                        fontWeight: isSelected ? 700 : 500,
                      }}
                    >
                      {d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : d.steps || '—'}
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 92,
                        background: isSelected
                          ? 'var(--color-badge-bg)'
                          : 'var(--color-surface-warm)',
                        border: `1px solid ${
                          isSelected ? 'var(--color-primary)' : 'var(--color-border)'
                        }`,
                        borderRadius: 6,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: `${pct}%`,
                          background: fill,
                          opacity: 0.85,
                          transition: 'height 240ms ease-out',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: isSelected
                          ? 'var(--color-primary)'
                          : 'var(--color-muted-foreground)',
                        fontWeight: isSelected ? 700 : 500,
                      }}
                    >
                      {formatDayShort(d.date)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardShell>

        {/* Day's log entries */}
        <GlassCard padding={false}>
          <div
            style={{
              padding: '12px 14px',
              borderBottom:
                dayLogs.length > 0 ? '1px solid var(--color-border)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <MicroLabel>Entries</MicroLabel>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
              }}
            >
              {dayLogs.length}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 14 }}>
              <div className="skeleton" style={{ height: 44, borderRadius: 6 }} />
            </div>
          ) : dayLogs.length === 0 ? (
            <div style={{ padding: 14 }}>
              <EmptyState>
                No step entries yet for this day.
              </EmptyState>
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: '4px 6px 6px 6px',
                margin: 0,
              }}
            >
              {dayLogs.map((entry) => {
                const time = (entry.logged_at || '').slice(11, 16);
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
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 6,
                          }}
                        >
                          <MonoNum size={16}>
                            {entry.steps.toLocaleString()}
                          </MonoNum>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--color-muted-foreground)',
                            }}
                          >
                            steps
                          </span>
                          {time && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--color-muted-foreground)',
                                fontFamily: 'var(--font-mono)',
                                marginLeft: 6,
                              }}
                            >
                              {time}
                            </span>
                          )}
                        </div>
                        {entry.note && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--color-muted-foreground)',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {entry.note}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(entry)}
                        aria-label="Edit"
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
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(entry)}
                        aria-label="Delete"
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

      {/* Add modal */}
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
    </div>
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
