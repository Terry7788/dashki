import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';
import { syncCalorieHabit, todayLocalIso } from '../dashko-sync';
import { nutritionFor } from '../nutrition';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const SELECT_ENTRY_SQL = `
  SELECT id, date, meal_type, logged_at, food_id, food_name_snapshot,
         quantity, unit,
         calories_snapshot, protein_snapshot, created_at
  FROM JournalEntries
`;

// ─── GET / — entries for a date or date range ────────────────────────────────
// Supports:
//   ?date=YYYY-MM-DD                              → single day
//   ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD      → inclusive range
//   (no params)                                   → today

router.get('/', (req: Request, res: Response) => {
  const dateParam = (req.query.date as string | undefined)?.trim();
  const startDate = (req.query.startDate as string | undefined)?.trim();
  const endDate = (req.query.endDate as string | undefined)?.trim();

  let sql: string;
  let params: string[];

  if (startDate && endDate) {
    sql = `${SELECT_ENTRY_SQL} WHERE date BETWEEN ? AND ? ORDER BY date ASC, logged_at ASC`;
    params = [startDate, endDate];
  } else {
    const date = dateParam || todayStr();
    sql = `${SELECT_ENTRY_SQL} WHERE date = ? ORDER BY logged_at ASC`;
    params = [date];
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[error] GET /api/journal', err);
      return res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
    res.json(rows || []);
  });
});

// ─── GET /today-summary ───────────────────────────────────────────────────────

router.get('/today-summary', (req: Request, res: Response) => {
  const date = ((req.query.date as string) || todayStr()).trim();

  db.get(
    `SELECT COALESCE(SUM(calories_snapshot), 0) AS calories,
            COALESCE(SUM(protein_snapshot), 0)  AS protein
     FROM JournalEntries WHERE date = ?`,
    [date],
    (err, summary: { calories: number; protein: number } | undefined) => {
      if (err) {
        console.error('[error] GET /api/journal/today-summary', err);
        return res.status(500).json({ error: 'Failed to fetch today summary' });
      }

      db.all(
        `${SELECT_ENTRY_SQL} WHERE date = ? ORDER BY logged_at ASC`,
        [date],
        (err2, entries) => {
          if (err2) {
            console.error('[error] GET /api/journal/today-summary entries', err2);
            return res.status(500).json({ error: 'Failed to fetch today entries' });
          }
          res.json({
            date,
            calories: summary?.calories ?? 0,
            protein: summary?.protein ?? 0,
            entries: entries || [],
          });
        }
      );
    }
  );
});

// ─── GET /summary?date= ───────────────────────────────────────────────────────

router.get('/summary', (req: Request, res: Response) => {
  const date = ((req.query.date as string) || todayStr()).trim();

  db.get(
    `SELECT COALESCE(SUM(calories_snapshot), 0) AS calories,
            COALESCE(SUM(protein_snapshot), 0)  AS protein
     FROM JournalEntries WHERE date = ?`,
    [date],
    (err, summary: { calories: number; protein: number } | undefined) => {
      if (err) {
        console.error('[error] GET /api/journal/summary', err);
        return res.status(500).json({ error: 'Failed to fetch journal summary' });
      }
      res.json({
        date,
        calories: summary?.calories ?? 0,
        protein: summary?.protein ?? 0,
      });
    }
  );
});

// ─── POST / — add journal entry ───────────────────────────────────────────────

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
    finishInsert(cal, pro);
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
        finishInsert(calories, protein);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Invalid quantity/unit' });
      }
    }
  );
});

// ─── PUT /:id — update entry ──────────────────────────────────────────────────

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

      const finishUpdate = (calForCol: number | null, proForCol: number | null) => {
        if (newQuantity !== undefined || servings !== undefined) {
          fields.push('quantity = ?'); params.push(finalQuantity);
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
              finishUpdate(calories, protein);
            } catch (e: any) {
              return res.status(400).json({ error: e?.message || 'Invalid quantity/unit' });
            }
          }
        );
      } else {
        // Quick Add or unrelated PUT — accept client-supplied snapshots.
        const cal = calories_snapshot !== undefined ? toNumber(calories_snapshot, 0)! : null;
        const pro = protein_snapshot !== undefined ? toNumber(protein_snapshot, null) : null;
        finishUpdate(cal, pro);
      }
    }
  );
});

// ─── DELETE /:id — delete entry ───────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM JournalEntries WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/journal/:id', err);
        return res.status(500).json({ error: 'Failed to delete journal entry' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Journal entry not found' });
      try { getIo().emit('journal-entry-deleted', { id }); } catch (_) {}
      res.status(204).send();
    }
  );
});

export default router;
