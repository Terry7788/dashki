import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

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

        // Insert food - store as-is (calorie-assistant stores values per serving or per 100g)
        // For "grams" - already per 100g. For "servings" - per serving.
        // Just store the values as-is without conversion
        const calPer100 = calories;
        const proPer100 = protein ?? 0;
        const carbPer100 = carbs ?? null;
        const fatPer100 = fat ?? null;

        db.run(
          `INSERT INTO Foods (name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, baseAmount, baseUnit, calPer100, proPer100, carbPer100, fatPer100, servingSizeG ?? baseAmount],
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

    // Wait a bit for async operations, then respond
    setTimeout(() => {
      res.json({ imported, skipped, errors: errors.length > 0 ? errors : undefined });
    }, 1000);
  });
});

/**
 * POST /api/migration/import-meals
 * Import saved meals from external source
 * Body: { meals: Array<{ name, items: Array<{ name, servings }> }> }
 */
router.post('/import-meals', (req: Request, res: Response) => {
  const { meals } = req.body;

  if (!Array.isArray(meals)) {
    return res.status(400).json({ error: 'Meals array required' });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  db.serialize(() => {
    for (const meal of meals) {
      const { name, items } = meal;

      if (!name || !Array.isArray(items)) {
        errors.push(`Invalid meal: ${name || 'unknown'}`);
        continue;
      }

      // Check for duplicates
      db.get('SELECT id FROM SavedMeals WHERE LOWER(name) = LOWER(?)', [name], (err, row) => {
        if (err) {
          errors.push(`DB error for ${name}: ${err.message}`);
          return;
        }

        if (row) {
          skipped++;
          return;
        }

        // Insert meal
        db.run('INSERT INTO SavedMeals (name) VALUES (?)', [name], (insertErr) => {
          if (insertErr) {
            errors.push(`Insert error for ${name}: ${insertErr.message}`);
            return;
          }

          // Get the inserted ID
          db.get('SELECT last_insert_rowid() as id', [], (getErr, mealRow) => {
            if (getErr || !mealRow) {
              errors.push(`Could not get meal ID for ${name}`);
              return;
            }

            const mealId = (mealRow as { id: number }).id;

            // Insert items
            let itemsProcessed = 0;
            for (const item of items) {
              // Find food by name
              db.get('SELECT id FROM Foods WHERE LOWER(name) = LOWER(?)', [item.name], (foodErr, foodRow) => {
                if (foodErr || !foodRow) {
                  errors.push(`Food not found for item: ${item.name} in meal ${name}`);
                } else {
                  const foodId = (foodRow as { id: number }).id;
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
                }
              });
            }
          });
        });
      });
    }

    // Give time for async operations
    setTimeout(() => {
      res.json({ imported, skipped, errors: errors.length > 0 ? errors : undefined });
    }, 2000);
  });
});

export default router;