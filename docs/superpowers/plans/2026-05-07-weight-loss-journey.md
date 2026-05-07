# Weight Loss Journey Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Journey" feature to the Weight page — settable start date, days-since-start counter, calorie-deficit-based projection of on-track status and ETA. Expose journey state via `GET /api/weight/journey` for cross-app consumption.

**Architecture:** Single PR. Two new optional columns on `Goals` (`weight_journey_start_date`, `tdee_calories`). Pure projection helper in `server/src/journey.ts` with `node --test` unit coverage. New `GET /api/weight/journey` endpoint loads the inputs and calls the helper. Settings page gains two new inputs; Weight page gains a `JourneyCard` component that renders the API payload.

**Tech Stack:** Express + sqlite3 (server), Next.js 14 + React 18 + Tailwind (web), Node 20 built-in test runner.

**Spec:** [docs/superpowers/specs/2026-05-07-weight-loss-journey-design.md](docs/superpowers/specs/2026-05-07-weight-loss-journey-design.md)

**Ticket:** DSHKI-24

---

## File Structure

### New files
- `server/src/journey.ts` — pure function `computeJourney(input) → WeightJourney`. No DB access. Single source of truth for the projection math.
- `server/src/journey.test.ts` — `node --test` coverage for the pure helper (date math, missing-input fallbacks, on-track thresholds, projection ETA).
- `web/src/components/JourneyCard.tsx` — render the journey payload. Handles every empty/partial state from the spec.

### Modified files
- `server/src/db.ts` — additive migration: `ALTER TABLE Goals ADD COLUMN weight_journey_start_date`, `ADD COLUMN tdee_calories`.
- `server/src/routes/goals.ts` — read/write the two new fields; emit them on `goals-updated` socket payload.
- `server/src/routes/weight.ts` — new `GET /journey` handler.
- `web/src/lib/types.ts` — extend `Goals` with `weight_journey_start_date` and `tdee_calories`; add `WeightJourney` interface.
- `web/src/lib/api.ts` — `getWeightJourney()`; `updateGoals` accepts the two new fields.
- `web/src/app/settings/page.tsx` — two new inputs in the Goals card.
- `web/src/app/weight/page.tsx` — render `<JourneyCard>` between stats and chart; refresh on `goals-updated` and `weight-updated` socket events.

### Test approach
- Pure projection math → `journey.test.ts` via `node --test` (mirrors existing `nutrition.test.ts`).
- API + UI → manual verification against a freshly-pulled prod DB. Matches Terry's `local-test-before-push` workflow.

---

## Conventions

- After every backend change: `cd server && npm run build` to confirm TS compiles cleanly. After tests change: `cd server && npm test`.
- After every frontend change: `cd web && npx tsc --noEmit` for type checks. **Do NOT run `npm run build` while the dev server is running** — it clobbers `.next/` (per Terry's notes).
- Commit cadence: one commit per task. Format: `feat(scope): one-line summary` (or `fix:`/`refactor:`/`chore:`). Each commit ends with the Co-Authored-By trailer.
- Constants — exact values from the spec:
  - `KCAL_PER_KG_FAT = 7700`
  - `START_WEIGHT_LOOKUP_WINDOW_DAYS = 3`
  - `ON_TRACK_BAND_KG = 0.3`
  - `OFF_TRACK_THRESHOLD_KG = 1.0`

---

## Task 1: Schema migration — add `weight_journey_start_date` + `tdee_calories` to `Goals`

**Files:**
- Modify: [server/src/db.ts](server/src/db.ts) — add migration block alongside existing `Goals` setup

- [ ] **Step 1: Add the additive migration**

In `server/src/db.ts`, find the `// ── Goals (user-configurable targets) ──` block. Below the `INSERT OR IGNORE INTO Goals (id) VALUES (1)` line, add a new `PRAGMA table_info` migration following the same pattern as `JournalEntries`:

```ts
// ── Migration: add weight_journey_start_date + tdee_calories to Goals (DSHKI-24) ──
db.all(`PRAGMA table_info(Goals)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
  if (pragmaErr) return;
  const existingCols = new Set(columns.map((c) => c.name));
  const migrations: string[] = [];

  if (!existingCols.has('weight_journey_start_date')) {
    migrations.push('ALTER TABLE Goals ADD COLUMN weight_journey_start_date TEXT');
  }
  if (!existingCols.has('tdee_calories')) {
    migrations.push('ALTER TABLE Goals ADD COLUMN tdee_calories REAL');
  }

  for (const sql of migrations) {
    db.run(sql, [], (err) => {
      if (err) console.error('[db] migration error:', err.message);
      else console.log(`[db] ran migration: ${sql}`);
    });
  }
});
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd server && npm run build`
Expected: completes with no TS errors. Migration runs on next startup.

- [ ] **Step 3: Smoke-test the migration**

Run: `cd server && npm run dev`
Expected: log lines `[db] ran migration: ALTER TABLE Goals ADD COLUMN weight_journey_start_date TEXT` and `[db] ran migration: ALTER TABLE Goals ADD COLUMN tdee_calories REAL` appear once. Restart the server — those lines should NOT appear (migration is idempotent).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add server/src/db.ts
git commit -m "$(cat <<'EOF'
feat(db): add journey columns to Goals (DSHKI-24)

Adds weight_journey_start_date (TEXT) and tdee_calories (REAL)
as nullable, additive columns. Idempotent PRAGMA-guarded migration
matches the existing pattern used for JournalEntries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `goals.ts` route to read/write the two new fields

**Files:**
- Modify: [server/src/routes/goals.ts](server/src/routes/goals.ts)

- [ ] **Step 1: Extend the `Goals` interface**

In `server/src/routes/goals.ts`, replace the existing `Goals` interface (lines 7–16) with:

```ts
export interface Goals {
  id: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  steps: number | null;
  weight_kg: number | null;
  weight_journey_start_date: string | null;
  tdee_calories: number | null;
  updated_at: string;
}
```

And update `DEFAULT_GOALS` (lines 19–26) — add two new keys:

```ts
const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: null,
  fat: null,
  steps: 10000,
  weight_kg: null,
  weight_journey_start_date: null,
  tdee_calories: null,
};
```

- [ ] **Step 2: Update GET to return the new columns**

In the `router.get('/'`, …)` handler, replace the SELECT statement and the response-shaping logic. The `SELECT` should include the new columns:

```ts
db.get(
  `SELECT id, calories, protein, carbs, fat, steps, weight_kg,
          weight_journey_start_date, tdee_calories, updated_at
   FROM Goals WHERE id = 1`,
  [],
  (err, row: Goals | undefined) => {
    if (err) {
      console.error('[error] GET /api/goals', err);
      return res.status(500).json({ error: 'Failed to fetch goals' });
    }

    if (!row) {
      return res.json({ ...DEFAULT_GOALS, id: 1, updated_at: new Date().toISOString() });
    }

    const goals = {
      id: row.id,
      calories: row.calories ?? DEFAULT_GOALS.calories,
      protein: row.protein ?? DEFAULT_GOALS.protein,
      carbs: row.carbs ?? DEFAULT_GOALS.carbs,
      fat: row.fat ?? DEFAULT_GOALS.fat,
      steps: row.steps ?? DEFAULT_GOALS.steps,
      weight_kg: row.weight_kg ?? DEFAULT_GOALS.weight_kg,
      weight_journey_start_date: row.weight_journey_start_date ?? null,
      tdee_calories: row.tdee_calories ?? null,
      updated_at: row.updated_at,
    };

    res.json(goals);
  }
);
```

- [ ] **Step 3: Update PUT to accept the new fields**

In the `router.put('/'`, …)` handler, after the existing `weight_kg` validation block (lines 116–123), add:

```ts
if (weight_journey_start_date !== undefined) {
  const val = weight_journey_start_date === null ? null : String(weight_journey_start_date).trim();
  if (val !== null && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return res.status(400).json({ error: 'Invalid weight_journey_start_date — must be YYYY-MM-DD' });
  }
  updates.push('weight_journey_start_date = ?');
  params.push(val);
}

