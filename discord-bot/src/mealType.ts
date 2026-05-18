import type { MealType } from './types';

// Time-of-day defaults (local time):
//   < 11:00         -> breakfast
//   11:00 - 14:59   -> lunch
//   15:00 - 20:59   -> dinner
//   else            -> snack
export function defaultMealType(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

// Today, formatted as YYYY-MM-DD in local time (not UTC). Matches the
// toISODate helper used elsewhere in Dashki — always log against the local
// calendar day, never UTC.
export function todayLocalIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
