import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';
import { nutritionFor } from '../nutrition';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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

/**
 * Map a raw DB row into the shape the frontend expects.
 * The DB stores values per serving (based on baseAmount/baseUnit).
 * We calculate per-100g values only when baseUnit is 'g'/'grams'.
 */
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

const SELECT_SQL = `
  SELECT id, name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g, created_at
  FROM Foods
`;

// ─── GET / — list foods ───────────────────────────────────────────────────────
//
// Sorting: the 20 most-recently-used foods (by latest JournalEntries.logged_at
// for that food_id) are returned first in recency order, then everything
// else is appended in alphabetical name order. Each row carries a boolean
// `recently_used` flag so the frontend can render a divider between the two
// groups.
//
// Why JS post-processing rather than a single SQL query: SQLite's lack of
// NULLS LAST + the "first N by recency, then everything else alpha" rule
// is awkward to express as a single ORDER BY. Two passes in JS is clear,
// fast at this scale (hundreds of foods), and doesn't require a CTE.

const RECENT_FOODS_LIMIT = 20;

router.get('/', (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').trim();
  const pattern = search ? `%${search}%` : '%';

  // Pull the food row + its latest journal-entry timestamp via a correlated
  // subquery. last_used is null for foods that have never been logged.
  db.all(
    `SELECT
       f.id, f.name, f.base_amount, f.base_unit,
       f.calories, f.protein, f.carbs, f.fat,
       f.serving_size_g, f.created_at,
       (SELECT MAX(logged_at) FROM JournalEntries WHERE food_id = f.id) AS last_used
     FROM Foods f
     WHERE f.name LIKE ?`,
    [pattern],
    (err, rows: Array<Record<string, unknown> & { last_used: string | null }>) => {
      if (err) {
        console.error('[error] GET /api/foods', err);
        return res.status(500).json({ error: 'Failed to fetch foods' });
      }

      const all = rows || [];

      // Group A — recently used: at most RECENT_FOODS_LIMIT, sorted by
      // last_used DESC (most-recent first).
      const used = all
        .filter((r) => r.last_used !== null)
        .sort((a, b) =>
          (b.last_used as string).localeCompare(a.last_used as string)
        );
      const recent = used.slice(0, RECENT_FOODS_LIMIT);
      const recentIds = new Set(recent.map((r) => r.id));

      // Group B — everything else, sorted alphabetically by name (case-insensitive).
      const rest = all
        .filter((r) => !recentIds.has(r.id))
        .sort((a, b) =>
          (a.name as string).localeCompare(b.name as string, undefined, { sensitivity: 'base' })
        );

      const ordered = [...recent, ...rest].map((r) => ({
        ...mapFood(r),
        recently_used: recentIds.has(r.id),
      }));

      res.json(ordered);
    }
  );
});

// ─── GET /:id — single food ───────────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.get(
    `${SELECT_SQL} WHERE id = ?`,
    [id],
    (err, row: Record<string, unknown> | undefined) => {
      if (err) {
        console.error('[error] GET /api/foods/:id', err);
        return res.status(500).json({ error: 'Failed to fetch food' });
      }
      if (!row) return res.status(404).json({ error: 'Food not found' });
      res.json(mapFood(row));
    }
  );
});

