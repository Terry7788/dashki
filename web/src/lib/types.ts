// ─── Units ──────────────────────────────────────────────────────────────────

export type Unit = 'g' | 'ml' | 'serving';

export interface FoodUnitOption {
  unit: Unit;
  label: string;
  default: boolean;
}

// ─── Food & Nutrition ──────────────────────────────────────────────────────

export interface Food {
  id: number;
  name: string;
  /** kcal per 100g (returned as `calories` from the API) — kept for legacy callsites */
  calories_per_100g: number;
  /** g protein per 100g (legacy) */
  protein_per_100g: number;
  /** g carbs per 100g (legacy) */
  carbs_per_100g: number;
  /** g fat per 100g (legacy) */
  fat_per_100g: number;
  /** RAW serving_size_g column value if set (or fallback for legacy callsites) */
  serving_size_g?: number | null;
  // Canonical base unit fields (camelCase + snake_case both available from API):
  baseAmount?: number;
  baseUnit?: Unit;
  base_amount?: number;
  base_unit?: Unit;
  /** Per-base-amount nutrition (the source of truth for the math helper) */
  calories?: number;
  protein?: number | null;
  /** Available unit options for the picker (always at least one element) */
  units?: FoodUnitOption[];
  recently_used?: boolean;
  created_at: string;
}

// ─── Saved Meals ────────────────────────────────────────────────────────────

export interface SavedMeal {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  items?: SavedMealItem[];
}

export interface SavedMealItem {
  id: number;
  foodId: number;
  /** New unit-aware fields (PR 3) */
  quantity?: number;
  unit?: Unit;
  /** Legacy field — kept for backward-compat reads from older API responses */
  servings?: number;
  name: string;
  baseAmount: number;
  baseUnit: Unit;
  calories: number;
  protein: number | null;
  /** Food's serving_size_g — included from PR 3 so the builder can render QuantityInput */
  serving_size_g?: number | null;
}

// ─── Current Meal ───────────────────────────────────────────────────────────

export interface CurrentMealItem {
  id: number;
  foodId: number | null;
  servings: number;
  isTemporary: boolean;
  name: string;
  baseAmount: number;
  baseUnit: Unit;
  calories: number;
  protein: number | null;
}

// ─── Journal ────────────────────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface JournalEntry {
  id: number;
  date: string;
  meal_type: MealType;
  logged_at: string;
  food_id: number | null;
  food_name_snapshot: string;
  /** New unit-aware fields */
  quantity: number;
  unit: Unit;
  /** Legacy — kept until PR 2 backend cleanup */
  servings?: number;
  calories_snapshot: number;
  protein_snapshot: number;
  /** Optional: server may embed the food's units[] for the Edit modal */
  food_units?: FoodUnitOption[];
}

// ─── Steps / Weight / Goals / Summary — unchanged ──────────────────────────

export interface StepEntry { id: number; date: string; steps: number; }

export interface StepLogEntry {
  id: number;
  date: string;
  steps: number;
  note: string | null;
  logged_at: string;
  created_at: string;
}

export interface WeightEntry {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
}

export interface Goals {
  id: number;
  calories: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  steps: number;
  weight_kg: number | null;
  updated_at: string;
}

export interface DailySummary {
  date: string;
  calories: number;
  protein: number;
  entries: JournalEntry[];
}

// ─── API Response Wrappers ─────────────────────────────────────────────────

export interface ApiError { error: string; message?: string; }

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
