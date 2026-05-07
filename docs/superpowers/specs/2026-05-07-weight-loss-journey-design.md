# Weight loss journey tracking — design

**Date:** 2026-05-07
**Ticket:** DSHKI-24 — Add weight loss journey tracking to Weight page
**Status:** Approved by Terry, ready for implementation plan

---

## Goal

Add a "Journey" feature to the Weight page so the user can set a start date for their weight loss journey, see how many days they've been at it, and get a calorie-deficit-based projection of whether they're on track to hit their goal weight and roughly when they'll get there. Expose the journey state via a public API so other apps (e.g. Terry's other dashboard) can consume `days_since_start` and the rest of the journey fields without recomputing.

## Non-goals

- TDEE auto-estimation (Mifflin-St Jeor or similar). User enters their maintenance calories manually — see decision #1.
- Multiple/historical journeys. Only one active journey at a time, identified by a single start date.
- Macro-aware projections (protein/carbs/fat). Calorie deficit is the only signal used.
- Custom kcal/kg conversion. Hardcoded at 7700 kcal ≈ 1 kg of body fat.
- Editing the goal weight or weight log from the Journey card. Goal is edited in Settings (existing); weight is logged in the existing form below.

## Constraints / requirements

1. **Local-first testing.** Ship via the standard Dashki workflow — Terry verifies against a fresh copy of prod data before push.
2. **No data loss.** Schema changes are additive (`ALTER TABLE Goals ADD COLUMN ...`), nullable, and idempotent — same migration pattern as existing columns in [server/src/db.ts](server/src/db.ts).
3. **Single source of truth for journey math.** Server computes the journey payload; the Weight page renders it. Other apps hit the same endpoint.
4. **Graceful when prerequisites are missing.** Missing start date, missing TDEE, missing weight on start date, no calories logged — each should produce a sensible payload (with explicit `null` fields) rather than an error.

## Decisions made during brainstorm

| # | Question | Decision |
|---|----------|----------|
| 1 | How is maintenance/TDEE determined? | Manual input in Settings — single optional `tdee_calories` field on `Goals`. |
| 2 | Where does starting weight come from? | Looked up from existing weight log entry on the start date, with ±3-day fallback window. No separate "starting weight" input. |
| 3 | What if no weight entry near start date? | Journey card shows CTA "Log a weight for your start date" and disables the projection rows; days-since-start still renders. |
| 4 | What if no `tdee_calories` set? | Days-since-start, lost-so-far still render. Deficit/projection rows hidden behind a "Set maintenance calories in Settings" CTA. |
| 5 | Days with no journal entries — counted as 0 kcal, or skipped? | **Skipped** — only days with at least one journal entry contribute to `avg_actual_calories`. Forgiving; one missed log day shouldn't tank the average. |
| 6 | Projection method | Calorie-based: `avg_deficit / 7700` kg per day, projected forward from current weight. (Weight-history regression considered, rejected for now — calorie deficit is what the user explicitly asked for.) |
| 7 | "On track" thresholds | `actual_vs_predicted` within ±0.3 kg → on track; ahead → "ahead"; behind by 0.3–1.0 kg → "slightly behind"; behind by >1.0 kg → "off track". |
| 8 | API surface | Single `GET /api/weight/journey` endpoint returning the full state object. Fields are `null` when prerequisites aren't met. |

---

## Data model

Two new optional columns on the existing `Goals` table (single-row, `id = 1`):

| Column | Type | Notes |
|---|---|---|
| `weight_journey_start_date` | `TEXT` | ISO date `YYYY-MM-DD`. `null` = no active journey. |
| `tdee_calories` | `REAL` | Maintenance calories per day. `null` = not set. |

Migration follows the established `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` pattern from [server/src/db.ts](server/src/db.ts) so it's idempotent and safe to re-run.

No new tables. No changes to `WeightEntries` or `JournalEntries`.

---

## API

### `GET /api/weight/journey`

Returns the computed journey state. All fields nullable; consumer should handle `start_date === null` as "no journey configured."

```json
{
  "start_date": "2026-04-01",
  "days_since_start": 36,
  "starting_weight_kg": 92.4,
  "current_weight_kg": 89.1,
  "goal_weight_kg": 80.0,
  "lost_kg": 3.3,
  "tdee_calories": 2500,
  "avg_actual_calories": 2050,
  "avg_deficit_per_day": 450,
  "on_track": "on_track",
  "predicted_weight_today_kg": 89.4,
  "actual_vs_predicted_kg": -0.3,
  "projected_goal_date": "2026-08-14",
  "days_to_goal": 99
}
```

**`on_track` enum:** `"on_track" | "ahead" | "behind" | "off_track" | null`

**Computation rules:**

