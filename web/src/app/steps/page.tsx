'use client';

// Steps — laid out like Apple Health's steps view, in Dashki green:
// one big number, a D / W / M / 6M / Y bar chart you can swipe back through
// (all the way to the first entry), highlights, the day's entries, and one
// "Add steps" sheet with two tabs: type a number, or the walk calculator.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2, Check, X, Plus, TrendingUp, Target, Star } from 'lucide-react';
import { getSteps, getGoals, getStepLogs, createStepLog, updateStepLog, deleteStepLog } from '@/lib/api';
import type { StepEntry, StepLogEntry } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';

// ─── Dates ───────────────────────────────────────────────────────────────────

type Range = 'D' | 'W' | 'M' | '6M' | 'Y';
const RANGES: Range[] = ['D', 'W', 'M', '6M', 'Y'];
const DEFAULT_GOAL = 10000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const QUICK_TIMES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const HEIGHT_KEY = 'dashki-step-height';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-AU');
}
function longDay(d: Date): string {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function dayName(d: Date, today: Date): string {
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return longDay(d);
}
function formatLogTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

/** Minutes from what's typed: "45", "45.5", the treadmill's "45:30" (min:sec) or "1:05:00" (h:min:sec). */
function parseWalkMinutes(raw: string): number {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  let m = s.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d+):([0-5]?\d):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
  return NaN;
}
/** "45min" or "45min 30s": the phone's Health Connect sync reads the minutes from this note. */
function minutesLabel(min: number): string {
  const whole = Math.floor(min + 1e-9);
  const secs = Math.round((min - whole) * 60);
  return secs > 0 && secs < 60 ? `${whole}min ${secs}s` : `${Math.round(min)}min`;
}

/** The day's steps hour by hour, rebuilt from its entries (a walk is spread over its minutes before it was logged). */
function hoursFromLogs(logs: StepLogEntry[]): number[] {
  const h = new Array<number>(24).fill(0);
  for (const l of logs) {
    const t = new Date(l.logged_at);
    const end = isNaN(t.getTime()) || iso(t) !== l.date ? -1 : Math.min(t.getHours() + t.getMinutes() / 60, 23.99);
    const mm = (l.note || '').match(/(\d+)\s*min(?:\s*(\d+)\s*s)?/);
    const mins = mm ? Number(mm[1]) + (mm[2] ? Number(mm[2]) / 60 : 0) : 0;
    if (l.note === 'Samsung Health') {
      const last = end >= 0 ? Math.min(Math.floor(end), 21) : 21;
      const n = Math.max(1, last - 7 + 1);
      for (let k = 0; k < n; k++) h[7 + k] += l.steps / n;
    } else if (end >= 0 && mins > 0) {
      const start = Math.max(0, end - mins / 60);
      const span = end - start || 1 / 60;
      for (let hr = Math.floor(start); hr <= Math.floor(end); hr++) {
        const a = Math.max(start, hr), b = Math.min(end, hr + 1);
        if (b > a) h[hr] += (l.steps * (b - a)) / span;
      }
    } else {
      h[end >= 0 ? Math.floor(end) : 12] += l.steps;
    }
  }
  return h;
}

// ─── One page of the chart ───────────────────────────────────────────────────

interface Bar { v: number | null; label: string; short?: string; aria: string; date?: Date }
interface Period { bars: Bar[]; kind: string; unit: string; when: string; value: number; canPrev: boolean; daily: boolean; day?: Date }

