import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const SELECT_ITEMS_SQL = `
  SELECT
    cmi.id,
    cmi.food_id as foodId,
    cmi.servings,
    cmi.temp_food_name as tempFoodName,
    cmi.temp_food_base_amount as tempFoodBaseAmount,
    cmi.temp_food_base_unit as tempFoodBaseUnit,
    cmi.temp_food_calories as tempFoodCalories,
    cmi.temp_food_protein as tempFoodProtein,
    CASE WHEN cmi.food_id IS NULL THEN 1 ELSE 0 END as isTemporary,
    f.name,
    f.base_amount as baseAmount,
    f.base_unit as baseUnit,
    f.calories,
    f.protein
  FROM CurrentMealItems cmi
  LEFT JOIN Foods f ON cmi.food_id = f.id
  ORDER BY cmi.id ASC
`;

function transformItems(items: Record<string, unknown>[]): object[] {
  return items.map((item) => {
    if (item.isTemporary) {
      return {
        id: item.id,
        foodId: null,
        servings: item.servings,
        isTemporary: true,
        name: item.tempFoodName,
        baseAmount: item.tempFoodBaseAmount,
        baseUnit: item.tempFoodBaseUnit,
        calories: item.tempFoodCalories,
        protein: item.tempFoodProtein,
      };
    }
    return {
      id: item.id,
      foodId: item.foodId,
      servings: item.servings,
      isTemporary: false,
      name: item.name,
      baseAmount: item.baseAmount,
      baseUnit: item.baseUnit,
      calories: item.calories,
      protein: item.protein,
    };
  });
}

function broadcastMealUpdate(): void {
  db.all(SELECT_ITEMS_SQL, [], (err, items) => {
    if (err) {
      console.error('[error] broadcastMealUpdate', err);
      return;
    }
    try {
      getIo().emit('meal-updated', transformItems((items || []) as Record<string, unknown>[]));
    } catch (_) { /* io not ready */ }
  });
}

function updateCurrentMealTimestamp(): void {
  db.run('UPDATE CurrentMeal SET updated_at = CURRENT_TIMESTAMP WHERE id = 1');
}

// ─── GET / — get current meal items ──────────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  db.all(SELECT_ITEMS_SQL, [], (err, items) => {
    if (err) {
      console.error('[error] GET /api/meals/current', err);
      return res.status(500).json({ error: 'Failed to fetch current meal' });
    }
    res.json(transformItems((items || []) as Record<string, unknown>[]));
  });
});

// ─── POST /items — add item ───────────────────────────────────────────────────

