import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { logger } from '../logger';

const router = Router();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

interface EstimateResponse {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  portion: string;
  reasoning: string;
}

const ESTIMATE_FOOD_PROMPT = `You are estimating macros for a single food entry that a user typed into a Quick Add or New Food field.

The user's text may include a portion description ("2 slices of pepperoni pizza", "large apple", "250ml oat milk"). If no portion is described, assume one typical serving for that food as a normal person would eat it.

Return ONLY valid JSON in this exact shape — no markdown, no commentary:
{
  "calories": <integer kcal for the entire portion described>,
  "protein": <number grams of protein for the entire portion, one decimal place>,
  "carbs":   <number grams of carbohydrates for the entire portion, one decimal place>,
  "fat":     <number grams of fat for the entire portion, one decimal place>,
  "fiber":   <number grams of dietary fibre for the entire portion, one decimal place>,
  "portion": "<short human-readable description of the portion you assumed, e.g. '1 medium apple (~180g)' or '2 slices (~250g)'>",
  "reasoning": "<one or two sentences explaining how you arrived at the numbers — components, density, source rule of thumb. Keep it concise but specific.>"
}

Rules:
1. Numbers must reflect the TOTAL portion described (or your assumed serving), not per-100g.
2. Calories: round to the nearest integer.
3. Protein / carbs / fat / fiber: round to one decimal place each.
4. Fibre counts the dietary fibre subset of carbs (not net carbs) — for most refined foods this is 0–2g, for produce/legumes/wholegrains it's higher.
5. Reasoning must be specific — name the components or the typical macro density. Do not say "based on standard nutritional data".
6. If the food is wildly ambiguous (e.g. just "food", "snack"), still produce a reasonable best guess and say so in reasoning.
7. If the input is clearly not food (e.g. "blue car"), return all macros 0, portion="(not a food)", reasoning="That doesn't look like a food item.".

Return JSON only.`;

function clampNonNegOneDp(n: unknown): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(Number(n) * 10) / 10) : 0;
}

router.post('/estimate-food', async (req: Request, res: Response) => {
  if (!openai) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Missing or invalid name parameter' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You estimate macros for one-off food entries. Output JSON only — no prose, no markdown.',
        },
        { role: 'user', content: `${ESTIMATE_FOOD_PROMPT}\n\nFood: "${name.trim()}"` },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<EstimateResponse>;

    const calories = Number.isFinite(parsed.calories) ? Math.max(0, Math.round(Number(parsed.calories))) : 0;
    const protein = clampNonNegOneDp(parsed.protein);
    const carbs = clampNonNegOneDp(parsed.carbs);
    const fat = clampNonNegOneDp(parsed.fat);
    const fiber = clampNonNegOneDp(parsed.fiber);
    const portion = typeof parsed.portion === 'string' && parsed.portion.trim() ? parsed.portion.trim() : '1 serving';
    const reasoning =
      typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
        ? parsed.reasoning.trim()
        : 'Estimate based on typical nutritional values for this food.';

    const result: EstimateResponse = { calories, protein, carbs, fat, fiber, portion, reasoning };
    res.json(result);
  } catch (err) {
    logger.error('[ai/estimate-food] failed:', err);
    res.status(500).json({ error: 'Failed to estimate food' });
  }
});

export default router;
