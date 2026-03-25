/**
 * Migration Endpoint for Railway Deployment
 * 
 * This file adds a one-time migration endpoint to the Dashki server.
 * Add this to your server/src/index.ts or include the route in your routes folder.
 * 
 * Usage:
 *   POST /api/migrate-import
 *   Body: { foods: [...], savedMeals: [...], savedMealItems: [...] }
 * 
 * Security: This endpoint should be disabled after use!
 */

import { Router, Request, Response } from 'express';

const router = Router();

// Flag to disable after use
let migrationEnabled = true;

// Helper to check if a food is a duplicate
function findDuplicateFood(db: any, food: any): Promise<number | null> {
  return new Promise((resolve) => {
    // Match on name + base_amount + base_unit + calories (approximate match)
    db.get(
      `SELECT id FROM Foods WHERE 
       name = ? AND 
       base_amount = ? AND 
       base_unit = ? AND 
       calories = ?`,
      [food.name, food.base_amount, food.base_unit, food.calories],
      (err: any, row: any) => {
        if (err || !row) {
          resolve(null);
        } else {
          resolve(row.id);
        }
      }
    );
  });
}

// Helper to find duplicate meal by name
function findDuplicateMeal(db: any, meal: any): Promise<number | null> {
  return new Promise((resolve) => {
    db.get(
      `SELECT id FROM SavedMeals WHERE name = ?`,
      [meal.name],
      (err: any, row: any) => {
        if (err || !row) {
          resolve(null);
        } else {
          resolve(row.id);
        }
      }
    );
  });
}

router.post('/migrate-import', async (req: Request, res: Response) => {
  // SECURITY: Disable this after first use in production!
  if (!migrationEnabled) {
    res.status(403).json({ error: 'Migration endpoint disabled' });
    return;
  }
  
  const { foods, savedMeals, savedMealItems } = req.body;
  
  if (!foods || !Array.isArray(foods)) {
    res.status(400).json({ error: 'Missing foods array' });
    return;
  }
  
  const db = req.app.locals.db;
  const results = {
    foodsImported: 0,
    foodsSkipped: 0,
    mealsImported: 0,
    mealsSkipped: 0,
    mealItemsImported: 0,
    foodIdMap: {} as Record<number, number> // old ID -> new ID
  };
  
  console.log(`[migration] Starting import: ${foods.length} foods, ${savedMeals?.length || 0} meals`);
  
  // Import foods with deduplication
  for (const food of foods) {
    // Skip test entries
    if (food.name === 'test') {
      results.foodsSkipped++;
      continue;
    }
    
    const existingId = await findDuplicateFood(db, food);
    
    if (existingId) {
      results.foodIdMap[food.id] = existingId;
      results.foodsSkipped++;
    } else {
      // Insert new food
      const info = await new Promise<{ lastID: number }>((resolve, reject) => {
        db.run(
          `INSERT INTO Foods (name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            food.name,
            food.base_amount,
            food.base_unit,
            food.calories,
            food.protein || null,
            food.carbs || null,
            food.fat || null,
            food.serving_size_g || null,
            food.created_at || new Date().toISOString()
          ],
          function(err: any) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID });
          }
        );
      });
      
      results.foodIdMap[food.id] = info.lastID;
      results.foodsImported++;
    }
  }
  
  console.log(`[migration] Foods: ${results.foodsImported} imported, ${results.foodsSkipped} skipped (duplicates)`);
  
  // Import saved meals if provided
  if (savedMeals && Array.isArray(savedMeals)) {
    const mealIdMap: Record<number, number> = {}; // old meal ID -> new meal ID
    
    for (const meal of savedMeals) {
      const existingId = await findDuplicateMeal(db, meal);
      
      if (existingId) {
        mealIdMap[meal.id] = existingId;
        results.mealsSkipped++;
      } else {
        const info = await new Promise<{ lastID: number }>((resolve, reject) => {
          db.run(
            `INSERT INTO SavedMeals (name, created_at) VALUES (?, ?)`,
            [meal.name, meal.created_at || new Date().toISOString()],
            function(err: any) {
              if (err) reject(err);
              else resolve({ lastID: this.lastID });
            }
          );
        });
        
        mealIdMap[meal.id] = info.lastID;
        results.mealsImported++;
      }
    }
    
    // Import saved meal items if provided
    if (savedMealItems && Array.isArray(savedMealItems)) {
      for (const item of savedMealItems) {
        const newMealId = mealIdMap[item.meal_id];
        const newFoodId = results.foodIdMap[item.food_id];
        
        if (newMealId && newFoodId) {
          // Check if this item already exists
          const exists = await new Promise<boolean>((resolve) => {
            db.get(
              `SELECT id FROM SavedMealItems WHERE meal_id = ? AND food_id = ? AND servings = ?`,
              [newMealId, newFoodId, item.servings],
              (err: any, row: any) => resolve(!!row)
            );
          });
          
          if (!exists) {
            await new Promise<void>((resolve, reject) => {
              db.run(
                `INSERT INTO SavedMealItems (meal_id, food_id, servings) VALUES (?, ?, ?)`,
                [newMealId, newFoodId, item.servings],
                function(err: any) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            results.mealItemsImported++;
          }
        }
      }
    }
    
    console.log(`[migration] Meals: ${results.mealsImported} imported, ${results.mealsSkipped} skipped`);
    console.log(`[migration] Meal Items: ${results.mealItemsImported} imported`);
  }
  
  res.json({
    success: true,
    results,
    message: `Imported ${results.foodsImported} foods, ${results.mealsImported} meals. Skipped ${results.foodsSkipped} duplicate foods.`
  });
});

// Disable migration endpoint (call this after successful import)
router.post('/migrate-disable', (req: Request, res: Response) => {
  migrationEnabled = false;
  res.json({ success: true, message: 'Migration endpoint disabled' });
});

export default router;