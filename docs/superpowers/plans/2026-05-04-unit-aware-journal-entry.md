# Unit-aware Journal Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Dashki so each food log stores `{ quantity, unit }` (`'g' | 'ml' | 'serving'`) instead of a `servings`-only multiplier. AU metric units only. Mirrors MacroFactor's "log a g-based food in servings (or vice versa) with one toggle" behaviour.

**Architecture:** Three sequenced PRs. PR 1 ships the backend schema + API + the prod→local pull script with the frontend untouched (compat layer keeps old `servings` column populated). PR 2 swaps the frontend picker + edit modal to unit-aware. PR 3 extends the same treatment to Saved Meals. Each PR ends with a **local test gate** — Terry pulls a fresh prod DB, exercises the change in his browser, and explicitly approves before push.

**Tech Stack:** Express + sqlite3 (server), Next.js 14 + React 18 + Tailwind (web), Node 20 built-in test runner (no new test deps).

**Spec:** `docs/superpowers/specs/2026-05-04-unit-aware-journal-entry-design.md`

**Ticket:** DSHKI-8

---

## File Structure

### New files
- `server/src/nutrition.ts` — pure conversion helper `nutritionFor(food, quantity, unit) → {calories, protein}`. Single source of truth for the math.
- `server/src/nutrition.test.ts` — Node `node --test` cases covering every `(base_unit, unit)` combination.
- `server/scripts/pull-from-prod.js` — REST-based prod→local DB replication script.
- `web/src/lib/nutrition.ts` — frontend mirror of the same helper for live macro previews in the picker.
- `web/src/components/QuantityInput.tsx` — replacement for `ServingsStepper`. Adaptive input (stepper for `serving`, tap-to-type for `g`/`ml`) + unit toggle when alternates exist.

### Modified files
- `server/src/db.ts` — add migrations for `JournalEntries.quantity`/`unit` (PR 1), `SavedMealItems.quantity`/`unit` (PR 3); drop legacy `servings` columns later.
- `server/src/routes/foods.ts` — emit `units[]` array on responses; normalise legacy `'grams'` → `'g'` at API boundary; use `nutritionFor` for the food-update snapshot resync.
- `server/src/routes/journal.ts` — accept `{ quantity, unit }` in POST/PUT; compute snapshots server-side via `nutritionFor`.
- `server/src/routes/meals.ts` — items use `{ quantity, unit }`; logging a saved meal inflates each item via `nutritionFor`.
- `server/package.json` — add `pull:prod` script.
- `web/src/lib/types.ts` — add `Unit` type + `FoodUnitOption`; `JournalEntry` and `SavedMealItem` shape changes.
- `web/src/lib/api.ts` — `addJournalEntry` / `updateJournalEntry` / saved-meal create+update signatures change.
- `web/src/app/journal/page.tsx` — swap `ServingsStepper` → `QuantityInput`; `EditEntryModal` → unit-aware; `EntryRow` subtitle uses `formatQuantity`.

### Test approach

The repo has no test framework. The plan adds `nutrition.test.ts` using **Node's built-in `node --test` runner** (Node 20 is already in use — zero new deps). Everything else uses **manual verification** against a freshly-pulled prod DB — matches Terry's `local-test-before-push` workflow.

---

## Conventions

- Canonical units in code: `'g' | 'ml' | 'serving'`.
- DB historically stores `Foods.base_unit` as `'grams' | 'servings' | 'ml'`. Normalise on read in `mapFood` (return `'g'` not `'grams'`, `'serving'` not `'servings'`).
- After every backend change in PR 1: `cd server && npm run build` to confirm TypeScript compiles cleanly.
- After every frontend change in PR 2/3: `cd web && npm run build` + `npm run lint`.
- Commit cadence: one commit per task, message format `feat(scope): one-line summary` or `fix:`/`refactor:`/`chore:` as appropriate. Each commit ends with the Co-Authored-By trailer.

---

# PHASE / PR 1 — Backend, schema, prod→local pull script

End state: backend speaks both old and new request shapes. Schema has new columns, old columns still populated. Frontend unchanged. `npm run pull:prod` works. Local test gate before push.

---

### Task 1.1: Create `nutrition.ts` helper

**Files:**
- Create: `server/src/nutrition.ts`

- [ ] **Step 1: Write the helper**

```typescript
// server/src/nutrition.ts
//
// Single source of truth for converting (food, quantity, unit) into
// kcal/protein snapshots. Mirrored client-side in web/src/lib/nutrition.ts
// for live previews — keep the two in sync.

export type Unit = 'g' | 'ml' | 'serving';

export interface FoodForNutrition {
  base_amount: number;        // e.g. 100
  base_unit: 'g' | 'ml' | 'serving';
  serving_size_g: number | null;
  calories: number;           // kcal per (base_amount × base_unit)
  protein: number | null;     // g protein per (base_amount × base_unit)
}

export interface NutritionResult {
  calories: number;           // rounded to integer
  protein: number;            // rounded to 1dp
}

/**
 * Compute the unit-less ratio: how many "base_amount × base_unit" the
 * user actually ate, given their typed quantity in their chosen unit.
 *
 * Throws on unsupported (base_unit, unit) combos so callers fail loudly
 * rather than silently logging zero calories.
 */
export function computeRatio(
  food: FoodForNutrition,
  quantity: number,
  unit: Unit,
): number {
  const { base_unit, base_amount, serving_size_g } = food;

  if (base_unit === 'g' && unit === 'g') {
    return quantity / base_amount;
  }
  if (base_unit === 'g' && unit === 'serving') {
    if (serving_size_g == null) {
      throw new Error('Cannot log in serving: food has no serving_size_g');
    }
    return (quantity * serving_size_g) / base_amount;
  }
  if (base_unit === 'ml' && unit === 'ml') {
    return quantity / base_amount;
  }
  if (base_unit === 'serving' && unit === 'serving') {
    return quantity / base_amount;
  }
  if (base_unit === 'serving' && unit === 'g') {
    if (serving_size_g == null) {
      throw new Error('Cannot log in g: food has no serving_size_g');
    }
    return (quantity / serving_size_g) / base_amount;
  }
  throw new Error(`Unsupported unit combo: base=${base_unit} entered=${unit}`);
}

export function nutritionFor(
  food: FoodForNutrition,
  quantity: number,
  unit: Unit,
): NutritionResult {
  const ratio = computeRatio(food, quantity, unit);
  return {
    calories: Math.round(food.calories * ratio),
    protein: Math.round((food.protein ?? 0) * ratio * 10) / 10,
  };
}

/**
 * Convert a quantity from one unit to another, preserving total kcal.
 * Used by the picker UI when toggling between g and serving — but lives
 * server-side too so the test suite can pin the conversion behaviour.
 */
export function convertQuantity(
  food: FoodForNutrition,
  quantity: number,
  fromUnit: Unit,
  toUnit: Unit,
): number {
  if (fromUnit === toUnit) return quantity;
  // Convert via the food's base.
  const ratio = computeRatio(food, quantity, fromUnit);
  // Now find the quantity in toUnit that produces the same ratio.
  if (toUnit === 'g' && food.base_unit === 'g') return ratio * food.base_amount;
  if (toUnit === 'ml' && food.base_unit === 'ml') return ratio * food.base_amount;
  if (toUnit === 'serving' && food.base_unit === 'g') {
    if (food.serving_size_g == null) throw new Error('No serving_size_g');
    return (ratio * food.base_amount) / food.serving_size_g;
  }
  if (toUnit === 'serving' && food.base_unit === 'serving') return ratio * food.base_amount;
  if (toUnit === 'g' && food.base_unit === 'serving') {
    if (food.serving_size_g == null) throw new Error('No serving_size_g');
    return ratio * food.base_amount * food.serving_size_g;
  }
  throw new Error(`Unsupported conversion: ${fromUnit} → ${toUnit} (base=${food.base_unit})`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npm run build`
Expected: clean build, no errors. New `dist/nutrition.js` exists.

- [ ] **Step 3: Commit**

```bash
git add server/src/nutrition.ts
git commit -m "$(cat <<'EOF'
feat(nutrition): add nutritionFor + convertQuantity helpers

Single source of truth for journal-entry nutrition math. Mirrored
client-side in a follow-up PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: Add `nutrition.test.ts` with full case coverage

**Files:**
- Create: `server/src/nutrition.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// server/src/nutrition.test.ts
//
// Run via the npm test script (in package.json) which builds with tsc first
// then runs `node --test dist/*.test.js`. Node's built-in test runner (Node
// 20+) is used so we avoid adding vitest/jest as dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRatio, nutritionFor, convertQuantity, FoodForNutrition } from './nutrition';

const chicken: FoodForNutrition = {
  base_amount: 100, base_unit: 'g', serving_size_g: null,
  calories: 165, protein: 31,
};

const bread: FoodForNutrition = {
  base_amount: 100, base_unit: 'g', serving_size_g: 35,
  calories: 250, protein: 9,
};

const cookiePack: FoodForNutrition = {
  base_amount: 2, base_unit: 'serving', serving_size_g: 30,
  calories: 160, protein: 2,  // 160 kcal per pack of 2 cookies (each 30g)
};

const coffee: FoodForNutrition = {
  base_amount: 250, base_unit: 'ml', serving_size_g: null,
  calories: 5, protein: 0,
};

// ─── computeRatio ─────────────────────────────────────────────────────────────

test('g→g: 150g of chicken (base 100g) = ratio 1.5', () => {
  assert.equal(computeRatio(chicken, 150, 'g'), 1.5);
});

test('g→serving: 2 servings of bread (35g each, base 100g) = ratio 0.7', () => {
  assert.equal(computeRatio(bread, 2, 'serving'), 0.7);
});

test('g→serving fails when serving_size_g is null', () => {
  assert.throws(() => computeRatio(chicken, 1, 'serving'), /serving_size_g/);
});

test('ml→ml: 500ml coffee (base 250ml) = ratio 2', () => {
  assert.equal(computeRatio(coffee, 500, 'ml'), 2);
});

test('serving→serving: 1 cookie pack (base 2) = ratio 0.5', () => {
  assert.equal(computeRatio(cookiePack, 1, 'serving'), 0.5);
});

test('serving→g: 60g of cookiePack (30g/cookie, base 2) = ratio 1.0', () => {
  // 60g / 30g per cookie = 2 cookies = 1.0 of base "2 cookies"
  assert.equal(computeRatio(cookiePack, 60, 'g'), 1.0);
});

test('unsupported combo throws (ml + g)', () => {
  assert.throws(() => computeRatio(coffee, 100, 'g'), /Unsupported/);
});

// ─── nutritionFor ─────────────────────────────────────────────────────────────

test('nutritionFor: 150g chicken = 248 kcal, 46.5g protein', () => {
  const r = nutritionFor(chicken, 150, 'g');
  assert.equal(r.calories, 248);   // round(165 * 1.5) = 247.5 → 248
  assert.equal(r.protein, 46.5);
});

test('nutritionFor: 1 slice bread (35g) = 88 kcal, 3.2g protein', () => {
  const r = nutritionFor(bread, 1, 'serving');
  assert.equal(r.calories, 88);    // round(250 * 0.35) = 87.5 → 88
  assert.equal(r.protein, 3.2);    // round(9 * 0.35 * 10)/10 = 3.2 (3.15 → 3.2)
});

