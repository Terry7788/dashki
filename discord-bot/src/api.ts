import type {
  Food,
  ParseFoodsResponse,
  EstimateResponse,
  JournalEntry,
  Unit,
  MealType,
  PerBase,
} from './types';

export class DashkiApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Dashki API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export class DashkiClient {
  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new DashkiApiError(res.status, text);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  searchFoods(query: string): Promise<Food[]> {
    const q = encodeURIComponent(query);
    return this.request<Food[]>('GET', `/api/foods?search=${q}`);
  }

  parseFoods(text: string): Promise<ParseFoodsResponse> {
    return this.request<ParseFoodsResponse>('POST', '/api/bot/parse-foods', { text });
  }

  matchFood(name: string): Promise<{
    match: Food | null;
    alternatives: Food[];
    confidence: 'high' | 'low' | 'none';
  }> {
    return this.request('POST', '/api/bot/match-food', { name });
  }

  estimateNutrition(name: string, quantity: number, unit: Unit): Promise<EstimateResponse> {
    return this.request<EstimateResponse>('POST', '/api/bot/estimate-nutrition', {
      name,
      quantity,
      unit,
    });
  }

  createFood(perBase: PerBase & { name: string }): Promise<Food> {
    // The Foods POST endpoint accepts both snake_case and camelCase. Pass the
    // shape that matches the snapshot we already have.
    return this.request<Food>('POST', '/api/foods', {
      name: perBase.name,
      base_amount: perBase.base_amount,
      base_unit: perBase.base_unit,
      calories: perBase.calories,
      protein: perBase.protein,
      carbs: perBase.carbs,
      fat: perBase.fat,
      serving_size_g: perBase.serving_size_g,
    });
  }

  // Log against an existing food — server computes kcal/protein from food_id.
  logFromFood(args: {
    date: string;
    mealType: MealType;
    foodId: number;
    foodName: string;
    quantity: number;
    unit: Unit;
  }): Promise<JournalEntry> {
    return this.request<JournalEntry>('POST', '/api/journal', {
      date: args.date,
      meal_type: args.mealType,
      food_id: args.foodId,
      food_name_snapshot: args.foodName,
      quantity: args.quantity,
      unit: args.unit,
    });
  }

  // Quick-add: no food_id; client supplies calories + protein snapshots.
  // Carbs/fat aren't persisted on JournalEntries — matches existing schema.
  logQuickAdd(args: {
    date: string;
    mealType: MealType;
    foodName: string;
    quantity: number;
    unit: Unit;
    calories: number;
    protein: number | null;
  }): Promise<JournalEntry> {
    return this.request<JournalEntry>('POST', '/api/journal', {
      date: args.date,
      meal_type: args.mealType,
      food_name_snapshot: args.foodName,
      quantity: args.quantity,
      unit: args.unit,
      calories_snapshot: args.calories,
      protein_snapshot: args.protein,
    });
  }
}