if (tdee_calories !== undefined) {
  const val = tdee_calories === null ? null : Number(tdee_calories);
  if (val !== null && (!Number.isFinite(val) || val <= 0)) {
    return res.status(400).json({ error: 'Invalid tdee_calories value' });
  }
  updates.push('tdee_calories = ?');
  params.push(val);
}
```

And destructure them from `req.body` at the top of the handler — replace:

```ts
const { calories, protein, carbs, fat, steps, weight_kg } = req.body || {};
```

with:

```ts
const { calories, protein, carbs, fat, steps, weight_kg, weight_journey_start_date, tdee_calories } =
  req.body || {};
```

Note: `params.push(val)` for the journey start date — `val` is `string | null`, but the existing `params` array typed as `(number | null)[]`. Widen the type at the top of the handler:

```ts
const params: (number | string | null)[] = [];
```

- [ ] **Step 4: Update PUT response shaping**

In the post-update `db.get` callback, replace the SELECT and response shape to include the new columns — same shape as Step 2:

```ts
db.get(
  `SELECT id, calories, protein, carbs, fat, steps, weight_kg,
          weight_journey_start_date, tdee_calories, updated_at
   FROM Goals WHERE id = 1`,
  [],
  (err2, row: Goals | undefined) => {
    if (err2) {
      console.error('[error] GET /api/goals after update', err2);
      return res.status(500).json({ error: 'Failed to fetch updated goals' });
    }

    const goals = {
      id: row!.id,
      calories: row!.calories ?? DEFAULT_GOALS.calories,
      protein: row!.protein ?? DEFAULT_GOALS.protein,
      carbs: row!.carbs ?? DEFAULT_GOALS.carbs,
      fat: row!.fat ?? DEFAULT_GOALS.fat,
      steps: row!.steps ?? DEFAULT_GOALS.steps,
      weight_kg: row!.weight_kg ?? DEFAULT_GOALS.weight_kg,
      weight_journey_start_date: row!.weight_journey_start_date ?? null,
      tdee_calories: row!.tdee_calories ?? null,
      updated_at: row!.updated_at,
    };

    try { getIo().emit('goals-updated', goals); } catch (_) {}
    res.json(goals);
  }
);
```

- [ ] **Step 5: Verify the build compiles**

Run: `cd server && npm run build`
Expected: completes with no TS errors.

- [ ] **Step 6: Smoke-test via curl**

Start dev server (`cd server && npm run dev`) and in another shell:

```bash
curl -s http://localhost:4000/api/goals | jq
# expect: weight_journey_start_date: null, tdee_calories: null

curl -s -X PUT http://localhost:4000/api/goals \
  -H 'Content-Type: application/json' \
  -d '{"weight_journey_start_date":"2026-04-01","tdee_calories":2500}' | jq
# expect: those values echoed back

curl -s -X PUT http://localhost:4000/api/goals \
  -H 'Content-Type: application/json' \
  -d '{"weight_journey_start_date":"not-a-date"}'
# expect: 400 with "Invalid weight_journey_start_date" message
```

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/goals.ts
git commit -m "$(cat <<'EOF'
feat(goals): expose journey start date + TDEE (DSHKI-24)

Goals API now reads/writes weight_journey_start_date (ISO date)
and tdee_calories (positive number). Backwards compatible — both
optional, default null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure journey computation module + tests

**Files:**
- Create: `server/src/journey.ts`
- Create: `server/src/journey.test.ts`

- [ ] **Step 1: Create `journey.ts` with input/output types and constants**

```ts
// server/src/journey.ts
//
// Pure projection math for the weight loss journey feature (DSHKI-24).
// No DB access — the route handler is responsible for loading inputs.

export const KCAL_PER_KG_FAT = 7700;
export const START_WEIGHT_LOOKUP_WINDOW_DAYS = 3;
export const ON_TRACK_BAND_KG = 0.3;
export const OFF_TRACK_THRESHOLD_KG = 1.0;

export type OnTrackStatus = 'on_track' | 'ahead' | 'behind' | 'off_track';

export interface WeightSample {
  date: string;       // YYYY-MM-DD
  weight_kg: number;
}

export interface DailyCalories {
  date: string;       // YYYY-MM-DD
  calories: number;   // total kcal logged that day, > 0
}

