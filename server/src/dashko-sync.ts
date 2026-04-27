// One-way sync from Dashki -> Dashko via the deployed Dashko tRPC API.
//
// Configured via env:
//   DASHKO_API_URL              base URL of the Dashko Hono API (no trailing /)
//   DASHKO_PAT                  personal access token starting "dshk_pat_"
//   DASHKO_STEP_HABIT_ID        UUID of the Dashko habit to mark when daily steps cross threshold
//   DASHKO_STEP_THRESHOLD       integer step count needed to mark done (default 10000)
//   DASHKO_CALORIE_HABIT_ID     UUID of the Dashko habit to mark when any journal entry is logged today
//   DASHKO_WEIGHT_GOAL_ID       UUID of the Dashko goal whose currentValue tracks latest weight (kg)
//
// Any missing env var disables the corresponding sync silently. Failures are
// logged to console.error and never thrown — Dashki must keep working even if
// Dashko is down or the PAT is revoked.

import { db } from './db';

const API_URL = process.env.DASHKO_API_URL?.replace(/\/$/, '') ?? '';
const PAT = process.env.DASHKO_PAT ?? '';
const STEP_HABIT_ID = process.env.DASHKO_STEP_HABIT_ID ?? '';
const STEP_THRESHOLD = Number(process.env.DASHKO_STEP_THRESHOLD ?? 10000);
const CALORIE_HABIT_ID = process.env.DASHKO_CALORIE_HABIT_ID ?? '';
const WEIGHT_GOAL_ID = process.env.DASHKO_WEIGHT_GOAL_ID ?? '';

function dashkoConfigured(): boolean {
  return Boolean(API_URL && PAT);
}

async function callDashko(procedure: string, input: Record<string, unknown>): Promise<unknown> {
  if (!dashkoConfigured()) return null;
  const url = `${API_URL}/trpc/${procedure}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${PAT}`,
      },
      body: JSON.stringify({ json: input }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[dashko-sync] ${procedure} ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[dashko-sync] ${procedure} failed:`, err);
    return null;
  }
}

/** Sums today's StepLogEntries and marks the configured habit done if the
 *  total crosses the threshold. Idempotent — repeated calls are safe. */
export async function syncStepsHabitForToday(today: string): Promise<void> {
  if (!STEP_HABIT_ID || !dashkoConfigured()) return;
  db.get(
    `SELECT COALESCE(SUM(steps), 0) AS total FROM StepLogEntries WHERE date = ?`,
    [today],
    (err, row: { total: number } | undefined) => {
      if (err) {
        console.warn('[dashko-sync] failed to read today step total', err);
        return;
      }
      const total = Number(row?.total ?? 0);
      const done = total >= STEP_THRESHOLD;
      void callDashko('habits.setDone', {
        habitId: STEP_HABIT_ID,
        date: today,
        done,
      });
    },
  );
}

/** Marks the calorie habit done (idempotent) — call after any journal entry
 *  is created/updated for today. We don't bother clearing it if all entries
 *  are deleted; that's vanishingly rare. */
export async function syncCalorieHabit(date: string): Promise<void> {
  if (!CALORIE_HABIT_ID || !dashkoConfigured()) return;
  await callDashko('habits.setDone', {
    habitId: CALORIE_HABIT_ID,
    date,
    done: true,
  });
}

/** Pushes the most recent weight (rounded to nearest kg) to a Dashko count
 *  goal's currentValue. Goal target stores the target weight in kg. */
export async function syncWeightGoal(weightKg: number): Promise<void> {
  if (!WEIGHT_GOAL_ID || !dashkoConfigured()) return;
  const rounded = Math.round(weightKg);
  if (!Number.isFinite(rounded) || rounded <= 0) return;
  await callDashko('goals.setProgress', {
    goalId: WEIGHT_GOAL_ID,
    currentValue: rounded,
  });
}

export function todayLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
