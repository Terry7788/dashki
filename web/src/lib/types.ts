// ─── Food & Nutrition ──────────────────────────────────────────────────────

export interface Food {
  id: number;
  name: string;
  /** kcal per 100g (returned as `calories` from the API) */
  calories_per_100g: number;
  /** grams of protein per 100g (returned as `protein` from the API) */
  protein_per_100g: number;
  /** grams of carbs per 100g */
  carbs_per_100g: number;
  /** grams of fat per 100g */
  fat_per_100g: number;
  /** optional serving size in grams (e.g. 1 slice = 30g) */
  serving_size_g?: number;
  // Also exposed from API as camelCase:
  baseAmount?: number;
  baseUnit?: string;
  /** raw calories field from API (same as calories_per_100g) */
  calories?: number;
  /** raw protein field from API (same as protein_per_100g) */
  protein?: number;
  /** True for foods that appear in the top "Recently used" group of GET /api/foods. */
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
  /** food_id from DB (returned as foodId from API) */
  foodId: number;
  servings: number;
  name: string;
  baseAmount: number;
  baseUnit: string;
  calories: number;
  protein: number | null;
}

// ─── Current Meal (in-progress meal being built) ────────────────────────────

export interface CurrentMealItem {
  id: number;
  /** null if isTemporary */
  foodId: number | null;
  servings: number;
  isTemporary: boolean;
  name: string;
  baseAmount: number;
  baseUnit: string;
  calories: number;
  protein: number | null;
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface JournalEntry {
  id: number;
  date: string;           // ISO date string "YYYY-MM-DD"
  meal_type: MealType;
  logged_at: string;      // ISO datetime
  food_id: number | null;
  food_name_snapshot: string;
  servings: number;
  calories_snapshot: number;
  protein_snapshot: number;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export interface StepEntry {
  id: number;
  date: string;   // "YYYY-MM-DD"
  steps: number;
}

// Individual step log entry — multiple per day (like JournalEntry).
// The aggregate StepEntry returned by GET /api/steps is the SUM of all
// StepLogEntry.steps for that date.
export interface StepLogEntry {
  id: number;
  date: string;       // "YYYY-MM-DD"
  steps: number;
  note: string | null;
  logged_at: string;  // "YYYY-MM-DDTHH:MM:SS" local time
  created_at: string;
}

// ─── Weight ──────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id: number;
  date: string;       // "YYYY-MM-DD"
  weight_kg: number;
  created_at: string;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

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

// ─── Dashboard Summary ───────────────────────────────────────────────────────

export interface DailySummary {
  date: string;
  calories: number;
  protein: number;
  entries: JournalEntry[];
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