export interface JourneyInput {
  /** Today, in local-time YYYY-MM-DD. */
  today: string;
  /** Goals row values. */
  start_date: string | null;
  goal_weight_kg: number | null;
  tdee_calories: number | null;
  /** All weight log entries (any order, any date range). */
  weight_entries: WeightSample[];
  /** Daily calorie totals from the journal — only days with at least one entry. */
  daily_calories: DailyCalories[];
}

export interface WeightJourney {
  start_date: string | null;
  days_since_start: number | null;
  starting_weight_kg: number | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  lost_kg: number | null;
  tdee_calories: number | null;
  avg_actual_calories: number | null;
  avg_deficit_per_day: number | null;
  on_track: OnTrackStatus | null;
  predicted_weight_today_kg: number | null;
  actual_vs_predicted_kg: number | null;
  projected_goal_date: string | null;
  days_to_goal: number | null;
}
```

- [ ] **Step 2: Add the `daysBetween` and `addDays` date helpers**

Append to `server/src/journey.ts`:

```ts
function parseISO(date: string): Date {
  // Treat YYYY-MM-DD as a local-midnight date (avoid UTC drift).
  return new Date(date + 'T00:00:00');
}

function toISO(d: Date): string {
  // en-CA gives YYYY-MM-DD in local time.
  return d.toLocaleString('en-CA').split(',')[0];
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = parseISO(toIso).getTime() - parseISO(fromIso).getTime();
  return Math.round(ms / 86400000);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}
```

- [ ] **Step 3: Add the `findStartingWeight` helper**

Append:

```ts
/**
 * Find the weight entry on `start_date`, or the closest entry within
 * ±START_WEIGHT_LOOKUP_WINDOW_DAYS days. Returns null when no candidate exists.
 */
export function findStartingWeight(
  start_date: string,
  entries: WeightSample[]
): number | null {
  let best: { entry: WeightSample; distance: number } | null = null;
  for (const e of entries) {
    const distance = Math.abs(daysBetween(start_date, e.date));
    if (distance > START_WEIGHT_LOOKUP_WINDOW_DAYS) continue;
    if (!best || distance < best.distance) {
      best = { entry: e, distance };
    }
  }
  return best?.entry.weight_kg ?? null;
}
```

- [ ] **Step 4: Add the `findCurrentWeight` helper**

Append:

```ts
/**
 * Most recent weight entry by date (ties broken by latest position in input — caller
 * is expected to sort by `created_at` ASC if needed). Returns null when list is empty.
 */
export function findCurrentWeight(entries: WeightSample[]): number | null {
  if (!entries.length) return null;
  let latest = entries[0];
  for (const e of entries) {
    if (e.date > latest.date) latest = e;
  }
  return latest.weight_kg;
}
```

- [ ] **Step 5: Add the `classifyOnTrack` helper**

Append:

```ts
/**
 * Map actual_vs_predicted (negative = ahead of schedule, positive = behind) to a label.
 * Thresholds from the spec: within ±0.3 kg = on track, >0.3 kg behind = behind,
 * >1.0 kg behind = off track, any amount ahead = ahead.
 */
export function classifyOnTrack(actual_vs_predicted_kg: number): OnTrackStatus {
  if (actual_vs_predicted_kg <= -ON_TRACK_BAND_KG) return 'ahead';
  if (actual_vs_predicted_kg <= ON_TRACK_BAND_KG) return 'on_track';
  if (actual_vs_predicted_kg <= OFF_TRACK_THRESHOLD_KG) return 'behind';
  return 'off_track';
}
```

- [ ] **Step 6: Add the main `computeJourney` function**

Append:

```ts
function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeJourney(input: JourneyInput): WeightJourney {
  const empty: WeightJourney = {
    start_date: input.start_date,
    days_since_start: null,
    starting_weight_kg: null,
    current_weight_kg: findCurrentWeight(input.weight_entries),
    goal_weight_kg: input.goal_weight_kg,
    lost_kg: null,
    tdee_calories: input.tdee_calories,
    avg_actual_calories: null,
    avg_deficit_per_day: null,
    on_track: null,
    predicted_weight_today_kg: null,
    actual_vs_predicted_kg: null,
    projected_goal_date: null,
    days_to_goal: null,
  };

  if (!input.start_date) return empty;

  const days_since_start = daysBetween(input.start_date, input.today);
  empty.days_since_start = days_since_start;

  const starting_weight_kg = findStartingWeight(input.start_date, input.weight_entries);
  empty.starting_weight_kg = starting_weight_kg;

  const current_weight_kg = empty.current_weight_kg;

  if (starting_weight_kg !== null && current_weight_kg !== null) {
    empty.lost_kg = round(starting_weight_kg - current_weight_kg, 2);
  }

  // Calorie-based projection requires TDEE + at least one journaled day.
  const inWindow = input.daily_calories.filter(
    (d) => d.date >= input.start_date! && d.date <= input.today
  );
  const avg_actual_calories = avg(inWindow.map((d) => d.calories));
  empty.avg_actual_calories = avg_actual_calories === null ? null : Math.round(avg_actual_calories);

  if (input.tdee_calories !== null && avg_actual_calories !== null) {
    const avg_deficit_per_day = input.tdee_calories - avg_actual_calories;
    empty.avg_deficit_per_day = Math.round(avg_deficit_per_day);

    if (
      starting_weight_kg !== null &&
      current_weight_kg !== null &&
      days_since_start > 0
    ) {
      const predicted = starting_weight_kg - (avg_deficit_per_day * days_since_start) / KCAL_PER_KG_FAT;
      empty.predicted_weight_today_kg = round(predicted, 2);
      const delta = current_weight_kg - predicted;
      empty.actual_vs_predicted_kg = round(delta, 2);
      empty.on_track = classifyOnTrack(delta);
    }

    if (
      input.goal_weight_kg !== null &&
      current_weight_kg !== null &&
      avg_deficit_per_day > 0 &&
      current_weight_kg > input.goal_weight_kg
    ) {
      const kg_to_lose = current_weight_kg - input.goal_weight_kg;
      const days = Math.ceil(kg_to_lose / (avg_deficit_per_day / KCAL_PER_KG_FAT));
      empty.days_to_goal = days;
      empty.projected_goal_date = addDays(input.today, days);
    }
  }

  return empty;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
```

- [ ] **Step 7: Verify the file compiles**

Run: `cd server && npm run build`
Expected: completes with no TS errors.

- [ ] **Step 8: Create `journey.test.ts`**

```ts
// server/src/journey.test.ts
//
// Run via `npm test` (tsc → node --test dist/*.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeJourney,
  classifyOnTrack,
  findStartingWeight,
  daysBetween,
  addDays,
} from './journey';

