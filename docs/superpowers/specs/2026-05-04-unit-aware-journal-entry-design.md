# Unit-aware journal entries — design

**Date:** 2026-05-04
**Ticket:** DSHKI-8 — Refactor journal entry: unit-aware quantity (MacroFactor-style, AU metric)
**Status:** Approved by Terry, ready for implementation plan

---

## Goal

Refactor Dashki's food-add flow so each entry stores **what the user typed** — `150 g`, `250 ml`, or `1 serving` — instead of forcing every entry into a single "servings multiplier". Modeled on MacroFactor's logger; constrained to **Australian metric units only**.

## Non-goals

- Multi-favourite-units configuration (MacroFactor's "pin 2 favourite units" feature). Unit choice is per-food and shown by toggle, not user-configurable globally.
- US units — no oz/lb/fl oz/US cups. AU teaspoon (5 ml) ≠ US (≈4.93 ml) and AU tablespoon (20 ml) ≠ US (15 ml), so we don't expose tbsp/tsp either; users enter ml directly.
- Quick Add (`food_id === null`) is unchanged — no food to convert against, stays a free-form kcal/protein form.
- Per-food "last logged quantity" memory. Nice-to-have follow-up; not in this scope.
- Bulk units (kg, L). Single-meal entries don't benefit from them.

## Constraints / requirements

1. **Local-first testing.** Each PR ships only after Terry verifies it locally against a fresh copy of prod data. No auto-push.
2. **No data loss.** Existing `journal_entries` and `saved_meal_items` rows must round-trip through the migration with their kcal/protein snapshots intact.
3. **Backward-compatible mid-rollout.** Between PR 1 (backend) and PR 2 (frontend) shipping, the unchanged frontend must keep working against the migrated DB.
4. **Single source of truth for nutrition math.** Server computes calorie/protein snapshots; client mirrors the same helper for live previews.

## Decisions made during brainstorm

| # | Question | Decision |
|---|----------|----------|
| 1 | Unit choice scope | Base unit + 1-tap toggle to alternate when both available (e.g. `g` ↔ `1 serving (35 g)`) |
| 2 | Quantity input | Stepper (±0.5) for `serving`; tap-to-type for `g`/`ml` |
| 3 | Default on open | `1 serving` if `serving_size_g` is set, else the food's `base_amount` in `base_unit` |
| 4 | Storage shape | Replace `servings` column with `quantity` + `unit`; migrate existing rows |
| 5 | Refactor scope | Picker + Edit modal + Saved Meals (Quick Add stays free-form) |
| 6 | Rollout | Three sequenced PRs (backend/migration → frontend picker+edit → saved meals) |
| 7 | Prod→local replication | Pull via existing public REST API; overwrite local `dashki.db` with `.bak` snapshot |

---

## 1. Data model

### `journal_entries`

```diff
- servings          REAL NOT NULL
+ quantity          REAL NOT NULL              -- e.g. 150
+ unit              TEXT NOT NULL              -- 'g' | 'ml' | 'serving'
  calories_snapshot INTEGER NOT NULL           -- unchanged
  protein_snapshot  REAL    NOT NULL           -- unchanged
```

### `saved_meal_items`

```diff
- servings  REAL NOT NULL
+ quantity  REAL NOT NULL
+ unit      TEXT NOT NULL
```

### `Foods` — unchanged in DB

Existing schema already encodes everything: `base_amount`, `base_unit` (`'grams' | 'servings' | 'ml'`), optional `serving_size_g`. The API normalises legacy `'grams'` → `'g'` at the boundary so the frontend only sees the canonical vocabulary `'g' | 'ml' | 'serving'`.

### Migration (one-shot, in `db.ts`'s migration block)

For each `journal_entries` and `saved_meal_items` row where `quantity IS NULL`:

```
unit     ← 'serving'
quantity ← old `servings` value
```

Idempotent — re-running is a no-op. Snapshots untouched.

---

## 2. Backend API

### Canonical units

The API speaks `'g' | 'ml' | 'serving'`. Legacy `'grams'` from `Foods.base_unit` is mapped to `'g'` on read.

### `Food` response — additive `units[]` field

```json
{
  "id": 17,
  "name": "Tip Top wholemeal slice",
  "base_amount": 100, "base_unit": "g",
  "serving_size_g": 35,
  "calories": 240, "protein": 9,
  "units": [
    { "unit": "g",       "label": "g",            "default": false },
    { "unit": "serving", "label": "1 slice (35g)", "default": true  }
  ]
}
```

Foods with no alternate unit return a single-element `units` array. The `default: true` element is what the picker opens in.

Rules for `units[]` derivation:

| `base_unit` | `serving_size_g` | `units[]` |
|-------------|------------------|-----------|
| `g`         | null             | `[{g, default}]` |
| `g`         | set              | `[{g}, {serving (Xg), default}]` |
| `ml`        | (n/a — column is grams-only) | `[{ml, default}]` |
| `serving`   | null             | `[{serving, default}]` |
| `serving`   | set              | `[{serving, default}, {g (Xg per serving)}]` |

`serving_size_g` is grams-only by name, so ml-based foods always expose only `ml`. If we ever want g↔serving for ml-based foods we'd need a `serving_size_ml` column — explicitly out of scope here.

### `POST /api/journal` — request body

```ts
{
  date: 'YYYY-MM-DD',
  meal_type: 'breakfast'|'lunch'|'dinner'|'snack',
  food_id?: number,
  food_name_snapshot: string,
  quantity: number,
  unit: 'g'|'ml'|'serving',
  // Quick Add (no food_id) only:
  calories_snapshot?: number,
  protein_snapshot?: number,
}
```

Server behaviour:
- If `food_id` set, server looks up the food, calls `nutritionFor(food, quantity, unit)`, writes the resulting snapshots. Any client-supplied snapshots for `food_id`-bound entries are ignored.
- If `food_id` absent (Quick Add), server requires client-supplied snapshots and writes them as-is. `unit` defaults to `'serving'`, `quantity` to `1`.

### `PUT /api/journal/:id`

Accepts `quantity`, `unit`, `meal_type`. If `quantity` or `unit` change and the entry has a `food_id`, the server re-runs `nutritionFor` and overwrites the snapshots.

### Saved-meal endpoints

- `POST/PUT /api/meals/saved` — items now `{ food_id, quantity, unit }`.
- `GET /api/meals/saved/:id` — each item gains the food's full `units[]` so the meal builder can render a `QuantityInput` per item.
- `POST /api/meals/saved/:id/log` (or however inflation is wired) — iterates items, creates one journal entry per item carrying `quantity`+`unit`. Snapshots recomputed against current food data.

### `nutritionFor` helper — `server/src/nutrition.ts` (new)

Single function that converts `(food, quantity, unit)` → `{ calories, protein }`. Used by all three POST/PUT paths above. Frontend mirrors the same logic for live previews. Pseudocode:

```
function nutritionFor(food, quantity, unit) {
  const ratioFromBase = computeRatio(food, quantity, unit)  // grams- or servings-equivalent
  return {
    calories: round(food.calories * ratioFromBase),
    protein:  round1dp(food.protein  * ratioFromBase),
  }
}

computeRatio cases (food.base_unit, unit):
  ('g',       'g')        → quantity / base_amount
  ('g',       'serving')  → (quantity * serving_size_g) / base_amount
  ('ml',      'ml')       → quantity / base_amount
  ('serving', 'serving')  → quantity / base_amount
  ('serving', 'g')        → (quantity / serving_size_g) / base_amount

Notes:
- `('ml', 'serving')` and `('ml', 'g')` are not supported — ml-based foods only expose ml.
- The `('serving', 'g')` case correctly handles base_amount > 1 (e.g. a "2 cookies" base
  with serving_size_g = 30g/cookie: logging 60g → ratio = (60/30)/2 = 1.0).
```

### Backward compat (PR 1 only)

Backend keeps writing the legacy `servings` column on insert/update, computed inversely from `quantity`+`unit`. Dropped in PR 2 once the frontend is fully migrated.

---

## 3. Frontend — picker UI

### New component: `QuantityInput`

Replaces `ServingsStepper` at the same callsite. Props:

```ts
interface QuantityInputProps {
  food: Food                  // includes units[]
  quantity: number
  unit: 'g'|'ml'|'serving'
  onChange: (next: { quantity: number; unit: 'g'|'ml'|'serving' }) => void
}
```

Layout (one row, mobile-friendly):

```
┌──────────────────────────────────────────────────────────┐
│  [stepper or text field]   [unit pills]      145 kcal    │
└──────────────────────────────────────────────────────────┘
```

**Servings mode (`unit === 'serving'`):**
- `–` / value / `+` stepper, ±0.5 step. Tap value → custom decimal entry (existing pattern).
- Display: `1`, `1.5`, `2` — strip trailing `.0`.

**Mass/volume mode (`unit === 'g' | 'ml'`):**
- Single tap-to-type numeric field, `inputMode="decimal"`.
- No stepper. Empty/zero allowed but blocks "Add" in the sticky footer.
- Display: integer rounding (137 g, not 137.5 g).

**Unit toggle:**
- Hidden when `food.units.length === 1`. The unit shows as a plain label.
- Two-pill segmented control when both available. Active pill uses `bg-indigo-500/20 border-indigo-400/60`.
- Tapping a pill switches `unit` AND **converts `quantity`** so kcal stays roughly constant:
  - `g` → `serving` : `quantity / serving_size_g`, rounded to nearest 0.5 (round-up bias).
  - `serving` → `g` : `quantity * serving_size_g`, rounded to nearest integer.
  - Equivalent rules for `ml` ↔ `serving`.

**Live macro display:**
- Right-aligned `… kcal` updates on every change via the client-side mirror of `nutritionFor`.

### Default on selection

When a food is toggled into the selected set:
- `unit` ← `food.units.find(u => u.default).unit`
- `quantity` ← `1` if `unit === 'serving'`, else `food.base_amount`

### Sticky footer — no change in behaviour

Running total and "Add to {Meal}" button unchanged. POST body now sends `{ food_id, food_name_snapshot, quantity, unit }` per selected food; server computes snapshots.

---

## 4. Frontend — Edit modal + Saved Meals + entry display

### `EditEntryModal`

- Single `Servings` input replaced by `QuantityInput`.
- Opens with the entry's stored `quantity` + `unit`.
- Conversion-on-toggle works the same as picker.
- Needs the food's `units[]` — embedded in `JournalEntry` response (server joins on Foods, ~1ms cost).
- Quick Add entries (`food_id === null`) keep today's single "Amount" field — no toggle.
- Save sends `{ quantity, unit, meal_type }`; server recomputes snapshots.

### `EntryRow` subtitle

Helper:

```ts
function formatQuantity(q: number, unit: 'g'|'ml'|'serving'): string {
  if (unit === 'g')  return `${Math.round(q)} g`
  if (unit === 'ml') return `${Math.round(q)} ml`
  return `${stripTrailingZero(q)} serving`   // no plural "s"
}
```

Renders:

| stored | display |
|--------|---------|
| `quantity=150, unit='g'` | `150 g · 145 kcal · 12g protein` |
| `quantity=1, unit='serving'` | `1 serving · 145 kcal · 12g protein` |
| `quantity=2.5, unit='serving'` | `2.5 serving · 360 kcal · 30g protein` |

### Saved Meals

- `SavedMealItem` shape: `{ food_id, quantity, unit, name, units[], calories, protein }`.
- Saved-meal builder UI gets the `QuantityInput` swap (one-for-one replacement of the existing per-item servings field). Any larger redesign of the saved-meal builder is a separate ticket.
- Logging a saved meal inflates each item via the journal POST path; server recomputes snapshots against current food data (matches today's behaviour).

---

## 5. Prod → local pull

### `server/scripts/pull-from-prod.js`

One-command script wired as `npm run pull:prod` in `server/package.json`.

**Flow:**
1. Read `RAILWAY_URL` env var (default `https://dashki-production.up.railway.app`).
2. Pull each table via existing public endpoints:
   - `GET /api/foods`
   - `GET /api/journal?startDate=2020-01-01&endDate=<today>`
   - `GET /api/weight`
   - `GET /api/steps?startDate=2020-01-01&endDate=<today>`
   - For each step date, `GET /api/steps/logs?date=…`
   - `GET /api/meals/saved` then `GET /api/meals/saved/:id` per meal
   - `GET /api/goals`
   - `GET /api/preferences`
3. Open local `dashki.db`. If exists → copy to `dashki.db.bak-<YYYYMMDD-HHMMSS>` first.
4. `DELETE FROM` each table (schema and indexes preserved).
5. INSERT each pulled row, **preserving original `id` values** so cross-table refs stay coherent.
6. Print summary: per-table counts + backup path.

**Safety:**
- Refuse if `NODE_ENV === 'production'` or `DATABASE_PATH` resolves under `/data/` or `/mnt/` (Railway-volume-looking paths).
- Prompt `y/N` before wipe unless `--yes` flag.
- Backups kept (not auto-cleaned). Roll back via `mv dashki.db.bak-… dashki.db`.

---

## Rollout — three sequenced PRs

Each PR has a **local test gate** — Terry pulls fresh prod data, validates the change in browser, signs off before push.

### PR 1 — backend, schema, pull script

- Migration: add `quantity` + `unit` to `journal_entries` and `saved_meal_items`; backfill from `servings`; keep `servings` column (writable for compat).
- New `server/src/nutrition.ts`.
- `POST/PUT /api/journal` accept `quantity` + `unit`; compute snapshots server-side. Old `servings` body field still accepted.
- `Food` response gains `units[]`.
- `pull-from-prod.js` + `npm run pull:prod`.
- **Frontend untouched.** Existing journal continues to work because `servings` is still being written by the backend.
- **Test gate:** `npm run pull:prod`, restart server, verify journal still loads and add/edit/delete still works against migrated DB.

### PR 2 — frontend picker + Edit modal

- `QuantityInput` component (new).
- `FoodPicker`: swap `ServingsStepper` → `QuantityInput`.
- `EditEntryModal`: swap `Servings` field → `QuantityInput`.
- `EntryRow`: subtitle uses `formatQuantity`.
- API client (`lib/api.ts`): `addJournalEntry` / `updateJournalEntry` send `quantity` + `unit`; server now owns snapshot math.
- `JournalEntry` type adds `quantity` + `unit`; drops `servings`.
- DROP `servings` column from `journal_entries`.
- **Test gate:** `npm run pull:prod`, log foods in g and serving modes, edit one of each, switch units mid-edit, verify macros still add up to the daily total ring.

### PR 3 — Saved Meals

- `saved_meal_items` API + types switch to `quantity` + `unit`.
- Saved-meal log inflation goes through unit-aware journal POST.
- DROP `servings` column from `saved_meal_items`.
- **Test gate:** `npm run pull:prod`, add a saved meal, log it, edit one item, verify each item's unit is preserved.

### Rollback story per PR

- PR 1: backend revert restores old request shape (frontend still on old shape, never broke).
- PR 2: frontend revert + DB column re-add (one-line SQL) restores `servings`-based flow. The `quantity`/`unit` columns can stay populated.
- PR 3: same as PR 2 for saved-meal items.

---

## Open follow-ups (out of scope)

- Last-logged-quantity-per-food memory (Question 3 option C).
- Saved-meal builder UI rebuild (full glow-up, not just `QuantityInput` swap).
- Bulk units (kg, L) for very-large entries.
- Globally-pinned favourite units (MacroFactor's "pin 2" feature).
