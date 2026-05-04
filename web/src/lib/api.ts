import type {
  Food,
  SavedMeal,
  CurrentMealItem,
  JournalEntry,
  StepEntry,
  StepLogEntry,
  WeightEntry,
  DailySummary,
  MealType,
  Goals,
} from './types';

// ─── Base Configuration ───────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ─── Foods ───────────────────────────────────────────────────────────────────

export function getFoods(): Promise<Food[]> {
  return request<Food[]>('/api/foods');
}

export function createFood(
  data: Omit<Food, 'id' | 'created_at'>
): Promise<Food> {
  return request<Food>('/api/foods', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateFood(
  id: number,
  data: Partial<Omit<Food, 'id' | 'created_at'>>
): Promise<Food> {
  return request<Food>(`/api/foods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteFood(id: number): Promise<void> {
  return request<void>(`/api/foods/${id}`, { method: 'DELETE' });
}

// ─── Saved Meals ─────────────────────────────────────────────────────────────

export function getSavedMeals(): Promise<SavedMeal[]> {
  return request<SavedMeal[]>('/api/meals/saved');
}

export function createSavedMeal(data: {
  name: string;
  items: Array<{ food_id: number; quantity: number; unit: 'g' | 'ml' | 'serving' }>;
}): Promise<SavedMeal> {
  return request<SavedMeal>('/api/meals/saved', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteSavedMeal(id: number): Promise<void> {
  return request<void>(`/api/meals/saved/${id}`, { method: 'DELETE' });
}

export function updateSavedMeal(id: number, data: { name: string; items: { food_id: number; quantity: number; unit: 'g' | 'ml' | 'serving' }[] }): Promise<SavedMeal> {
  return request<SavedMeal>(`/api/meals/saved/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// ─── Current Meal ─────────────────────────────────────────────────────────────

export function getCurrentMeal(): Promise<CurrentMealItem[]> {
  return request<CurrentMealItem[]>('/api/meals/current');
}

export function addCurrentMealItem(data: {
  food_id: number;
  servings: number;
}): Promise<CurrentMealItem> {
  return request<CurrentMealItem>('/api/meals/current', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCurrentMealItem(
  id: number,
  data: { servings: number }
): Promise<CurrentMealItem> {
  return request<CurrentMealItem>(`/api/meals/current/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteCurrentMealItem(id: number): Promise<void> {
  return request<void>(`/api/meals/current/${id}`, { method: 'DELETE' });
}

export function clearCurrentMeal(): Promise<void> {
  return request<void>('/api/meals/current', { method: 'DELETE' });
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export function getJournalEntries(params?: {
  date?: string;
  startDate?: string;
  endDate?: string;
}): Promise<JournalEntry[]> {
  const qs = new URLSearchParams();
  if (params?.date) qs.set('date', params.date);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<JournalEntry[]>(`/api/journal${query}`);
}

export function addJournalEntry(data: {
  date: string;
  meal_type: MealType;
  food_id?: number;
  food_name_snapshot: string;
  /** New unit-aware fields — server computes snapshots when food_id is set */
  quantity: number;
  unit: 'g' | 'ml' | 'serving';
  /** Quick Add only (food_id absent) */
  calories_snapshot?: number;
  protein_snapshot?: number;
}): Promise<JournalEntry> {
  return request<JournalEntry>('/api/journal', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateJournalEntry(
  id: number,
  data: Partial<{
    meal_type: MealType;
    quantity: number;
    unit: 'g' | 'ml' | 'serving';
    /** Quick Add only */
    calories_snapshot: number;
    protein_snapshot: number;
  }>
): Promise<JournalEntry> {
  return request<JournalEntry>(`/api/journal/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteJournalEntry(id: number): Promise<void> {
  return request<void>(`/api/journal/${id}`, { method: 'DELETE' });
}

export function getJournalSummary(date?: string): Promise<DailySummary> {
  const qs = date ? `?date=${date}` : '';
  return request<DailySummary>(`/api/journal/today-summary${qs}`);
}

// ─── Weight ──────────────────────────────────────────────────────────────────

export function getWeightEntries(params?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<WeightEntry[]> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<WeightEntry[]>(`/api/weight${query}`);
}

export function addWeightEntry(data: {
  date: string;
  weight_kg: number;
}): Promise<WeightEntry> {
  return request<WeightEntry>('/api/weight', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getLatestWeight(): Promise<WeightEntry | null> {
  return request<WeightEntry>('/api/weight/latest').catch(() => null);
}

export function deleteWeightEntry(id: number): Promise<void> {
  return request<void>(`/api/weight/${id}`, { method: 'DELETE' });
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export function getSteps(params?: {
  date?: string;
  startDate?: string;
  endDate?: string;
}): Promise<StepEntry[]> {
  const qs = new URLSearchParams();
  if (params?.date) qs.set('date', params.date);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<StepEntry[]>(`/api/steps${query}`);
}

export function updateSteps(data: {
  date: string;
  steps: number;
}): Promise<StepEntry> {
  return request<StepEntry>('/api/steps', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Individual step log entries (multiple per day) ──────────────────────────

export function getStepLogs(date: string): Promise<StepLogEntry[]> {
  return request<StepLogEntry[]>(`/api/steps/logs?date=${encodeURIComponent(date)}`);
}

export function createStepLog(data: {
  date: string;
  steps: number;
  note?: string;
}): Promise<StepLogEntry> {
  return request<StepLogEntry>('/api/steps/logs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateStepLog(
  id: number,
  data: { steps?: number; note?: string | null }
): Promise<StepLogEntry> {
  return request<StepLogEntry>(`/api/steps/logs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteStepLog(id: number): Promise<void> {
  return request<void>(`/api/steps/logs/${id}`, { method: 'DELETE' });
}

export function getTodaySteps(): Promise<{ date: string; steps: number; id: number | null }> {
  return request('/api/steps/today');
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export function getGoals(): Promise<Goals> {
  return request<Goals>('/api/goals');
}

export function updateGoals(data: {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  steps?: number | null;
  weight_kg?: number | null;
}): Promise<Goals> {
  return request<Goals>('/api/goals', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface Preferences {
  theme: 'dark' | 'light';
  display_name: string | null;
}

export function getPreferences(): Promise<Preferences> {
  return request<Preferences>('/api/preferences');
}

export function updatePreferences(
  data: Partial<{ theme: 'dark' | 'light'; display_name: string | null }>
): Promise<Preferences> {
  return request<Preferences>('/api/preferences', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