test('daysBetween — same day is zero', () => {
  assert.equal(daysBetween('2026-04-01', '2026-04-01'), 0);
});

test('daysBetween — counts forward', () => {
  assert.equal(daysBetween('2026-04-01', '2026-04-15'), 14);
});

test('daysBetween — survives DST boundary', () => {
  // AU DST ends first Sunday of April. Range crosses the transition.
  assert.equal(daysBetween('2026-04-01', '2026-04-30'), 29);
});

test('addDays — adds positive days', () => {
  assert.equal(addDays('2026-04-01', 14), '2026-04-15');
});

test('findStartingWeight — exact match', () => {
  const v = findStartingWeight('2026-04-01', [
    { date: '2026-03-30', weight_kg: 95 },
    { date: '2026-04-01', weight_kg: 92.4 },
    { date: '2026-04-02', weight_kg: 92.0 },
  ]);
  assert.equal(v, 92.4);
});

test('findStartingWeight — closest within ±3 days', () => {
  const v = findStartingWeight('2026-04-01', [
    { date: '2026-03-30', weight_kg: 95 },   // 2 away
    { date: '2026-04-04', weight_kg: 90 },   // 3 away
  ]);
  assert.equal(v, 95);
});

test('findStartingWeight — null when nothing within window', () => {
  const v = findStartingWeight('2026-04-01', [
    { date: '2026-03-15', weight_kg: 95 },
    { date: '2026-04-10', weight_kg: 90 },
  ]);
  assert.equal(v, null);
});

test('classifyOnTrack — within band is on_track', () => {
  assert.equal(classifyOnTrack(0), 'on_track');
  assert.equal(classifyOnTrack(0.3), 'on_track');
  assert.equal(classifyOnTrack(-0.3), 'on_track');
});

test('classifyOnTrack — ahead when negative beyond band', () => {
  assert.equal(classifyOnTrack(-0.4), 'ahead');
});

test('classifyOnTrack — behind for 0.3 < x ≤ 1.0', () => {
  assert.equal(classifyOnTrack(0.5), 'behind');
  assert.equal(classifyOnTrack(1.0), 'behind');
});

test('classifyOnTrack — off_track beyond 1.0 kg', () => {
  assert.equal(classifyOnTrack(1.1), 'off_track');
  assert.equal(classifyOnTrack(5), 'off_track');
});

test('computeJourney — returns nulls when start_date is null', () => {
  const result = computeJourney({
    today: '2026-05-07',
    start_date: null,
    goal_weight_kg: 80,
    tdee_calories: 2500,
    weight_entries: [{ date: '2026-05-07', weight_kg: 89 }],
    daily_calories: [],
  });
  assert.equal(result.start_date, null);
  assert.equal(result.days_since_start, null);
  assert.equal(result.starting_weight_kg, null);
  assert.equal(result.current_weight_kg, 89); // still derivable
});

test('computeJourney — no TDEE → no projection but days/lost render', () => {
  const result = computeJourney({
    today: '2026-05-07',
    start_date: '2026-04-01',
    goal_weight_kg: 80,
    tdee_calories: null,
    weight_entries: [
      { date: '2026-04-01', weight_kg: 92.4 },
      { date: '2026-05-07', weight_kg: 89.1 },
    ],
    daily_calories: [{ date: '2026-04-15', calories: 2000 }],
  });
  assert.equal(result.days_since_start, 36);
  assert.equal(result.starting_weight_kg, 92.4);
  assert.equal(result.lost_kg, 3.3);
  assert.equal(result.avg_deficit_per_day, null);
  assert.equal(result.projected_goal_date, null);
});

test('computeJourney — full happy path', () => {
  const result = computeJourney({
    today: '2026-05-07',
    start_date: '2026-04-01',
    goal_weight_kg: 80,
    tdee_calories: 2500,
    weight_entries: [
      { date: '2026-04-01', weight_kg: 92.4 },
      { date: '2026-05-07', weight_kg: 89.1 },
    ],
    daily_calories: [
      { date: '2026-04-10', calories: 2050 },
      { date: '2026-05-01', calories: 2050 },
    ],
  });
  assert.equal(result.days_since_start, 36);
  assert.equal(result.avg_actual_calories, 2050);
  assert.equal(result.avg_deficit_per_day, 450);
  // predicted = 92.4 - (450 * 36) / 7700 = 90.296...
  assert.equal(result.predicted_weight_today_kg, 90.3);
  // delta = 89.1 - 90.3 = -1.2 → ahead
  assert.equal(result.actual_vs_predicted_kg, -1.2);
  assert.equal(result.on_track, 'ahead');
  // 89.1 - 80 = 9.1 kg to lose. 450/7700 = 0.0584 kg/day. ~156 days.
  assert.equal(result.days_to_goal, 156);
  assert.equal(result.projected_goal_date, addDays('2026-05-07', 156));
});

test('computeJourney — skip days with no calories (only logged days count)', () => {
  // 2 logged days at 2000 kcal each → avg = 2000 (NOT 2000/30 = 67).
  const result = computeJourney({
    today: '2026-04-30',
    start_date: '2026-04-01',
    goal_weight_kg: 80,
    tdee_calories: 2500,
    weight_entries: [
      { date: '2026-04-01', weight_kg: 90 },
      { date: '2026-04-30', weight_kg: 88 },
    ],
    daily_calories: [
      { date: '2026-04-10', calories: 2000 },
      { date: '2026-04-20', calories: 2000 },
    ],
  });
  assert.equal(result.avg_actual_calories, 2000);
  assert.equal(result.avg_deficit_per_day, 500);
});

test('computeJourney — no projection when not in deficit', () => {
  const result = computeJourney({
    today: '2026-05-07',
    start_date: '2026-04-01',
    goal_weight_kg: 80,
    tdee_calories: 2000,
    weight_entries: [
      { date: '2026-04-01', weight_kg: 90 },
      { date: '2026-05-07', weight_kg: 91 },
    ],
    daily_calories: [{ date: '2026-04-15', calories: 2500 }],
  });
  assert.equal(result.avg_deficit_per_day, -500);
  assert.equal(result.projected_goal_date, null);
  assert.equal(result.days_to_goal, null);
});

