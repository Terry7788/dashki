export type Unit = 'g' | 'ml' | 'serving';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// Subset of the Foods row the bot needs.
export interface Food {
  id: number;
  name: string;
  base_amount: number;
  base_unit: Unit;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  serving_size_g: number | null;
}

export interface ParsedItem {
  name: string;
  quantity: number;
  unit: Unit;
}

export interface ParseFoodsResponse {
  meal_type: MealType | null;
  items: ParsedItem[];
}

export interface PerBase {
  base_amount: number;
  base_unit: Unit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size_g: number | null;
}

export interface EstimateResponse {
  name: string;
  quantity: number;
  unit: Unit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  perBase: PerBase;
}

export interface JournalEntry {
  id: number;
  date: string;
  meal_type: MealType;
  food_id: number | null;
  food_name_snapshot: string;
  quantity: number;
  unit: Unit;
  calories_snapshot: number;
  protein_snapshot: number | null;
}

// Decision the user made for a per-item card.
//   'logged'        — server resolves nutrition via food_id (matched item)
//   'quick-add'     — log directly with client-supplied snapshots (unknown food)
//   'save-and-log'  — create the food in DB first, then log with food_id
// Decision the user made for a per-item card.
//   'logged'        — server resolves nutrition via food_id (matched item)
//   'quick-add'     — log directly with client-supplied snapshots (unknown food)
//   'save-and-log'  — create the food in DB first, then log with food_id
//   'save-only'     — create the food in DB but don't log it to the journal
//   'cancelled'     — user cancelled / estimate failed
export type ItemDecision = 'logged' | 'quick-add' | 'save-and-log' | 'save-only' | 'cancelled';

export interface ItemState {
  parsed: ParsedItem;
  matched: Food | null;
  // Candidate Foods from a low-confidence LLM match. Null when not
  // applicable (high-confidence match or no plausible match). Set when the
  // bot is awaiting the user's pick from a match-candidates card.
  candidates: Food[] | null;
  estimate: EstimateResponse | null;
  decision: ItemDecision | null;
}

export interface Session {
  id: string;
  userId: string;
  channelId: string;
  mealType: MealType;
  date: string;
  items: ItemState[];
  // Index of the next item awaiting a per-item decision. Equals items.length
  // when all unknowns are resolved and we're ready to render the batch card.
  pendingIndex: number;
  // Discord message IDs we created during this session, so we can disable
  // their buttons after a decision or on cancel.
  perItemMessageIds: string[];
  batchMessageId: string | null;
}
