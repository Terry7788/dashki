// web/src/lib/nutrition.ts
//
// Client-side mirror of server/src/nutrition.ts. Keep in sync — the server is
// the source of truth at write time; this is purely for live previews in the
// picker.

export type Unit = 'g' | 'ml' | 'serving';

export interface FoodForNutrition {
  base_amount: number;
  base_unit: Unit;
  serving_size_g: number | null;
  calories: number;
  protein: number | null;
}

export function computeRatio(food: FoodForNutrition, quantity: number, unit: Unit): number {
  const { base_unit, base_amount, serving_size_g } = food;
  // Fallback: when serving_size_g is null, "1 serving" = base_amount of the
  // base unit. Lets the picker offer the serving toggle for any food.
  const servingSize = serving_size_g ?? base_amount;
  if (base_unit === 'g' && unit === 'g') return quantity / base_amount;
  if (base_unit === 'g' && unit === 'serving') return (quantity * servingSize) / base_amount;
  if (base_unit === 'ml' && unit === 'ml') return quantity / base_amount;
  if (base_unit === 'ml' && unit === 'serving') return (quantity * servingSize) / base_amount;
  if (base_unit === 'serving' && unit === 'serving') return quantity / base_amount;
  if (base_unit === 'serving' && unit === 'g') return (quantity / servingSize) / base_amount;
  throw new Error(`Unsupported: base=${base_unit} entered=${unit}`);
}

export function nutritionFor(food: FoodForNutrition, quantity: number, unit: Unit) {
  const ratio = computeRatio(food, quantity, unit);
  return {
    calories: Math.round(food.calories * ratio),
    protein: Math.round((food.protein ?? 0) * ratio * 10) / 10,
  };
}

export function convertQuantity(food: FoodForNutrition, quantity: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return quantity;
  const ratio = computeRatio(food, quantity, fromUnit);
  const servingSize = food.serving_size_g ?? food.base_amount;
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

export function formatQuantity(quantity: number, unit: Unit): string {
  if (unit === 'g') return `${Math.round(quantity)} g`;
  if (unit === 'ml') return `${Math.round(quantity)} ml`;
  // 'serving' — strip trailing .0
  const s = (Math.round(quantity * 10) / 10).toString();
  return `${s} serving`;
}
