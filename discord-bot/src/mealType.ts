import type { MealType } from './types';

// Terry is in Melbourne. The bot runs on a Railway worker (UTC), so we can't
// rely on Date.getHours() / .getFullYear() — those return values in the
// process's local TZ and would produce yesterday's date late at night
// Melbourne time. Always compute date + hour explicitly in Melbourne.
const TZ = 'Australia/Melbourne';

// Time-of-day defaults (Melbourne local time):
//   < 11:00         -> breakfast
//   11:00 - 14:59   -> lunch
//   15:00 - 20:59   -> dinner
//   else            -> snack
export function defaultMealType(now: Date = new Date()): MealType {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  // 'en-GB' returns "HH" (or "HH:00" in some runtimes); parseInt handles both.
  const h = parseInt(hourStr, 10);
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

// Today, formatted as YYYY-MM-DD in Melbourne local time.
export function todayLocalIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}
