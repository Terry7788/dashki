import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

/**
 * DELETE /api/migration/clear-foods
 * Clear all foods from the database
 */
router.delete('/clear-foods', (req: Request, res: Response) => {
  db.run('DELETE FROM Foods', (err) => {
    if (err) {
      console.error('[error] DELETE /api/migration/clear-foods', err);
      return res.status(500).json({ error: 'Failed to clear foods' });
    }
    res.json({ success: true, message: 'All foods cleared' });
  });
});

/**
 * DELETE /api/migration/clear-meals
 * Clear all saved meals from the database
 */
router.delete('/clear-meals', (req: Request, res: Response) => {
  db.run('DELETE FROM SavedMealItems', (err) => {
    if (err) {
      console.error('[error] DELETE /api/migration/clear-meals', err);
      return res.status(500).json({ error: 'Failed to clear meal items' });
    }
    db.run('DELETE FROM SavedMeals', (err2) => {
      if (err2) {
        console.error('[error] DELETE /api/migration/clear-meals', err2);
        return res.status(500).json({ error: 'Failed to clear meals' });
      }
      res.json({ success: true, message: 'All meals cleared' });
    });
  });
});

/**
 * POST /api/migration/import-foods
 * Import foods from external source (calorie-assistant)
 * Body: { foods: Array<{ name, baseAmount, baseUnit, calories, protein, carbs?, fat? }> }
 */
router.post('/import-foods', (req: Request, res: Response) => {
  const { foods } = req.body;

  if (!Array.isArray(foods)) {
    return res.status(400).json({ error: 'Foods array required' });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  db.serialize(() => {
    for (const food of foods) {
      const { name, baseAmount, baseUnit, calories, protein, carbs, fat, servingSizeG } = food;

      if (!name || calories === undefined) {
        errors.push(`Missing required fields for: ${name || 'unknown'}`);
        continue;
      }

      // Check for duplicates
      db.get('SELECT id FROM Foods WHERE LOWER(name) = LOWER(?)', [name], (err, row) => {
        if (err) {
          errors.push(`DB error for ${name}: ${err.message}`);
          return;
        }

        if (row) {
          skipped++;
          return;
        }

        db.run(
          `INSERT INTO Foods (name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, baseAmount, baseUnit, calories, protein ?? 0, carbs ?? null, fat ?? null, servingSizeG ?? baseAmount],
          (insertErr) => {
            if (insertErr) {
              errors.push(`Insert error for ${name}: ${insertErr.message}`);
            } else {
              imported++;
            }
          }
        );
      });
    }

    setTimeout(() => {
      res.json({ imported, skipped, errors: errors.length > 0 ? errors : undefined });
    }, 1000);
  });
});

/**
 * POST /api/migration/import-meals
 * Import saved meals from external source
 * Body: { meals: Array<{ name, items: Array<{ name, servings, foodId? }> }> }
 */
router.post('/import-meals', (req: Request, res: Response) => {
  const { meals } = req.body;

  if (!Array.isArray(meals)) {
    return res.status(400).json({ error: 'Meals array required' });
  }

  let imported = 0;
  const errors: string[] = [];
  let mealsProcessed = 0;

  for (const meal of meals) {
    const { name, items } = meal;

    if (!name || !Array.isArray(items)) {
      errors.push(`Invalid meal: ${name || 'unknown'}`);
      mealsProcessed++;
      continue;
    }

    // Check if meal exists and delete if so
    db.get('SELECT id FROM SavedMeals WHERE LOWER(name) = LOWER(?)', [name], (err, row) => {
      if (err) {
        errors.push(`DB error for ${name}: ${err.message}`);
        mealsProcessed++;
        checkDone();
        return;
      }

      const existingId = row ? (row as { id: number }).id : null;

      const finishImport = () => {
        // Insert the meal
        db.run('INSERT INTO SavedMeals (name) VALUES (?)', [name], (insertErr) => {
          if (insertErr) {
            errors.push(`Insert error for ${name}: ${insertErr.message}`);
            mealsProcessed++;
            checkDone();
            return;
          }

          // Get new meal ID
          db.get('SELECT last_insert_rowid() as id', [], (getErr, mealRow) => {
            if (getErr || !mealRow) {
              errors.push(`Could not get meal ID for ${name}`);
              mealsProcessed++;
              checkDone();
              return;
            }

            const mealId = (mealRow as { id: number }).id;

            // Insert all items
            let itemsProcessed = 0;
            for (const item of items) {
              // Use foodId if provided, otherwise look up by name
              const lookupFood = (cb: (foodId: number | null) => void) => {
                if (item.foodId) {
                  cb(item.foodId);
                } else if (item.name) {
                  db.get('SELECT id FROM Foods WHERE LOWER(name) = LOWER(?)', [item.name], (foodErr, foodRow) => {
                    cb(foodRow ? (foodRow as { id: number }).id : null);
                  });
                } else {
                  cb(null);
                }
              };

              lookupFood((foodId) => {
                if (!foodId) {
                  errors.push(`Food not found: ${item.name || item.foodId}`);
                } else {
                  db.run(
                    'INSERT INTO SavedMealItems (meal_id, food_id, servings) VALUES (?, ?, ?)',
                    [mealId, foodId, item.servings ?? 1],
                    (itemErr) => {
                      if (itemErr) {
                        errors.push(`Item insert error: ${itemErr.message}`);
                      }
                    }
                  );
                }

                itemsProcessed++;
                if (itemsProcessed === items.length) {
                  imported++;
                  mealsProcessed++;
                  checkDone();
                }
              });
            }
          });
        });
      };

      if (existingId) {
        db.run('DELETE FROM SavedMealItems WHERE meal_id = ?', [existingId], () => {
          db.run('DELETE FROM SavedMeals WHERE id = ?', [existingId], finishImport);
        });
      } else {
        finishImport();
      }
    });
  }

  function checkDone() {
    if (mealsProcessed === meals.length) {
      setTimeout(() => {
        res.json({ imported, errors: errors.length > 0 ? errors : undefined });
      }, 500);
    }
  }
});

export default router;