import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { logger } from '../logger';

const router = Router();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type Unit = 'g' | 'ml' | 'serving';
type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const VALID_UNITS: Unit[] = ['g', 'ml', 'serving'];
const VALID_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface ParsedItem {
  name: string;
  quantity: number;
  unit: Unit;
}

interface ParseResponse {
  meal_type: MealType | null;
  items: ParsedItem[];
}

const PARSE_FOODS_PROMPT = `You are parsing a food log message into structured items.

Input is one user message describing one or more foods eaten, e.g.:
  "Chicken breast 200g, mushrooms 20g, eatlean cheese 1 serving"
  "lunch: 2 eggs and 250ml coffee"
  "had a chicken sandwich"

Return ONLY valid JSON in this exact shape — no markdown, no commentary:
{
  "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | null,
  "items": [
    { "name": "<food name>", "quantity": <number>, "unit": "g" | "ml" | "serving" }
  ]
}

Rules:
1. If the message has a meal-type prefix ("breakfast:", "lunch:", "dinner:", "snack:"), set meal_type. Otherwise null.
2. Split the rest on commas, "and", "&". One item per food.
3. unit MUST be exactly one of "g", "ml", "serving" (singular, lowercase). Never "grams", "servings", "ml.", etc.
4. quantity MUST be a positive number.
5. Inferring unit when ambiguous:
   - Explicit weight in grams ("200g chicken") -> "g"
   - Explicit volume in ml ("250ml coffee") -> "ml"
   - Beverages (coffee, tea, juice, soda, milk, water) default to ml, quantity 250 if unstated
   - Count-based foods (2 eggs, 1 banana, 1 sandwich) -> "serving", quantity = the count
   - "1 serving" of anything -> "serving", quantity 1
   - Otherwise default to "serving" quantity 1
6. Capitalise the first letter of name. Keep brand names as written.
7. Drop items you can't parse — do not invent foods.

Return JSON only.`;

router.post('/parse-foods', async (req: Request, res: Response) => {
  if (!openai) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing or invalid text parameter' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You parse food log messages into structured JSON. Output JSON only — no prose, no markdown.' },
        { role: 'user', content: `${PARSE_FOODS_PROMPT}\n\nMessage: "${text.trim()}"` },
      ],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('[bot/parse-foods] non-JSON response from model:', raw);
      return res.status(502).json({ error: 'Model returned invalid JSON' });
    }

    const result = normalise(parsed);
    res.json(result);
  } catch (err) {
    logger.error('[bot/parse-foods] error', err);
    res.status(500).json({ error: 'Failed to parse food log', details: (err as Error).message });
  }
});

function normalise(raw: unknown): ParseResponse {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const rawMealType = typeof obj.meal_type === 'string' ? obj.meal_type.toLowerCase() : null;
  const meal_type = (rawMealType && VALID_MEAL_TYPES.includes(rawMealType as MealType))
    ? (rawMealType as MealType)
    : null;

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: ParsedItem[] = [];
  for (const item of rawItems) {
    const normalised = normaliseItem(item);
    if (normalised) items.push(normalised);
  }

  return { meal_type, items };
}

function normaliseItem(raw: unknown): ParsedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Record<string, unknown>;

  const name = typeof it.name === 'string' ? it.name.trim() : '';
  if (!name) return null;

  const quantity = Number(it.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unitRaw = typeof it.unit === 'string' ? it.unit.toLowerCase() : '';
  // Tolerate common LLM mistakes — map to canonical even if the prompt was ignored.
  const unitMapped = unitRaw === 'grams' ? 'g'
    : unitRaw === 'servings' ? 'serving'
    : unitRaw;
  if (!VALID_UNITS.includes(unitMapped as Unit)) return null;

  return { name, quantity, unit: unitMapped as Unit };
}

// ─── POST /estimate-nutrition ─────────────────────────────────────────────────
//
// Given a (name, quantity, unit) the bot couldn't match in the Foods table,
// ask the LLM for a calorie + macro estimate.
//
// Two parts in the response:
//   - top-level kcal/P/C/F = what the user is about to eat right now
//   - perBase = the food's per-base-unit profile, used if the user picks
//     "Confirm + Save to DB" (this is what gets written to the Foods row)
//
// Base convention:
//   - unit 'g'       -> base_amount=100, base_unit='g'      (per 100g)
//   - unit 'ml'      -> base_amount=100, base_unit='ml'     (per 100ml)
//   - unit 'serving' -> base_amount=1,   base_unit='serving'(per 1 serving),
//                       plus serving_size_g if the LLM can estimate the
//                       weight of a typical serving.

interface PerBase {
  base_amount: number;
  base_unit: Unit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size_g: number | null;
}

interface EstimateResponse {
  name: string;
  quantity: number;
  unit: Unit;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  perBase: PerBase;
}