function period(range: Range, off: number, byDay: Map<string, number>, first: Date, today: Date, hours: (d: Date) => number[]): Period {
  const on = (d: Date) => byDay.get(iso(d)) || 0;
  const inData = (d: Date) => d >= first && d <= today;
  const avgDays: number[] = [];
  const bars: Bar[] = [];
  if (range === 'D') {
    const d = addDays(today, -off);
    const hrs = hours(d);
    for (let i = 0; i < 24; i++) {
      const hh = i % 12 || 12;
      bars.push({ v: hrs[i] || 0, label: i === 0 ? '12 am' : i === 6 ? '6' : i === 12 ? '12 pm' : i === 18 ? '6' : '', aria: `${hh} ${i < 12 ? 'am' : 'pm'}` });
    }
    return { bars, kind: 'TOTAL', unit: 'steps', when: dayName(d, today), value: on(d), canPrev: addDays(d, -1) >= first, daily: false, day: d };
  }
  if (range === 'W') {
    const mon = addDays(mondayOf(today), -7 * off), sun = addDays(mon, 6);
    for (let j = 0; j < 7; j++) {
      const d = addDays(mon, j);
      bars.push({ v: inData(d) ? on(d) : null, label: DAYS[j], short: DAYS[j].charAt(0), aria: longDay(d), date: d });
      if (inData(d)) avgDays.push(on(d));
    }
    const when = mon.getMonth() === sun.getMonth()
      ? `${mon.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}`
      : `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}`;
    return { bars, kind: 'AVERAGE', unit: 'steps/day', when, value: mean(avgDays), canPrev: mon > first, daily: true };
  }
  if (range === 'M') {
    const m0 = new Date(today.getFullYear(), today.getMonth() - off, 1);
    const n = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
    for (let k = 0; k < n; k++) {
      const d = addDays(m0, k);
      bars.push({ v: inData(d) ? on(d) : null, label: k % 7 === 0 ? String(k + 1) : '', aria: longDay(d), date: d });
      if (inData(d)) avgDays.push(on(d));
    }
    return { bars, kind: 'AVERAGE', unit: 'steps/day', when: `${MONTHS_FULL[m0.getMonth()]} ${m0.getFullYear()}`, value: mean(avgDays), canPrev: m0 > first, daily: true };
  }
  if (range === '6M') {
    const lastMon = addDays(mondayOf(today), -26 * 7 * off), firstMon = addDays(lastMon, -25 * 7);
    let prevMonth = -1;
    for (let w = 0; w < 26; w++) {
      const wm = addDays(firstMon, w * 7), days: number[] = [];
      for (let x = 0; x < 7; x++) {
        const d = addDays(wm, x);
        if (inData(d)) { days.push(on(d)); avgDays.push(on(d)); }
      }
      const endMonth = addDays(wm, 6).getMonth();
      bars.push({ v: days.length ? mean(days) : null, label: endMonth !== prevMonth ? MONTHS[endMonth] : '', aria: `Week of ${longDay(wm)}` });
      prevMonth = endMonth;
    }
    const endD = addDays(lastMon, 6);
    return { bars, kind: 'DAILY AVERAGE', unit: 'steps/day', when: `${MONTHS[firstMon.getMonth()]} ${firstMon.getFullYear()} – ${MONTHS[endD.getMonth()]} ${endD.getFullYear()}`, value: mean(avgDays), canPrev: firstMon > first, daily: true };
  }
  const mEnd = new Date(today.getFullYear(), today.getMonth() - 12 * off, 1);
  const mStart = new Date(mEnd.getFullYear(), mEnd.getMonth() - 11, 1);
  for (let y = 0; y < 12; y++) {
    const ms = new Date(mStart.getFullYear(), mStart.getMonth() + y, 1), md: number[] = [];
    const len = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
    for (let z = 0; z < len; z++) {
      const d = addDays(ms, z);
      if (inData(d)) { md.push(on(d)); avgDays.push(on(d)); }
    }
    bars.push({ v: md.length ? mean(md) : null, label: MONTHS[ms.getMonth()], short: MONTHS[ms.getMonth()].charAt(0), aria: `${MONTHS_FULL[ms.getMonth()]} ${ms.getFullYear()}` });
  }
  return { bars, kind: 'DAILY AVERAGE', unit: 'steps/day', when: `${MONTHS[mStart.getMonth()]} ${mStart.getFullYear()} – ${MONTHS[mEnd.getMonth()]} ${mEnd.getFullYear()}`, value: mean(avgDays), canPrev: mStart > first, daily: true };
}

// ─── Chart ───────────────────────────────────────────────────────────────────

