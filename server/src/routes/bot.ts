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

export default router;
