// server/src/nutrition.ts
//
// Single source of truth for converting (food, quantity, unit) into
// kcal/protein snapshots. Mirrored client-side in web/src/lib/nutrition.ts
// for live previews — keep the two in sync.

export type Unit = 'g' | 'ml' | 'serving';

/**
 * Normalise the legacy DB strings ('grams' / 'servings' / 'ml') into the
 * canonical Unit vocabulary used everywhere in code. Anything unrecognised
 * falls back to 'serving' (the most permissive case — won't blow up the
 * route handler, but logs a warning would be a future hardening). Centralised
 * here so route handlers don't have to remember every legacy spelling.
 */
export function canonicalUnit(raw: string | null | undefined): Unit {
  if (raw === 'g' || raw === 'grams') return 'g';
  if (raw === 'ml') return 'ml';
  return 'serving'; // 'serving', 'servings', undefined, anything else
}

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
 * Convention: when serving_size_g is null, "1 serving" defaults to
 * base_amount-of-the-base-unit. For a food stored as "100g, 200 kcal",
 * 1 serving = 100g. This lets the picker offer the serving toggle for
 * any food regardless of whether it has an explicit serving size.
 *
 * Throws on unsupported (base_unit, unit) combos (e.g. ml ↔ g —
 * different physical dimensions, no density data).
 */
export function computeRatio(
  food: FoodForNutrition,
  quantity: number,
  unit: Unit,
): number {
  const { base_unit, base_amount, serving_size_g } = food;
  // Effective grams-per-serving: explicit if set, otherwise the food's
  // base portion. For ml-base foods this is "ml-per-serving" (1 serving
  // = base_amount ml), with the same fallback logic.
  const servingSize = serving_size_g ?? base_amount;

  if (base_unit === 'g' && unit === 'g') {
    return quantity / base_amount;
  }
  if (base_unit === 'g' && unit === 'serving') {
    return (quantity * servingSize) / base_amount;
  }
  if (base_unit === 'ml' && unit === 'ml') {
    return quantity / base_amount;
  }
  if (base_unit === 'ml' && unit === 'serving') {
    // 1 serving = base_amount ml when no explicit size; servingSize is in
    // ml here (still uses the serving_size_g column as the override since
    // there's no separate serving_size_ml — the column name is historical).
    return (quantity * servingSize) / base_amount;
  }
  if (base_unit === 'serving' && unit === 'serving') {
    return quantity / base_amount;
  }
  if (base_unit === 'serving' && unit === 'g') {
    return (quantity / servingSize) / base_amount;
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
  // Same fallback as computeRatio — 1 serving = base_amount when no explicit
  // serving_size_g is set.
  const servingSize = food.serving_size_g ?? food.base_amount;
  // Now find the quantity in toUnit that produces the same ratio.
  if (toUnit === 'g' && food.base_unit === 'g') return ratio * food.base_amount;
  if (toUnit === 'ml' && food.base_unit === 'ml') return ratio * food.base_amount;
  if (toUnit === 'serving' && food.base_unit === 'g') {
    return (ratio * food.base_amount) / servingSize;
  }
  if (toUnit === 'serving' && food.base_unit === 'ml') {
    return (ratio * food.base_amount) / servingSize;
  }
  if (toUnit === 'serving' && food.base_unit === 'serving') return ratio * food.base_amount;
  if (toUnit === 'g' && food.base_unit === 'serving') {
    return ratio * food.base_amount * servingSize;
  }
  throw new Error(`Unsupported conversion: ${fromUnit} → ${toUnit} (base=${food.base_unit})`);
}