function StepsChart({
  byDay, first, today, goal, hours, onDayView,
}: {
  byDay: Map<string, number>; first: Date; today: Date; goal: number;
  hours: (d: Date) => number[]; onDayView: (d: Date | null) => void;
}) {
  const [range, setRange] = useState<Range>('W');
  const [off, setOff] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [dx, setDx] = useState(0);
  const [slide, setSlide] = useState(false);
  const [grown, setGrown] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const timers = useRef<number[]>([]);

  const p = useMemo(() => period(range, off, byDay, first, today, hours), [range, off, byDay, first, today, hours]);

  // The entries list follows the day on screen: the D view's day, or a day bar tapped in W / M.
  const selDay = sel !== null ? p.bars[sel]?.date : undefined;
  useEffect(() => {
    onDayView(range === 'D' && p.day ? p.day : selDay && selDay <= today ? selDay : null);
  }, [range, p.day, selDay, today, onDayView]);
  useEffect(() => {
    setGrown(false);
    const t = window.setTimeout(() => setGrown(true), 40);
    return () => window.clearTimeout(t);
  }, [range]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const page = useCallback((dir: 1 | -1) => {
    const w = plotRef.current?.offsetWidth || 320;
    if ((dir > 0 && !p.canPrev) || (dir < 0 && off === 0)) { setSlide(true); setDx(0); return; }
    setSel(null); setSlide(true); setDx(dir * w);
    timers.current.push(window.setTimeout(() => {
      setSlide(false); setOff((o) => o + dir); setDx(-dir * w);
      timers.current.push(window.setTimeout(() => { setSlide(true); setDx(0); }, 30));
    }, 240));
  }, [p.canPrev, off]);

  const vals = p.bars.map((b) => b.v || 0);
  const max = Math.max(...vals, p.daily ? goal : 500);
  const stepSize = p.daily ? 2500 : max > 4000 ? 1000 : 250;
  const top = Math.ceil((max * 1.06) / stepSize) * stepSize;
  const sixOrYear = range === '6M' || range === 'Y';
  let sum = { kind: p.kind, value: fmt(p.value), unit: p.unit, when: p.when };
  if (sel !== null && p.bars[sel]) {
    const b = p.bars[sel];
    sum = { kind: sixOrYear ? 'DAILY AVERAGE' : 'TOTAL', value: fmt(b.v || 0), unit: sixOrYear ? 'steps/day' : 'steps', when: range === 'D' ? `${b.aria}, ${p.when}` : b.aria };
  }
  const slideT = slide ? 'transform 0.24s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';

  return (
    <div className="stp-chart">
      <div className="stp-chart-head">
        <h1 className="stp-title">Steps</h1>
        <div role="tablist" aria-label="Time range" className="stp-seg">
          {RANGES.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === range} className={k === range ? 'on' : ''}
              onClick={() => { if (k !== range) { setRange(k); setOff(0); setSel(null); setDx(0); setSlide(false); } }}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="stp-sum-row">
        <section aria-live="polite" aria-label="Summary" className="stp-sum">
          <div className="stp-kind">{sum.kind}</div>
          <div className="stp-big"><span className="stp-num">{sum.value}</span><span className="stp-unit">{sum.unit}</span></div>
          <div className="stp-when">{sum.when}</div>
        </section>
        <div className="stp-arrows">
          <button type="button" aria-label="Earlier" disabled={!p.canPrev} onClick={() => page(1)}><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Later" disabled={off === 0} onClick={() => page(-1)}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="stp-plot-row">
        <div
          ref={plotRef}
          className="stp-plot"
          onPointerDown={(e) => { drag.current = { x: e.clientX, moved: false }; dragged.current = false; }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            let x = e.clientX - d.x;
            if (Math.abs(x) > 6 && !d.moved) { d.moved = true; e.currentTarget.setPointerCapture?.(e.pointerId); }
            if (!d.moved) return;
            if ((x > 0 && !p.canPrev) || (x < 0 && off === 0)) x = x / 4;
            setSlide(false); setDx(x);
          }}
          onPointerUp={() => {
            const d = drag.current; drag.current = null;
            if (!d || !d.moved) return;
            dragged.current = true; window.setTimeout(() => { dragged.current = false; }, 60);
            const w = plotRef.current?.offsetWidth || 320;
            if (dx > w * 0.18) page(1); else if (dx < -w * 0.18) page(-1); else { setSlide(true); setDx(0); }
          }}
          onPointerCancel={() => { drag.current = null; setSlide(true); setDx(0); }}
        >
          <div className="stp-mid" />
          {p.daily && <div className="stp-goal" style={{ bottom: `${(goal / top) * 100}%` }} />}
          <div className={`stp-bars r-${range}`} style={{ transform: `translateX(${dx}px)`, transition: slideT }}>
            {p.bars.map((b, i) => {
              const v = b.v;
              const pct = v ? Math.max(1.2, (v / top) * 100) : 0;
              return (
                <div key={i} className="stp-cell">
                  <button
                    type="button"
                    aria-label={`${b.aria}: ${v === null ? 'no data' : fmt(v) + (sixOrYear ? ' steps a day' : ' steps')}`}
                    className={`stp-bar${v ? '' : ' empty'}${sel !== null && sel !== i ? ' dim' : ''}`}
                    style={{ height: grown ? (v === null ? 0 : v ? `${pct}%` : '2px') : 0 }}
                    onClick={() => { if (!dragged.current) setSel(sel === i ? null : i); }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="stp-y" aria-hidden="true"><span>{fmt(top)}</span><span>{fmt(top / 2)}</span><span>0</span></div>
      </div>
      <div className="stp-x-wrap" aria-hidden="true">
        <div className={`stp-x r-${range}`} style={{ transform: `translateX(${dx}px)`, transition: slideT }}>
          {p.bars.map((b, i) => <span key={i}><b className="long">{b.label}</b><b className="short">{b.short ?? b.label}</b></span>)}
        </div>
      </div>
      <div className="stp-legend">
        {p.daily ? <span className="stp-goal-key"><i />Goal {fmt(goal)} a day</span> : <span />}
        <span>Swipe for earlier · tap a bar</span>
      </div>
    </div>
  );
}

// ─── Add steps sheet (type a number, or the walk calculator) ────────────────

function AddStepsSheet({
  open, tab, onClose, byDay, goal, today,
}: {
  open: boolean; tab: 'steps' | 'calc'; onClose: () => void; byDay: Map<string, number>; goal: number; today: Date;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="stp-sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="stp-sheet-title" className="stp-sheet">
        <div className="stp-grab" aria-hidden="true" />
        <AddStepsForm startTab={tab} byDay={byDay} goal={goal} today={today} onSaved={onClose}
          header={(save, canAdd) => (
            <header className="stp-sheet-head">
              <button type="button" className="stp-link" onClick={onClose}>Cancel</button>
              <h2 id="stp-sheet-title">Add steps</h2>
              <button type="button" className="stp-link strong" disabled={!canAdd} onClick={save}>Add</button>
            </header>
          )} />
      </section>
    </div>
  );
}

/**
 * The "Add steps" form: type a number, or the walk calculator. It is the phone's
 * sheet, and on wide screens it also sits open in the page's right column.
 */
function AddStepsForm({
  startTab, byDay, goal, today, onSaved, header,
}: {
  startTab: 'steps' | 'calc'; byDay: Map<string, number>; goal: number; today: Date;
  onSaved?: () => void; header?: (save: () => void, canAdd: boolean) => React.ReactNode;
}) {
  const [tab, setTab] = useState<'steps' | 'calc'>(startTab);
  const [date, setDate] = useState(iso(today));
  const [steps, setSteps] = useState('');
  const [time, setTime] = useState('');
  const [speed, setSpeed] = useState('5.0');
  const [height, setHeight] = useState('183');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    try { const h = localStorage.getItem(HEIGHT_KEY); if (h) setHeight(h); } catch { /* storage off */ }
  }, []);
  useEffect(() => { setDate(iso(today)); }, [today]);

  const mins = parseWalkMinutes(time);
  const sp = parseFloat(speed), h = parseFloat(height);
  // Same maths as before: distance ÷ step length, step length = 0.415 × height.
  const est = mins > 0 && sp > 0 && h > 0 ? Math.round((sp * (mins / 60) * 1000) / ((0.415 * h) / 100)) : 0;
  const typed = parseInt(steps, 10);
  const adding = tab === 'calc' ? est : typed > 0 ? typed : 0;
  const base = byDay.get(date) || 0;
  const projected = base + adding;
  const pct = goal > 0 ? Math.min(100, Math.round((projected / goal) * 100)) : 0;
  const d = fromIso(date);
  const yesterday = iso(addDays(today, -1));
  const which = date === iso(today) ? 'today' : date === yesterday ? 'yesterday' : d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeBad = time.trim() !== '' && !(mins > 0);

  async function save() {
    if (adding <= 0 || saving) return;
    setSaving(true); setError(''); setSaved('');
    try {
      if (tab === 'calc') {
        try { localStorage.setItem(HEIGHT_KEY, height); } catch { /* storage off */ }
        await createStepLog({ date, steps: est, note: `Calculator: ${minutesLabel(mins)} @ ${speed}km/h` });
        setTime('');
      } else {
        await createStepLog({ date, steps: typed });
        setSteps('');
      }
      if (onSaved) onSaved(); else setSaved(`Added ${fmt(adding)} to ${which}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the steps');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
        {header && header(save, adding > 0 && !saving)}

        <div className="stp-sheet-body">
          <div role="tablist" aria-label="How to add" className="stp-seg two">
            <button type="button" role="tab" aria-selected={tab === 'calc'} className={tab === 'calc' ? 'on' : ''} onClick={() => setTab('calc')}>Walk calculator</button>
            <button type="button" role="tab" aria-selected={tab === 'steps'} className={tab === 'steps' ? 'on' : ''} onClick={() => setTab('steps')}>Steps</button>
          </div>

          <div className="stp-group">
            <div className="stp-row date">
              <span>Date</span>
              <div className="stp-chips">
                <button type="button" aria-pressed={date === iso(today)} className={date === iso(today) ? 'on' : ''} onClick={() => setDate(iso(today))}>Today</button>
                <button type="button" aria-pressed={date === yesterday} className={date === yesterday ? 'on' : ''} onClick={() => setDate(yesterday)}>Yesterday</button>
                <label className={`stp-pick${date !== iso(today) && date !== yesterday ? ' on' : ''}`}>
                  Pick…
                  <input type="date" value={date} max={iso(today)} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} aria-label="Pick a date" />
                </label>
              </div>
            </div>
            <div className="stp-hint">{d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>

          {tab === 'steps' ? (
            <label className="stp-group stp-row big">
              <span>Steps</span>
              <input type="number" inputMode="numeric" min={1} placeholder="0" value={steps} autoFocus
                onChange={(e) => setSteps(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </label>
          ) : (
            <div className="stp-calc">
              <div className="stp-kind">QUICK TIME</div>
              <div className="stp-quick">
                {QUICK_TIMES.map((m) => (
                  <button key={m} type="button" aria-pressed={time === String(m)} className={time === String(m) ? 'on' : ''} onClick={() => setTime(String(m))}>{m}m</button>
                ))}
              </div>
              <div className="stp-group">
                <label className="stp-row field">
                  <span>Walking time</span>
                  <span className="stp-in">
                    <input type="text" inputMode="decimal" value={time} aria-invalid={timeBad}
                      onChange={(e) => setTime(e.target.value.replace(/[^\d:.]/g, ''))} />
                    <em>min</em>
                  </span>
                </label>
                <label className="stp-row field">
                  <span>Speed</span>
                  <span className="stp-in"><input type="number" inputMode="decimal" min={0} step={0.1} value={speed} onChange={(e) => setSpeed(e.target.value)} /><em>km/h</em></span>
                </label>
                <label className="stp-row field last">
                  <span>Your height</span>
                  <span className="stp-in"><input type="number" inputMode="decimal" min={0} value={height} onChange={(e) => setHeight(e.target.value)} /><em>cm</em></span>
                </label>
              </div>
              {timeBad && <div className="stp-hint bad">Type minutes (45), or the treadmill time: 45:30 or 1:05:00.</div>}
              <div className="stp-est">
                <span className="stp-kind">ESTIMATED STEPS</span>
                <span><b className="mono">{est > 0 ? fmt(est) : '—'}</b> steps</span>
              </div>
              <div className="stp-hint">
                {est > 0 ? `Walking ${minutesLabel(mins).replace('min', ' min')} at ${speed} km/h · ${goal > 0 ? Math.min(100, Math.round((est / goal) * 100)) : 0}% of the daily goal` : 'Pick a time and a speed.'}
              </div>
            </div>
          )}

          <div className="stp-group stp-goalbox">
            <div className="stp-goal-top"><span className="stp-kind">{which.toUpperCase()} WITH THESE STEPS</span><b className="mono">{pct}%</b></div>
            <div className="stp-track"><div className={projected >= goal ? 'done' : ''} style={{ width: `${pct}%` }} /></div>
            <div className="stp-hint">{fmt(projected)} of {fmt(goal)}{projected >= goal ? ' · goal reached' : ` · ${fmt(goal - projected)} to go`}</div>
          </div>

          {error && <div className="stp-error" role="alert">{error}</div>}
          {saved && <div className="stp-saved" role="status">{saved}</div>}

          <div className="stp-actions wide">
            <button type="button" className="stp-btn" onClick={() => { setSaved(''); if (tab === 'calc') { setTime(''); setSpeed('5.0'); setHeight('183'); } else setSteps(''); }}>{tab === 'calc' ? 'Reset' : 'Clear'}</button>
            <button type="button" className="stp-btn primary" disabled={adding <= 0 || saving} onClick={save}>
              {saving ? 'Adding…' : adding > 0 ? `Add ${fmt(adding)} to ${which}` : 'Add steps'}
            </button>
          </div>
        </div>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StepsPage() {
  const [days, setDays] = useState<StepEntry[]>([]);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [logsByDay, setLogsByDay] = useState<Record<string, StepLogEntry[]>>({});
  const [dayView, setDayView] = useState<Date | null>(null);
  const [sheet, setSheet] = useState<'steps' | 'calc' | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(startOfToday);

  useEffect(() => {
    getGoals().then((g) => { if (g.steps) setGoal(g.steps); }).catch(() => {});
    const t = window.setInterval(() => { const n = startOfToday(); setToday((o) => (o.getTime() === n.getTime() ? o : n)); }, 60000);
    return () => window.clearInterval(t);
  }, []);

  const loadDays = useCallback(async () => {
    try { setDays(await getSteps()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load steps'); }
  }, []);
  const loadLogs = useCallback(async (date: string) => {
    try { const l = await getStepLogs(date); setLogsByDay((m) => ({ ...m, [date]: l })); } catch { /* shown as empty */ }
  }, []);

  const entriesDate = iso(dayView || today);
  useEffect(() => { loadDays(); }, [loadDays]);
  useEffect(() => { loadLogs(entriesDate); }, [entriesDate, loadLogs]);
  const reload = useCallback(() => { loadDays(); setLogsByDay({}); loadLogs(entriesDate); }, [loadDays, loadLogs, entriesDate]);
  useSocketEvent('steps-updated', reload);

  const byDay = useMemo(() => new Map(days.map((d) => [d.date, d.steps])), [days]);
  const first = useMemo(() => {
    const dates = days.filter((d) => d.steps > 0).map((d) => d.date).sort();
    return dates.length ? fromIso(dates[0]) : today;
  }, [days, today]);

  // Hours for the D view: fetched per day on demand.
  const hours = useCallback((d: Date) => {
    const k = iso(d);
    const logs = logsByDay[k];
    if (!logs) return new Array<number>(24).fill(0);
    return hoursFromLogs(logs);
  }, [logsByDay]);
  useEffect(() => { if (dayView && !logsByDay[iso(dayView)]) loadLogs(iso(dayView)); }, [dayView, logsByDay, loadLogs]);
  const onDayView = useCallback((d: Date | null) => {
    setDayView((o) => (o && d && o.getTime() === d.getTime()) || (!o && !d) ? o : d);
  }, []);

  // Highlights
  const last = (n: number, skip = 0) => Array.from({ length: n }, (_, i) => byDay.get(iso(addDays(today, -(i + skip)))) || 0).reverse();
  const week = last(7), prevWeek = last(7, 7);
  const weekAvg = mean(week), prevAvg = mean(prevWeek);
  const goalDays = week.filter((v) => v >= goal).length;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let best: { d: Date; v: number } | null = null;
  for (let d = monthStart; d <= today; d = addDays(d, 1)) {
    const v = byDay.get(iso(d)) || 0;
    if (v > 0 && (!best || v > best.v)) best = { d, v };
  }
  const change = prevAvg > 0 ? weekAvg / prevAvg : 0;
  const weekLine = prevAvg <= 0
    ? `${fmt(weekAvg)} steps a day over the last 7 days.`
    : change >= 1.8 ? `${fmt(weekAvg)} steps a day over the last 7 days, almost double the week before.`
    : change >= 1.05 ? `${fmt(weekAvg)} steps a day over the last 7 days, up from ${fmt(prevAvg)} the week before.`
    : change > 0.95 ? `${fmt(weekAvg)} steps a day over the last 7 days, about the same as the week before.`
    : `${fmt(weekAvg)} steps a day over the last 7 days, down from ${fmt(prevAvg)} the week before.`;
  const barMax = Math.max(weekAvg, prevAvg, 1);

  const entries = logsByDay[entriesDate] || [];
  const entriesTotal = entries.reduce((s, l) => s + l.steps, 0);
  const entriesTitle = dayName(fromIso(entriesDate), today);

  async function commitEdit(id: number) {
    const v = parseInt(draft, 10);
    if (!(v > 0)) { setEditing(null); return; }
    try { await updateStepLog(id, { steps: v }); setEditing(null); reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
  }
  async function remove(id: number) {
    if (!window.confirm('Delete this entry?')) return;
    try { await deleteStepLog(id); reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); }
  }

  return (
    <main className="page-mount stp">
      {error && <div className="stp-error" role="alert">{error}</div>}

      <div className="stp-top">
        <section className="stp-card stp-hero" aria-label="Steps chart">
          <StepsChart byDay={byDay} first={first} today={today} goal={goal} hours={hours} onDayView={onDayView} />
        </section>

        <aside className="stp-side" aria-label="Log steps and highlights">
          <div className="stp-tools">
            <div className="stp-actions stp-open">
              <button type="button" className="stp-btn primary" onClick={() => setSheet('calc')}><Plus size={16} /> Add steps</button>
            </div>

            {/* Website (wide screens): the step calculator and typing steps live here, always open (no buttons). */}
            <section className="stp-card stp-calc-card" aria-label="Add steps">
              <AddStepsForm startTab="calc" byDay={byDay} goal={goal} today={today} />
            </section>
          </div>

          <div className="stp-hls">
          <h2 className="stp-h2 phone-only">Highlights</h2>
          <article className="stp-card stp-hl">
            <div className="stp-hl-h"><TrendingUp size={15} /> This week</div>
            <p>{weekLine}</p>
            <div className="stp-cmp">
              <div><i style={{ width: `${(weekAvg / barMax) * 100}%` }} /><b className="mono">{fmt(weekAvg)}</b></div>
              <div className="prev"><i style={{ width: `${(prevAvg / barMax) * 100}%` }} /><b className="mono">{fmt(prevAvg)}</b></div>
            </div>
          </article>

          <article className="stp-card stp-hl">
            <div className="stp-hl-h"><Target size={15} /> Goal days</div>
            <p>{fmt(goal)} steps on {goalDays} of the last 7 days.</p>
            <div className="stp-dots">
              {week.map((v, i) => {
                const d = addDays(today, i - 6);
                return <span key={i}><i className={v >= goal ? 'hit' : ''} title={`${longDay(d)}: ${fmt(v)}`} />{DAYS[(d.getDay() + 6) % 7].charAt(0)}</span>;
              })}
            </div>
          </article>

          {best && (
            <article className="stp-card stp-hl">
              <div className="stp-hl-h"><Star size={15} /> Best day this month</div>
              <p>{best.d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}, <b className="mono">{fmt(best.v)}</b> steps.</p>
            </article>
          )}
          </div>
        </aside>
      </div>

      <section className="stp-card stp-entries" aria-label={`Entries for ${entriesTitle}`}>
        <div className="stp-entries-h">
          <h2 className="stp-h2">{entriesTitle === 'Today' ? 'Today' : entriesTitle}</h2>
          <span>{fmt(entriesTotal)} steps · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        {entries.length === 0 ? (
          <div className="stp-empty">No steps logged for this day.</div>
        ) : (
          <ul>
            {entries.map((l) => (
              <li key={l.id}>
                <span className="t mono">{formatLogTime(l.logged_at)}</span>
                <span className="n">{l.note === 'Samsung Health' ? <>Samsung Health <em>· last sync</em></> : l.note ? l.note.replace(/^Calculator: /, 'Walk · ').replace(/(\d)min/, '$1 min').replace('@', 'at').replace('km/h', ' km/h') : 'Logged'}</span>
                {editing === l.id ? (
                  <span className="e">
                    <input type="number" inputMode="numeric" min={1} value={draft} autoFocus aria-label="Steps"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(l.id); if (e.key === 'Escape') setEditing(null); }} />
                    <button type="button" aria-label="Save" onClick={() => commitEdit(l.id)}><Check size={16} /></button>
                    <button type="button" aria-label="Cancel" onClick={() => setEditing(null)}><X size={16} /></button>
                  </span>
                ) : (
                  <>
                    <span className="v mono">{fmt(l.steps)}</span>
                    <span className="a">
                      <button type="button" aria-label="Edit entry" onClick={() => { setEditing(l.id); setDraft(String(l.steps)); }}><Pencil size={15} /></button>
                      <button type="button" aria-label="Delete entry" onClick={() => remove(l.id)}><Trash2 size={15} /></button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddStepsSheet open={sheet !== null} tab={sheet || 'steps'} onClose={() => setSheet(null)} byDay={byDay} goal={goal} today={today} />

      <style jsx global>{`
        .stp { --g: #45bf6e; --g-dim: rgba(69, 191, 110, 0.3); --g-ink: #1e7a44; --g-btn: #23804a; --g-soft: rgba(69, 191, 110, 0.14);
          max-width: 1120px; margin: 0 auto; padding: 24px 16px 80px; display: flex; flex-direction: column; gap: 16px; color: var(--color-foreground); }
        .dark .stp { --g-ink: #7cd69a; --g-soft: #1f3a2b; }
        .stp .mono { font-family: var(--font-mono); font-weight: 600; }
        .stp-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; box-shadow: var(--shadow-card); }
        .stp-top { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
        .stp-hero { padding: 0; border: 0; background: none; box-shadow: none; }
        .stp-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .stp-h2 { margin: 6px 0 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
        @media (min-width: 700px) {
          .stp-top { grid-template-columns: minmax(0, 1fr) 280px; align-items: start; }
          .stp-hero { padding: 18px 18px 14px; background: var(--color-surface); border: 1px solid var(--color-border); box-shadow: var(--shadow-card); }
          .stp .phone-only { display: none; }
          .stp-chart-head { flex-direction: row !important; align-items: center !important; }
          .stp-seg { width: 290px; }
        }
        .stp-calc-card { display: none; }
        .stp-tools, .stp-hls { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        @media (min-width: 700px) {
          /* Website and the unfolded Fold: chart with the highlights in a row under it; Log steps + the calculator on the right. */
          .stp-top { grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: auto 1fr; grid-template-areas: 'hero tools' 'hls tools'; align-items: start; }
          .stp-hero { grid-area: hero; }
          .stp-side { display: contents; }
          .stp-tools { grid-area: tools; }
          .stp-hls { grid-area: hls; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: stretch; }
          .stp-actions.stp-open { display: none; }
          .stp-calc-card { display: flex; flex-direction: column; padding: 4px 0 2px; }
          .stp-calc-card .stp-sheet-body { padding: 10px 12px 12px; gap: 12px; }
          .stp-calc-card .stp-group { background: var(--color-surface-warm); }
          .stp-calc-card .stp-quick button { background: var(--color-surface-warm); }
          .stp-calc-card .stp-quick button.on { background: var(--g); }
          .stp-calc-card .stp-est b { font-size: 28px; }
          .stp-calc-card .stp-row.date { flex-direction: column; align-items: flex-start; gap: 8px; padding-top: 12px; }
          .stp-calc-card .stp-row.date .stp-chips { justify-content: flex-start; flex-wrap: nowrap; }
        }
        @media (min-width: 1000px) {
          .stp-top { grid-template-columns: minmax(0, 1fr) 360px; }
          .stp-hls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .stp-saved { padding: 10px 12px; border-radius: 10px; font-size: 13px; color: var(--g-ink); background: var(--g-soft); }
        .stp-actions.wide { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
        .stp-actions.wide .stp-btn { height: 50px; font-size: 15px; }

        .stp-chart { display: flex; flex-direction: column; gap: 14px; user-select: none; }
        .stp-chart-head { display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 12px; }
        .stp-title { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.6px; }
        .stp-seg { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; padding: 2px; border-radius: 10px; background: var(--color-surface-warm); border: 1px solid var(--color-border); }
        .stp-seg.two { grid-template-columns: repeat(2, minmax(0, 1fr)); width: auto; }
        .stp-seg button { height: 34px; border: 0; border-radius: 8px; background: transparent; color: var(--color-muted-foreground); font: 600 13px var(--font-sans); cursor: pointer; transition: background 0.2s, color 0.2s; }
        .stp-seg button.on { background: var(--color-surface); color: var(--color-foreground); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); }
        .stp-sum-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
        .stp-sum { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .stp-kind { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: var(--color-muted-foreground); }
        .stp-big { display: flex; align-items: baseline; gap: 6px; }
        .stp-num { font-family: var(--font-mono); font-size: 40px; font-weight: 600; letter-spacing: -1.5px; line-height: 1.1; }
        .stp-unit, .stp-when { font-size: 14px; color: var(--color-muted-foreground); }
        .stp-unit { font-size: 16px; }
        .stp-arrows { display: flex; gap: 6px; flex: none; }
        .stp-arrows button { width: 40px; height: 40px; border-radius: 20px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-foreground); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .stp-arrows button:disabled { color: var(--color-muted-foreground); opacity: 0.45; cursor: default; }
        .stp-plot-row { display: flex; gap: 6px; }
        .stp-plot { position: relative; flex: 1; height: 220px; overflow: hidden; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); touch-action: pan-y; cursor: grab; }
        @media (min-width: 700px) { .stp-plot { height: 300px; } .stp-num { font-size: 46px; } }
        .stp-mid { position: absolute; left: 0; right: 0; top: 50%; border-top: 1px solid var(--color-border); opacity: 0.6; }
        .stp-goal { position: absolute; left: 0; right: 0; border-top: 2px dashed var(--color-muted-foreground); opacity: 0.75; z-index: 1; pointer-events: none; transition: bottom 0.5s cubic-bezier(0.2, 0.9, 0.25, 1); }
        .stp-bars { position: absolute; inset: 0; display: flex; align-items: stretch; gap: 3px; }
        .stp-x { display: flex; gap: 3px; font-size: 11px; color: var(--color-muted-foreground); height: 14px; }
        .stp-bars.r-W, .stp-x.r-W { gap: 12px; } .stp-bars.r-Y, .stp-x.r-Y { gap: 7px; }
        @media (min-width: 700px) {
          .stp-bars.r-D, .stp-x.r-D { gap: 6px; } .stp-bars.r-M, .stp-x.r-M { gap: 6px; } .stp-bars.r-6M, .stp-x.r-6M { gap: 5px; }
          .stp-bars.r-W, .stp-x.r-W { gap: 28px; } .stp-bars.r-Y, .stp-x.r-Y { gap: 16px; }
        }
        .stp-cell { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
        .stp-bar { width: 100%; padding: 0; border: 0; display: block; cursor: pointer; background: var(--g); border-radius: 5px 5px 2px 2px;
          transition: height 0.5s cubic-bezier(0.2, 0.9, 0.25, 1), background 0.2s; }
        .r-D .stp-bar, .r-M .stp-bar, .r-6M .stp-bar { border-radius: 3px 3px 1px 1px; }
        .stp-bar.dim { background: var(--g-dim); }
        .stp-bar.empty { background: var(--color-border); }
        .stp-y { width: 40px; height: 220px; display: flex; flex-direction: column; justify-content: space-between; font-family: var(--font-mono); font-size: 10px; color: var(--color-muted-foreground); margin-top: -6px; }
        @media (min-width: 700px) { .stp-y { height: 300px; } }
        .stp-y span:last-child { margin-bottom: -6px; }
        .stp-x-wrap { overflow: hidden; margin-right: 46px; margin-top: -8px; }
        .stp-x span { flex: 1 1 0; min-width: 0; white-space: nowrap; }
        .stp-x b { font-weight: 400; } .stp-x .long { display: none; }
        @media (min-width: 700px) { .stp-x .long { display: inline; } .stp-x .short { display: none; } }
        .stp-legend { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--color-muted-foreground); }
        .stp-goal-key { display: flex; align-items: center; gap: 8px; }
        .stp-goal-key i { width: 18px; border-top: 2px dashed var(--color-muted-foreground); }

        .stp-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .stp-actions.stp-open { grid-template-columns: minmax(0, 1fr); }
        .stp-btn { height: 46px; border-radius: 12px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-foreground);
          font: 600 14px var(--font-sans); display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
        .stp-btn.primary { background: var(--g-btn); border-color: var(--g-btn); color: #fff; }
        .stp-btn:disabled { opacity: 0.5; cursor: default; }
        .stp-hl { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
        .stp-hl p { margin: 0; font-size: 15px; line-height: 1.4; font-weight: 500; }
        .stp-hl-h { display: flex; align-items: center; gap: 8px; color: var(--g-ink); font-size: 13px; font-weight: 600; }
        .stp-cmp { display: flex; flex-direction: column; gap: 6px; }
        .stp-cmp div { display: flex; align-items: center; gap: 8px; }
        .stp-cmp i { display: block; height: 9px; border-radius: 5px; background: var(--g); flex: none; max-width: calc(100% - 52px); min-width: 4px; }
        .stp-cmp .prev i { background: var(--color-muted-foreground); opacity: 0.55; }
        .stp-cmp b { margin-left: auto; font-size: 12px; }
        .stp-dots { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; text-align: center; font-size: 11px; color: var(--color-muted-foreground); }
        .stp-dots span { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .stp-dots i { width: 22px; height: 22px; border-radius: 11px; box-sizing: border-box; border: 2px solid var(--color-border); }
        .stp-dots i.hit { background: var(--g); border-color: var(--g); }

        .stp-entries { padding: 6px 16px 8px; }
        .stp-entries-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0 6px; font-size: 13px; color: var(--color-muted-foreground); }
        .stp-entries-h .stp-h2 { margin: 0; font-size: 17px; color: var(--color-foreground); }
        .stp-entries ul { list-style: none; margin: 0; padding: 0; }
        .stp-entries li { display: flex; align-items: center; gap: 10px; min-height: 52px; border-top: 1px solid var(--color-border); }
        .stp-entries .t { width: 64px; flex: none; font-size: 11px; font-weight: 400; color: var(--color-muted-foreground); }
        .stp-entries .n { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .stp-entries .n em { font-style: normal; color: var(--color-muted-foreground); }
        .stp-entries .v { font-size: 14px; }
        .stp-entries .a, .stp-entries .e { display: flex; gap: 2px; align-items: center; }
        .stp-entries button { width: 40px; height: 40px; border: 0; border-radius: 8px; background: transparent; color: var(--color-muted-foreground); display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .stp-entries input { width: 90px; height: 36px; border-radius: 8px; border: 1px solid var(--color-border); background: transparent; color: var(--color-foreground); padding: 0 8px; font-family: var(--font-mono); }
        .stp-empty { padding: 16px 0; font-size: 14px; color: var(--color-muted-foreground); border-top: 1px solid var(--color-border); }
        .stp-error { padding: 10px 12px; border-radius: 10px; font-size: 13px; color: var(--color-critical, #e5484d); border: 1px solid currentColor; }

        .stp-sheet-wrap { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.55); display: flex; align-items: flex-end; justify-content: center; animation: stpFade 0.2s ease; }
        .stp-sheet { width: 100%; max-height: 92vh; overflow-y: auto; background: var(--color-background); color: var(--color-foreground); border-radius: 18px 18px 0 0; border-top: 1px solid var(--color-border);
          animation: stpUp 0.32s cubic-bezier(0.2, 0.9, 0.25, 1); padding-bottom: env(safe-area-inset-bottom); }
        @media (min-width: 700px) {
          .stp-sheet-wrap { align-items: center; }
          .stp-sheet { width: 480px; max-height: 90vh; border-radius: 18px; border: 1px solid var(--color-border); animation: stpPop 0.22s ease; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); }
          .stp-grab { display: none; }
        }
        @keyframes stpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes stpUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes stpPop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .stp-grab { width: 40px; height: 5px; border-radius: 3px; background: var(--color-border); margin: 8px auto 0; }
        .stp-sheet-head { display: grid; grid-template-columns: 80px minmax(0, 1fr) 80px; align-items: center; height: 52px; padding: 0 8px; }
        .stp-sheet-head h2 { margin: 0; text-align: center; font-size: 17px; font-weight: 700; }
        .stp-link { height: 44px; border: 0; background: transparent; color: var(--g-ink); font: 400 16px var(--font-sans); padding: 0 8px; text-align: left; cursor: pointer; }
        .stp-link.strong { font-weight: 700; text-align: right; }
        .stp-link:disabled { color: var(--color-muted-foreground); opacity: 0.6; cursor: default; }
        .stp-sheet-body { display: flex; flex-direction: column; gap: 14px; padding: 4px 16px 20px; }
        .stp-group { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; padding: 4px 14px; }
        .stp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 52px; font-size: 15px; }
        .stp-row.field { border-bottom: 1px solid var(--color-border); } .stp-row.field.last { border-bottom: 0; }
        .stp-row.big { padding: 10px 14px; }
        .stp-row.big input { width: 160px; text-align: right; background: transparent; border: 0; outline: none; color: var(--color-foreground); font: 600 30px var(--font-mono); }
        .stp-chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .stp-chips button, .stp-pick { height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--color-border); background: transparent; color: var(--color-foreground);
          font: 600 13px var(--font-sans); cursor: pointer; display: inline-flex; align-items: center; position: relative; }
        .stp-chips .on, .stp-pick.on { background: var(--g-soft); border-color: transparent; color: var(--g-ink); }
        .stp-pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
        .stp-hint { font-size: 12px; color: var(--color-muted-foreground); padding: 0 2px 8px; }
        .stp-group .stp-hint { padding: 0 0 10px; }
        .stp-hint.bad { color: var(--color-critical, #e5484d); }
        .stp-hint b { color: var(--color-foreground); }
        .stp-calc { display: flex; flex-direction: column; gap: 10px; }
        .stp-quick { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
        .stp-quick button { height: 36px; border-radius: 18px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-foreground); font: 600 13px var(--font-mono); cursor: pointer; padding: 0; }
        .stp-quick button.on { background: var(--g); border-color: var(--g); color: #0f2414; }
        .stp-in { display: flex; align-items: baseline; gap: 6px; }
        .stp-in input { width: 120px; text-align: right; background: transparent; border: 0; outline: none; color: var(--color-foreground); font: 400 18px var(--font-mono); }
        .stp-in input[aria-invalid='true'] { color: var(--color-critical, #e5484d); }
        .stp-in em { font-style: normal; font-size: 13px; color: var(--color-muted-foreground); width: 36px; }
        .stp-est { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 2px 2px 0; }
        .stp-est b { font-size: 32px; }
        .stp-goalbox { padding: 12px 14px 4px; display: flex; flex-direction: column; gap: 8px; }
        .stp-goal-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .stp-track { height: 8px; border-radius: 4px; background: var(--color-border); overflow: hidden; }
        .stp-track div { height: 100%; border-radius: 4px; background: var(--g-ink); transition: width 0.35s ease; }
        .stp-track div.done { background: var(--g); }
        @media (prefers-reduced-motion: reduce) {
          .stp-bar, .stp-goal, .stp-bars, .stp-x, .stp-track div { transition: none !important; }
          .stp-sheet, .stp-sheet-wrap { animation: none; }
        }
      `}</style>
    </main>
  );
}