test('computeJourney — no goal date when already at/below goal', () => {
  const result = computeJourney({
    today: '2026-05-07',
    start_date: '2026-04-01',
    goal_weight_kg: 90,
    tdee_calories: 2500,
    weight_entries: [
      { date: '2026-04-01', weight_kg: 92 },
      { date: '2026-05-07', weight_kg: 89 },
    ],
    daily_calories: [{ date: '2026-04-15', calories: 2000 }],
  });
  assert.equal(result.projected_goal_date, null);
  assert.equal(result.days_to_goal, null);
});
```

- [ ] **Step 9: Run the tests**

Run: `cd server && npm test`
Expected: `journey.test.ts` cases all pass alongside the existing `nutrition.test.ts` cases.

- [ ] **Step 10: Commit**

```bash
git add server/src/journey.ts server/src/journey.test.ts
git commit -m "$(cat <<'EOF'
feat(journey): pure projection helper + tests (DSHKI-24)

computeJourney() takes the user's start date, TDEE, weight log, and
daily calorie totals and returns the journey state — days since start,
avg deficit, predicted vs actual weight, on-track classification,
and projected goal date. Pure function, no DB access.

Tests cover all empty/partial states (no start, no TDEE, no journal,
not in deficit, goal already reached), plus the on-track threshold
boundaries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `GET /api/weight/journey` endpoint

**Files:**
- Modify: [server/src/routes/weight.ts](server/src/routes/weight.ts)

- [ ] **Step 1: Add the imports**

At the top of `server/src/routes/weight.ts`, add:

```ts
import {
  computeJourney,
  type WeightSample,
  type DailyCalories,
} from '../journey';
```

- [ ] **Step 2: Add a `todayLocalIso` helper**

Above the route definitions in the same file, add:

```ts
function todayLocalIso(): string {
  return new Date().toLocaleString('en-CA').split(',')[0];
}
```

(Local-time YYYY-MM-DD — same trick the frontend uses, avoids UTC drift.)

- [ ] **Step 3: Add the `GET /journey` handler**

Below the existing `GET /latest` handler (after line 63), add:

```ts
// ─── GET /journey — computed weight journey state ────────────────────────────

router.get('/journey', (_req: Request, res: Response) => {
  const today = todayLocalIso();

  db.get(
    `SELECT weight_kg AS goal_weight_kg, weight_journey_start_date AS start_date,
            tdee_calories
     FROM Goals WHERE id = 1`,
    [],
    (gErr, goalsRow: { goal_weight_kg: number | null; start_date: string | null; tdee_calories: number | null } | undefined) => {
      if (gErr) {
        console.error('[error] GET /api/weight/journey (goals)', gErr);
        return res.status(500).json({ error: 'Failed to load goals' });
      }

      db.all(
        `SELECT date, weight_kg FROM WeightEntries ORDER BY date ASC`,
        [],
        (wErr, weightRows: WeightSample[] | undefined) => {
          if (wErr) {
            console.error('[error] GET /api/weight/journey (weight)', wErr);
            return res.status(500).json({ error: 'Failed to load weight entries' });
          }

          // Daily calorie totals — one row per date that has at least one entry.
          db.all(
            `SELECT date, SUM(calories_snapshot) AS calories
             FROM JournalEntries
             GROUP BY date
             HAVING calories > 0`,
            [],
            (jErr, calRows: DailyCalories[] | undefined) => {
              if (jErr) {
                console.error('[error] GET /api/weight/journey (journal)', jErr);
                return res.status(500).json({ error: 'Failed to load journal entries' });
              }

              const journey = computeJourney({
                today,
                start_date: goalsRow?.start_date ?? null,
                goal_weight_kg: goalsRow?.goal_weight_kg ?? null,
                tdee_calories: goalsRow?.tdee_calories ?? null,
                weight_entries: weightRows ?? [],
                daily_calories: calRows ?? [],
              });

              res.json(journey);
            }
          );
        }
      );
    }
  );
});
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd server && npm run build`
Expected: completes with no TS errors.

- [ ] **Step 5: Smoke-test via curl**

Start dev server (`cd server && npm run dev`):

```bash
# Without start_date set, the payload should have null fields
curl -s http://localhost:4000/api/weight/journey | jq

# Now set a start date and TDEE, then call again
curl -s -X PUT http://localhost:4000/api/goals \
  -H 'Content-Type: application/json' \
  -d '{"weight_journey_start_date":"2026-04-01","tdee_calories":2500}' > /dev/null

curl -s http://localhost:4000/api/weight/journey | jq
# Expect: start_date "2026-04-01", days_since_start matches today - 2026-04-01,
# starting_weight_kg pulled from the weight log if one exists ±3 days from start.
```

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/weight.ts
git commit -m "$(cat <<'EOF'
feat(weight): add GET /api/weight/journey (DSHKI-24)

Loads goals, weight entries, and daily calorie totals from SQLite
and runs them through computeJourney() to produce the journey state
payload. Read-only; safe for cross-app consumers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend types + API client extension

**Files:**
- Modify: [web/src/lib/types.ts](web/src/lib/types.ts)
- Modify: [web/src/lib/api.ts](web/src/lib/api.ts)

- [ ] **Step 1: Extend `Goals` and add `WeightJourney` in types.ts**

In `web/src/lib/types.ts`, replace the `Goals` interface (lines 123–132) with:

```ts
export interface Goals {
  id: number;
  calories: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  steps: number;
  weight_kg: number | null;
  weight_journey_start_date: string | null;
  tdee_calories: number | null;
  updated_at: string;
}
```

Below `Goals`, add:

```ts
export type OnTrackStatus = 'on_track' | 'ahead' | 'behind' | 'off_track';

export interface WeightJourney {
  start_date: string | null;
  days_since_start: number | null;
  starting_weight_kg: number | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  lost_kg: number | null;
  tdee_calories: number | null;
  avg_actual_calories: number | null;
  avg_deficit_per_day: number | null;
  on_track: OnTrackStatus | null;
  predicted_weight_today_kg: number | null;
  actual_vs_predicted_kg: number | null;
  projected_goal_date: string | null;
  days_to_goal: number | null;
}
```

