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
