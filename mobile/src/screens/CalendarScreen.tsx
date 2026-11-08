// Mobile calendar — port of web/src/app/calendar/page.tsx (~694 lines).
// Scoped to ~300 lines: month grid with per-day data dots and a detail sheet.
// Skipped from web:
//   - Google Calendar OAuth integration + event overlays (needs server-side
//     OAuth flow that's specific to web — defer for now)

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getJournalEntries,
  getGoals,
  getWeightEntries,
  getSteps,
} from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { toISODate } from '../lib/nutrition';
import type { JournalEntry } from '../lib/types';
import { FoldHead, FoldRing, PAGE_WEEK } from '../components/Fold';

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
  const [, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [entriesByDay, setEntriesByDay] = useState<Record<string, JournalEntry[]>>({});
  const [calGoal, setCalGoal] = useState(2000);
  const navigate = useNavigate();

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

      getGoals().then((g) => setCalGoal(g.calories)).catch(() => {});
      if (journalRes.status === 'fulfilled') {
        const byDay: Record<string, JournalEntry[]> = {};
        for (const e of journalRes.value) (byDay[e.date] ??= []).push(e);
        setEntriesByDay(byDay);
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
  const selected = selectedDay ?? todayISO;
  const day = data[selected];
  const dayEntries = entriesByDay[selected] ?? [];

  return (
    <>
      <main className="fd-page">
        <FoldHead
          title="Calendar"
          sub={<><span className="fd-wide">Green under {calGoal.toLocaleString()} kcal · orange over</span><span className="fd-narrow">{monthLabel}</span></>}
          right={<>
            <button type="button" className="fd-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
            <b className="fd-wide" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{monthLabel}</b>
            <button type="button" className="fd-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
          </>}
        />
        <div className="fd-calwrap">
          <div className="fd-calmain">
            <div className="fd-days" style={{ flex: 'none', gap: 4 }}>{PAGE_WEEK.map((n) => <span key={n} className="fd-mute" style={{ fontSize: 11, fontWeight: 600 }}>{n}</span>)}</div>
            <div className="fd-cal">
              {monthDays.map((d) => {
                const key = toISODate(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const c = Math.round(data[key]?.calories ?? 0);
                const cls = key === selected ? 'sel' : !inMonth ? 'out' : c > calGoal ? 'over' : c > 0 ? 'under' : '';
                return <button key={key} type="button" className={cls} aria-pressed={key === selected} onClick={() => setSelectedDay(key)}><span>{d.getDate()}</span>{c > 0 && inMonth ? <b>{c.toLocaleString()}</b> : null}</button>;
              })}
            </div>
          </div>
          <section className="fd-panel" style={{ overflow: 'hidden' }}>
            <b style={{ fontSize: 15 }}>{new Date(selected + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
            <div className="fd-wide fd-flex" style={{ justifyContent: 'center' }}><FoldRing value={Math.round(day?.calories ?? 0)} goal={calGoal} size={120} /></div>
            <div className="fd-narrow" style={{ fontSize: 13 }}><b className="fd-mono">{Math.round(day?.calories ?? 0).toLocaleString()} kcal</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="fd-mute">Protein</span><b className="fd-mono">{Math.round(dayEntries.reduce((a, e) => a + (e.protein_snapshot ?? 0), 0))} g</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="fd-mute">Steps</span><b className="fd-mono">{(day?.steps ?? 0).toLocaleString()}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="fd-mute">Weight</span><b className="fd-mono">{day?.weight_kg ? `${day.weight_kg.toFixed(1)} kg` : '—'}</b></div>
            <div className="fd-meal-list">
              {dayEntries.map((e) => <div key={e.id} style={{ paddingTop: 6, marginTop: 6, borderTop: '1px solid #34312E', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 6 }}><span>{e.food_name_snapshot}</span><b className="fd-mono" style={{ flex: 'none' }}>{Math.round(e.calories_snapshot)}</b></div>)}
            </div>
            <button type="button" className="fd-btn primary" style={{ width: '100%', flex: 'none' }} onClick={() => navigate(`/journal?date=${selected}`)}>Open journal</button>
          </section>
        </div>
      </main>


        </>
  );
}

