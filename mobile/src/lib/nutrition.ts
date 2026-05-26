// Client-side mirror of web/src/lib/nutrition.ts + server/src/nutrition.ts.
// Keep in sync — server is source of truth at write time, this is for the
// live preview in the picker.

export type Unit = 'g' | 'ml' | 'serving';

export interface FoodForNutrition {
  base_amount: number;
  base_unit: Unit;
  serving_size_g: number | null;
  calories: number;
  protein: number | null;
  fiber?: number | null;
}

export function computeRatio(
  food: FoodForNutrition,
  quantity: number,
  unit: Unit,
): number {
  const { base_unit, base_amount, serving_size_g } = food;
  const servingSize = serving_size_g ?? base_amount;
  if (base_unit === 'g' && unit === 'g') return quantity / base_amount;
  if (base_unit === 'g' && unit === 'serving')
    return (quantity * servingSize) / base_amount;
  if (base_unit === 'ml' && unit === 'ml') return quantity / base_amount;
  if (base_unit === 'ml' && unit === 'serving')
    return (quantity * servingSize) / base_amount;
  if (base_unit === 'serving' && unit === 'serving') return quantity / base_amount;
  if (base_unit === 'serving' && unit === 'g')
    return quantity / servingSize / base_amount;
  throw new Error(`Unsupported: base=${base_unit} entered=${unit}`);
}

export function nutritionFor(
  food: FoodForNutrition,
  quantity: number,
  unit: Unit,
) {
  const ratio = computeRatio(food, quantity, unit);
  return {
    calories: Math.round(food.calories * ratio),
    protein: Math.round((food.protein ?? 0) * ratio * 10) / 10,
    fiber: Math.round((food.fiber ?? 0) * ratio * 10) / 10,
  };
}

export function formatQuantity(quantity: number, unit: Unit): string {
  if (unit === 'g') return `${Math.round(quantity)} g`;
  if (unit === 'ml') return `${Math.round(quantity)} ml`;
  const s = (Math.round(quantity * 10) / 10).toString();
  return `${s} ${quantity === 1 ? 'serving' : 'servings'}`;
}

// ─── Helpers used across screens ──────────────────────────────────────────

export function toISODate(d: Date): string {
  return d.toLocaleString('en-CA').split(',')[0];
}

export function formatDateLabel(d: Date): string {
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  const key = toISODate(d);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export function defaultMealForNow(): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}
