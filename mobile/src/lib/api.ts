// Mobile API client. Adapted from web/src/lib/api.ts:
//   - reads VITE_API_BASE_URL (Vite) instead of NEXT_PUBLIC_API_URL (Next.js)
//   - sends Bearer token when present (set after sign-in, Phase 2)
//   - additional auth/user-goals/health endpoints not on web
//
// Keep the existing function signatures in sync with web's api.ts so porting
// page components from web/ is mechanical.

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
  WeightJourney,
  AuthSession,
  User,
  UserGoals,
  HealthCheck,
} from './types';

// ─── Base Configuration ───────────────────────────────────────────────────

const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4001'
).replace(/\/$/, '');

// ─── Auth token (in-memory + persisted to Capacitor Preferences / localStorage) ──
// Phase 2 (DSHKI auth tickets) wires real sign-in. For now this lets the client
// already send tokens if present, so adding auth doesn't require re-touching every
// fetch site.

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

// ─── Core request helper ──────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, { ...options, headers });

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

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────

export function getHealth(): Promise<HealthCheck> {
  return request<HealthCheck>('/api/health');
}

export function getBaseUrl(): string {
  return BASE_URL;
}

// ─── Foods ────────────────────────────────────────────────────────────────

export function getFoods(): Promise<Food[]> {
  return request<Food[]>('/api/foods');
}

export function createFood(data: Omit<Food, 'id' | 'created_at'>): Promise<Food> {
  return request<Food>('/api/foods', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateFood(
  id: number,
  data: Partial<Omit<Food, 'id' | 'created_at'>>,
): Promise<Food> {
  return request<Food>(`/api/foods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteFood(id: number): Promise<void> {
  return request<void>(`/api/foods/${id}`, { method: 'DELETE' });
}

// ─── Saved Meals ──────────────────────────────────────────────────────────

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

export function updateSavedMeal(
  id: number,
  data: {
    name: string;
    items: { food_id: number; quantity: number; unit: 'g' | 'ml' | 'serving' }[];
  },
): Promise<SavedMeal> {
  return request<SavedMeal>(`/api/meals/saved/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Current Meal ─────────────────────────────────────────────────────────

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
  data: { servings: number },
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

// ─── Journal ──────────────────────────────────────────────────────────────

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
  quantity: number;
  unit: 'g' | 'ml' | 'serving';
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
    calories_snapshot: number;
    protein_snapshot: number;
  }>,
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

// ─── Weight ───────────────────────────────────────────────────────────────

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

export function getWeightJourney(): Promise<WeightJourney> {
  return request<WeightJourney>('/api/weight/journey');
}

export function deleteWeightEntry(id: number): Promise<void> {
  return request<void>(`/api/weight/${id}`, { method: 'DELETE' });
}

// ─── Steps ────────────────────────────────────────────────────────────────

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

export function getStepLogs(date: string): Promise<StepLogEntry[]> {
  return request<StepLogEntry[]>(
    `/api/steps/logs?date=${encodeURIComponent(date)}`,
  );
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
  data: { steps?: number; note?: string | null },
): Promise<StepLogEntry> {
  return request<StepLogEntry>(`/api/steps/logs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteStepLog(id: number): Promise<void> {
  return request<void>(`/api/steps/logs/${id}`, { method: 'DELETE' });
}

export function getTodaySteps(): Promise<{
  date: string;
  steps: number;
  id: number | null;
}> {
  return request('/api/steps/today');
}

// ─── Goals (legacy, single-user — kept for parity with web) ──────────────

export function getGoals(): Promise<Goals> {
  return request<Goals>('/api/goals');
}

export function updateGoals(data: {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  steps?: number | null;
  weight_kg?: number | null;
  weight_journey_start_date?: string | null;
  tdee_calories?: number | null;
}): Promise<Goals> {
  return request<Goals>('/api/goals', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Preferences ──────────────────────────────────────────────────────────

export type HomeMetric = 'protein' | 'fiber' | 'steps' | 'weight';

export interface Preferences {
  theme: 'dark' | 'light';
  display_name: string | null;
  home_metrics: HomeMetric[];
}

export function getPreferences(): Promise<Preferences> {
  return request<Preferences>('/api/preferences');
}

export function updatePreferences(
  data: Partial<{
    theme: 'dark' | 'light';
    display_name: string | null;
    home_metrics: HomeMetric[];
  }>,
): Promise<Preferences> {
  return request<Preferences>('/api/preferences', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── AI helpers ───────────────────────────────────────────────────────────

export interface FoodEstimate {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  portion: string;
  reasoning: string;
}

export function estimateFood(name: string): Promise<FoodEstimate> {
  return request<FoodEstimate>('/api/ai/estimate-food', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export interface ScannedLabel {
  calories: number;
  kj: number | null;
  energyPrintedAs: 'kcal' | 'kj' | 'both';
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingSize: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export function scanFoodLabel(imageDataUrl: string): Promise<ScannedLabel> {
  return request<ScannedLabel>('/api/ai/scan-label', {
    method: 'POST',
    body: JSON.stringify({ image: imageDataUrl }),
  });
}

// ─── Auth (mobile-specific — backend endpoints live in Phase 1) ──────────

export function signUp(data: {
  email: string;
  password: string;
  display_name?: string;
}): Promise<AuthSession> {
  return request<AuthSession>('/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function signIn(data: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  return request<AuthSession>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function signOut(): Promise<void> {
  return request<void>('/api/auth/sign-out', { method: 'POST' });
}

export function requestPasswordReset(email: string): Promise<void> {
  return request<void>('/api/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(data: {
  token: string;
  new_password: string;
}): Promise<void> {
  return request<void>('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getCurrentUser(): Promise<User> {
  return request<User>('/api/auth/me');
}

export function deleteAccount(): Promise<void> {
  return request<void>('/api/auth/account', { method: 'DELETE' });
}

// Sign in with Apple — exchanges an Apple identity token for a Dashki session.
export function signInWithApple(data: {
  identity_token: string;
  user?: { email?: string; given_name?: string; family_name?: string };
}): Promise<AuthSession> {
  return request<AuthSession>('/api/auth/sign-in-with-apple', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── User goals (onboarding wizard target — Phase 2.5) ──────────────────

export function getUserGoals(): Promise<UserGoals> {
  return request<UserGoals>('/api/user/goals');
}

export function updateUserGoals(data: Partial<UserGoals>): Promise<UserGoals> {
  return request<UserGoals>('/api/user/goals', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function markOnboardingComplete(): Promise<void> {
  return request<void>('/api/user/onboarding-complete', { method: 'POST' });
}