- [ ] **Step 2: Add `getWeightJourney` and extend `updateGoals` in api.ts**

In `web/src/lib/api.ts`, update the import block at the top to include `WeightJourney`:

```ts
import type {
  Food,
  SavedMeal,
  CurrentMealItem,
  JournalEntry,
  StepEntry,
  StepLogEntry,
  WeightEntry,
  DailySummary,
  MealType,
  Goals,
  WeightJourney,
} from './types';
```

Below the existing `getLatestWeight` function (after line 222), add:

```ts
export function getWeightJourney(): Promise<WeightJourney> {
  return request<WeightJourney>('/api/weight/journey');
}
```

Replace the `updateGoals` function (lines 294–306) with:

```ts
export function updateGoals(data: {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  steps?: number | null;
  weight_kg?: number | null;
  weight_journey_start_date?: string | null;
  tdee_calories?: number | null;
}): Promise<Goals> {
  return request<Goals>('/api/goals', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(web): journey types + getWeightJourney() (DSHKI-24)

Adds WeightJourney type mirroring the API payload, getWeightJourney()
client function, and the two new optional fields on updateGoals().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Settings page — Start date + TDEE inputs

**Files:**
- Modify: [web/src/app/settings/page.tsx](web/src/app/settings/page.tsx)

- [ ] **Step 1: Add new draft state and load existing values**

In `web/src/app/settings/page.tsx`, inside `GoalsSection`, after the existing draft state (after `weightDraft`, line 127), add:

```ts
const [startDateDraft, setStartDateDraft] = useState('');
const [tdeeDraft, setTdeeDraft] = useState('');
```

And in `fetchGoals` (after line 140), after the `weightDraft` setter, add:

```ts
setStartDateDraft(g.weight_journey_start_date ?? '');
setTdeeDraft(g.tdee_calories !== null ? String(g.tdee_calories) : '');
```

- [ ] **Step 2: Add validation and dirty-tracking for the new fields**

Below the existing `draftWeight` block (lines 163–166), add:

```ts
// Start date is optional — empty means "no journey", otherwise must look like ISO YYYY-MM-DD.
const draftStartDate = startDateDraft.trim() === '' ? null : startDateDraft.trim();
const startDateValid =
  draftStartDate === null || /^\d{4}-\d{2}-\d{2}$/.test(draftStartDate);

// TDEE is optional — empty means "not set", otherwise must be a positive number.
const draftTdee = tdeeDraft.trim() === '' ? null : parseField(tdeeDraft);
const tdeeValid = tdeeDraft.trim() === '' || draftTdee !== null;
```

Below the `savedWeight` constant (line 171), add:

```ts
const savedStartDate = savedGoals?.weight_journey_start_date ?? null;
const savedTdee = savedGoals?.tdee_calories ?? null;
```

Replace the `isDirty` definition (lines 173–177) with:

```ts
const isDirty =
  draftCalories !== savedCalories ||
  draftProtein !== savedProtein ||
  draftSteps !== savedSteps ||
  draftWeight !== savedWeight ||
  draftStartDate !== savedStartDate ||
  draftTdee !== savedTdee;
```

Replace the `allValid` definition (lines 182–187) with:

```ts
const allValid =
  draftCalories !== null &&
  draftProtein !== null &&
  draftSteps !== null &&
  stepsValid &&
  draftWeightValid &&
  startDateValid &&
  tdeeValid;
```

- [ ] **Step 3: Send the new fields on save**

Replace the `updateGoals` call inside `handleSave` (lines 197–203) with:

```ts
const updated = await updateGoals({
  calories: draftCalories,
  protein: draftProtein,
  steps: draftSteps,
  weight_kg: draftWeight,
  weight_journey_start_date: draftStartDate,
  tdee_calories: draftTdee,
});
```

And in the same block, after `setWeightDraft(...)` (line 208), reset the two new drafts:

```ts
setStartDateDraft(updated.weight_journey_start_date ?? '');
setTdeeDraft(updated.tdee_calories !== null ? String(updated.tdee_calories) : '');
```

In the catch block (after line 218), add the same reset for failure recovery:

```ts
setStartDateDraft(savedGoals.weight_journey_start_date ?? '');
setTdeeDraft(savedGoals.tdee_calories !== null ? String(savedGoals.tdee_calories) : '');
```

- [ ] **Step 4: Render the two new inputs**

Replace the input grid (`<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">`, lines 233–275) with:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <GlassInput
    label="Calories (kcal)"
    type="number"
    inputMode="decimal"
    value={calorieDraft}
    onChange={(e) => setCalorieDraft(e.target.value)}
    min={1}
    step={50}
    disabled={loading || saving}
  />
  <GlassInput
    label="Protein (g)"
    type="number"
    inputMode="decimal"
    value={proteinDraft}
    onChange={(e) => setProteinDraft(e.target.value)}
    min={1}
    step={5}
    disabled={loading || saving}
  />
  <GlassInput
    label="Steps"
    type="number"
    inputMode="numeric"
    value={stepDraft}
    onChange={(e) => setStepDraft(e.target.value)}
    min={1}
    step={500}
    disabled={loading || saving}
  />
  <GlassInput
    label="Weight (kg)"
    type="number"
    inputMode="decimal"
    value={weightDraft}
    onChange={(e) => setWeightDraft(e.target.value)}
    min={0}
    step={0.1}
    placeholder="optional"
    disabled={loading || saving}
  />
</div>

<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  <GlassInput
    label="Journey start date"
    type="date"
    value={startDateDraft}
    onChange={(e) => setStartDateDraft(e.target.value)}
    placeholder="optional"
    disabled={loading || saving}
  />
  <GlassInput
    label="Maintenance calories (TDEE)"
    type="number"
    inputMode="decimal"
    value={tdeeDraft}
    onChange={(e) => setTdeeDraft(e.target.value)}
    min={0}
    step={50}
    placeholder="optional"
    disabled={loading || saving}
  />
</div>
```

Update the helper paragraph that follows (lines 276–280):

```tsx
<p className="text-xs text-white/40">
  Goals are saved to your Dashki database — they persist across all your
  devices. Weight and journey fields are optional; setting a start date
  + TDEE unlocks the journey card on the Weight page with a projected
  goal date.