test('nutritionFor: 60g of cookie pack = 160 kcal', () => {
  // 60g / 30g per cookie = 2 cookies = exactly the base pack
  const r = nutritionFor(cookiePack, 60, 'g');
  assert.equal(r.calories, 160);
  assert.equal(r.protein, 2);
});

test('nutritionFor handles null protein (returns 0)', () => {
  const f: FoodForNutrition = { ...chicken, protein: null };
  const r = nutritionFor(f, 100, 'g');
  assert.equal(r.protein, 0);
});

// ─── convertQuantity ──────────────────────────────────────────────────────────

test('convertQuantity g→serving: 70g of bread → 2 slices', () => {
  // 70g / 35g per slice = 2 slices
  assert.equal(convertQuantity(bread, 70, 'g', 'serving'), 2);
});

test('convertQuantity serving→g: 2 slices of bread → 70g', () => {
  assert.equal(convertQuantity(bread, 2, 'serving', 'g'), 70);
});

test('convertQuantity serving→g for cookie pack: 1 pack → 60g', () => {
  // 1 pack × 2 cookies/pack × 30g/cookie = 60g
  assert.equal(convertQuantity(cookiePack, 1, 'serving', 'g'), 60);
});

test('convertQuantity is identity when units match', () => {
  assert.equal(convertQuantity(chicken, 137, 'g', 'g'), 137);
});
```

- [ ] **Step 2: Add test script to package.json**

Edit `server/package.json` — add inside `"scripts"`:

```json
"test": "tsc -p tsconfig.json && node --test dist/*.test.js"
```

So scripts becomes:
```json
"scripts": {
  "build": "tsc && node -p \"require('fs').copyFileSync('./src/seed-foods.json', './dist/seed-foods.json')\"",
  "start": "node dist/index.js",
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "test": "tsc -p tsconfig.json && node --test dist/*.test.js"
}
```

- [ ] **Step 3: Run the tests — verify all pass**

Run: `cd server && npm run test`
Expected: all 14 tests pass. Output ends with `# pass 14`, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add server/src/nutrition.test.ts server/package.json
git commit -m "$(cat <<'EOF'
test(nutrition): cover all (base_unit, unit) ratio + conversion combos

Uses Node 20's built-in test runner — zero new deps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Add `quantity` and `unit` columns to `JournalEntries` (migration)

**Files:**
- Modify: `server/src/db.ts:218` (after the existing Foods migrations block)

- [ ] **Step 1: Add the migration block**

Insert this block in `db.ts` after the existing `// ── Migration: add display_name to UserPreferences ──` block (~line 229), before the `// ── Sentinel ──` block:

```typescript
      // ── Migration: add quantity + unit to JournalEntries (DSHKI-8) ─────────
      // SQLite ALTER TABLE can't add NOT NULL columns retroactively; we add
      // them as nullable and enforce via the route code. Backfill from the
      // legacy `servings` column so existing entries stay readable.
      db.all(`PRAGMA table_info(JournalEntries)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        const migrations: string[] = [];

        if (!existingCols.has('quantity')) {
          migrations.push('ALTER TABLE JournalEntries ADD COLUMN quantity REAL');
        }
        if (!existingCols.has('unit')) {
          migrations.push('ALTER TABLE JournalEntries ADD COLUMN unit TEXT');
        }

        for (const sql of migrations) {
          db.run(sql, [], (err) => {
            if (err) console.error('[db] migration error:', err.message);
            else console.log(`[db] ran migration: ${sql}`);
          });
        }

        // Backfill: any row where quantity IS NULL gets quantity=servings, unit='serving'.
        // Idempotent — safe to re-run.
        db.run(
          `UPDATE JournalEntries
           SET quantity = servings, unit = 'serving'
           WHERE quantity IS NULL OR unit IS NULL`,
          [],
          function (this: { changes: number }, err) {
            if (err) console.error('[db] backfill error:', err.message);
            else if (this.changes > 0) {
              console.log(`[db] backfilled ${this.changes} JournalEntries with quantity/unit`);
            }
          }
        );
      });
```

- [ ] **Step 2: Build to confirm TypeScript still compiles**

Run: `cd server && npm run build`
Expected: clean build.

- [ ] **Step 3: Restart server, confirm migration runs**

Run: `cd server && npm run dev`
Expected (in stdout, on first run after this change):
- `[db] ran migration: ALTER TABLE JournalEntries ADD COLUMN quantity REAL`
- `[db] ran migration: ALTER TABLE JournalEntries ADD COLUMN unit TEXT`
- `[db] backfilled N JournalEntries with quantity/unit` (N = however many rows you have locally)

Then stop the dev server (Ctrl+C).

- [ ] **Step 4: Verify schema and backfill via sqlite CLI**

Run:
```bash
cd server && node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./dashki.db');
db.all('PRAGMA table_info(JournalEntries)', (e, rows) => {
  console.log('Columns:', rows.map(r => r.name).join(', '));
  db.get('SELECT COUNT(*) c, COUNT(quantity) q, COUNT(unit) u FROM JournalEntries', (e2, r) => {
    console.log('Total rows:', r.c, '| quantity NOT NULL:', r.q, '| unit NOT NULL:', r.u);
    db.close();
  });
});
"
```

Expected: `Columns:` line includes both `quantity` and `unit`. Total = quantity = unit (every row backfilled).

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts
git commit -m "$(cat <<'EOF'
feat(db): add quantity + unit columns to JournalEntries

Migration backfills existing rows from the legacy servings column
(quantity = servings, unit = 'serving'). Columns are nullable in SQL
and enforced as required in route code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Add `units[]` array + canonical-unit normalisation to foods route

**Files:**
- Modify: `server/src/routes/foods.ts:7-65` (`mapFood` function and surrounding helpers)

- [ ] **Step 1: Add unit-normalisation + units-derivation helpers**

Replace the existing `mapFood` function (and its surrounding 2-line gap above the SELECT_SQL constant) with:

```typescript
type CanonicalUnit = 'g' | 'ml' | 'serving';

function canonicalUnit(raw: string | null | undefined): CanonicalUnit {
  if (raw === 'grams' || raw === 'g') return 'g';
  if (raw === 'ml') return 'ml';
  return 'serving';
}

interface UnitOption {
  unit: CanonicalUnit;
  label: string;
  default: boolean;
}

/**
 * Derive the units the picker can offer for a food. The convention is:
 *   - If both base unit and serving_size_g are present, expose both with the
 *     "serving" option set as default (most natural way to log).
 *   - If only the base unit is present (no serving size), expose that alone.
 *
 * IMPORTANT: We use the RAW serving_size_g column value here, NOT the mapped
 * fallback (some g-based foods have serving_size_g === base_amount as a
 * fallback derived in mapFood, which would create a meaningless "serving"
 * toggle for raw ingredients like chicken). Pass the raw row value.
 */
function deriveUnits(rawBaseUnit: string, baseAmount: number, rawServingSizeG: number | null): UnitOption[] {
  const base = canonicalUnit(rawBaseUnit);

  if (base === 'g') {
    if (rawServingSizeG == null) {
      return [{ unit: 'g', label: 'g', default: true }];
    }
    return [
      { unit: 'g', label: 'g', default: false },
      { unit: 'serving', label: `1 serving (${rawServingSizeG}g)`, default: true },
    ];
  }
  if (base === 'ml') {
    // serving_size_g is grams-only by name, so ml-base foods always expose only ml.
    return [{ unit: 'ml', label: 'ml', default: true }];
  }
  // serving base
  if (rawServingSizeG == null) {
    return [{ unit: 'serving', label: 'serving', default: true }];
  }
  return [
    { unit: 'serving', label: 'serving', default: true },
    { unit: 'g', label: `g (${rawServingSizeG}g per serving)`, default: false },
  ];
}

