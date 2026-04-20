'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { GlassCard, GlassButton } from '@/components/ui';
import { getTodos, getJournalEntries, getWeightEntries } from '@/lib/api';
import type { Todo, JournalEntry, WeightEntry } from '@/lib/types';
import { ChevronLeft, ChevronRight, Calendar, CheckSquare, ExternalLink, Flame, Scale } from 'lucide-react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Build a 6-week grid (42 cells) for a given month.
 * Each cell: { date, isCurrentMonth }
 */
function buildCalendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sunday

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  // Pad with previous month days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: d, isCurrentMonth: false });
  }

  // Current month days
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  // Pad to fill 6 rows (42 cells)
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay++), isCurrentMonth: false });
  }

  return cells;
}

function formatEventTime(event: CalendarEvent): string {
  const start = event.start.dateTime || event.start.date;
  if (!start) return '';
  if (event.start.date && !event.start.dateTime) return 'All day';
  const d = new Date(start);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-8 w-48 rounded-xl" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  );
}

// ─── Google Calendar Setup Card ───────────────────────────────────────────────

function GoogleCalendarSetup() {
  return (
    <GlassCard className="text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="text-4xl">📅</span>
        <h3 className="text-white font-semibold text-base">Connect Google Calendar</h3>
        <p className="text-white/50 text-sm">
          Link your Google Calendar to see events alongside your tasks.
        </p>
        <GlassButton
          variant="primary"
          onClick={() => (window.location.href = `${BASE_URL}/api/auth/google`)}
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Connect Google Calendar
          </span>
        </GlassButton>
      </div>
    </GlassCard>
  );
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  hasTodo,
  hasEvent,
  hasHealth,
  onClick,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasTodo: boolean;
  hasEvent: boolean;
  hasHealth: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative flex flex-col items-center justify-start pt-1.5 pb-1 rounded-xl transition-all duration-200 min-h-[44px]',
        'text-sm font-medium select-none',
        isSelected
          ? 'bg-indigo-500/30 border border-indigo-400/60 text-white'
          : isToday
          ? 'bg-white/[0.08] border border-indigo-400/40 text-indigo-300'
          : 'hover:bg-white/[0.06] border border-transparent',
        isCurrentMonth ? 'text-white' : 'text-white/25',
        !isCurrentMonth && 'opacity-50'
      )}
    >
      <span
        className={clsx(
          'w-6 h-6 flex items-center justify-center rounded-full text-xs',
          isToday && !isSelected && 'ring-1 ring-indigo-400/60'
        )}
      >
        {date.getDate()}
      </span>

      {/* Dots */}
      {(hasTodo || hasEvent || hasHealth) && (
        <div className="flex gap-0.5 mt-0.5">
          {hasTodo && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 opacity-80" />
          )}
          {hasEvent && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-80" />
          )}
          {hasHealth && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 opacity-80" />
          )}
        </div>
      )}
    </button>
  );
}

// ─── Side Panel ───────────────────────────────────────────────────────────────

