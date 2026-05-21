import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

export interface Goals {
  id: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  steps: number | null;
  weight_kg: number | null;
  weight_journey_start_date: string | null;
  tdee_calories: number | null;
  updated_at: string;
}

// Default goals (used when no goals are set)
const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: null,
  fat: null,
  fiber: null,
  steps: 10000,
  weight_kg: null,
  weight_journey_start_date: null,
  tdee_calories: null,
};

// ─── GET / — fetch current goals ─────────────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  db.get(
    `SELECT id, calories, protein, carbs, fat, fiber, steps, weight_kg,
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
        fiber: row.fiber ?? DEFAULT_GOALS.fiber,
        steps: row.steps ?? DEFAULT_GOALS.steps,
        weight_kg: row.weight_kg ?? DEFAULT_GOALS.weight_kg,
        weight_journey_start_date: row.weight_journey_start_date ?? null,
        tdee_calories: row.tdee_calories ?? null,
        updated_at: row.updated_at,
      };

      res.json(goals);
    }
  );
});

// ─── PUT / — update goals ───────────────────────────────────────────────────

router.put('/', (req: Request, res: Response) => {
  const { calories, protein, carbs, fat, fiber, steps, weight_kg, weight_journey_start_date, tdee_calories } =
    req.body || {};

  // Validate inputs - all fields are optional but must be valid numbers if provided
  const updates: string[] = [];
  const params: (number | string | null)[] = [];

  if (calories !== undefined) {
    const val = calories === null ? null : Number(calories);
    if (val !== null && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: 'Invalid calories value' });
    }
    updates.push('calories = ?');
    params.push(val);
  }

  if (protein !== undefined) {
    const val = protein === null ? null : Number(protein);
    if (val !== null && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: 'Invalid protein value' });
    }
    updates.push('protein = ?');
    params.push(val);
  }

  if (carbs !== undefined) {
    const val = carbs === null ? null : Number(carbs);
    if (val !== null && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: 'Invalid carbs value' });
    }
    updates.push('carbs = ?');
    params.push(val);
  }

  if (fat !== undefined) {
    const val = fat === null ? null : Number(fat);
    if (val !== null && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: 'Invalid fat value' });
    }
    updates.push('fat = ?');
    params.push(val);
  }

  if (fiber !== undefined) {
    const val = fiber === null ? null : Number(fiber);
    if (val !== null && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: 'Invalid fiber value' });
    }
    updates.push('fiber = ?');
    params.push(val);
  }

  if (steps !== undefined) {
    const val = steps === null ? null : Number(steps);
    if (val !== null && (!Number.isFinite(val) || val <= 0 || !Number.isInteger(val))) {
      return res.status(400).json({ error: 'Invalid steps value' });
    }
    updates.push('steps = ?');
    params.push(val);
  }

  if (weight_kg !== undefined) {
    const val = weight_kg === null ? null : Number(weight_kg);
    if (val !== null && (!Number.isFinite(val) || val <= 0)) {
      return res.status(400).json({ error: 'Invalid weight_kg value' });
    }
    updates.push('weight_kg = ?');
    params.push(val);
  }

  if (weight_journey_start_date !== undefined) {
    const val = weight_journey_start_date === null ? null : String(weight_journey_start_date).trim();
    if (val !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return res.status(400).json({ error: 'Invalid weight_journey_start_date — must be YYYY-MM-DD' });
      }
      // Round-trip through Date to reject impossible dates like 2026-13-45.
      const d = new Date(val + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== val) {
        return res.status(400).json({ error: 'Invalid weight_journey_start_date — must be YYYY-MM-DD' });
      }
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

  // Always update the timestamp
  updates.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `UPDATE Goals SET ${updates.join(', ')} WHERE id = 1`;

  db.run(sql, params, function (this: { changes: number }, err) {
    if (err) {
      console.error('[error] PUT /api/goals', err);
      return res.status(500).json({ error: 'Failed to update goals' });
    }

    // Fetch the updated goals
    db.get(
      `SELECT id, calories, protein, carbs, fat, fiber, steps, weight_kg,
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
          fiber: row!.fiber ?? DEFAULT_GOALS.fiber,
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
  });
});

export default router;