- `days_since_start` = `(today - start_date)` in whole days (local time). Negative if start date is in the future — clients should treat that as "hasn't started yet."
- `starting_weight_kg` = weight log entry on `start_date`. If absent, the closest entry within ±3 days. If still absent, `null`.
- `current_weight_kg` = most recent weight log entry by `date` (ties broken by latest `created_at`). `null` if no entries exist.
- `lost_kg` = `starting_weight_kg - current_weight_kg` (positive when losing, negative when gaining). `null` if either input is `null`.
- `avg_actual_calories` = average of daily kcal totals from journal entries between `start_date` and today (inclusive), **counting only days with at least one entry**. `null` if no journal entries in the window.
- `avg_deficit_per_day` = `tdee_calories - avg_actual_calories`. Only computed when both inputs are non-null.
- `predicted_weight_today_kg` = `starting_weight_kg - (avg_deficit_per_day × days_since_start) / 7700`.
- `actual_vs_predicted_kg` = `current_weight_kg - predicted_weight_today_kg` (negative = ahead of schedule).
- `on_track` thresholds — see decision #7.
- `projected_goal_date` = `today + ((current_weight_kg - goal_weight_kg) / (avg_deficit_per_day / 7700))` days. `null` if `avg_deficit_per_day <= 0` (not in deficit) or goal already reached.
- `days_to_goal` = same as above, rounded to whole days.

**Side effects:** none (read-only). Cacheable per-request; no caching needed server-side.

### Updates to existing endpoints

- `GET /api/goals` — returns `weight_journey_start_date` and `tdee_calories` in the response.
- `PUT /api/goals` — accepts the two new fields; same validation pattern as existing fields (positive number for `tdee_calories`, valid ISO date for `weight_journey_start_date`, `null` to clear).

---

## Frontend changes

### Settings page — `web/src/app/settings/page.tsx`

Extend the **Daily Goals** card (`GoalsSection`) with two new inputs in the same grid:

- **Journey start date** — `<input type="date">`, optional.
- **Maintenance calories (TDEE)** — number input, optional.

Same draft / dirty / save mechanics as existing fields. Validation: TDEE must be a positive number when provided; start date must be a valid ISO date when provided.

### Weight page — `web/src/app/weight/page.tsx`

New `<JourneyCard>` component, rendered between the stats row and the chart. Fetches `GET /api/weight/journey` on mount and on `goals-updated` / `weight-updated` socket events.

**Card layout (when fully populated):**

```
┌─ Your Journey ────────────────────────────────────┐
│  Day 36                          On track ✓       │
│  since Apr 1, 2026                                │
│                                                   │
│  Started: 92.4 kg     Now: 89.1 kg     Goal: 80   │
│  Lost: 3.3 kg (3.6%)                              │
│                                                   │
│  Avg intake: 2,050 kcal  ·  Deficit: 450 kcal/day │
│  Predicted today: 89.4 kg  ·  Δ -0.3 kg           │
│                                                   │
│  Projected goal date: ~Aug 14, 2026 (99 days)     │
└───────────────────────────────────────────────────┘
```

**Empty/partial states:**

| State | Render |
|---|---|
| `start_date === null` | Single CTA: "Set a start date in Settings to track your journey." |
| `starting_weight_kg === null` | Days-since-start renders. Rest of card shows CTA: "Log a weight for your start date." |
| `tdee_calories === null` | Days-since-start + lost-so-far render. Deficit/projection rows show CTA: "Set maintenance calories in Settings." |
| `goal_weight_kg === null` | Card hidden entirely (consistent with how the chart already treats missing goal). |
| `start_date > today` | "Journey starts in N days." Other rows hidden. |
| `current_weight_kg <= goal_weight_kg` | Replace projection with "🎉 Goal reached." |
| `avg_deficit_per_day <= 0` | Show deficit row with the actual value but display "—" for ETA, hint: "You're not in a deficit yet." |

**Visual style:** reuses `GlassCard`, `GlassButton` from [web/src/components/ui](web/src/components/ui), existing color tokens (red for goal/off-track, emerald for on-track/ahead, amber for slightly behind). Matches the existing dark-glass aesthetic.

### Types & API client

- `web/src/lib/types.ts` — extend `Goals` with `weight_journey_start_date: string | null` and `tdee_calories: number | null`. Add new `WeightJourney` interface mirroring the API payload.
- `web/src/lib/api.ts` — `getWeightJourney(): Promise<WeightJourney>`. Extend `updateGoals` to accept the two new fields.

---

## Files touched

**Backend:**
- [server/src/db.ts](server/src/db.ts) — migration for two new columns on `Goals`.
- [server/src/routes/goals.ts](server/src/routes/goals.ts) — read/write the new fields.
- [server/src/routes/weight.ts](server/src/routes/weight.ts) — new `GET /journey` handler.

**Frontend:**
- [web/src/lib/types.ts](web/src/lib/types.ts) — extend `Goals`, add `WeightJourney`.
- [web/src/lib/api.ts](web/src/lib/api.ts) — `getWeightJourney()`, extended `updateGoals`.
- [web/src/app/settings/page.tsx](web/src/app/settings/page.tsx) — two new fields in Goals section.
- [web/src/app/weight/page.tsx](web/src/app/weight/page.tsx) — new `<JourneyCard>` component + render slot.

No tests in scope (Dashki has minimal test coverage today; this PR keeps that consistent rather than introducing a new pattern).

## Rollout

Single PR — backend + frontend together. Schema migration is additive and nullable, so it's safe to deploy without coordination. Local verification per Dashki's standard flow before push.

## Constants

- **7700 kcal/kg** — body fat conversion factor, hardcoded as `KCAL_PER_KG_FAT = 7700` in the route handler.
- **±3 days** — start-date weight lookup window, hardcoded as `START_WEIGHT_LOOKUP_WINDOW_DAYS = 3`.
- **0.3 kg / 1.0 kg** — on-track band thresholds, hardcoded.
