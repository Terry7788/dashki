import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

// ─── GET / — list saved meals ─────────────────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  // First get all meals with counts
  db.all(
    `SELECT sm.id, sm.name, sm.created_at,
       COUNT(smi.id) as item_count,
       COALESCE(SUM(f.calories * smi.servings), 0) as total_calories,
       COALESCE(SUM(COALESCE(f.protein,0) * smi.servings), 0) as total_protein
     FROM SavedMeals sm
     LEFT JOIN SavedMealItems smi ON sm.id = smi.meal_id
     LEFT JOIN Foods f ON smi.food_id = f.id
     GROUP BY sm.id ORDER BY sm.created_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[error] GET /api/meals/saved', err);
        return res.status(500).json({ error: 'Failed to fetch saved meals' });
      }

      // For each meal, get the items
      const meals = (rows as any[]) || [];
      if (meals.length === 0) {
        return res.json([]);
      }

      interface MealRow {
        id: number;
        name: string;
        created_at: string;
        item_count: number;
        total_calories: number;
        total_protein: number;
      }

      let processed = 0;
      const result: (MealRow & { items: unknown[] })[] = [];

      meals.forEach((meal: MealRow) => {
        db.all(
          `SELECT smi.id, smi.food_id as foodId, smi.servings,
             f.name, f.base_amount as baseAmount, f.base_unit as baseUnit,
             f.calories, f.protein
           FROM SavedMealItems smi
           JOIN Foods f ON smi.food_id = f.id
           WHERE smi.meal_id = ?`,
          [meal.id],
          (err2, items) => {
            if (err2) {
              console.error('[error] GET /api/meals/saved items', err2);
            }
            result.push({ ...meal, items: (items as any[]) || [] });
            processed++;
            if (processed === meals.length) {
              res.json(result);
            }
          }
        );
      });
    }
  );
});

// ─── GET /:id — single meal with items ───────────────────────────────────────

router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.get(
    `SELECT id, name, created_at FROM SavedMeals WHERE id = ?`,
    [id],
    (err, meal) => {
      if (err) {
        console.error('[error] GET /api/meals/saved/:id', err);
        return res.status(500).json({ error: 'Failed to fetch meal' });
      }
      if (!meal) return res.status(404).json({ error: 'Saved meal not found' });

      db.all(
        `SELECT smi.id, smi.food_id as foodId, smi.servings,
           f.name, f.base_amount as baseAmount, f.base_unit as baseUnit,
           f.calories, f.protein
         FROM SavedMealItems smi
         JOIN Foods f ON smi.food_id = f.id
         WHERE smi.meal_id = ?`,
        [id],
        (err2, items) => {
          if (err2) {
            console.error('[error] GET /api/meals/saved/:id items', err2);
            return res.status(500).json({ error: 'Failed to fetch meal items' });
          }
          res.json({ ...(meal as object), items: items || [] });
        }
      );
    }
  );
});

// ─── POST / — create saved meal ───────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const { name, items } = req.body || {};

  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: name and items[]' });
  }

  for (const item of items) {
    const foodId = item.foodId ?? item.food_id;
    if (!foodId || item.servings === undefined) {
      return res.status(400).json({ error: 'Each item must have foodId and servings' });
    }
  }

  db.run(
    'INSERT INTO SavedMeals (name) VALUES (?)',
    [name],
    function (this: { lastID: number }, err) {
      if (err) {
        console.error('[error] POST /api/meals/saved', err);
        return res.status(500).json({ error: 'Failed to create meal' });
      }
      const mealId = this.lastID;

      // Insert items sequentially
      const insertItems = (index: number): void => {
        if (index >= items.length) {
          // All items inserted — return the meal
          db.get(
            `SELECT id, name, created_at FROM SavedMeals WHERE id = ?`,
            [mealId],
            (err2, meal) => {
              if (err2) {
                console.error('[error] POST /api/meals/saved fetch', err2);
                return res.status(500).json({ error: 'Failed to fetch created meal' });
              }
              db.all(
                `SELECT smi.id, smi.food_id as foodId, smi.servings,
                   f.name, f.base_amount as baseAmount, f.base_unit as baseUnit,
                   f.calories, f.protein
                 FROM SavedMealItems smi
                 JOIN Foods f ON smi.food_id = f.id
                 WHERE smi.meal_id = ?`,
                [mealId],
                (err3, mealItems) => {
                  if (err3) {
                    return res.status(500).json({ error: 'Failed to fetch meal items' });
                  }
                  const created = { ...(meal as object), items: mealItems || [] };
                  try { getIo().emit('saved-meal-created', created); } catch (_) {}
                  res.status(201).json(created);
                }
              );
            }
          );
          return;
        }

        const item = items[index];
        const foodId = item.foodId ?? item.food_id;
        const servings = Number(item.servings);

        db.run(
          'INSERT INTO SavedMealItems (meal_id, food_id, servings) VALUES (?, ?, ?)',
          [mealId, foodId, servings],
          (err2) => {
            if (err2) {
              console.error('[error] POST /api/meals/saved item insert', err2);
              // Clean up the meal
              db.run('DELETE FROM SavedMeals WHERE id = ?', [mealId]);
              return res.status(500).json({ error: 'Failed to create meal items' });
            }
            insertItems(index + 1);
          }
        );
      };

      insertItems(0);
    }
  );
});

// ─── PUT /:id — update saved meal ────────────────────────────────────────────

router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const { name, items } = req.body || {};

  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: name and items[]' });
  }

  // Update the meal name
  db.run(
    'UPDATE SavedMeals SET name = ? WHERE id = ?',
    [name, id],
    (err) => {
      if (err) {
        console.error('[error] PUT /api/meals/saved/:id', err);
        return res.status(500).json({ error: 'Failed to update meal' });
      }

      // Delete existing items
      db.run(
        'DELETE FROM SavedMealItems WHERE meal_id = ?',
        [id],
        (err2) => {
          if (err2) {
            console.error('[error] PUT /api/meals/saved/:id delete items', err2);
            return res.status(500).json({ error: 'Failed to update meal items' });
          }

          // Insert new items
          const insertItem = (index: number) => {
            if (index >= items.length) {
              // Fetch updated meal with items
              db.get(
                `SELECT sm.id, sm.name, sm.created_at FROM SavedMeals sm WHERE sm.id = ?`,
                [id],
                (err3, meal) => {
                  if (err3 || !meal) {
                    return res.status(500).json({ error: 'Failed to fetch updated meal' });
                  }

                  db.all(
                    `SELECT smi.id, smi.food_id as foodId, smi.servings,
                       f.name, f.base_amount as baseAmount, f.base_unit as baseUnit,
                       f.calories, f.protein
                     FROM SavedMealItems smi
                     JOIN Foods f ON smi.food_id = f.id
                     WHERE smi.meal_id = ?`,
                    [id],
                    (err4, mealItems) => {
                      if (err4) {
                        return res.status(500).json({ error: 'Failed to fetch meal items' });
                      }
                      const updated = { ...(meal as object), items: mealItems || [] };
                      try { getIo().emit('saved-meal-updated', updated); } catch (_) {}
                      res.json(updated);
                    }
                  );
                }
              );
              return;
            }

            const item = items[index];
            const foodId = item.foodId ?? item.food_id;
            const servings = Number(item.servings);

            db.run(
              'INSERT INTO SavedMealItems (meal_id, food_id, servings) VALUES (?, ?, ?)',
              [id, foodId, servings],
              (err5) => {
                if (err5) {
                  console.error('[error] PUT /api/meals/saved/:id insert item', err5);
                  return res.status(500).json({ error: 'Failed to insert meal item' });
                }
                insertItem(index + 1);
              }
            );
          };

          insertItem(0);
        }
      );
    }
  );
});

// ─── DELETE /:id — delete saved meal ─────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM SavedMeals WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/meals/saved/:id', err);
        return res.status(500).json({ error: 'Failed to delete meal' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Saved meal not found' });
      try { getIo().emit('saved-meal-deleted', { id }); } catch (_) {}
      res.status(204).send();
    }
  );
});

export default router;