const ESTIMATE_PROMPT = `You are estimating the nutrition of a food item.

You will be given a food name, a quantity, and a unit. Return BOTH the macros for
that specific amount AND the food's per-base-unit profile (used to seed a database).

Output ONLY this JSON shape — no markdown, no commentary:
{
  "calories": <integer kcal for the asked quantity>,
  "protein": <grams, 1dp>,
  "carbs":   <grams, 1dp>,
  "fat":     <grams, 1dp>,
  "perBase": {
    "base_amount": <number>,
    "base_unit":   "g" | "ml" | "serving",
    "calories":    <integer kcal per base_amount of base_unit>,
    "protein":     <grams, 1dp>,
    "carbs":       <grams, 1dp>,
    "fat":         <grams, 1dp>,
    "serving_size_g": <grams per 1 serving — only when base_unit is "serving", else null>
  }
}

Rules for perBase:
- If the input unit is "g": base_amount=100, base_unit="g", serving_size_g=null. Macros are per 100g.
- If the input unit is "ml": base_amount=100, base_unit="ml", serving_size_g=null. Macros are per 100ml.
- If the input unit is "serving": base_amount=1, base_unit="serving". Macros are per 1 serving. Set serving_size_g to the typical weight of one serving in grams (e.g. 1 slice of bread ≈ 30g).

Internal consistency check: the top-level (kcal/P/C/F) MUST equal perBase scaled to the asked quantity (within rounding). For example: 200g chicken breast with perBase 165 kcal / 31P / 0C / 3.6F per 100g => top-level 330 kcal / 62P / 0C / 7.2F.

Round calories to integer; protein, carbs, fat to 1 decimal place.

Return JSON only.`;

router.post('/estimate-nutrition', async (req: Request, res: Response) => {
  if (!openai) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { name, quantity, unit } = req.body || {};

  const nameTrimmed = typeof name === 'string' ? name.trim() : '';
  if (!nameTrimmed) {
    return res.status(400).json({ error: 'Missing or invalid name' });
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Missing or invalid quantity (must be > 0)' });
  }

  const unitNormalised = typeof unit === 'string' ? unit.toLowerCase() : '';
  if (!VALID_UNITS.includes(unitNormalised as Unit)) {
    return res.status(400).json({ error: 'Missing or invalid unit (must be g | ml | serving)' });
  }
  const u = unitNormalised as Unit;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You estimate nutrition for foods. Output JSON only — no prose, no markdown.' },
        { role: 'user', content: `${ESTIMATE_PROMPT}\n\nFood: ${nameTrimmed}\nQuantity: ${qty}\nUnit: ${u}` },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('[bot/estimate-nutrition] non-JSON response from model:', raw);
      return res.status(502).json({ error: 'Model returned invalid JSON' });
    }

    const response = buildEstimate(nameTrimmed, qty, u, parsed);
    if (!response) {
      return res.status(502).json({ error: 'Model returned unparseable estimate', raw });
    }
    res.json(response);
  } catch (err) {
    logger.error('[bot/estimate-nutrition] error', err);
    res.status(500).json({ error: 'Failed to estimate nutrition', details: (err as Error).message });
  }
});

function buildEstimate(
  name: string,
  quantity: number,
  unit: Unit,
  raw: unknown
): EstimateResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const calories = roundInt(obj.calories);
  const protein = round1(obj.protein);
  const carbs = round1(obj.carbs);
  const fat = round1(obj.fat);
  if (calories === null || protein === null || carbs === null || fat === null) return null;

  const perBaseRaw = obj.perBase && typeof obj.perBase === 'object'
    ? (obj.perBase as Record<string, unknown>)
    : null;
  if (!perBaseRaw) return null;

  const baseAmount = Number(perBaseRaw.base_amount);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return null;

  const baseUnitRaw = typeof perBaseRaw.base_unit === 'string' ? perBaseRaw.base_unit.toLowerCase() : '';
  if (!VALID_UNITS.includes(baseUnitRaw as Unit)) return null;
  const baseUnit = baseUnitRaw as Unit;

  // Server enforces the base convention so the LLM can't drift.
  const expectedBaseAmount = unit === 'serving' ? 1 : 100;
  const expectedBaseUnit = unit;
  const baseAmountFinal = baseUnit === expectedBaseUnit ? expectedBaseAmount : baseAmount;
  const baseUnitFinal = baseUnit === expectedBaseUnit ? baseUnit : expectedBaseUnit;

  const pbCalories = roundInt(perBaseRaw.calories);
  const pbProtein = round1(perBaseRaw.protein);
  const pbCarbs = round1(perBaseRaw.carbs);
  const pbFat = round1(perBaseRaw.fat);
  if (pbCalories === null || pbProtein === null || pbCarbs === null || pbFat === null) return null;

  // serving_size_g is required when base_unit === 'serving', null otherwise.
  let servingSizeG: number | null = null;
  if (baseUnitFinal === 'serving') {
    const ssg = Number(perBaseRaw.serving_size_g);
    servingSizeG = Number.isFinite(ssg) && ssg > 0 ? Math.round(ssg) : null;
  }

  return {
    name,
    quantity,
    unit,
    calories,
    protein,
    carbs,
    fat,
    perBase: {
      base_amount: baseAmountFinal,
      base_unit: baseUnitFinal,
      calories: pbCalories,
      protein: pbProtein,
      carbs: pbCarbs,
      fat: pbFat,
      serving_size_g: servingSizeG,
    },
  };
}

function roundInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function round1(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10) / 10;
}

export default router;