// ─── POST / — create food ─────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const body = req.body || {};
  const { name, baseUnit } = body;

  // Accept both naming conventions from the frontend
  const baseAmount = toNumber(body.baseAmount ?? body.base_amount) ?? 100;
  const unit = baseUnit ?? body.base_unit ?? 'grams';

  // Accept calories_per_100g or legacy calories
  const calories = toNumber(body.calories_per_100g ?? body.calories);
  const protein = toNumber(body.protein_per_100g ?? body.protein, null);
  const carbs = toNumber(body.carbs_per_100g ?? body.carbs, null);
  const fat = toNumber(body.fat_per_100g ?? body.fat, null);
  const serving_size_g = toNumber(body.serving_size_g, null);

  if (!name || calories === null) {
    return res.status(400).json({ error: 'Missing required fields: name, calories_per_100g' });
  }

  db.run(
    `INSERT INTO Foods (name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, baseAmount, unit, calories, protein, carbs, fat, serving_size_g],
    function (this: { lastID: number }, err) {
      if (err) {
        console.error('[error] POST /api/foods', err);
        return res.status(500).json({ error: 'Failed to create food' });
      }
      const newId = this.lastID;
      db.get(
        `${SELECT_SQL} WHERE id = ?`,
        [newId],
        (err2, food: Record<string, unknown> | undefined) => {
          if (err2) {
            console.error('[error] POST /api/foods fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch created food' });
          }
          const mapped = mapFood(food!);
          try { getIo().emit('food-created', mapped); } catch (_) { /* io not ready */ }
          res.status(201).json(mapped);
        }
      );
    }
  );
});

// ─── PUT /:id — partial update ────────────────────────────────────────────────

router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const body = req.body || {};
  const fields: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { fields.push('name = ?'); params.push(body.name); }

  const rawBaseAmount = body.baseAmount ?? body.base_amount;
  if (rawBaseAmount !== undefined) {
    const v = toNumber(rawBaseAmount);
    if (v === null) return res.status(400).json({ error: 'Invalid baseAmount' });
    fields.push('base_amount = ?'); params.push(v);
  }

  if (body.baseUnit !== undefined || body.base_unit !== undefined) {
    fields.push('base_unit = ?'); params.push(body.baseUnit ?? body.base_unit);
  }

  // Accept calories_per_100g OR legacy calories
  const rawCalories = body.calories_per_100g ?? body.calories;
  if (rawCalories !== undefined) {
    const v = toNumber(rawCalories);
    if (v === null) return res.status(400).json({ error: 'Invalid calories' });
    fields.push('calories = ?'); params.push(v);
  }

  const rawProtein = body.protein_per_100g ?? body.protein;
  if (rawProtein !== undefined) {
    const v = toNumber(rawProtein, null);
    fields.push('protein = ?'); params.push(v);
  }

  const rawCarbs = body.carbs_per_100g ?? body.carbs;
  if (rawCarbs !== undefined) {
    const v = toNumber(rawCarbs, null);
    fields.push('carbs = ?'); params.push(v);
  }

  const rawFat = body.fat_per_100g ?? body.fat;
  if (rawFat !== undefined) {
    const v = toNumber(rawFat, null);
    fields.push('fat = ?'); params.push(v);
  }

  if (body.serving_size_g !== undefined) {
    const v = toNumber(body.serving_size_g, null);
    fields.push('serving_size_g = ?'); params.push(v);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.run(
    `UPDATE Foods SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/foods/:id', err);
        return res.status(500).json({ error: 'Failed to update food' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Food not found' });

      db.get(
        `${SELECT_SQL} WHERE id = ?`,
        [id],
        (err2, food: Record<string, unknown> | undefined) => {
          if (err2) {
            console.error('[error] PUT /api/foods/:id fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch updated food' });
          }
          const mapped = mapFood(food!);

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
        }
      );
    }
  );
});

// ─── DELETE /:id — delete food ────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM Foods WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/foods/:id', err);
        return res.status(500).json({ error: 'Failed to delete food' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Food not found' });

      // Remove all journal entries that referenced this food
      db.run(
        'DELETE FROM JournalEntries WHERE food_id = ?',
        [id],
        (journalErr) => {
          if (journalErr) {
            console.error('[error] DELETE /api/foods/:id journal cleanup', journalErr);
          }
          try { getIo().emit('food-deleted', { id }); } catch (_) {}
          try { getIo().emit('journal-entry-deleted', { food_id: id }); } catch (_) {}
          res.status(204).send();
        }
      );
    }
  );
});

export default router;
