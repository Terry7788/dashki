'use client';

import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '@/components/ui';
import { getTodos, getJournalEntries, getWeightEntries, getSteps } from '@/lib/api';
import type { Todo, JournalEntry, WeightEntry, StepEntry } from '@/lib/types';
import { ChevronLeft, ChevronRight, CheckSquare, Flame, Scale, Footprints } from 'lucide-react';
import clsx from 'clsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Day Cell ─────────────────────────────────────────────────────────────────

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  hasTodo,
  caloriesForCell,
  proteinForCell,
  stepsForCell,
  onClick,
}: {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasTodo: boolean;
  caloriesForCell: number | null;
  proteinForCell: number | null;
  stepsForCell: number | null;
  onClick: () => void;
}) {
  const hasData =
    caloriesForCell !== null || proteinForCell !== null || stepsForCell !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative flex flex-col items-center justify-start pt-1.5 pb-1.5 px-1 rounded-xl transition-all duration-200 min-h-[78px]',
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

      {/* Health labels — calories, protein, steps */}
      {hasData && isCurrentMonth && (
        <div className="flex flex-col items-center mt-0.5 leading-tight">
          {caloriesForCell !== null && (
            <span className="text-[10px] font-semibold text-amber-400/90">
              {Math.round(caloriesForCell)}<span className="text-amber-400/50 font-normal"> kcal</span>
            </span>
          )}
          {proteinForCell !== null && (
            <span className="text-[10px] font-semibold text-emerald-400/90">
              {Math.round(proteinForCell)}<span className="text-emerald-400/50 font-normal">g</span>
            </span>
          )}
          {stepsForCell !== null && (
            <span className="text-[10px] font-semibold text-sky-400/90">
              {stepsForCell.toLocaleString()}<span className="text-sky-400/50 font-normal"> steps</span>
            </span>
          )}
        </div>
      )}

      {/* Todo dot (only when no health labels above) */}
      {hasTodo && !hasData && (
        <div className="flex gap-0.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 opacity-80" />
        </div>
      )}

      {/* When health labels are present, show todo as small corner dot */}
      {hasTodo && hasData && (
        <div className="absolute top-1 right-1">
          <span className="w-1 h-1 rounded-full bg-indigo-400 opacity-80 inline-block" />
        </div>
      )}
    </button>
  );
}

// ─── Side Panel ───────────────────────────────────────────────────────────────

function SidePanel({
  selectedDay,
  todos,
  caloriesForDay,
  proteinForDay,
  weightForDay,
  stepsForDay,
}: {
  selectedDay: Date;
  todos: Todo[];
  caloriesForDay: number | null;
  proteinForDay: number | null;
  weightForDay: number | null;
  stepsForDay: number | null;
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
      {(caloriesForDay !== null || proteinForDay !== null || weightForDay !== null || stepsForDay !== null) && (
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Health
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {caloriesForDay !== null && (
              <GlassCard padding={false} className="px-2 py-2.5">
                <div className="flex flex-col items-center leading-tight">
                  <Flame className="w-4 h-4 text-amber-400 mb-1" />
                  <span className="text-sm text-white font-semibold">
                    {Math.round(caloriesForDay)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    kcal
                  </span>
                </div>
              </GlassCard>
            )}
            {proteinForDay !== null && (
              <GlassCard padding={false} className="px-2 py-2.5">
                <div className="flex flex-col items-center leading-tight">
                  <span className="w-4 h-4 mb-1 flex items-center justify-center text-emerald-400 text-xs font-bold">P</span>
                  <span className="text-sm text-white font-semibold">
                    {Math.round(proteinForDay)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    g protein
                  </span>
                </div>
              </GlassCard>
            )}
            {stepsForDay !== null && (
              <GlassCard padding={false} className="px-2 py-2.5">
                <div className="flex flex-col items-center leading-tight">
                  <Footprints className="w-4 h-4 text-sky-400 mb-1" />
                  <span className="text-sm text-white font-semibold">
                    {stepsForDay.toLocaleString()}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    steps
                  </span>
                </div>
              </GlassCard>
            )}
            {weightForDay !== null && (
              <GlassCard padding={false} className="px-2 py-2.5">
                <div className="flex flex-col items-center leading-tight">
                  <Scale className="w-4 h-4 text-purple-400 mb-1" />
                  <span className="text-sm text-white font-semibold">
                    {weightForDay.toFixed(1)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    kg
                  </span>
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
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [stepEntries, setStepEntries] = useState<StepEntry[]>([]);

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

  // ── Fetch journal entries + steps for the visible month ───────────────────

  useEffect(() => {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    getJournalEntries({ startDate, endDate })
      .then(setJournalEntries)
      .catch(console.error);
    getSteps({ startDate, endDate })
      .then(setStepEntries)
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

  const proteinByDate = useMemo(() => {
    const map = new Map<string, number>();
    journalEntries.forEach((e) => {
      map.set(e.date, (map.get(e.date) ?? 0) + e.protein_snapshot);
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

  const stepsByDate = useMemo(() => {
    const map = new Map<string, number>();
    stepEntries.forEach((s) => map.set(s.date, s.steps));
    return map;
  }, [stepEntries]);

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
                      return (
                        <DayCell
                          key={idx}
                          date={date}
                          isCurrentMonth={isCurrentMonth}
                          isToday={isSameDay(date, today)}
                          isSelected={isSameDay(date, selectedDay)}
                          hasTodo={todoDateSet.has(dateStr)}
                          caloriesForCell={caloriesByDate.get(dateStr) ?? null}
                          proteinForCell={proteinByDate.get(dateStr) ?? null}
                          stepsForCell={stepsByDate.get(dateStr) ?? null}
                          onClick={() => setSelectedDay(new Date(date))}
                        />
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="text-amber-400 font-semibold">kcal</span>
                      Calories
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="text-emerald-400 font-semibold">g</span>
                      Protein
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="text-sky-400 font-semibold">steps</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      Task due
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
                caloriesForDay={caloriesByDate.get(toLocalDateStr(selectedDay)) ?? null}
                proteinForDay={proteinByDate.get(toLocalDateStr(selectedDay)) ?? null}
                weightForDay={weightByDate.get(toLocalDateStr(selectedDay)) ?? null}
                stepsForDay={stepsByDate.get(toLocalDateStr(selectedDay)) ?? null}
              />
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
