// Verbatim copy of web/src/lib/types.ts.
// Keep these in sync — types should never diverge between web and mobile.

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
  /** g fibre per 100g (legacy) — DSHKI-44 */
  fiber_per_100g?: number;
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
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
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
  quantity?: number;
  unit?: Unit;
  /** Legacy field — kept for backward-compat reads */
  servings?: number;
  name: string;
  baseAmount: number;
  baseUnit: Unit;
  calories: number;
  protein: number | null;
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
  quantity: number;
  unit: Unit;
  servings?: number;
  calories_snapshot: number;
  protein_snapshot: number;
  fiber_snapshot?: number;
  food_units?: FoodUnitOption[];
}

// ─── Steps / Weight / Goals / Summary ──────────────────────────────────────

export interface StepEntry {
  id: number;
  date: string;
  steps: number;
}

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
  fiber: number | null;
  steps: number;
  weight_kg: number | null;
  weight_journey_start_date: string | null;
  tdee_calories: number | null;
  updated_at: string;
}

export type OnTrackStatus = 'on_track' | 'ahead' | 'behind' | 'off_track';

export interface WeightJourney {
  start_date: string | null;
  days_since_start: number | null;
  starting_weight_kg: number | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  lost_kg: number | null;
  tdee_calories: number | null;
  avg_actual_calories: number | null;
  avg_deficit_per_day: number | null;
  on_track: OnTrackStatus | null;
  predicted_weight_today_kg: number | null;
  actual_vs_predicted_kg: number | null;
  projected_goal_date: string | null;
  days_to_goal: number | null;
}

export interface DailySummary {
  date: string;
  calories: number;
  protein: number;
  fiber: number;
  entries: JournalEntry[];
}

// ─── API Response Wrappers ─────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message?: string;
}

// ─── Auth (mobile-specific, additive — not present on web yet) ────────────

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
  subscription_status: 'free' | 'premium' | 'lifetime';
  onboarding_completed_at: string | null;
}

export interface AuthSession {
  user: User;
  token: string;
  expires_at: string;
}

export interface UserGoals {
  user_id: number;
  primary_goal:
    | 'lose_weight'
    | 'gain_weight'
    | 'build_muscle'
    | 'maintain'
    | 'general_health'
    | null;
  sex: 'male' | 'female' | 'other' | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
  pace: 'slow' | 'moderate' | 'aggressive' | null;
  kcal_target: number;
  protein_target_g: number;
  fibre_target_g: number;
  steps_target: number;
  enabled_tiles: string[];
  onboarding_completed_at: string | null;
}

// ─── Health check (mobile diagnostic) ─────────────────────────────────────

export interface HealthCheck {
  ok: boolean;
  uptime: number;
  timestamp: string;
  env: string;
}
