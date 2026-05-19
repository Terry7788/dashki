'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Scale,
  Footprints,
  ArrowRightCircle,
  Filter,
} from 'lucide-react';
import {
  GlassButton,
  CardShell,
  MicroLabel,
  MonoNum,
  Pill,
} from '@/components/ui';
import {
  getJournalEntries,
  getWeightEntries,
  getSteps,
} from '@/lib/api';
import type { JournalEntry, WeightEntry, StepEntry } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Build a 6×7 grid of dates for the visible month, Mon-start.
function buildMonthGrid(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const dow = (first.getDay() + 6) % 7; // 0 = Mon
  const start = new Date(year, month, 1 - dow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: d, isCurrentMonth: d.getMonth() === month };
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

type CalView = 'month' | 'week';

export default function CalendarPage() {
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const [view, setView] = useState<CalView>('month');
  const [currentMonth, setCurrentMonth] = useState(
    new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState(todayDate);
  const [loading, setLoading] = useState(true);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [stepEntries, setStepEntries] = useState<StepEntry[]>([]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Fetch month-scoped journal + steps
  useEffect(() => {
    setLoading(true);
    const startDate = year + '-' + String(month + 1).padStart(2, '0') + '-01';
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate =
      year + '-' + String(month + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    Promise.allSettled([
      getJournalEntries({ startDate, endDate }).then(setJournalEntries),
      getSteps({ startDate, endDate }).then(setStepEntries),
    ]).finally(() => setLoading(false));
  }, [year, month]);

  // Fetch weight entries (all, once)
  useEffect(() => {
    getWeightEntries().then(setWeightEntries).catch(console.error);
  }, []);

  // Aggregate per-day
  const caloriesByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of journalEntries) {
      m.set(e.date, (m.get(e.date) ?? 0) + (e.calories_snapshot ?? 0));
    }
    return m;
  }, [journalEntries]);

  const proteinByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of journalEntries) {
      m.set(e.date, (m.get(e.date) ?? 0) + (e.protein_snapshot ?? 0));
    }
    return m;
  }, [journalEntries]);

  const stepsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of stepEntries) m.set(e.date, e.steps);
    return m;
  }, [stepEntries]);

  const weightByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of weightEntries) m.set(e.date, e.weight_kg);
    return m;
  }, [weightEntries]);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }
  function goToday() {
    setCurrentMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
    setSelectedDay(todayDate);
  }

  // Up-next list — pull the most recent entries with any activity, newest first.
  const upcoming = useMemo(() => {
    const all = [
      ...journalEntries.map((e) => ({
        kind: 'meal' as const,
        date: e.date,
        title: e.food_name_snapshot,
        meta: e.meal_type,
      })),
      ...weightEntries.map((e) => ({
        kind: 'track' as const,
        date: e.date,
        title: 'Weigh-in',
        meta: e.weight_kg.toFixed(1) + ' kg',
      })),
    ];
    return all
      .filter((x) => x.date >= toLocalDateStr(todayDate))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [journalEntries, weightEntries, todayDate]);

  // Day detail for sidebar
  const selectedKey = toLocalDateStr(selectedDay);
  const selCal = caloriesByDate.get(selectedKey) ?? null;
  const selProtein = proteinByDate.get(selectedKey) ?? null;
  const selSteps = stepsByDate.get(selectedKey) ?? null;
  const selWeight = weightByDate.get(selectedKey) ?? null;
  const selHasAny =
    selCal != null || selProtein != null || selSteps != null || selWeight != null;

  return (
    <main
      className="page-mount"
      style={{
        maxWidth: 1280,
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
            Calendar
          </h1>
          <div
            style={{
              color: 'var(--color-muted-foreground)',
              marginTop: 4,
              fontSize: 14,
            }}
          >
            Your meals, weigh-ins, and movement at a glance.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--color-surface-warm)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: 2,
            }}
          >
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="cursor-pointer"
                style={{
                  padding: '5px 12px',
                  borderRadius: 3,
                  fontSize: 12,
                  fontWeight: 600,
                  background:
                    view === v ? 'var(--color-surface)' : 'transparent',
                  color:
                    view === v
                      ? 'var(--color-foreground)'
                      : 'var(--color-muted-foreground)',
                  border: 0,
                  fontFamily: 'inherit',
                  textTransform: 'capitalize',
                  boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="calendar-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: 16,
          marginTop: 24,
        }}
      >
        {/* LEFT: Calendar grid */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
          }}
        >
          {/* Month nav header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.2px',
              }}
            >
              {MONTHS[month]} {year}
            </h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <GlassButton variant="outline" size="sm" onClick={prevMonth}>
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </GlassButton>
              <GlassButton variant="outline" size="sm" onClick={goToday}>
                Today
              </GlassButton>
              <GlassButton variant="outline" size="sm" onClick={nextMonth}>
                <ChevronRight style={{ width: 14, height: 14 }} />
              </GlassButton>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {DAYS.map((d) => (
              <div
                key={d}
                style={{
                  padding: '8px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-muted-foreground)',
                  textAlign: 'left',
                  borderLeft: '1px solid var(--color-border)',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div
              className="skeleton"
              style={{ height: 480, margin: 12, borderRadius: 8 }}
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
              }}
            >
              {cells.map(({ date, isCurrentMonth }, idx) => {
                const key = toLocalDateStr(date);
                const isToday = isSameDay(date, todayDate);
                const isSelected = isSameDay(date, selectedDay);
                const cal = caloriesByDate.get(key);
                const steps = stepsByDate.get(key);
                const weight = weightByDate.get(key);
                const hasAny =
                  cal != null || steps != null || weight != null;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(date)}
                    className="cursor-pointer"
                    style={{
                      minHeight: 92,
                      borderLeft: '1px solid var(--color-border)',
                      borderBottom: '1px solid var(--color-border)',
                      padding: '6px 8px',
                      textAlign: 'left',
                      background:
                        !isCurrentMonth
                          ? 'var(--color-surface-warm)'
                          : isSelected
                          ? 'var(--color-badge-bg)'
                          : 'var(--color-surface)',
                      color: isCurrentMonth
                        ? 'var(--color-foreground)'
                        : 'var(--color-placeholder)',
                      fontFamily: 'inherit',
                      borderTop: 'none',
                      borderRight: 'none',
                      transition: 'background 100ms',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: 9999,
                        background: isToday
                          ? 'var(--color-primary)'
                          : 'transparent',
                        color: isToday
                          ? 'var(--color-primary-foreground)'
                          : 'inherit',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {date.getDate()}
                    </div>
                    {hasAny && isCurrentMonth && (
                      <div
                        style={{
                          marginTop: 4,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        {cal != null && (
                          <div
                            style={{
                              fontSize: 10,
                              padding: '2px 5px',
                              borderRadius: 3,
                              background: 'var(--color-surface-warm)',
                              borderLeft: '2px solid var(--color-warning)',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--color-foreground)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {Math.round(cal)} kcal
                          </div>
                        )}
                        {steps != null && (
                          <div
                            style={{
                              fontSize: 10,
                              padding: '2px 5px',
                              borderRadius: 3,
                              background: 'var(--color-surface-warm)',
                              borderLeft: '2px solid var(--color-primary)',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--color-foreground)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {(steps / 1000).toFixed(1)}k steps
                          </div>
                        )}
                        {weight != null && (
                          <div
                            style={{
                              fontSize: 10,
                              padding: '2px 5px',
                              borderRadius: 3,
                              background: 'var(--color-surface-warm)',
                              borderLeft: '2px solid var(--color-teal)',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--color-foreground)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {weight.toFixed(1)} kg
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CardShell
            title={
              isSameDay(selectedDay, todayDate)
                ? 'Today'
                : selectedDay.toLocaleDateString('en-AU', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })
            }
          >
            {selHasAny ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {selCal != null && (
                  <DayStat
                    icon={<Flame style={{ width: 14, height: 14 }} />}
                    label="Calories"
                    value={Math.round(selCal).toLocaleString()}
                    unit="kcal"
                  />
                )}
                {selProtein != null && (
                  <DayStat
                    icon={
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 11,
                          color: 'var(--color-success)',
                        }}
                      >
                        P
                      </span>
                    }
                    label="Protein"
                    value={Math.round(selProtein)}
                    unit="g"
                  />
                )}
                {selSteps != null && (
                  <DayStat
                    icon={<Footprints style={{ width: 14, height: 14 }} />}
                    label="Steps"
                    value={selSteps.toLocaleString()}
                    unit=""
                  />
                )}
                {selWeight != null && (
                  <DayStat
                    icon={<Scale style={{ width: 14, height: 14 }} />}
                    label="Weight"
                    value={selWeight.toFixed(1)}
                    unit="kg"
                  />
                )}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-muted-foreground)',
                  textAlign: 'center',
                  padding: '8px 0',
                }}
              >
                No data logged this day.
              </div>
            )}
          </CardShell>

          {/* Up next */}
          <CardShell
            title="Up next"
            icon={
              <ArrowRightCircle
                style={{ width: 14, height: 14, strokeWidth: 2.25 }}
              />
            }
          >
            {upcoming.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-muted-foreground)',
                  textAlign: 'center',
                  padding: '8px 0',
                }}
              >
                Nothing scheduled.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {upcoming.map((ev, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--color-muted-foreground)',
                          fontWeight: 600,
                        }}
                      >
                        {ev.date === toLocalDateStr(todayDate)
                          ? 'Today'
                          : new Date(ev.date + 'T00:00:00').toLocaleDateString(
                              'en-AU',
                              { weekday: 'short', day: 'numeric' }
                            )}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {ev.title}
                    </div>
                    <Pill tone={ev.kind === 'meal' ? 'success' : 'teal'}>
                      {ev.kind}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </CardShell>

          <CardShell
            title="Legend"
            icon={<Filter style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          >
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <LegendItem color="var(--color-warning)" label="Calories" />
              <LegendItem color="var(--color-primary)" label="Steps" />
              <LegendItem color="var(--color-teal)" label="Weight" />
            </ul>
          </CardShell>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.calendar-grid) {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

function DayStat({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          color: 'var(--color-muted-foreground)',
          display: 'inline-flex',
        }}
      >
        {icon}
      </div>
      <MicroLabel style={{ flex: 1 }}>{label}</MicroLabel>
      <MonoNum size={15}>{value}</MonoNum>
      {unit && (
        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
          {unit}
        </span>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
        }}
      />
      <span style={{ color: 'var(--color-foreground)' }}>{label}</span>
    </li>
  );
}
