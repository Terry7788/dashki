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

// ─── Todos ───────────────────────────────────────────────────────────────────

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  due_date: string | null;  // "YYYY-MM-DD" or null
  created_at: string;
}

// ─── Gym ─────────────────────────────────────────────────────────────────────

export interface GymSession {
  id: number;
  date: string;     // "YYYY-MM-DD"
  name: string;     // e.g. "Push Day", "Leg Day"
  notes: string;
  status?: 'active' | 'completed';
  created_at: string;
  exercises?: GymExercise[];
}

export interface GymExercise {
  id: number;
  session_id: number;
  name: string;
  order_index: number;
  sets?: GymSet[];
}

export interface GymSet {
  id: number;
  exercise_id: number;
  set_number: number;
  reps: number;
  weight_kg: number;
}

// ─── Workout Templates ────────────────────────────────────────────────────────

export interface WorkoutTemplateExercise {
  id: number;
  template_id: number;
  exercise_name: string;
  order_index: number;
  default_sets: number;
  default_reps: number;
}

export interface WorkoutTemplate {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
  exercises: WorkoutTemplateExercise[];
}

// ─── Gym Routine ─────────────────────────────────────────────────────────────

export interface GymRoutineDay {
  id: number | null;
  day_of_week: number;
  workout_name: string;
  notes: string | null;
  template_id: number | null;
  template_name: string | null;
}

export interface NextWorkout {
  day_of_week: number;
  workout_name: string;
  date: string;
  notes: string | null;
  template_id: number | null;
  template_name: string | null;
}

// ─── Weight ──────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id: number;
  date: string;       // "YYYY-MM-DD"
  weight_kg: number;
  created_at: string;
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
