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

/**
 * Map actual_vs_predicted (negative = ahead of schedule, positive = behind) to a label.
 * Thresholds from the spec: within ±0.3 kg = on track, >0.3 kg behind = behind,
 * >1.0 kg behind = off track, any amount ahead = ahead.
 */
export function classifyOnTrack(actual_vs_predicted_kg: number): OnTrackStatus {
  if (actual_vs_predicted_kg < -ON_TRACK_BAND_KG) return 'ahead';
  if (actual_vs_predicted_kg <= ON_TRACK_BAND_KG) return 'on_track';
  if (actual_vs_predicted_kg <= OFF_TRACK_THRESHOLD_KG) return 'behind';
  return 'off_track';
}

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
