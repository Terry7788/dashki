import type {
  Food,
  SavedMeal,
  CurrentMealItem,
  JournalEntry,
  StepEntry,
  Todo,
  GymSession,
  GymExercise,
  GymSet,
  GymRoutineDay,
  NextWorkout,
  WeightEntry,
  DailySummary,
  MealType,
  WorkoutTemplate,
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
  items: Array<{ food_id: number; servings: number }>;
}): Promise<SavedMeal> {
  return request<SavedMeal>('/api/meals/saved', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteSavedMeal(id: number): Promise<void> {
  return request<void>(`/api/meals/saved/${id}`, { method: 'DELETE' });
}

export function updateSavedMeal(id: number, data: { name: string; items: { food_id: number; servings: number }[] }): Promise<SavedMeal> {
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
  servings: number;
  calories_snapshot: number;
  protein_snapshot: number;
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
    servings: number;
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

// ─── Todos ───────────────────────────────────────────────────────────────────

export function getTodos(params?: {
  upcoming?: boolean;
  filter?: 'all' | 'active' | 'completed';
}): Promise<Todo[]> {
  const qs = new URLSearchParams();
  if (params?.upcoming) qs.set('upcoming', 'true');
  if (params?.filter && params.filter !== 'all') qs.set('filter', params.filter);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<Todo[]>(`/api/todos${query}`);
}

export function createTodo(data: {
  title: string;
  due_date?: string | null;
}): Promise<Todo> {
  return request<Todo>('/api/todos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTodo(
  id: number,
  data: Partial<{ title: string; completed: boolean; due_date: string | null }>
): Promise<Todo> {
  return request<Todo>(`/api/todos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteTodo(id: number): Promise<void> {
  return request<void>(`/api/todos/${id}`, { method: 'DELETE' });
}

// ─── Gym ─────────────────────────────────────────────────────────────────────

export function getGymSessions(params?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<GymSession[]> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return request<GymSession[]>(`/api/gym${query}`);
}

export function getGymRoutine(): Promise<GymRoutineDay[]> {
  return request<GymRoutineDay[]>('/api/gym/routine');
}

export function updateRoutineDay(
  dayOfWeek: number,
  data: { template_id?: number | null; workout_name?: string; notes?: string }
): Promise<GymRoutineDay> {
  return request<GymRoutineDay>(`/api/gym/routine/${dayOfWeek}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Workout Templates ────────────────────────────────────────────────────────

export function getWorkoutTemplates(): Promise<WorkoutTemplate[]> {
  return request<WorkoutTemplate[]>('/api/gym/templates');
}

export function createWorkoutTemplate(data: {
  name: string;
  notes?: string;
  exercises: Array<{ name: string; sets: number; reps: number }>;
}): Promise<WorkoutTemplate> {
  return request<WorkoutTemplate>('/api/gym/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateWorkoutTemplate(
  id: number,
  data: {
    name: string;
    notes?: string;
    exercises: Array<{ name: string; sets: number; reps: number }>;
  }
): Promise<WorkoutTemplate> {
  return request<WorkoutTemplate>(`/api/gym/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteWorkoutTemplate(id: number): Promise<void> {
  return request<void>(`/api/gym/templates/${id}`, { method: 'DELETE' });
}

export function startSessionFromTemplate(templateId: number, date?: string): Promise<GymSession> {
  return request<GymSession>(`/api/gym/sessions/from-template/${templateId}`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
}

export function getNextWorkout(): Promise<NextWorkout | null> {
  return request<NextWorkout | null>('/api/gym/routine/next');
}

export function syncRoutineToCalendar(): Promise<{ synced: number }> {
  return request<{ synced: number }>('/api/gym/routine/sync', { method: 'POST' });
}

export function createGymSession(data: {
  date: string;
  name: string;
  notes?: string;
}): Promise<GymSession> {
  return request<GymSession>('/api/gym', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function completeGymSession(id: number): Promise<GymSession> {
  return request<GymSession>(`/api/gym/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  });
}

export function addExercise(
  sessionId: number,
  data: { name: string; order_index?: number }
): Promise<GymExercise> {
  return request<GymExercise>(`/api/gym/${sessionId}/exercises`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function addSet(
  exerciseId: number,
  data: { set_number: number; reps: number; weight_kg: number }
): Promise<GymSet> {
  return request<GymSet>(`/api/gym/exercises/${exerciseId}/sets`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
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

export function getPreferences(): Promise<{ theme: 'dark' | 'light' }> {
  return request<{ theme: 'dark' | 'light' }>('/api/preferences');
}

export function updatePreferences(data: { theme: 'dark' | 'light' }): Promise<{ theme: 'dark' | 'light' }> {
  return request<{ theme: 'dark' | 'light' }>('/api/preferences', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