function SidePanel({
  selectedDay,
  todos,
  events,
  eventsLoading,
  googleConfigured,
  caloriesForDay,
  weightForDay,
}: {
  selectedDay: Date;
  todos: Todo[];
  events: CalendarEvent[];
  eventsLoading: boolean;
  googleConfigured: boolean | null;
  caloriesForDay: number | null;
  weightForDay: number | null;
}) {
  const dayLabel = selectedDay.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const dayStr = toLocalDateStr(selectedDay);
  const dayTodos = todos.filter((t) => t.due_date === dayStr);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{dayLabel}</h2>

      {/* Health summary for this day */}
      {(caloriesForDay !== null || weightForDay !== null) && (
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Health
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {caloriesForDay !== null && (
              <GlassCard padding={false} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm text-white font-semibold">
                      {Math.round(caloriesForDay)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      kcal
                    </span>
                  </div>
                </div>
              </GlassCard>
            )}
            {weightForDay !== null && (
              <GlassCard padding={false} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm text-white font-semibold">
                      {weightForDay.toFixed(1)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      kg
                    </span>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      )}

      {/* Todos for this day */}
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <CheckSquare className="w-3.5 h-3.5" /> Tasks due
        </h3>
        {dayTodos.length === 0 ? (
          <p className="text-white/30 text-sm">No tasks due this day.</p>
        ) : (
          <div className="space-y-2">
            {dayTodos.map((todo) => (
              <GlassCard key={todo.id} padding={false} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'w-2 h-2 rounded-full shrink-0',
                      todo.completed ? 'bg-white/20' : 'bg-indigo-400'
                    )}
                  />
                  <span
                    className={clsx(
                      'text-sm',
                      todo.completed ? 'line-through text-white/30' : 'text-white'
                    )}
                  >
                    {todo.title}
                  </span>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Google Calendar Events */}
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> Calendar events
        </h3>

        {googleConfigured === null || eventsLoading ? (
          <PanelSkeleton />
        ) : !googleConfigured ? (
          <GoogleCalendarSetup />
        ) : events.length === 0 ? (
          <p className="text-white/30 text-sm">No events this day.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <GlassCard key={event.id} padding={false} className="px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-white font-medium line-clamp-1">
                    {event.summary}
                  </span>
                  <span className="text-xs text-white/40">{formatEventTime(event)}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState(today);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todosLoading, setTodosLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  // null = unknown (loading), true = configured, false = not configured
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // ── Fetch todos ───────────────────────────────────────────────────────────

  useEffect(() => {
    setTodosLoading(true);
    getTodos()
      .then(setTodos)
      .catch(console.error)
      .finally(() => setTodosLoading(false));
  }, []);

  // ── Fetch journal entries for the visible month ───────────────────────────

  useEffect(() => {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    getJournalEntries({ startDate, endDate })
      .then(setJournalEntries)
      .catch(console.error);
  }, [year, month]);

  // ── Fetch weight entries (all, once) ──────────────────────────────────────

  useEffect(() => {
    getWeightEntries().then(setWeightEntries).catch(console.error);
  }, []);

  // ── Aggregate health data by date ─────────────────────────────────────────

  const caloriesByDate = useMemo(() => {
    const map = new Map<string, number>();
    journalEntries.forEach((e) => {
      map.set(e.date, (map.get(e.date) ?? 0) + e.calories_snapshot);
    });
    return map;
  }, [journalEntries]);

  const weightByDate = useMemo(() => {
    const map = new Map<string, number>();
    // If multiple weights exist for the same date, the last entry (highest id) wins.
    const sorted = [...weightEntries].sort((a, b) => a.id - b.id);
    sorted.forEach((w) => map.set(w.date, w.weight_kg));
    return map;
  }, [weightEntries]);

  // ── Fetch calendar events for selected day ────────────────────────────────

  const fetchEvents = useCallback(async (date: Date) => {
    setEventsLoading(true);
    const dateStr = toLocalDateStr(date);
    try {
      const res = await fetch(`${BASE_URL}/api/calendar/events?date=${dateStr}`);
      if (res.status === 501 || res.status === 404) {
        const body = await res.json().catch(() => ({}));
        if (body.setup) {
          setGoogleConfigured(false);
          setEvents([]);
          return;
        }
        // 404 with no setup flag = not configured either
        setGoogleConfigured(false);
        setEvents([]);
        return;
      }
      if (!res.ok) {
        // Treat other errors as not configured gracefully
        setGoogleConfigured(false);
        setEvents([]);
        return;
      }
      const data = await res.json();
      setGoogleConfigured(true);
      setEvents(Array.isArray(data) ? data : data.events || []);
    } catch {
      setGoogleConfigured(false);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(selectedDay);
  }, [selectedDay, fetchEvents]);

  // ── Calendar grid ─────────────────────────────────────────────────────────

  const cells = buildCalendarGrid(year, month);

  // Build a set of due-date strings for the current month's todos
  const todoDateSet = new Set(
    todos
      .filter((t) => t.due_date)
      .map((t) => t.due_date as string)
  );

  // Month navigation
  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  return (
    <div className="px-4 py-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
        {/* Page title */}
        <h1 className="text-3xl font-bold text-white tracking-tight mb-6">Calendar</h1>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Left: Calendar Grid ── */}
          <div className="flex-1 min-w-0">
            <GlassCard>
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-5">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <h2 className="text-lg font-semibold text-white">
                  {MONTHS[month]} {year}
                </h2>

                <button
                  type="button"
                  onClick={nextMonth}
                  className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {todosLoading ? (
                <CalendarSkeleton />
              ) : (
                <>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {DAYS.map((d) => (
                      <div
                        key={d}
                        className="text-center text-xs font-semibold text-white/30 py-1 uppercase tracking-wider"
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map(({ date, isCurrentMonth }, idx) => {
                      const dateStr = toLocalDateStr(date);
                      const hasHealth =
                        caloriesByDate.has(dateStr) || weightByDate.has(dateStr);
                      return (
                        <DayCell
                          key={idx}
                          date={date}
                          isCurrentMonth={isCurrentMonth}
                          isToday={isSameDay(date, today)}
                          isSelected={isSameDay(date, selectedDay)}
                          hasTodo={todoDateSet.has(dateStr)}
                          hasEvent={false} /* We don't bulk-fetch events per cell */
                          hasHealth={hasHealth}
                          onClick={() => setSelectedDay(new Date(date))}
                        />
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      Task due
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Calendar event
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      Calories / Weight logged
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="w-3 h-3 rounded-full ring-1 ring-indigo-400/60 inline-block" />
                      Today
                    </div>
                  </div>
                </>
              )}
            </GlassCard>
          </div>

          {/* ── Right: Side Panel ── */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0">
            <GlassCard>
              <SidePanel
                selectedDay={selectedDay}
                todos={todos}
                events={events}
                eventsLoading={eventsLoading}
                googleConfigured={googleConfigured}
                caloriesForDay={caloriesByDate.get(toLocalDateStr(selectedDay)) ?? null}
                weightForDay={weightByDate.get(toLocalDateStr(selectedDay)) ?? null}
              />
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
