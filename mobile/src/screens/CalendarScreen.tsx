// Mobile calendar — port of web/src/app/calendar/page.tsx (~694 lines).
// Scoped to ~300 lines: month grid with per-day data dots and a detail sheet.
// Skipped from web:
//   - Google Calendar OAuth integration + event overlays (needs server-side
//     OAuth flow that's specific to web — defer for now)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  Pill,
  MonoNum,
  EmptyState,
  GlassModal,
} from '../components/ui';
import {
  getJournalEntries,
  getWeightEntries,
  getSteps,
} from '../lib/api';
import { toISODate } from '../lib/nutrition';
import PageHeader from '../components/PageHeader';

interface DayData {
  date: string;
  calories: number;
  steps: number;
  weight_kg: number | null;
}

function getMonthDays(year: number, month: number): Date[] {
  // Returns all days in the month, padded to start on a Monday.
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // JS getDay() is 0=Sun, 1=Mon...6=Sat. We want a Mon-start week.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;

  const days: Date[] = [];
  // Pad leading days from prev month
  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push(d);
  }
  for (let i = 1; i <= lastOfMonth.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  // Pad trailing days to complete the final week
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }
  return days;
}

export default function CalendarScreen() {
  const today = new Date();
  const [cursor, setCursor] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [data, setData] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthDays = useMemo(
    () => getMonthDays(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    try {
      const start = toISODate(monthDays[0]);
      const end = toISODate(monthDays[monthDays.length - 1]);

      const [journalRes, weightRes, stepsRes] = await Promise.allSettled([
        getJournalEntries({ startDate: start, endDate: end }),
        getWeightEntries({ startDate: start, endDate: end, limit: 366 }),
        getSteps({ startDate: start, endDate: end }),
      ]);

      const map: Record<string, DayData> = {};

      if (journalRes.status === 'fulfilled') {
        for (const e of journalRes.value) {
          if (!map[e.date]) {
            map[e.date] = { date: e.date, calories: 0, steps: 0, weight_kg: null };
          }
          map[e.date].calories += e.calories_snapshot ?? 0;
        }
      }
      if (stepsRes.status === 'fulfilled') {
        for (const s of stepsRes.value) {
          if (!map[s.date]) {
            map[s.date] = { date: s.date, calories: 0, steps: 0, weight_kg: null };
          }
          map[s.date].steps = s.steps;
        }
      }
      if (weightRes.status === 'fulfilled') {
        for (const w of weightRes.value) {
          if (!map[w.date]) {
            map[w.date] = { date: w.date, calories: 0, steps: 0, weight_kg: null };
          }
          map[w.date].weight_kg = w.weight_kg;
        }
      }
      setData(map);
    } finally {
      setLoading(false);
    }
  }, [monthDays]);

  useEffect(() => {
    fetchMonth();
  }, [fetchMonth]);

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  const monthLabel = cursor.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  const todayISO = toISODate(today);

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader title="Calendar" subtitle={monthLabel} back="/more" />

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
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
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
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 600,
              padding: '8px 0',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
            }}
          >
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
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
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day-of-week header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 2,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-muted-foreground)',
            textAlign: 'center',
            paddingBottom: 4,
          }}
        >
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>

        {/* Month grid */}
        <GlassCard padding={false}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
              padding: 4,
            }}
          >
            {monthDays.map((d, i) => {
              const iso = toISODate(d);
              const dayData = data[iso];
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = iso === todayISO;
              const isFuture = iso > todayISO;
              const hasData = dayData != null;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDay(iso)}
                  disabled={!inMonth || isFuture}
                  className="cursor-pointer"
                  style={{
                    aspectRatio: '1',
                    padding: 4,
                    background: isToday
                      ? 'var(--color-badge-bg)'
                      : 'var(--color-surface)',
                    border: `1px solid ${
                      isToday ? 'var(--color-primary)' : 'var(--color-border)'
                    }`,
                    borderRadius: 4,
                    color: inMonth
                      ? 'var(--color-foreground)'
                      : 'var(--color-placeholder)',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    opacity: isFuture ? 0.3 : 1,
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: isToday ? 700 : 500,
                    }}
                  >
                    {d.getDate()}
                  </span>
                  {/* Activity dot */}
                  {hasData && inMonth && (
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 4,
                        background: 'var(--color-primary)',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>

        {loading && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              textAlign: 'center',
            }}
          >
            Loading month…
          </div>
        )}

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            justifyContent: 'center',
          }}
        >
          <span className="flex items-center gap-1">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: 'var(--color-primary)',
              }}
            />
            Activity logged
          </span>
        </div>
      </div>

      {/* Day detail modal */}
      <GlassModal
        isOpen={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={
          selectedDay
            ? new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-AU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : ''
        }
        size="sm"
        footer={
          <GlassButton variant="primary" onClick={() => setSelectedDay(null)}>
            Done
          </GlassButton>
        }
      >
        {selectedDay && (
          <div className="flex flex-col gap-3">
            {data[selectedDay] ? (
              <>
                <DayStat
                  label="Calories"
                  value={Math.round(data[selectedDay].calories)}
                  unit="kcal"
                />
                <DayStat
                  label="Steps"
                  value={data[selectedDay].steps}
                  unit=""
                />
                {data[selectedDay].weight_kg != null && (
                  <DayStat
                    label="Weight"
                    value={data[selectedDay].weight_kg!}
                    unit="kg"
                    decimals={1}
                  />
                )}
                {data[selectedDay].calories === 0 &&
                  data[selectedDay].steps === 0 &&
                  data[selectedDay].weight_kg == null && (
                    <EmptyState>Nothing logged on this day.</EmptyState>
                  )}
              </>
            ) : (
              <EmptyState>
                <CalendarDays
                  size={20}
                  style={{
                    color: 'var(--color-muted-foreground)',
                    marginBottom: 8,
                  }}
                />
                <div>Nothing logged on this day.</div>
              </EmptyState>
            )}
          </div>
        )}
      </GlassModal>
    </div>
  );
}

function DayStat({
  label,
  value,
  unit,
  decimals = 0,
}: {
  label: string;
  value: number;
  unit: string;
  decimals?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 12px',
        background: 'var(--color-surface-warm)',
        borderRadius: 6,
      }}
    >
      <Pill tone="primary">{label}</Pill>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <MonoNum size={20}>{value.toFixed(decimals)}</MonoNum>
        {unit && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-muted-foreground)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

