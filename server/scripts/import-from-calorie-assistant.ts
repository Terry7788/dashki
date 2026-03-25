/**
 * Migration script: Import foods and saved meals from calorie-assistant
 * Usage: npx ts-node scripts/import-from-calorie-assistant.ts
 */
import sqlite3 from 'sqlite3';
import fetch from 'node-fetch';

const CALORIE_ASSISTANT_API = 'https://calorie-assistant-production.up.railway.app';
const DASHKI_DB_PATH = process.env.DATABASE_PATH || './dashki.db';

interface Food {
  id: number;
  name: string;
  baseAmount: number;
  baseUnit: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
}

interface SavedMealItem {
  id: number;
  foodId: number;
  servings: number;
  name: string;
  baseAmount: number;
  baseUnit: string;
  calories: number;
  protein: number;
}

interface SavedMeal {
  id: number;
  name: string;
  items: SavedMealItem[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function main() {
  console.log('🚀 Starting migration from calorie-assistant...\n');

  // Connect to Dashki DB
  const db = new sqlite3.Database(DASHKI_DB_PATH);
  
  // Enable foreign keys
  await new Promise<void>((resolve, reject) => {
    db.run('PRAGMA foreign_keys = ON', (err) => err ? reject(err) : resolve());
  });

  // --- Import Foods ---
  console.log('📥 Fetching foods from calorie-assistant...');
  const foods = await fetchJson<Food[]>(`${CALORIE_ASSISTANT_API}/api/foods`);
  console.log(`   Found ${foods.length} foods`);

  let foodsImported = 0;
  let foodsSkipped = 0;

  for (const food of foods) {
    // Check if food with same name exists
    const existing = await new Promise<{ id: number } | null>((resolve) => {
      db.get('SELECT id FROM Foods WHERE LOWER(name) = LOWER(?)', [food.name], (err, row) => {
        resolve(row as { id: number } | null);
      });
    });

    if (existing) {
      foodsSkipped++;
      continue;
    }

    // Insert food - note: Dashki stores per-100g values
    // Calorie-assistant might store differently, need to convert
    const calories = food.baseUnit === 'grams' ? food.calories : (food.calories / food.baseAmount) * 100;
    const protein = food.baseUnit === 'grams' ? (food.protein ?? 0) : ((food.protein ?? 0) / food.baseAmount) * 100;
    const carbs = food.carbs !== undefined 
      ? (food.baseUnit === 'grams' ? food.carbs : (food.carbs / food.baseAmount) * 100)
      : null;
    const fat = food.fat !== undefined
      ? (food.baseUnit === 'grams' ? food.fat : (food.fat / food.baseAmount) * 100)
      : null;

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO Foods (name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [food.name, food.baseAmount, food.baseUnit, calories, protein, carbs, fat, food.baseAmount],
        (err) => err ? reject(err) : resolve()
      );
    });
    foodsImported++;
  }

  console.log(`   ✅ Imported ${foodsImported} new foods`);
  console.log(`   ⏭️  Skipped ${foodsSkipped} duplicate foods\n`);

  // --- Import Saved Meals ---
  console.log('📥 Fetching saved meals from calorie-assistant...');
  const meals = await fetchJson<SavedMeal[]>(`${CALORIE_ASSISTANT_API}/api/saved-meals`);
  console.log(`   Found ${meals.length} saved meals`);

  let mealsImported = 0;
  let mealsSkipped = 0;

  for (const meal of meals) {
    // Check if meal with same name exists
    const existingMeal = await new Promise<{ id: number } | null>((resolve) => {
      db.get('SELECT id FROM SavedMeals WHERE LOWER(name) = LOWER(?)', [meal.name], (err, row) => {
        resolve(row as { id: number } | null);
      });
    });

    if (existingMeal) {
      mealsSkipped++;
      console.log(`   ⏭️  Skipping duplicate meal: ${meal.name}`);
      continue;
    }

    // Get full meal details with items
    const fullMeal = await fetchJson<SavedMeal>(`${CALORIE_ASSISTANT_API}/api/saved-meals/${meal.id}`);

    // Insert the saved meal
    await new Promise<void>((resolve, reject) => {
      db.run('INSERT INTO SavedMeals (name) VALUES (?)', [fullMeal.name], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const mealId = await new Promise<number>((resolve) => {
      db.get('SELECT last_insert_rowid() as id', [], (err, row) => {
        resolve((row as { id: number }).id);
      });
    });

    // Insert meal items
    for (const item of fullMeal.items) {
      // Find the food in Dashki by name
      const dashkiFood = await new Promise<{ id: number } | null>((resolve) => {
        db.get('SELECT id FROM Foods WHERE LOWER(name) = LOWER(?)', [item.name], (err, row) => {
          resolve(row as { id: number } | null);
        });
      });

      if (!dashkiFood) {
        console.log(`   ⚠️  Food not found for meal item: ${item.name}`);
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO SavedMealItems (meal_id, food_id, servings) VALUES (?, ?, ?)',
          [mealId, dashkiFood.id, item.servings],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    mealsImported++;
    console.log(`   ✅ Imported meal: ${fullMeal.name} (${fullMeal.items.length} items)`);
  }

  console.log(`\n   ✅ Imported ${mealsImported} new meals`);
  console.log(`   ⏭️  Skipped ${mealsSkipped} duplicate meals`);

  // Summary
  console.log('\n🎉 Migration complete!');
  console.log(`   Foods: ${foodsImported} imported, ${foodsSkipped} skipped`);
  console.log(`   Meals: ${mealsImported} imported, ${mealsSkipped} skipped`);

  db.close();
}

main().catch(console.error);