function addItem(req: Request, res: Response): void {
  const body = req.body || {};
  const foodId = body.foodId ?? body.food_id;
  const { servings, isTemporary, food } = body;

  if (isTemporary && food) {
    // Temporary food — not in Foods table
    const servingsNum = toNumber(servings, 1)!;
    if (servingsNum <= 0) {
      res.status(400).json({ error: 'Invalid servings' });
      return;
    }
    if (!food.name) {
      res.status(400).json({ error: 'Missing food.name for temporary food' });
      return;
    }

    db.run(
      `INSERT INTO CurrentMealItems (food_id, servings, temp_food_name, temp_food_base_amount, temp_food_base_unit, temp_food_calories, temp_food_protein)
       VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
      [
        servingsNum,
        food.name,
        food.baseAmount ?? food.base_amount ?? 100,
        food.baseUnit ?? food.base_unit ?? 'grams',
        food.calories ?? 0,
        food.protein ?? null,
      ],
      function (this: { lastID: number }, err) {
        if (err) {
          console.error('[error] POST /api/meals/current/items temp', err);
          return res.status(500).json({ error: 'Failed to add temporary item' });
        }
        updateCurrentMealTimestamp();
        broadcastMealUpdate();
        res.status(201).json({ id: this.lastID, foodId: null, isTemporary: true, servings: servingsNum });
      }
    );
    return;
  }

  // DB food
  if (foodId === undefined || servings === undefined) {
    res.status(400).json({ error: 'Missing required fields: foodId and servings' });
    return;
  }

  const foodIdNum = Number(foodId);
  if (!Number.isInteger(foodIdNum)) {
    res.status(400).json({ error: 'Invalid foodId' });
    return;
  }

  const servingsNum = toNumber(servings);
  if (servingsNum === null || servingsNum <= 0) {
    res.status(400).json({ error: 'Invalid servings' });
    return;
  }

  // Check food exists
  db.get('SELECT id FROM Foods WHERE id = ?', [foodIdNum], (err, foodRow) => {
    if (err || !foodRow) {
      return res.status(404).json({ error: 'Food not found' });
    }

    // Check if already in current meal
    db.get('SELECT id FROM CurrentMealItems WHERE food_id = ?', [foodIdNum], (err2, existing) => {
      if (err2) {
        console.error('[error] POST /api/meals/current/items check', err2);
        return res.status(500).json({ error: 'Failed to check existing item' });
      }

      if (existing) {
        const existingTyped = existing as { id: number };
        db.run(
          'UPDATE CurrentMealItems SET servings = ? WHERE food_id = ?',
          [servingsNum, foodIdNum],
          (err3) => {
            if (err3) {
              console.error('[error] POST /api/meals/current/items update', err3);
              return res.status(500).json({ error: 'Failed to update item' });
            }
            updateCurrentMealTimestamp();
            broadcastMealUpdate();
            res.json({ id: existingTyped.id, foodId: foodIdNum, servings: servingsNum });
          }
        );
      } else {
        db.run(
          'INSERT INTO CurrentMealItems (food_id, servings) VALUES (?, ?)',
          [foodIdNum, servingsNum],
          function (this: { lastID: number }, err3) {
            if (err3) {
              console.error('[error] POST /api/meals/current/items insert', err3);
              return res.status(500).json({ error: 'Failed to add item' });
            }
            updateCurrentMealTimestamp();
            broadcastMealUpdate();
            res.status(201).json({ id: this.lastID, foodId: foodIdNum, servings: servingsNum });
          }
        );
      }
    });
  });
}

router.post('/', addItem);
router.post('/items', addItem);

// ─── PUT /items/:id — update servings ────────────────────────────────────────

router.put('/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const servingsNum = toNumber(req.body?.servings);
  if (servingsNum === null || servingsNum <= 0) return res.status(400).json({ error: 'Invalid servings' });

  db.run(
    'UPDATE CurrentMealItems SET servings = ? WHERE id = ?',
    [servingsNum, id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/meals/current/items/:id', err);
        return res.status(500).json({ error: 'Failed to update item' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.json({ id, servings: servingsNum });
    }
  );
});

// ─── PUT /:id — alias for update servings ────────────────────────────────────

router.put('/:id(\\d+)', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const servingsNum = toNumber(req.body?.servings);
  if (servingsNum === null || servingsNum <= 0) return res.status(400).json({ error: 'Invalid servings' });

  db.run(
    'UPDATE CurrentMealItems SET servings = ? WHERE id = ?',
    [servingsNum, id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/meals/current/:id', err);
        return res.status(500).json({ error: 'Failed to update item' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.json({ id, servings: servingsNum });
    }
  );
});

// ─── DELETE /items/:id — remove item ─────────────────────────────────────────

router.delete('/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM CurrentMealItems WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/meals/current/items/:id', err);
        return res.status(500).json({ error: 'Failed to delete item' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.status(204).send();
    }
  );
});

// ─── DELETE /:id — alias remove item ─────────────────────────────────────────

router.delete('/:id(\\d+)', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM CurrentMealItems WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/meals/current/:id', err);
        return res.status(500).json({ error: 'Failed to delete item' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.status(204).send();
    }
  );
});

// ─── DELETE / — clear all items ───────────────────────────────────────────────

router.delete('/', (_req: Request, res: Response) => {
  db.run('DELETE FROM CurrentMealItems', [], (err) => {
    if (err) {
      console.error('[error] DELETE /api/meals/current', err);
      return res.status(500).json({ error: 'Failed to clear current meal' });
    }
    updateCurrentMealTimestamp();
    broadcastMealUpdate();
    res.status(204).send();
  });
});

export default router;
