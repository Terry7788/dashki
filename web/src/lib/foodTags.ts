import type { ComponentType, CSSProperties } from 'react';
import {
  Drumstick,
  Milk,
  Wheat,
  Apple,
  Leaf,
  Droplet,
  Coffee,
  Cookie,
} from 'lucide-react';
import type { Food } from '@/lib/types';
import type { PillTone } from '@/components/ui';

export type FoodTag =
  | 'Protein'
  | 'Dairy'
  | 'Grain'
  | 'Fruit'
  | 'Veg'
  | 'Fat'
  | 'Drink'
  | 'Snack';

export const FOOD_TAGS: (FoodTag | 'All')[] = [
  'All',
  'Protein',
  'Dairy',
  'Grain',
  'Fruit',
  'Veg',
  'Fat',
  'Drink',
  'Snack',
];

export const TAG_TONES: Record<FoodTag, PillTone> = {
  Protein: 'primary',
  Dairy: 'medium',
  Grain: 'warning',
  Fruit: 'success',
  Veg: 'success',
  Fat: 'warning',
  Drink: 'neutral',
  Snack: 'pink',
};

export const TAG_ICONS: Record<FoodTag, ComponentType<{ style?: CSSProperties }>> = {
  Protein: Drumstick,
  Dairy: Milk,
  Grain: Wheat,
  Fruit: Apple,
  Veg: Leaf,
  Fat: Droplet,
  Drink: Coffee,
  Snack: Cookie,
};

// Infer a tag for a Food. The DB doesn't store one, so guess from name keywords.
// Returns null if no clear match — the row will fall back to a neutral pill.
export function inferTag(food: Food): FoodTag | null {
  const name = food.name.toLowerCase();
  const baseUnit = (food.base_unit ?? food.baseUnit ?? 'g') as string;
  if (baseUnit === 'ml') return 'Drink';
  if (/coffee|tea|drink|juice|water|soda/.test(name)) return 'Drink';
  if (/milk|yogurt|yoghurt|cheese|cream|butter/.test(name)) return 'Dairy';
  if (
    /chicken|beef|fish|salmon|tuna|egg|whey|protein|turkey|pork|tofu|tempeh/.test(
      name
    )
  )
    return 'Protein';
  if (/oat|rice|bread|pasta|noodle|cereal|toast|wheat|flour/.test(name))
    return 'Grain';
  if (/banana|apple|berry|orange|pear|grape|melon|peach|kiwi|mango|pineapple/.test(name))
    return 'Fruit';
  if (
    /broccoli|spinach|lettuce|kale|veggie|vegetable|carrot|tomato|cucumber|salad|onion|garlic|pepper/.test(
      name
    )
  )
    return 'Veg';
  if (/oil|nut|butter|avocado|seed/.test(name)) return 'Fat';
  if (/chocolate|cookie|crisp|chip|candy|snack/.test(name)) return 'Snack';
  return null;
}

export function unitLabel(food: Food): string {
  const amount = food.baseAmount ?? food.base_amount ?? 100;
  const unit = (food.baseUnit ?? food.base_unit ?? 'g') as string;
  if (unit === 'serving')
    return amount === 1 ? 'per 1 serving' : 'per ' + amount + ' servings';
  if (unit === 'ml') return 'per ' + amount + 'ml';
  return 'per ' + amount + 'g';
}