function mapFood(row: Record<string, unknown>): Record<string, unknown> {
  const baseAmount = (row.base_amount as number | undefined) ?? 100;
  const rawBaseUnit = (row.base_unit as string | undefined) ?? 'grams';
  const baseUnit = canonicalUnit(rawBaseUnit);   // canonical 'g' / 'ml' / 'serving'
  const calories = (row.calories as number | undefined) ?? 0;
  const protein = (row.protein as number | undefined) ?? 0;
  const carbs = (row.carbs as number | undefined) ?? 0;
  const fat = (row.fat as number | undefined) ?? 0;
  const rawServingSizeG = (row.serving_size_g as number | null | undefined) ?? null;

  // Per-100g view (legacy field — the frontend still uses these).
  let caloriesPer100 = calories;
  let proteinPer100 = protein;
  let carbsPer100 = carbs;
  let fatPer100 = fat;

  if (baseUnit === 'g' && baseAmount !== 100) {
    const factor = baseAmount / 100;
    caloriesPer100 = Math.round(calories * factor * 10) / 10;
    proteinPer100 = Math.round(protein * factor * 10) / 10;
    carbsPer100 = Math.round((carbs ?? 0) * factor * 10) / 10;
    fatPer100 = Math.round((fat ?? 0) * factor * 10) / 10;
  }

  return {
    id: row.id,
    name: row.name,
    calories_per_100g: caloriesPer100,
    protein_per_100g: proteinPer100,
    carbs_per_100g: carbsPer100,
    fat_per_100g: fatPer100,
    // serving_size_g: keep the legacy fallback for old frontend code paths that
    // still read it, but units[] uses the raw column value.
    serving_size_g: rawServingSizeG ?? (baseUnit === 'g' ? baseAmount : null),
    calories,
    protein,
    carbs,
    fat,
    baseAmount,
    baseUnit,                          // canonical now ('g' not 'grams')
    base_amount: baseAmount,           // snake_case alias for spec consumers
    base_unit: baseUnit,
    units: deriveUnits(rawBaseUnit, baseAmount, rawServingSizeG),
    created_at: row.created_at,
  };
}
```

- [ ] **Step 2: Build to confirm TypeScript compiles**

Run: `cd server && npm run build`
Expected: clean build.

- [ ] **Step 3: Smoke-test the API**

Start dev server (`cd server && npm run dev` in another terminal). Then:

```bash
curl -s http://localhost:4000/api/foods | python -c "import sys, json; foods=json.load(sys.stdin); print('First food:', json.dumps(foods[0], indent=2)) if foods else print('No foods')"
```

Expected: each food in the response now contains a `units` array with at least one entry. For at least one food in your local DB, `units` should have **two** entries (one with `default: true`).

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/foods.ts
git commit -m "$(cat <<'EOF'
feat(foods): derive units[] for picker + normalise base_unit on read

Foods response gains a units array describing the unit choices the
picker should offer ('g'/'ml'/'serving' with labels and a default
flag). Legacy 'grams' base_unit is normalised to canonical 'g'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Update `POST /api/journal` to accept `quantity` + `unit`

**Files:**
- Modify: `server/src/routes/journal.ts:118-178` (the POST handler)
- Modify: `server/src/routes/journal.ts:20-24` (the SELECT_ENTRY_SQL — add quantity, unit)

- [ ] **Step 1: Update SELECT_ENTRY_SQL to include the new columns**

Replace lines 20-24:

```typescript
const SELECT_ENTRY_SQL = `
  SELECT id, date, meal_type, logged_at, food_id, food_name_snapshot,
         servings, quantity, unit,
         calories_snapshot, protein_snapshot, created_at
  FROM JournalEntries
`;
```

- [ ] **Step 2: Replace the POST handler**

Replace the entire `router.post('/', ...)` block (lines 118-178) with:

```typescript
router.post('/', (req: Request, res: Response) => {
  const {
    date,
    meal_type,
    logged_at,
    food_id,
    food_name_snapshot,
    // New shape:
    quantity: rawQuantity,
    unit: rawUnit,
    // Legacy shape (still accepted in PR 1):
    servings,
    // Quick Add (food_id absent) only:
    calories_snapshot: clientCalories,
    protein_snapshot: clientProtein,
  } = req.body || {};

  if (!date || !meal_type || !food_name_snapshot) {
    return res.status(400).json({
      error: 'Missing required fields: date, meal_type, food_name_snapshot',
    });
  }

  const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  if (!validMealTypes.includes(meal_type)) {
    return res.status(400).json({ error: 'meal_type must be one of: breakfast, lunch, dinner, snack' });
  }

  // Resolve quantity + unit from either the new or legacy shape.
  const validUnits = ['g', 'ml', 'serving'] as const;
  const unit: 'g' | 'ml' | 'serving' = validUnits.includes(rawUnit) ? rawUnit : 'serving';

  let quantity = toNumber(rawQuantity);
  if (quantity === null) {
    // Fall back to legacy `servings` field
    const sv = toNumber(servings);
    if (sv === null || sv <= 0) {
      return res.status(400).json({ error: 'Missing or invalid quantity (or servings)' });
    }
    quantity = sv;
  }
  if (quantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });

  const loggedAt = logged_at || new Date().toISOString();
  const foodIdVal = food_id ? Number(food_id) : null;

  // Compute snapshots:
  //   - food_id absent (Quick Add): trust client-supplied snapshots
  //   - food_id present: look up the food, compute via nutritionFor
  const finishInsert = (caloriesNum: number, proteinNum: number | null, servingsForCompat: number) => {
    db.run(
      `INSERT INTO JournalEntries
         (date, meal_type, logged_at, food_id, food_name_snapshot,
          servings, quantity, unit,
          calories_snapshot, protein_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, meal_type, loggedAt, foodIdVal, food_name_snapshot,
       servingsForCompat, quantity, unit,
       caloriesNum, proteinNum],
      function (this: { lastID: number }, err) {
        if (err) {
          console.error('[error] POST /api/journal', err);
          return res.status(500).json({ error: 'Failed to add journal entry' });
        }
        const newId = this.lastID;
        db.get(
          `${SELECT_ENTRY_SQL} WHERE id = ?`,
          [newId],
          (err2, entry) => {
            if (err2) {
              console.error('[error] POST /api/journal fetch', err2);
              return res.status(500).json({ error: 'Failed to fetch created entry' });
            }
            try { getIo().emit('journal-entry-created', entry); } catch (_) {}
            if (date === todayLocalIso()) {
              void syncCalorieHabit(date);
            }
            res.status(201).json(entry);
          }
        );
      }
    );
  };

  if (foodIdVal === null) {
    // Quick Add path
    const cal = toNumber(clientCalories, 0)!;
    const pro = toNumber(clientProtein, null);
    finishInsert(cal, pro, quantity /* legacy compat: servings = quantity */);
    return;
  }

  // food_id path: look up the food, compute via nutritionFor
  db.get(
    `SELECT base_amount, base_unit, serving_size_g, calories, protein
     FROM Foods WHERE id = ?`,
    [foodIdVal],
    (err, foodRow: any) => {
      if (err || !foodRow) {
        console.error('[error] POST /api/journal food lookup', err);
        return res.status(500).json({ error: 'Failed to look up food for nutrition computation' });
      }
      try {
        const food = {
          base_amount: foodRow.base_amount,
          base_unit: (foodRow.base_unit === 'grams' ? 'g' : foodRow.base_unit) as 'g'|'ml'|'serving',
          serving_size_g: foodRow.serving_size_g,
          calories: foodRow.calories,
          protein: foodRow.protein,
        };
        const { calories, protein } = nutritionFor(food, quantity!, unit);
        // Legacy `servings` column is computed as the unit-less ratio so an
        // unmigrated frontend reading the row still gets a sensible value.
        const ratio = computeRatio(food, quantity!, unit);
        finishInsert(calories, protein, ratio);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Invalid quantity/unit' });
      }
    }
  );
});
```

**Update the imports at the top of the file (lines 1-4) to add the nutrition helper:**

```typescript
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';
import { syncCalorieHabit, todayLocalIso } from '../dashko-sync';
import { nutritionFor, computeRatio } from '../nutrition';
```

- [ ] **Step 3: Build**

Run: `cd server && npm run build`
Expected: clean build.

- [ ] **Step 4: Smoke-test the legacy POST shape (must still work)**

Start dev server. Then:

```bash
curl -s -X POST http://localhost:4000/api/journal \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-04","meal_type":"snack","food_name_snapshot":"Test legacy","servings":2,"calories_snapshot":100,"protein_snapshot":5}' \
  | python -m json.tool
```

Expected: 201 response, the entry has `quantity: 2`, `unit: "serving"`, `servings: 2`, `calories_snapshot: 100`. Note the new fields populated even though only legacy ones were sent.

Delete that entry (`curl -X DELETE http://localhost:4000/api/journal/<id>`).

- [ ] **Step 5: Smoke-test the new POST shape with a real food_id**

Find a food id with `serving_size_g` set:

```bash
curl -s "http://localhost:4000/api/foods" | python -c "import sys, json; foods = json.load(sys.stdin); print([(f['id'], f['name'], f['serving_size_g']) for f in foods if f.get('serving_size_g')][:3])"
```

Pick one with serving_size_g set (e.g. food_id=17, serving_size_g=35). Then POST in grams:

```bash
curl -s -X POST http://localhost:4000/api/journal \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-04","meal_type":"snack","food_id":<ID>,"food_name_snapshot":"Test g","quantity":150,"unit":"g"}' \
  | python -m json.tool
```

Expected: 201, the entry has `quantity: 150, unit: "g"`, and `calories_snapshot` reflects 150g of that food (not 1 serving's worth). Delete the entry.

POST in servings:

```bash
curl -s -X POST http://localhost:4000/api/journal \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-04","meal_type":"snack","food_id":<ID>,"food_name_snapshot":"Test serving","quantity":2,"unit":"serving"}' \
  | python -m json.tool
```

Expected: 201, the entry has `quantity: 2, unit: "serving"`, `calories_snapshot` reflects 2 servings. Delete the entry.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/journal.ts
git commit -m "$(cat <<'EOF'
feat(journal): POST accepts quantity+unit; server computes snapshots

food_id-bound entries now flow through nutritionFor — client can no
longer drift macros. Legacy {servings, calories_snapshot} body shape
still accepted for compat with the unmigrated frontend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.6: Update `PUT /api/journal/:id` to accept `quantity` + `unit`

**Files:**
- Modify: `server/src/routes/journal.ts:182-238` (the PUT handler)

- [ ] **Step 1: Replace the PUT handler**

Replace the entire `router.put('/:id', ...)` block with:

```typescript
router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const {
    quantity: rawQuantity,
    unit: rawUnit,
    servings,
    meal_type,
    logged_at,
    calories_snapshot,
    protein_snapshot,
  } = req.body || {};

  // First fetch the existing row so we know food_id (for snapshot recompute).
  db.get(
    `${SELECT_ENTRY_SQL} WHERE id = ?`,
    [id],
    (fetchErr, existing: any) => {
      if (fetchErr) return res.status(500).json({ error: 'Failed to fetch entry' });
      if (!existing) return res.status(404).json({ error: 'Journal entry not found' });

      const fields: string[] = [];
      const params: unknown[] = [];

      // Resolve new quantity/unit if either is being changed.
      const validUnits = ['g', 'ml', 'serving'] as const;
      const newUnit = validUnits.includes(rawUnit) ? rawUnit : (rawUnit === undefined ? undefined : null);
      if (newUnit === null) return res.status(400).json({ error: 'Invalid unit' });

      let newQuantity: number | undefined;
      if (rawQuantity !== undefined) {
        const q = toNumber(rawQuantity);
        if (q === null || q <= 0) return res.status(400).json({ error: 'Invalid quantity' });
        newQuantity = q;
      } else if (servings !== undefined) {
        const sv = toNumber(servings);
        if (sv === null || sv <= 0) return res.status(400).json({ error: 'Invalid servings' });
        newQuantity = sv;
      }

      const finalQuantity = newQuantity ?? existing.quantity;
      const finalUnit = (newUnit ?? existing.unit) as 'g'|'ml'|'serving';

      // If the entry has a food_id and quantity/unit changed, recompute snapshots
      // server-side from the food. Otherwise (Quick Add or unrelated PUT), accept
      // client-supplied snapshot fields if any.
      const quantityOrUnitChanged = newQuantity !== undefined || newUnit !== undefined;
      const isQuickAdd = existing.food_id == null;

      const finishUpdate = (calForCol: number | null, proForCol: number | null, servingsForCol: number) => {
        if (newQuantity !== undefined || servings !== undefined) {
          fields.push('quantity = ?'); params.push(finalQuantity);
          fields.push('servings = ?'); params.push(servingsForCol);
        }
        if (newUnit !== undefined) {
          fields.push('unit = ?'); params.push(finalUnit);
        }
        if (meal_type !== undefined) {
          if (!['breakfast','lunch','dinner','snack'].includes(meal_type))
            return res.status(400).json({ error: 'Invalid meal_type' });
          fields.push('meal_type = ?'); params.push(meal_type);
        }
        if (logged_at !== undefined) { fields.push('logged_at = ?'); params.push(logged_at); }
        if (calForCol !== null) { fields.push('calories_snapshot = ?'); params.push(calForCol); }
        if (proForCol !== null) { fields.push('protein_snapshot = ?'); params.push(proForCol); }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        db.run(
          `UPDATE JournalEntries SET ${fields.join(', ')} WHERE id = ?`,
          params,
          function (this: { changes: number }, err) {
            if (err) {
              console.error('[error] PUT /api/journal/:id', err);
              return res.status(500).json({ error: 'Failed to update journal entry' });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Journal entry not found' });

            db.get(
              `${SELECT_ENTRY_SQL} WHERE id = ?`,
              [id],
              (err2, entry) => {
                if (err2) return res.status(500).json({ error: 'Failed to fetch updated entry' });
                try { getIo().emit('journal-entry-updated', entry); } catch (_) {}
                res.json(entry);
              }
            );
          }
        );
      };

      if (quantityOrUnitChanged && !isQuickAdd) {
        // Recompute snapshots from the food.
        db.get(
          `SELECT base_amount, base_unit, serving_size_g, calories, protein
           FROM Foods WHERE id = ?`,
          [existing.food_id],
          (foodErr, foodRow: any) => {
            if (foodErr || !foodRow) {
              return res.status(500).json({ error: 'Failed to look up food for nutrition recompute' });
            }
            try {
              const food = {
                base_amount: foodRow.base_amount,
                base_unit: (foodRow.base_unit === 'grams' ? 'g' : foodRow.base_unit) as 'g'|'ml'|'serving',
                serving_size_g: foodRow.serving_size_g,
                calories: foodRow.calories,
                protein: foodRow.protein,
              };
              const { calories, protein } = nutritionFor(food, finalQuantity, finalUnit);
              const ratio = computeRatio(food, finalQuantity, finalUnit);
              finishUpdate(calories, protein, ratio);
            } catch (e: any) {
              return res.status(400).json({ error: e?.message || 'Invalid quantity/unit' });
            }
          }
        );
      } else {
        // Quick Add or unrelated PUT — accept client-supplied snapshots.
        const cal = calories_snapshot !== undefined ? toNumber(calories_snapshot, 0)! : null;
        const pro = protein_snapshot !== undefined ? toNumber(protein_snapshot, null) : null;
        finishUpdate(cal, pro, finalQuantity); // legacy `servings` = quantity for QuickAdd
      }
    }
  );
});
```

- [ ] **Step 2: Build**

Run: `cd server && npm run build`
Expected: clean build.

- [ ] **Step 3: Smoke-test PUT with new shape**

Start dev server. Insert a test entry first via the POST (use the legacy shape to keep it simple), grab its id from the response.

PUT to change unit and quantity:
```bash
curl -s -X PUT http://localhost:4000/api/journal/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"quantity":75,"unit":"g"}' \
  | python -m json.tool
```
Expected: 200, the entry shows `quantity: 75, unit: "g"`, calories recomputed for 75g of that food. Delete the test entry. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/journal.ts
git commit -m "$(cat <<'EOF'
feat(journal): PUT accepts quantity+unit; server recomputes snapshots

When quantity or unit changes on a food-bound entry, snapshots are
recomputed server-side via nutritionFor. Legacy servings field still
accepted for compat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.7: Update `PUT /api/foods/:id` snapshot resync to use `nutritionFor`

**Files:**
- Modify: `server/src/routes/foods.ts:278-294` (the journal-entry sync after a food update)

- [ ] **Step 1: Replace the journal sync block**

Find the block that currently runs:
```typescript
db.run(
  `UPDATE JournalEntries
   SET calories_snapshot = CAST(ROUND(? * servings) AS REAL),
       ...
   WHERE food_id = ?`,
  [mapped.calories, mapped.protein ?? 0, mapped.name, id],
  ...
);
```

Replace it with a per-row recompute (since each entry can be in a different unit now):

```typescript
          // Sync all journal entries that reference this food. Each entry may
          // now be in a different unit (g, ml, serving), so we recompute per
          // row via nutritionFor rather than the old broadcast `calories *
          // servings` formula.
          db.all(
            `SELECT id, quantity, unit FROM JournalEntries WHERE food_id = ?`,
            [id],
            (selectErr, rows: Array<{ id: number; quantity: number; unit: string }>) => {
              if (selectErr) {
                console.error('[error] PUT /api/foods/:id journal select', selectErr);
              }

              const foodForCalc = {
                base_amount: mapped.base_amount as number,
                base_unit: mapped.baseUnit as 'g'|'ml'|'serving',
                serving_size_g: (mapped.serving_size_g as number | null),
                calories: mapped.calories as number,
                protein: mapped.protein as number | null,
              };

              let remaining = (rows || []).length;
              if (remaining === 0) {
                try { getIo().emit('food-updated', mapped); } catch (_) {}
                return res.json(mapped);
              }

              for (const row of rows || []) {
                try {
                  const u = (row.unit ?? 'serving') as 'g'|'ml'|'serving';
                  const { calories, protein } = nutritionFor(foodForCalc, row.quantity ?? 1, u);
                  db.run(
                    `UPDATE JournalEntries
                     SET calories_snapshot = ?, protein_snapshot = ?, food_name_snapshot = ?
                     WHERE id = ?`,
                    [calories, protein, mapped.name, row.id],
                    (updErr) => {
                      if (updErr) console.error('[error] journal resync row', row.id, updErr);
                      if (--remaining === 0) {
                        try { getIo().emit('food-updated', mapped); } catch (_) {}
                        try { getIo().emit('journal-entry-updated', {}); } catch (_) {}
                        res.json(mapped);
                      }
                    }
                  );
                } catch (e) {
                  // Unsupported unit combo for this row — skip the resync (snapshot stays stale,
                  // user will see old kcal until they re-enter). Log loudly.
                  console.error('[error] journal resync skipped row', row.id, e);
                  if (--remaining === 0) {
                    try { getIo().emit('food-updated', mapped); } catch (_) {}
                    try { getIo().emit('journal-entry-updated', {}); } catch (_) {}
                    res.json(mapped);
                  }
                }
              }
            }
          );
```

Add the import at the top of the file (alongside the other imports at lines 1-3):

```typescript
import { nutritionFor } from '../nutrition';
```

- [ ] **Step 2: Build**

Run: `cd server && npm run build`
Expected: clean build.

- [ ] **Step 3: Smoke-test (optional sanity check)**

Pick a food via API:
```bash
curl -s http://localhost:4000/api/foods | python -c "import sys, json; print([(f['id'], f['name'], f['calories']) for f in json.load(sys.stdin)[:1]])"
```

Bump its calories by 10 (use the existing PUT route — body shape unchanged):
```bash
curl -s -X PUT http://localhost:4000/api/foods/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"calories_per_100g":<NEW_VALUE>}' \
  > /dev/null
```

Then verify any journal entry referencing that food has its `calories_snapshot` updated proportionally to its `quantity`/`unit`. Reset the calories afterwards.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/foods.ts
git commit -m "$(cat <<'EOF'
fix(foods): journal resync uses per-row nutritionFor

Previously the resync after a food edit used a single SQL UPDATE
multiplying by the legacy servings column. Now that entries can be in
different units (g, ml, serving), each row is recomputed individually
via nutritionFor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.8: Build `pull-from-prod.js`

**Files:**
- Create: `server/scripts/pull-from-prod.js`

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
// server/scripts/pull-from-prod.js
//
// Pulls Dashki production data into the local SQLite DB so changes can be
// tested against real foods/journal entries before pushing.
//
// Usage:
//   node scripts/pull-from-prod.js              # prompts for confirmation
//   node scripts/pull-from-prod.js --yes        # skip confirmation
//
// Env:
//   RAILWAY_URL    Override prod URL (default: https://dashki-production.up.railway.app)
//   DATABASE_PATH  Override local DB path (default: ./dashki.db)
//
// Safety:
//   - Refuses to run if NODE_ENV === 'production' or DATABASE_PATH points at /data/ or /mnt/.
//   - Backs up existing local DB to dashki.db.bak-<timestamp> before wiping.

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const readline = require('readline');

const RAILWAY_URL = (process.env.RAILWAY_URL || 'https://dashki-production.up.railway.app').replace(/\/$/, '');
const LOCAL_DB_PATH = path.resolve(process.env.DATABASE_PATH || './dashki.db');
const SKIP_CONFIRM = process.argv.includes('--yes');

// ── Safety ──────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSE: NODE_ENV=production. This script is local-only.');
  process.exit(1);
}
if (LOCAL_DB_PATH.includes('/data/') || LOCAL_DB_PATH.includes('/mnt/') || LOCAL_DB_PATH.startsWith('/data/') || LOCAL_DB_PATH.startsWith('/mnt/')) {
  console.error(`REFUSE: DATABASE_PATH '${LOCAL_DB_PATH}' looks like a Railway volume.`);
  process.exit(1);
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

async function getJson(pathname) {
  const url = `${RAILWAY_URL}${pathname}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

// ── Main pull sequence ──────────────────────────────────────────────────────

async function pullAll() {
  console.log(`Pulling from ${RAILWAY_URL}…`);
  const today = new Date().toISOString().slice(0, 10);
  const earliest = '2020-01-01';

  const data = {};
  data.foods         = await getJson('/api/foods');
  data.journal       = await getJson(`/api/journal?startDate=${earliest}&endDate=${today}`);
  data.weight        = await getJson('/api/weight');
  data.steps         = await getJson(`/api/steps?startDate=${earliest}&endDate=${today}`);
  data.savedMeals    = await getJson('/api/meals/saved');
  // Saved meal items are returned inline in /api/meals/saved (each meal has items[])
  // but to be safe, also fetch full detail per meal.
  data.savedMealsFull = [];
  for (const m of data.savedMeals) {
    data.savedMealsFull.push(await getJson(`/api/meals/saved/${m.id}`));
  }
  data.goals         = await getJson('/api/goals');
  data.preferences   = await getJson('/api/preferences');

  // Pull StepLogEntries per date that has steps
  const stepDates = [...new Set((data.steps || []).map(s => s.date))];
  data.stepLogs = [];
  for (const d of stepDates) {
    const logs = await getJson(`/api/steps/logs?date=${encodeURIComponent(d)}`);
    data.stepLogs.push(...logs);
  }

  console.log(`  foods:           ${data.foods.length}`);
  console.log(`  journal entries: ${data.journal.length}`);
  console.log(`  weight entries:  ${data.weight.length}`);
  console.log(`  step entries:    ${data.steps.length}`);
  console.log(`  step logs:       ${data.stepLogs.length}`);
  console.log(`  saved meals:     ${data.savedMeals.length}`);
  return data;
}

// ── Wipe + insert into local DB ─────────────────────────────────────────────

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

async function wipeAndInsert(data) {
  // Backup existing DB
  if (fs.existsSync(LOCAL_DB_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = `${LOCAL_DB_PATH}.bak-${ts}`;
    fs.copyFileSync(LOCAL_DB_PATH, backup);
    console.log(`Backed up: ${backup}`);
  }

  const db = new sqlite3.Database(LOCAL_DB_PATH);

  // Wipe — preserves schema/indexes
  await run(db, 'DELETE FROM JournalEntries');
  await run(db, 'DELETE FROM SavedMealItems');
  await run(db, 'DELETE FROM SavedMeals');
  await run(db, 'DELETE FROM Foods');
  await run(db, 'DELETE FROM WeightEntries');
  await run(db, 'DELETE FROM StepLogEntries');
  await run(db, 'DELETE FROM StepEntries');
  // Goals + UserPreferences are singletons (id=1) — UPDATE not DELETE.

  // Foods
  for (const f of data.foods) {
    await run(db,
      `INSERT INTO Foods (id, name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.id, f.name, f.baseAmount ?? 100, f.baseUnit ?? 'grams',
       f.calories ?? 0, f.protein ?? null, f.carbs ?? null, f.fat ?? null,
       f.serving_size_g ?? null, f.created_at ?? new Date().toISOString()]);
  }

  // Saved meals + items
  for (const m of data.savedMeals) {
    await run(db, 'INSERT INTO SavedMeals (id, name, created_at) VALUES (?, ?, ?)',
      [m.id, m.name, m.created_at]);
  }
  for (const m of data.savedMealsFull) {
    for (const item of (m.items || [])) {
      await run(db, 'INSERT INTO SavedMealItems (id, meal_id, food_id, servings) VALUES (?, ?, ?, ?)',
        [item.id, m.id, item.foodId ?? item.food_id, item.servings]);
    }
  }

  // Journal entries — old API may not include quantity/unit; fall back to servings.
  for (const e of data.journal) {
    await run(db,
      `INSERT INTO JournalEntries
         (id, date, meal_type, logged_at, food_id, food_name_snapshot,
          servings, quantity, unit, calories_snapshot, protein_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.date, e.meal_type, e.logged_at, e.food_id, e.food_name_snapshot,
       e.servings, e.quantity ?? e.servings, e.unit ?? 'serving',
       e.calories_snapshot, e.protein_snapshot ?? null, e.created_at ?? new Date().toISOString()]);
  }

  // Weight
  for (const w of data.weight) {
    await run(db, 'INSERT INTO WeightEntries (id, date, weight_kg, created_at) VALUES (?, ?, ?, ?)',
      [w.id, w.date, w.weight_kg, w.created_at]);
  }

  // Steps (legacy aggregate)
  for (const s of data.steps) {
    await run(db, 'INSERT INTO StepEntries (id, date, steps) VALUES (?, ?, ?)',
      [s.id, s.date, s.steps]);
  }
  // Step logs (new)
  for (const l of data.stepLogs) {
    await run(db,
      `INSERT INTO StepLogEntries (id, date, steps, note, logged_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [l.id, l.date, l.steps, l.note ?? null, l.logged_at, l.created_at]);
  }

  // Goals (singleton)
  if (data.goals) {
    await run(db,
      `UPDATE Goals SET calories=?, protein=?, carbs=?, fat=?, steps=?, weight_kg=?, updated_at=? WHERE id=1`,
      [data.goals.calories ?? null, data.goals.protein ?? null, data.goals.carbs ?? null,
       data.goals.fat ?? null, data.goals.steps ?? null, data.goals.weight_kg ?? null,
       data.goals.updated_at ?? new Date().toISOString()]);
  }

  // Preferences (singleton)
  if (data.preferences) {
    await run(db,
      `UPDATE UserPreferences SET theme=?, display_name=? WHERE id=1`,
      [data.preferences.theme ?? 'dark', data.preferences.display_name ?? null]);
  }

  await new Promise((res, rej) => db.close(err => err ? rej(err) : res()));
  console.log('Local DB updated.');
}

// ── Confirm prompt ──────────────────────────────────────────────────────────

async function confirm() {
  if (SKIP_CONFIRM) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`This will OVERWRITE ${LOCAL_DB_PATH} with prod data. Proceed? (y/N) `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

(async () => {
  try {
    if (!(await confirm())) { console.log('Aborted.'); process.exit(0); }
    const data = await pullAll();
    await wipeAndInsert(data);
    console.log('✓ Pull complete.');
  } catch (e) {
    console.error('Pull failed:', e.message || e);
    process.exit(1);
  }
})();
```

- [ ] **Step 2: Add npm script**

Edit `server/package.json` — add to `"scripts"`:

```json
"pull:prod": "node scripts/pull-from-prod.js"
```

- [ ] **Step 3: Verify safety guards by running with a fake bad path**

```bash
cd server && DATABASE_PATH=/data/oops.db node scripts/pull-from-prod.js
```
Expected: exits with `REFUSE: DATABASE_PATH '/data/oops.db' looks like a Railway volume.` and exit code 1.

- [ ] **Step 4: Run the actual pull (this is the local test gate setup)**

```bash
cd server && npm run pull:prod
```
At the prompt, type `y`. Expected:
- "Pulling from https://dashki-production.up.railway.app…"
- Counts printed for each table
- "Backed up: …/dashki.db.bak-…"
- "Local DB updated." and "✓ Pull complete."

Verify a table count via the same one-liner from Task 1.3 step 4 — counts should match what the script reported.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/pull-from-prod.js server/package.json
git commit -m "$(cat <<'EOF'
feat(scripts): pull-from-prod.js + npm run pull:prod

REST-based replication of Railway prod data into local SQLite for
manual testing before push. Backs up the existing local DB; refuses
to run with a Railway-volume-looking DATABASE_PATH or NODE_ENV=production.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.9: Local test gate for PR 1 + push

This is the human verification gate. The previous tasks added the schema + the API + the pull script. The frontend is unchanged.

- [ ] **Step 1: Pull fresh prod data**

```bash
cd server && npm run pull:prod
# answer y at prompt
```

- [ ] **Step 2: Start backend + frontend dev servers**

In one terminal: `cd server && npm run dev`
In another: `cd web && npm run dev`

- [ ] **Step 3: Smoke-test in browser at http://localhost:3000/journal**

Manual checks (Terry performs these):
- The journal page loads at today's date with prod entries visible.
- Adding a food via the picker still works (legacy frontend → legacy API path).
- Editing an entry's servings still works.
- Deleting an entry works.
- Daily totals still match the sum of entries.
- No new console errors.

- [ ] **Step 4: Move ticket to In Review and report**

```bash
# Move DSHKI-8 to In Review with a status comment.
# (The agent calls mcp__dashko__move_task and mcp__dashko__add_comment here.)
```

Stop and ASK Terry: "PR 1 is locally tested. Backend speaks both old and new shapes; pull-from-prod works; frontend is untouched. Ready to push?"

- [ ] **Step 5: After explicit Terry approval, push**

```bash
git push origin <branch-name>
```

Then move DSHKI-8 → Done with a closing comment listing the commits in PR 1.

---

# PHASE / PR 2 — Frontend picker + Edit modal

End state: the food picker shows a `QuantityInput` with adaptive controls and a unit toggle. Edit modal mirrors the same. Entry rows display the natural unit. Old `servings` column dropped from `JournalEntries`.

---

### Task 2.1: Create `web/src/lib/nutrition.ts` (frontend mirror)

**Files:**
- Create: `web/src/lib/nutrition.ts`

- [ ] **Step 1: Write the helper**

```typescript
// web/src/lib/nutrition.ts
//
// Client-side mirror of server/src/nutrition.ts. Keep in sync — the server is
// the source of truth at write time; this is purely for live previews in the
// picker.

export type Unit = 'g' | 'ml' | 'serving';

export interface FoodForNutrition {
  base_amount: number;
  base_unit: Unit;
  serving_size_g: number | null;
  calories: number;
  protein: number | null;
}

export function computeRatio(food: FoodForNutrition, quantity: number, unit: Unit): number {
  const { base_unit, base_amount, serving_size_g } = food;
  if (base_unit === 'g' && unit === 'g') return quantity / base_amount;
  if (base_unit === 'g' && unit === 'serving') {
    if (serving_size_g == null) throw new Error('No serving_size_g');
    return (quantity * serving_size_g) / base_amount;
  }
  if (base_unit === 'ml' && unit === 'ml') return quantity / base_amount;
  if (base_unit === 'serving' && unit === 'serving') return quantity / base_amount;
  if (base_unit === 'serving' && unit === 'g') {
    if (serving_size_g == null) throw new Error('No serving_size_g');
    return (quantity / serving_size_g) / base_amount;
  }
  throw new Error(`Unsupported: base=${base_unit} entered=${unit}`);
}

export function nutritionFor(food: FoodForNutrition, quantity: number, unit: Unit) {
  const ratio = computeRatio(food, quantity, unit);
  return {
    calories: Math.round(food.calories * ratio),
    protein: Math.round((food.protein ?? 0) * ratio * 10) / 10,
  };
}

export function convertQuantity(food: FoodForNutrition, quantity: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return quantity;
  const ratio = computeRatio(food, quantity, fromUnit);
  if (toUnit === 'g' && food.base_unit === 'g') return ratio * food.base_amount;
  if (toUnit === 'ml' && food.base_unit === 'ml') return ratio * food.base_amount;
  if (toUnit === 'serving' && food.base_unit === 'g') {
    if (food.serving_size_g == null) throw new Error('No serving_size_g');
    return (ratio * food.base_amount) / food.serving_size_g;
  }
  if (toUnit === 'serving' && food.base_unit === 'serving') return ratio * food.base_amount;
  if (toUnit === 'g' && food.base_unit === 'serving') {
    if (food.serving_size_g == null) throw new Error('No serving_size_g');
    return ratio * food.base_amount * food.serving_size_g;
  }
  throw new Error(`Unsupported conversion: ${fromUnit} → ${toUnit} (base=${food.base_unit})`);
}

export function formatQuantity(quantity: number, unit: Unit): string {
  if (unit === 'g') return `${Math.round(quantity)} g`;
  if (unit === 'ml') return `${Math.round(quantity)} ml`;
  // 'serving' — strip trailing .0
  const s = (Math.round(quantity * 10) / 10).toString();
  return `${s} serving`;
}
```

- [ ] **Step 2: Build to verify**

Run: `cd web && npm run build`
Expected: clean build (this file isn't yet imported anywhere, so no use-checks).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/nutrition.ts
git commit -m "$(cat <<'EOF'
feat(web): mirror server nutrition helpers for live macro previews

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: Update `web/src/lib/types.ts` for unit-aware shape

**Files:**
- Modify: `web/src/lib/types.ts:1-26` (Food interface) and `:69-79` (JournalEntry)

- [ ] **Step 1: Add Unit + FoodUnitOption types and update Food/JournalEntry**

Replace the entire content of `web/src/lib/types.ts` with:

```typescript
// ─── Units ──────────────────────────────────────────────────────────────────

export type Unit = 'g' | 'ml' | 'serving';

export interface FoodUnitOption {
  unit: Unit;
  label: string;
  default: boolean;
}

// ─── Food & Nutrition ──────────────────────────────────────────────────────

export interface Food {
  id: number;
  name: string;
  /** kcal per 100g (returned as `calories` from the API) — kept for legacy callsites */
  calories_per_100g: number;
  /** g protein per 100g (legacy) */
  protein_per_100g: number;
  /** g carbs per 100g (legacy) */
  carbs_per_100g: number;
  /** g fat per 100g (legacy) */
  fat_per_100g: number;
  /** RAW serving_size_g column value if set (or fallback for legacy callsites) */
  serving_size_g?: number | null;
  // Canonical base unit fields (camelCase + snake_case both available from API):
  baseAmount?: number;
  baseUnit?: Unit;
  base_amount?: number;
  base_unit?: Unit;
  /** Per-base-amount nutrition (the source of truth for the math helper) */
  calories?: number;
  protein?: number | null;
  /** Available unit options for the picker (always at least one element) */
  units?: FoodUnitOption[];
  recently_used?: boolean;
  created_at: string;
}

// ─── Saved Meals ────────────────────────────────────────────────────────────

export interface SavedMeal {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  items?: SavedMealItem[];
}

export interface SavedMealItem {
  id: number;
  foodId: number;
  /** New unit-aware fields (PR 3) */
  quantity?: number;
  unit?: Unit;
  /** Legacy field — still populated server-side until PR 3 ships */
  servings?: number;
  name: string;
  baseAmount: number;
  baseUnit: Unit;
  calories: number;
  protein: number | null;
}

// ─── Current Meal ───────────────────────────────────────────────────────────

export interface CurrentMealItem {
  id: number;
  foodId: number | null;
  servings: number;
  isTemporary: boolean;
  name: string;
  baseAmount: number;
  baseUnit: Unit;
  calories: number;
  protein: number | null;
}

// ─── Journal ────────────────────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface JournalEntry {
  id: number;
  date: string;
  meal_type: MealType;
  logged_at: string;
  food_id: number | null;
  food_name_snapshot: string;
  /** New unit-aware fields */
  quantity: number;
  unit: Unit;
  /** Legacy — kept until PR 2 backend cleanup */
  servings?: number;
  calories_snapshot: number;
  protein_snapshot: number;
  /** Optional: server may embed the food's units[] for the Edit modal */
  food_units?: FoodUnitOption[];
}

// ─── Steps / Weight / Goals / Summary — unchanged ──────────────────────────

export interface StepEntry { id: number; date: string; steps: number; }

export interface StepLogEntry {
  id: number;
  date: string;
  steps: number;
  note: string | null;
  logged_at: string;
  created_at: string;
}

export interface WeightEntry {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
}

export interface Goals {
  id: number;
  calories: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  steps: number;
  weight_kg: number | null;
  updated_at: string;
}

export interface DailySummary {
  date: string;
  calories: number;
  protein: number;
  entries: JournalEntry[];
}

// ─── API Response Wrappers ─────────────────────────────────────────────────

export interface ApiError { error: string; message?: string; }

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Build to verify nothing else is broken yet**

Run: `cd web && npm run build`
Expected: clean build, OR a few specific TS errors about `JournalEntry.servings` being optional. Note them — they'll be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types.ts
git commit -m "$(cat <<'EOF'
feat(web): add Unit + FoodUnitOption types; quantity/unit on JournalEntry

Legacy servings field marked optional — will be removed once all
callsites migrate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: Update API client signatures

**Files:**
- Modify: `web/src/lib/api.ts:151-179` (addJournalEntry + updateJournalEntry)

- [ ] **Step 1: Replace the two functions**

Replace the existing `addJournalEntry` and `updateJournalEntry` functions with:

```typescript
export function addJournalEntry(data: {
  date: string;
  meal_type: MealType;
  food_id?: number;
  food_name_snapshot: string;
  /** New unit-aware fields — server computes snapshots when food_id is set */
  quantity: number;
  unit: 'g' | 'ml' | 'serving';
  /** Quick Add only (food_id absent) */
  calories_snapshot?: number;
  protein_snapshot?: number;
}): Promise<JournalEntry> {
  return request<JournalEntry>('/api/journal', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateJournalEntry(
  id: number,
  data: Partial<{
    meal_type: MealType;
    quantity: number;
    unit: 'g' | 'ml' | 'serving';
    /** Quick Add only */
    calories_snapshot: number;
    protein_snapshot: number;
  }>
): Promise<JournalEntry> {
  return request<JournalEntry>(`/api/journal/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 2: Build (expect TS errors in journal/page.tsx referencing old call sites — that's OK)**

Run: `cd web && npm run build`
Expected: errors in `app/journal/page.tsx` because callsites still use `servings`, `calories_snapshot` for food entries. We'll fix those next.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(web): API client takes quantity+unit; server computes snapshots

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: Build the `QuantityInput` component

**Files:**
- Create: `web/src/components/QuantityInput.tsx`

- [ ] **Step 1: Write the component**

```tsx
// web/src/components/QuantityInput.tsx
'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { Food, Unit } from '@/lib/types';
import { nutritionFor, convertQuantity } from '@/lib/nutrition';

interface QuantityInputProps {
  food: Food;
  quantity: number;
  unit: Unit;
  onChange: (next: { quantity: number; unit: Unit }) => void;
}

export function QuantityInput({ food, quantity, unit, onChange }: QuantityInputProps) {
  const [editingCustom, setEditingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState(String(quantity));

  const units = food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
  const showToggle = units.length > 1;

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  const commitCustom = () => {
    const n = parseFloat(customDraft);
    if (Number.isFinite(n) && n >= 0) onChange({ quantity: n, unit });
    setEditingCustom(false);
  };

  const switchUnit = (toUnit: Unit) => {
    if (toUnit === unit) return;
    try {
      const foodForCalc = {
        base_amount: food.base_amount ?? food.baseAmount ?? 100,
        base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
        serving_size_g: food.serving_size_g ?? null,
        calories: food.calories ?? 0,
        protein: food.protein ?? null,
      };
      let converted = convertQuantity(foodForCalc, quantity, unit, toUnit);
      // Round per the spec: serving → integer-friendly, g/ml → integer
      if (toUnit === 'serving') {
        converted = Math.round(converted * 2) / 2; // nearest 0.5
        if (converted === 0) converted = 0.5;       // never round to zero
      } else {
        converted = Math.round(converted);
        if (converted === 0) converted = 1;
      }
      onChange({ quantity: converted, unit: toUnit });
      setCustomDraft(String(converted));
    } catch {
      // Conversion impossible → just switch unit, keep quantity
      onChange({ quantity, unit: toUnit });
    }
  };

  // Live macro preview
  let kcalPreview: number | null = null;
  try {
    const foodForCalc = {
      base_amount: food.base_amount ?? food.baseAmount ?? 100,
      base_unit: (food.base_unit ?? food.baseUnit ?? 'serving') as Unit,
      serving_size_g: food.serving_size_g ?? null,
      calories: food.calories ?? 0,
      protein: food.protein ?? null,
    };
    kcalPreview = nutritionFor(foodForCalc, quantity, unit).calories;
  } catch { /* ignore — invalid combo */ }

  // ─── Stepper variant (servings) ─────────────────────────────────────────────
  const isServingMode = unit === 'serving';

  return (
    <div className="px-4 pb-3 flex items-center gap-3 flex-wrap" onClick={stop}>
      <span className="text-xs text-white/50 shrink-0">Amount</span>

      <div className="flex items-center gap-2">
        {isServingMode ? (
          <>
            <button
              type="button"
              onClick={(e) => { stop(e); onChange({ quantity: Math.max(0, quantity - 0.5), unit }); }}
              aria-label="Decrease"
              disabled={quantity <= 0}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>

            {editingCustom ? (
              <input
                type="number" inputMode="decimal" min={0} step={0.1} autoFocus
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCustom();
                  if (e.key === 'Escape') { setCustomDraft(String(quantity)); setEditingCustom(false); }
                }}
                onClick={stop}
                className="w-16 px-2 py-1 text-sm bg-white/10 border border-indigo-400/60 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-400/40 tabular-nums"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => { stop(e); setCustomDraft(String(quantity)); setEditingCustom(true); }}
                className="min-w-[3.5rem] px-2 py-1 text-sm font-semibold text-white tabular-nums hover:bg-white/10 rounded-lg transition-colors"
              >
                {quantity === 0 ? '—' : Number.isInteger(quantity) ? quantity : quantity.toFixed(1)}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => { stop(e); onChange({ quantity: quantity + 0.5, unit }); }}
              aria-label="Increase"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </>
        ) : (
          // g / ml mode — single tap-to-type field, no stepper
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={editingCustom ? customDraft : (quantity === 0 ? '' : String(quantity))}
            onFocus={() => { setCustomDraft(String(quantity)); setEditingCustom(true); }}
            onChange={(e) => setCustomDraft(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
              if (e.key === 'Escape') { setCustomDraft(String(quantity)); setEditingCustom(false); }
            }}
            onClick={stop}
            className="w-20 px-2 py-1 text-sm bg-white/10 border border-white/15 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-400/40 tabular-nums"
            placeholder="0"
          />
        )}
      </div>

      {/* Unit pills (or plain label if only one option) */}
      {showToggle ? (
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/5 border border-white/10">
          {units.map((opt) => (
            <button
              key={opt.unit}
              type="button"
              onClick={(e) => { stop(e); switchUnit(opt.unit); }}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                opt.unit === unit
                  ? 'bg-indigo-500/20 border border-indigo-400/60 text-white font-medium'
                  : 'text-white/60 hover:text-white border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-xs text-white/50">{units[0].label}</span>
      )}

      <span className="text-xs text-indigo-300 ml-auto tabular-nums">
        {kcalPreview != null ? `${kcalPreview} kcal` : '—'}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: clean build (component is created but not yet imported, so unused — that's fine).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/QuantityInput.tsx
git commit -m "$(cat <<'EOF'
feat(web): add QuantityInput component

Adaptive input: stepper for servings, tap-to-type for g/ml. Two-pill
unit toggle when alternates exist. Live kcal preview via mirrored
nutritionFor helper. Conversion-on-toggle preserves macros.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.5: Swap `ServingsStepper` → `QuantityInput` in `FoodPicker`

**Files:**
- Modify: `web/src/app/journal/page.tsx:131-205` (SelectedFood, FoodPicker, ServingsStepper)

- [ ] **Step 1: Replace SelectedFood + FoodPicker + remove ServingsStepper**

Find the section starting `// ─── Food Picker (shared between Foods tab & Meals) ────`.

Replace `interface SelectedFood` (line 133-136) with:

```typescript
interface SelectedFood {
  food: Food;
  quantity: number;
  unit: Unit;
}
```

In the `FoodPicker` component, replace the `toggleFood` function (lines 186-193) with:

```typescript
  function toggleFood(food: Food) {
    const existing = selectedFoods.find((sf) => sf.food.id === food.id);
    if (existing) {
      setSelectedFoods(selectedFoods.filter((sf) => sf.food.id !== food.id));
    } else {
      // Pick the food's default unit + sensible starting quantity
      const units = food.units ?? [{ unit: 'serving' as Unit, label: 'serving', default: true }];
      const def = units.find((u) => u.default) ?? units[0];
      const startQty =
        def.unit === 'serving' ? 1 :
        (food.base_amount ?? food.baseAmount ?? 100);
      setSelectedFoods([...selectedFoods, { food, quantity: startQty, unit: def.unit }]);
    }
  }
```

Replace `setServingsForFood` (lines 195-200) with:

```typescript
  function setQuantityForFood(foodId: number, next: { quantity: number; unit: Unit }) {
    const clamped = { quantity: Math.max(0, next.quantity), unit: next.unit };
    setSelectedFoods(selectedFoods.map((sf) =>
      sf.food.id === foodId ? { ...sf, ...clamped } : sf
    ));
  }
```

Replace the `<ServingsStepper ... />` JSX inside the food row (around line 292-296) with:

```tsx
                {isSelected && (
                  <QuantityInput
                    food={food}
                    quantity={selected.quantity}
                    unit={selected.unit}
                    onChange={(next) => setQuantityForFood(food.id, next)}
                  />
                )}
```

**Delete** the entire `// ─── Servings Stepper ──` section (the `ServingsStepperProps` interface and the `ServingsStepper` function — roughly lines 307-391).

**Update the imports at the top of `page.tsx` (around lines 7-17).** Add `Unit` to the existing `@/lib/types` import, and add two new import lines for the new helpers/components:

```typescript
import type { JournalEntry, MealType, Food, SavedMeal, Unit } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { QuantityInput } from '@/components/QuantityInput';
import { nutritionFor, formatQuantity } from '@/lib/nutrition';
```

The existing `calcNutrition`, `foodCalories`, and `foodProtein` helpers (lines 49-94) become redundant — **remove them entirely**. Anywhere they were used, swap to `nutritionFor` from `@/lib/nutrition` (or just read `food.calories` / `food.protein` directly for the picker row's "X kcal · Yg pro" line).

- [ ] **Step 2: Update `handleAddSelectedFoods`**

Find the function (around line 435-461). Replace its body with:

```typescript
  async function handleAddSelectedFoods() {
    if (selectedFoods.length === 0) return;
    setSaving(true);
    setError('');
    try {
      for (const { food, quantity, unit } of selectedFoods) {
        if (quantity <= 0) continue;
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: food.id,
          food_name_snapshot: food.name,
          quantity,
          unit,
        });
        onAdded(entry);
      }
      setSelectedFoods([]);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add entries');
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 3: Update sticky-footer running totals**

Find the `totalCalories`/`totalProtein` computation (around line 542-549). Replace with:

```typescript
  const footerTotals = selectedFoods.reduce(
    (acc, sf) => {
      try {
        const foodForCalc = {
          base_amount: sf.food.base_amount ?? sf.food.baseAmount ?? 100,
          base_unit: (sf.food.base_unit ?? sf.food.baseUnit ?? 'serving') as Unit,
          serving_size_g: sf.food.serving_size_g ?? null,
          calories: sf.food.calories ?? 0,
          protein: sf.food.protein ?? null,
        };
        const r = nutritionFor(foodForCalc, sf.quantity, sf.unit);
        return { calories: acc.calories + r.calories, protein: acc.protein + r.protein };
      } catch {
        return acc;
      }
    },
    { calories: 0, protein: 0 }
  );
  const totalCalories = footerTotals.calories;
  const totalProtein = footerTotals.protein;
```

- [ ] **Step 4: Update `handleAddMeal` (saved-meal log inflation)**

Find `handleAddMeal` (around line 463-505). Until PR 3 lands, saved-meal items still arrive with `servings` only. Update the call to `addJournalEntry`:

```typescript
      for (const item of fullMeal.items) {
        const res = await fetch(`${BASE_URL}/api/foods/${item.foodId}`);
        if (!res.ok) continue;
        const food: Food = await res.json();
        // Saved-meal items still come back as { servings } in PR 2 — translate
        // to the new shape. PR 3 will refactor saved meals to native quantity+unit.
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: food.id,
          food_name_snapshot: food.name,
          quantity: item.servings ?? item.quantity ?? 1,
          unit: 'serving',
        });
        onAdded(entry);
      }
```

- [ ] **Step 5: Update Quick Add path**

Find `handleQuickAdd` (around line 507-532). Replace the `addJournalEntry` call:

```typescript
      const entry = await addJournalEntry({
        date,
        meal_type: mealType,
        food_name_snapshot: quickName.trim(),
        quantity: 1,
        unit: 'serving',
        calories_snapshot: Math.round(cal),
        protein_snapshot: Math.round(pro * 10) / 10,
      });
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: build succeeds. May have remaining errors in `EntryRow` and `EditEntryModal` — fix those in tasks 2.6 and 2.7.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/journal/page.tsx
git commit -m "$(cat <<'EOF'
feat(journal): swap ServingsStepper for QuantityInput in picker

Picker now opens foods in their default unit (g for raw ingredients,
serving for portioned items), supports the unit toggle, and computes
the live kcal preview via the mirrored nutrition helper. Saved-meal
inflation and Quick Add updated to send quantity+unit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.6: Update `EditEntryModal` to be unit-aware

**Files:**
- Modify: `web/src/app/journal/page.tsx:739-813` (EditEntryModal component)

- [ ] **Step 1: Replace the EditEntryModal component**

Replace the entire `EditEntryModal` component with:

```tsx
function EditEntryModal({ isOpen, onClose, entry, onUpdated }: EditEntryModalProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<Unit>('serving');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [food, setFood] = useState<Food | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When an entry opens, hydrate the form and fetch the food (if any) so we
  // know its units[]. Quick Add entries (food_id null) use a single Amount
  // field, no toggle.
  useEffect(() => {
    if (!entry) return;
    setQuantity(entry.quantity ?? entry.servings ?? 1);
    setUnit((entry.unit as Unit) ?? 'serving');
    setMealType(entry.meal_type);
    setError('');
    setFood(null);
    if (entry.food_id != null) {
      fetch(`${BASE_URL}/api/foods/${entry.food_id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((f: Food | null) => setFood(f))
        .catch(() => setFood(null));
    }
  }, [entry]);

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateJournalEntry(entry.id, {
        quantity,
        unit,
        meal_type: mealType,
      });
      onUpdated(updated);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  const isQuickAdd = entry?.food_id == null;

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Edit Entry" size="sm">
      {entry && (
        <div className="space-y-4">
          <p className="font-medium text-white">{entry.food_name_snapshot}</p>

          {isQuickAdd || !food ? (
            // Quick Add: simple single quantity input (no unit toggle)
            <GlassInput
              label="Amount"
              type="number"
              inputMode="decimal"
              value={String(quantity)}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              min={0.1}
              step={0.1}
            />
          ) : (
            // Food-bound: full QuantityInput with unit toggle
            <div className="rounded-2xl bg-white/[0.04] border border-white/10">
              <QuantityInput
                food={food}
                quantity={quantity}
                unit={unit}
                onChange={(next) => { setQuantity(next.quantity); setUnit(next.unit); }}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white/60 pl-1">Meal</label>
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="w-full px-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400/60 transition-all duration-200"
            >
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m} className="bg-slate-900">{MEAL_LABELS[m]}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <GlassButton variant="default" className="flex-1" onClick={onClose}>Cancel</GlassButton>
            <GlassButton variant="primary" className="flex-1" onClick={handleSave} disabled={saving || quantity <= 0}>
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: build succeeds (or remaining errors only in EntryRow's display).

- [ ] **Step 3: Commit**

```bash
git add web/src/app/journal/page.tsx
git commit -m "$(cat <<'EOF'
feat(journal): EditEntryModal becomes unit-aware

Opens with the entry's stored quantity+unit, fetches the food's units
on open, and lets the user toggle. Quick Add entries (no food_id)
keep a simple Amount field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.7: Update `EntryRow` subtitle to use `formatQuantity`

**Files:**
- Modify: `web/src/app/journal/page.tsx:1129-1132` (EntryRow's subtitle)

- [ ] **Step 1: Replace the subtitle**

Find the `EntryRow` body, the `<p className="text-xs text-white/50">` block. Replace it with:

```tsx
        <p className="text-xs text-white/50">
          {formatQuantity(entry.quantity ?? entry.servings ?? 1, (entry.unit as Unit) ?? 'serving')} · {entry.calories_snapshot} kcal · {entry.protein_snapshot}g protein
        </p>
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: clean build.

- [ ] **Step 3: Lint**

Run: `cd web && npm run lint`
Expected: clean lint, or at most the same warnings present before this change.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/journal/page.tsx
git commit -m "$(cat <<'EOF'
feat(journal): EntryRow shows the natural unit (150 g, 1 serving, etc.)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.8: Backend cleanup — drop legacy `servings` from `JournalEntries`

**Files:**
- Modify: `server/src/db.ts` (add a one-shot drop migration)
- Modify: `server/src/routes/journal.ts` (stop writing `servings`)

This must run AFTER PR 2's frontend change is on Terry's local machine — otherwise the legacy code paths still need the column.

- [ ] **Step 1: Add the drop migration to db.ts**

Insert after the quantity/unit migration block:

```typescript
      // ── Migration: drop legacy `servings` column from JournalEntries (DSHKI-8 PR 2) ──
      // SQLite ALTER TABLE DROP COLUMN was added in 3.35 (2021). Use a guarded
      // try/catch via PRAGMA so this is safe on older SQLite builds (logs a
      // warning but continues — the unused column is harmless).
      db.all(`PRAGMA table_info(JournalEntries)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        if (existingCols.has('servings')) {
          db.run('ALTER TABLE JournalEntries DROP COLUMN servings', [], (err) => {
            if (err) console.warn('[db] could not drop legacy JournalEntries.servings:', err.message);
            else console.log('[db] ran migration: DROP COLUMN JournalEntries.servings');
          });
        }
      });
```

- [ ] **Step 2: Remove `servings` from journal route INSERT/UPDATE**

In `server/src/routes/journal.ts`:

- Update `SELECT_ENTRY_SQL` to remove `servings`:
```typescript
const SELECT_ENTRY_SQL = `
  SELECT id, date, meal_type, logged_at, food_id, food_name_snapshot,
         quantity, unit,
         calories_snapshot, protein_snapshot, created_at
  FROM JournalEntries
`;
```

- In the POST `finishInsert` helper, drop the `servingsForCompat` parameter and the `servings` column from both SQL and the array:
```typescript
const finishInsert = (caloriesNum: number, proteinNum: number | null) => {
  db.run(
    `INSERT INTO JournalEntries
       (date, meal_type, logged_at, food_id, food_name_snapshot,
        quantity, unit,
        calories_snapshot, protein_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, meal_type, loggedAt, foodIdVal, food_name_snapshot,
     quantity, unit,
     caloriesNum, proteinNum],
    /* …unchanged callback… */
  );
};
```
Update both call sites (`finishInsert(cal, pro)` and `finishInsert(calories, protein)`).

- In PUT, remove the `servings = ?` field push and the `servingsForCol` parameter from `finishUpdate`:
```typescript
const finishUpdate = (calForCol: number | null, proForCol: number | null) => {
  if (newQuantity !== undefined || servings !== undefined) {
    fields.push('quantity = ?'); params.push(finalQuantity);
  }
  // … rest unchanged, just no `servings = ?` field push
};
```
Update both call sites.

- [ ] **Step 3: Build + restart server**

Run: `cd server && npm run build && npm run dev`
Expected stdout: `[db] ran migration: DROP COLUMN JournalEntries.servings`. Stop the server.

- [ ] **Step 4: Verify**

```bash
cd server && node -e "
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./dashki.db');
db.all('PRAGMA table_info(JournalEntries)', (e, rows) => {
  console.log(rows.map(r => r.name).join(', '));
  db.close();
});
"
```
Expected: no `servings` in the output.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/src/routes/journal.ts
git commit -m "$(cat <<'EOF'
refactor(journal): drop legacy servings column; quantity+unit only

Frontend now sends quantity+unit exclusively (PR 2). Legacy compat
column dropped from the schema and removed from the route INSERT/UPDATE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.9: Local test gate for PR 2 + push

- [ ] **Step 1: Pull fresh prod data**

```bash
cd server && npm run pull:prod
# (this pulls from prod which still has the unit-naive frontend writing legacy
# entries — the pull handles that; locally they get backfilled to unit='serving'
# by the PR 1 migration)
```

- [ ] **Step 2: Start both dev servers**

`cd server && npm run dev` — and in another terminal `cd web && npm run dev`.

- [ ] **Step 3: Manual checks at http://localhost:3000/journal**

Terry runs through:
- Picker opens; foods with `serving_size_g` show a 2-pill toggle (g / serving), default to serving.
- Foods without serving_size_g (raw chicken etc.) show only `g`, no toggle.
- ml-only foods (coffee) show only `ml`.
- Logging a food in g writes an entry whose subtitle reads `150 g · …`.
- Logging in serving writes `1 serving · …` or `2.5 serving · …`.
- Editing an entry opens with the same unit it was logged in; toggling unit converts quantity AND keeps kcal stable.
- Adding a saved meal still works (each item logged as `1 serving` until PR 3).
- Quick Add still works.
- Daily totals on the ring add up.
- No console errors.

- [ ] **Step 4: Move ticket to In Review and report**

Stop and ASK Terry: "PR 2 is locally tested. Picker + Edit modal are unit-aware; legacy column dropped. Ready to push?"

- [ ] **Step 5: After Terry's go, push**

```bash
git push origin <branch-name>
```

DSHKI-8 stays In Progress (PR 3 still ahead).

---

# PHASE / PR 3 — Saved Meals

End state: `SavedMealItems` stores `quantity` + `unit`; the meal builder UI uses `QuantityInput` per item; logging a saved meal inflates each item with its native unit.

---

### Task 3.1: Locate the saved-meal builder UI

The journal page only consumes saved meals. Find where they're created/edited.

- [ ] **Step 1: Search for the builder**

```bash
grep -rn "createSavedMeal\|updateSavedMeal" web/src/
```

Expected: a Meals page or component (likely `web/src/app/meals/page.tsx`). Note the file paths.

- [ ] **Step 2: Read the builder code**

Read the file(s) found in Step 1 fully. Identify:
- Where items are added to a meal (a similar `selectedFoods` pattern likely exists)
- Where the per-item servings input lives (likely a `ServingsStepper`-equivalent)
- The shape sent to `createSavedMeal` / `updateSavedMeal`

- [ ] **Step 3: Note observations** in the next task's plan adjustments. (No commit — pure exploration.)

---

### Task 3.2: Migrate `SavedMealItems` schema (add quantity/unit, backfill)

**Files:**
- Modify: `server/src/db.ts`

- [ ] **Step 1: Add the migration block**

After the JournalEntries migration block (and the drop-servings block from PR 2), add:

```typescript
      // ── Migration: add quantity + unit to SavedMealItems (DSHKI-8 PR 3) ────
      db.all(`PRAGMA table_info(SavedMealItems)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        const migrations: string[] = [];
        if (!existingCols.has('quantity')) migrations.push('ALTER TABLE SavedMealItems ADD COLUMN quantity REAL');
        if (!existingCols.has('unit'))     migrations.push('ALTER TABLE SavedMealItems ADD COLUMN unit TEXT');
        for (const sql of migrations) {
          db.run(sql, [], (err) => err
            ? console.error('[db] migration error:', err.message)
            : console.log(`[db] ran migration: ${sql}`));
        }
        db.run(
          `UPDATE SavedMealItems
           SET quantity = servings, unit = 'serving'
           WHERE quantity IS NULL OR unit IS NULL`,
          [],
          function (this: { changes: number }, err) {
            if (err) console.error('[db] backfill error:', err.message);
            else if (this.changes > 0) console.log(`[db] backfilled ${this.changes} SavedMealItems`);
          }
        );
      });
```

- [ ] **Step 2: Restart dev server, verify migration logs**

Run: `cd server && npm run dev`
Expected stdout: `[db] ran migration: ALTER TABLE SavedMealItems ADD COLUMN quantity REAL` etc., plus a backfill line.

- [ ] **Step 3: Commit**

```bash
git add server/src/db.ts
git commit -m "$(cat <<'EOF'
feat(db): add quantity + unit to SavedMealItems

Mirror of the JournalEntries migration. Backfills from legacy servings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: Update saved-meal API routes for `quantity + unit`

**Files:**
- Modify: `server/src/routes/meals.ts:46-52, 87-92, 145-151, 234-241` (item SELECTs); `:108-188` (POST), `:192-278` (PUT)

- [ ] **Step 1: Add `quantity, unit` to every item SELECT**

In all four places where items are selected (search for `smi.food_id as foodId, smi.servings`), update to:

```sql
SELECT smi.id, smi.food_id as foodId, smi.servings,
  COALESCE(smi.quantity, smi.servings) as quantity,
  COALESCE(smi.unit, 'serving') as unit,
  f.name, f.base_amount as baseAmount, f.base_unit as baseUnit,
  f.calories, f.protein, f.serving_size_g
FROM SavedMealItems smi
JOIN Foods f ON smi.food_id = f.id
WHERE smi.meal_id = ?
```

(Also propagating `serving_size_g` so the meal-builder UI can render `QuantityInput` for each item.)

- [ ] **Step 2: Update POST validation + INSERT**

Replace the per-item validation loop:
```typescript
  for (const item of items) {
    const foodId = item.foodId ?? item.food_id;
    if (!foodId) {
      return res.status(400).json({ error: 'Each item must have foodId' });
    }
    const qty = item.quantity ?? item.servings;
    if (qty === undefined || qty <= 0) {
      return res.status(400).json({ error: 'Each item must have quantity > 0' });
    }
    const u = item.unit ?? 'serving';
    if (!['g', 'ml', 'serving'].includes(u)) {
      return res.status(400).json({ error: `Invalid unit: ${u}` });
    }
  }
```

Replace the INSERT inside `insertItems`:
```typescript
        const item = items[index];
        const foodId = item.foodId ?? item.food_id;
        const quantity = Number(item.quantity ?? item.servings);
        const unit = item.unit ?? 'serving';

        db.run(
          'INSERT INTO SavedMealItems (meal_id, food_id, servings, quantity, unit) VALUES (?, ?, ?, ?, ?)',
          [mealId, foodId, quantity /* legacy */, quantity, unit],
          /* …callback unchanged… */
        );
```

- [ ] **Step 3: Mirror the same INSERT changes in PUT**

Same INSERT shape inside PUT's `insertItem` helper.

- [ ] **Step 4: Build + smoke-test**

```bash
cd server && npm run build && npm run dev
```

```bash
# Create a saved meal with mixed units
curl -s -X POST http://localhost:4000/api/meals/saved \
  -H 'Content-Type: application/json' \
  -d '{"name":"PR3 test meal","items":[{"foodId":<FOOD_WITH_SERVING>,"quantity":150,"unit":"g"},{"foodId":<ANOTHER_FOOD>,"quantity":2,"unit":"serving"}]}' \
  | python -m json.tool
```
Expected: 201, items[].quantity and items[].unit reflect what was sent. Delete the test meal.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/meals.ts
git commit -m "$(cat <<'EOF'
feat(meals): saved-meal items use quantity+unit

POST/PUT accept the new shape. Item SELECTs now COALESCE the legacy
servings column for older rows and pull serving_size_g so the
meal-builder UI can render QuantityInput per item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.4: Update saved-meal log inflation in journal page

**Files:**
- Modify: `web/src/app/journal/page.tsx` — the `handleAddMeal` function (was updated in Task 2.5 with a temporary fallback)

- [ ] **Step 1: Replace the inflation block**

Find `handleAddMeal` and change the entry-creation loop to use the item's native unit:

```typescript
      for (const item of fullMeal.items) {
        const foodId = (item as any).foodId ?? (item as any).food_id;
        if (!foodId) continue;
        const res = await fetch(`${BASE_URL}/api/foods/${foodId}`);
        if (!res.ok) continue;
        const food: Food = await res.json();
        const entry = await addJournalEntry({
          date,
          meal_type: mealType,
          food_id: food.id,
          food_name_snapshot: food.name,
          quantity: (item as any).quantity ?? (item as any).servings ?? 1,
          unit: ((item as any).unit as Unit) ?? 'serving',
        });
        onAdded(entry);
      }
```

- [ ] **Step 2: Build**

Run: `cd web && npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/journal/page.tsx
git commit -m "$(cat <<'EOF'
feat(journal): saved-meal log inflation uses item's native unit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.5: Swap saved-meal builder per-item input → `QuantityInput`

**Files:**
- Modify: the file(s) found in Task 3.1.

- [ ] **Step 1: In the saved-meal builder, locate the per-item input**

Refer to the observations from Task 3.1. The pattern almost certainly mirrors what was in `FoodPicker`'s `ServingsStepper` — a per-item servings stepper.

- [ ] **Step 2: Update the builder's `SelectedItem` type to track `{ quantity, unit }` instead of `{ servings }`**

Same pattern as `SelectedFood` in Task 2.5:
```typescript
interface SelectedMealItem {
  food: Food;
  quantity: number;
  unit: Unit;
}
```

- [ ] **Step 3: Replace the per-item stepper with `<QuantityInput food={...} quantity={...} unit={...} onChange={...} />`**

Mirror the integration done in Task 2.5 step 1.

- [ ] **Step 4: Update the meal create/save call to pass `quantity` + `unit` per item**

```typescript
await createSavedMeal({
  name,
  items: items.map((it) => ({ food_id: it.food.id, quantity: it.quantity, unit: it.unit })),
});
```

(The signature of `createSavedMeal` in `web/src/lib/api.ts` may need a small update to accept `unit` — add it.)

- [ ] **Step 5: Build + lint**

Run: `cd web && npm run build && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/meals/* web/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(meals): saved-meal builder per-item QuantityInput

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.6: Drop legacy `servings` column from `SavedMealItems`

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/routes/meals.ts`

- [ ] **Step 1: Add drop migration to db.ts**

After the SavedMealItems quantity/unit migration:

```typescript
      // ── Migration: drop legacy SavedMealItems.servings (DSHKI-8 PR 3) ──────
      db.all(`PRAGMA table_info(SavedMealItems)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        if (existingCols.has('servings')) {
          db.run('ALTER TABLE SavedMealItems DROP COLUMN servings', [], (err) => {
            if (err) console.warn('[db] could not drop SavedMealItems.servings:', err.message);
            else console.log('[db] ran migration: DROP COLUMN SavedMealItems.servings');
          });
        }
      });
```

- [ ] **Step 2: Remove `servings` from meals.ts INSERTs and SELECTs**

In `server/src/routes/meals.ts`:

- INSERT calls:
```typescript
db.run(
  'INSERT INTO SavedMealItems (meal_id, food_id, quantity, unit) VALUES (?, ?, ?, ?)',
  [mealId, foodId, quantity, unit],
  /* …unchanged… */
);
```
- SELECTs: drop `smi.servings` and the COALESCE wrapping (now `quantity` and `unit` are guaranteed populated for all rows after Task 3.2's backfill):
```sql
SELECT smi.id, smi.food_id as foodId,
  smi.quantity, smi.unit,
  f.name, f.base_amount as baseAmount, f.base_unit as baseUnit,
  f.calories, f.protein, f.serving_size_g
FROM SavedMealItems smi
JOIN Foods f ON smi.food_id = f.id
WHERE smi.meal_id = ?
```
- Update the `total_calories` / `total_protein` aggregate query in the meals list endpoint to use `smi.quantity` instead of `smi.servings`. Note that this aggregate is only roughly accurate for `unit='serving'` items — for g/ml items it under-counts. Replace with a comment + a simpler heuristic:
```typescript
// total_* are approximate (assume unit='serving') — used only for the list-row
// preview. Per-item exact totals come from /api/meals/saved/:id.
```

- [ ] **Step 3: Build + restart**

```bash
cd server && npm run build && npm run dev
```
Expected: `[db] ran migration: DROP COLUMN SavedMealItems.servings`.

- [ ] **Step 4: Commit**

```bash
git add server/src/db.ts server/src/routes/meals.ts
git commit -m "$(cat <<'EOF'
refactor(meals): drop legacy SavedMealItems.servings

quantity+unit are the only stored fields now.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.7: Local test gate for PR 3 + push + close ticket

- [ ] **Step 1: Pull fresh prod data**

```bash
cd server && npm run pull:prod
```

- [ ] **Step 2: Start both dev servers**

- [ ] **Step 3: Manual checks**

Terry runs:
- Open the meals page; existing meals load.
- Add a new saved meal with mixed units (one item in g, one in serving).
- Edit a saved meal — each item's QuantityInput shows the correct unit toggle.
- Log the saved meal into the journal — each entry preserves its native unit (subtitle shows `150 g · …` for the g item).
- Existing serving-only saved meals still log as `1 serving · …`.
- No console errors.

- [ ] **Step 4: Move ticket to In Review and report**

Stop and ASK Terry: "PR 3 is locally tested. Saved meals are unit-aware end-to-end. Ready to push?"

- [ ] **Step 5: After Terry's go, push and close the ticket**

```bash
git push origin <branch-name>
```

Move DSHKI-8 → Done with a comment listing the three PRs and their commit ranges.

---

## Done

The end state: every food log on Dashki carries the user's chosen unit. Foods with `serving_size_g` set offer a `g ↔ serving` toggle that converts quantity-and-keeps-macros. Saved meals support mixed units. The legacy `servings` column is gone.