</p>
```

- [ ] **Step 5: Verify types compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Smoke-test in the browser**

Start the web dev server (`cd web && npm run dev`) — backend should already be running. Open `http://localhost:3000/settings`. Verify:
- Start date and TDEE inputs render side by side below the existing four fields.
- Setting a date + TDEE and clicking Save flashes "Saved" and persists across refresh.
- Clearing the start date back to empty and saving sets the field to null (refresh confirms it's empty).
- Entering a non-positive TDEE shows the error and Save stays disabled.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(settings): journey start date + TDEE inputs (DSHKI-24)

Two new optional fields in the Daily Goals card. Start date is the
journey anchor, TDEE is maintenance calories used for deficit math.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Weight page — `JourneyCard` component

**Files:**
- Create: `web/src/components/JourneyCard.tsx`
- Modify: [web/src/app/weight/page.tsx](web/src/app/weight/page.tsx)

- [ ] **Step 1: Create `JourneyCard.tsx`**

```tsx
// web/src/components/JourneyCard.tsx
'use client';

import { GlassCard } from './ui';
import type { WeightJourney, OnTrackStatus } from '@/lib/types';
import { TrendingUp, Calendar, Target, AlertCircle } from 'lucide-react';

function formatDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<OnTrackStatus, string> = {
  on_track: 'On track',
  ahead: 'Ahead of schedule',
  behind: 'Slightly behind',
  off_track: 'Off track',
};

const STATUS_CLASSES: Record<OnTrackStatus, string> = {
  on_track: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
  ahead: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
  behind: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
  off_track: 'bg-red-500/10 border-red-400/30 text-red-300',
};

function StatusChip({ status }: { status: OnTrackStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      <TrendingUp className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function CTA({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-white/50 bg-white/[0.03] border border-white/10 rounded-2xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 text-white/40" />
      {children}
    </div>
  );
}

export function JourneyCard({ journey }: { journey: WeightJourney | null }) {
  if (!journey) return null;

  // No start date set — single CTA, hide everything else.
  if (journey.start_date === null) {
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-1">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-white font-semibold">Your Journey</h2>
        </div>
        <p className="text-white/50 text-sm">
          Set a start date in Settings to track your weight loss journey.
        </p>
      </GlassCard>
    );
  }

  // Start date is in the future.
  if ((journey.days_since_start ?? 0) < 0) {
    const daysAway = Math.abs(journey.days_since_start ?? 0);
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-1">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-white font-semibold">Your Journey</h2>
        </div>
        <p className="text-white/50 text-sm">
          Journey starts in {daysAway} day{daysAway === 1 ? '' : 's'}
          {' '}({formatDateLong(journey.start_date)}).
        </p>
      </GlassCard>
    );
  }

  const goalReached =
    journey.goal_weight_kg !== null &&
    journey.current_weight_kg !== null &&
    journey.current_weight_kg <= journey.goal_weight_kg;

  return (
    <GlassCard>
      {/* Header: days + on-track chip */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-white font-semibold">Your Journey</h2>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-white text-3xl font-bold">
              Day {journey.days_since_start}
            </span>
            <span className="text-white/40 text-xs">
              since {formatDateLong(journey.start_date)}
            </span>
          </div>
        </div>
        {goalReached ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
            <Target className="w-3 h-3" /> Goal reached
          </span>
        ) : journey.on_track ? (
          <StatusChip status={journey.on_track} />
        ) : null}
      </div>

      {/* Starting weight: either render the weights row or a CTA */}
      {journey.starting_weight_kg === null ? (
        <CTA>
          Log a weight on {formatDateLong(journey.start_date)} (±3 days) to see
          your progress.
        </CTA>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-white/50 text-xs">Started</p>
              <p className="text-white text-lg font-semibold mt-0.5">
                {journey.starting_weight_kg.toFixed(1)} kg
              </p>
            </div>
            <div>
              <p className="text-white/50 text-xs">Now</p>
              <p className="text-white text-lg font-semibold mt-0.5">
                {journey.current_weight_kg !== null
                  ? `${journey.current_weight_kg.toFixed(1)} kg`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-white/50 text-xs">Goal</p>
              <p className="text-white text-lg font-semibold mt-0.5">
                {journey.goal_weight_kg !== null
                  ? `${journey.goal_weight_kg.toFixed(1)} kg`
                  : '—'}
              </p>
            </div>
          </div>

          {journey.lost_kg !== null && journey.starting_weight_kg > 0 && (
            <p className="text-white/60 text-sm mb-4">
              {journey.lost_kg >= 0 ? 'Lost' : 'Gained'}:{' '}
              <span className="text-white font-semibold">
                {Math.abs(journey.lost_kg).toFixed(1)} kg
              </span>{' '}
              <span className="text-white/40">
                ({((Math.abs(journey.lost_kg) / journey.starting_weight_kg) * 100).toFixed(1)}%)
              </span>
            </p>
          )}

          {/* Projection rows or TDEE CTA */}
          {journey.tdee_calories === null ? (
            <CTA>Set maintenance calories (TDEE) in Settings to see your projection.</CTA>
          ) : journey.avg_actual_calories === null ? (
            <CTA>Log some meals since your start date to see your projection.</CTA>
          ) : (
            <div className="space-y-2 text-sm border-t border-white/10 pt-4">
              <div className="flex justify-between text-white/60">
                <span>Avg intake</span>
                <span className="text-white">
                  {journey.avg_actual_calories!.toLocaleString()} kcal/day
                </span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Avg deficit</span>
                <span
                  className={
                    (journey.avg_deficit_per_day ?? 0) > 0
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }
                >
                  {(journey.avg_deficit_per_day ?? 0) > 0 ? '−' : '+'}
                  {Math.abs(journey.avg_deficit_per_day ?? 0).toLocaleString()} kcal/day
                </span>
              </div>
              {journey.predicted_weight_today_kg !== null && (
                <div className="flex justify-between text-white/60">
                  <span>Predicted today</span>
                  <span className="text-white">
                    {journey.predicted_weight_today_kg.toFixed(1)} kg{' '}
                    <span className="text-white/40">
                      (Δ {(journey.actual_vs_predicted_kg ?? 0) >= 0 ? '+' : ''}
                      {(journey.actual_vs_predicted_kg ?? 0).toFixed(1)} kg)
                    </span>
                  </span>
                </div>
              )}
              {!goalReached && (
                <div className="flex justify-between pt-2 border-t border-white/10 text-white/60">
                  <span>Projected goal date</span>
                  <span className="text-white">
                    {journey.projected_goal_date !== null && journey.days_to_goal !== null
                      ? `~${formatDateLong(journey.projected_goal_date)} (${journey.days_to_goal} days)`
                      : '—'}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 2: Wire `JourneyCard` into the Weight page**

In `web/src/app/weight/page.tsx`:

a) Update the imports — add `JourneyCard` and `getWeightJourney`:

```ts
import { getWeightEntries, addWeightEntry, getGoals, getWeightJourney } from '@/lib/api';
import type { WeightEntry, WeightJourney } from '@/lib/types';
import { JourneyCard } from '@/components/JourneyCard';
```

b) Inside `WeightPage`, alongside the existing state (after the `goalWeight` state, line 91), add:

```ts
const [journey, setJourney] = useState<WeightJourney | null>(null);
```

c) Below `loadGoals` (after line 113), add:

```ts
const loadJourney = useCallback(async () => {
  try {
    const j = await getWeightJourney();
    setJourney(j);
  } catch (_) {
    // silent — card just won't render until next refresh
  }
}, []);
```

d) Update the initial load `useEffect` (line 115) to include the journey fetch:

```ts
useEffect(() => {
  loadEntries();
  loadGoals();
  loadJourney();
}, [loadEntries, loadGoals, loadJourney]);
```

e) Update the existing socket subscriptions (lines 120–122) — both weight and goals changes invalidate the journey:

```ts
useSocketEvent('weight-updated', () => {
  loadEntries();
  loadJourney();
});
useSocketEvent('weight-deleted', () => {
  loadEntries();
  loadJourney();
});
useSocketEvent('goals-updated', () => {
  loadGoals();
  loadJourney();
});
```

f) Insert the card between the stats row and the chart. Find the comment `{/* ── Chart ── */}` (line 248) and insert above it:

```tsx
{/* ── Journey ── */}
<JourneyCard journey={journey} />
```

- [ ] **Step 3: Verify types compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke-test in the browser**

With both dev servers running, open `http://localhost:3000/weight`. Walk through the spec's empty/partial states by editing Settings:
- No start date → "Set a start date in Settings to track your journey."
- Start date set, no weight log on/near it → "Log a weight on [date] (±3 days)…" CTA.
- Weight log exists, no TDEE → starting/now/goal row + lost-so-far render; below them a "Set maintenance calories (TDEE)…" CTA.
- TDEE set, no journal entries since start → "Log some meals…" CTA in place of projection.
- Everything set → full card with on-track chip, predicted-today, ETA.
- Start date set in the future → "Journey starts in N days…"
- Current weight ≤ goal → "Goal reached" chip; ETA row hidden.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/JourneyCard.tsx web/src/app/weight/page.tsx
git commit -m "$(cat <<'EOF'
feat(weight): JourneyCard on Weight page (DSHKI-24)

Renders /api/weight/journey above the chart. Shows days-since-start,
starting/current/goal weights, avg deficit, predicted-vs-actual delta,
and projected goal date. Handles all empty/partial states (no start,
no TDEE, no journal entries, future start date, goal reached) with
inline CTAs that point to Settings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Local verification gate

This is Terry's standard pre-push test. Pull a fresh prod DB into `server/dashki.db` so you're testing the change against your real data, not a fresh sandbox.

- [ ] **Step 1: Pull a fresh prod DB**

Run: `cd server && npm run pull:prod`
Expected: `dashki.db` is overwritten with the latest prod snapshot.

- [ ] **Step 2: Restart both dev servers**

```bash
# Backend (kill the existing dev server first)
cd server && npm run dev

# In another shell:
cd web && npm run dev
```

The DB migration logs (`[db] ran migration: ALTER TABLE Goals ADD COLUMN ...`) should appear once on first start against the freshly pulled DB.

- [ ] **Step 3: Verify the API**

```bash
curl -s http://localhost:4000/api/weight/journey | jq
```

Expected: payload reflects your prod data. With no start date set yet on prod, expect `start_date: null` and most fields `null`.

- [ ] **Step 4: Set a real journey in the UI**

Open `http://localhost:3000/settings`, set:
- Journey start date to a past date you have a weight log for (e.g. 2 weeks ago)
- TDEE to your actual maintenance estimate

Save. Open `/weight` and confirm the card renders with sensible numbers.

- [ ] **Step 5: Hand off to Terry**

Terry exercises the feature locally — clears it, re-sets it, edits Settings, logs a weight, adds a journal entry, watches the card update via socket events. Only after explicit "ship it" approval do we push.

- [ ] **Step 6: Push to prod**

```bash
git push origin claude/mystifying-bartik-6a5335
```

(The branch will be merged via PR per the standard Dashki flow. Do NOT push to `master` directly.)

---

## Self-review notes

- **Spec coverage:** every section of [the spec](docs/superpowers/specs/2026-05-07-weight-loss-journey-design.md) maps to a task — schema (Task 1), Goals API (Task 2), pure math (Task 3), journey endpoint (Task 4), frontend types/api (Task 5), Settings inputs (Task 6), Weight page card (Task 7).
- **Test deviation from spec:** the spec said "no tests in scope." I added `journey.test.ts` because the projection math is a textbook pure-function-test case and the existing `nutrition.test.ts` is the same pattern — so it's a continuation of an existing pattern, not a new one. Flag this for Terry to override if he disagrees.
- **Constants:** `KCAL_PER_KG_FAT`, `START_WEIGHT_LOOKUP_WINDOW_DAYS`, `ON_TRACK_BAND_KG`, `OFF_TRACK_THRESHOLD_KG` are exported from `journey.ts` so the test file can reference them by name and any future caller can do the same.
- **Type consistency:** the `OnTrackStatus` enum string values match between `server/src/journey.ts` and `web/src/lib/types.ts`. `WeightJourney` field names match exactly between Task 3 (server) and Task 5 (web).
- **Socket event payload:** `goals-updated` already includes the full goals row, so frontend listeners will see the new fields automatically once Task 2 is in. No new socket event needed.
