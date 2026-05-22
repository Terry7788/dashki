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

interface ScanLabelResponse {
  name: string;
  baseAmount: number;
  baseUnit: 'grams' | 'ml' | 'servings';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingSize: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

const SCAN_LABEL_PROMPT = `You are extracting nutrition data from a photo of a packaged-food nutrition label.

Output ONLY valid JSON in this exact shape — no markdown, no commentary:
{
  "name":        "<best-guess product name visible on the packaging — brand + product, or empty string if not visible>",
  "baseAmount":  <number — typically 100 when reading the 'per 100g/100ml' column, OR the serving weight when only per-serving is shown>,
  "baseUnit":    "<grams|ml|servings>",
  "calories":    <integer kcal per the chosen base>,
  "protein":     <number grams per the chosen base, one decimal>,
  "carbs":       <number grams per the chosen base, one decimal>,
  "fat":         <number grams per the chosen base, one decimal>,
  "fiber":       <number grams per the chosen base, one decimal — 0 if not listed>,
  "servingSize": <optional number — grams in one serving if printed, else null>,
  "confidence":  "<high|medium|low>",
  "reasoning":   "<one or two sentences naming what column you used and any conversions you made>"
}

Rules:
1. PREFER the "per 100g" (or "per 100ml" for liquids) column when present — it's the most useful base for the database. Set baseAmount=100 and baseUnit="grams" or "ml". If only per-serving is shown (common on US labels), use that and set baseUnit="servings", baseAmount=1, and put the serving weight in servingSize.
2. Energy: if the label shows kJ but not kcal, divide kJ by 4.184 and round to the nearest integer kcal. If both are shown, use the printed kcal value.
3. For liquids (drinks, milks, oils) prefer ml. For solids prefer grams.
4. Fibre may be labelled "Fibre", "Dietary Fibre", or "Fiber" — extract whichever is shown. If absent, use 0.
5. Carbs: prefer "Total Carbohydrate" / "Carbohydrate" (not "of which sugars").
6. Fat: prefer "Total Fat" / "Fat" (not "Saturated").
7. Product name: combine brand and product when both are visible (e.g. "Vita-Weat Original"). Leave empty if uncertain.
8. If the image is NOT a nutrition label (blurry, wrong subject, unreadable), set confidence="low", all macros to 0, baseAmount=100, baseUnit="grams", and explain in reasoning.
9. If the image IS a label but a specific value is missing or unreadable, set that value to 0 and mention it in reasoning.

Return JSON only.`;

function isValidBaseUnit(s: unknown): s is 'grams' | 'ml' | 'servings' {
  return s === 'grams' || s === 'ml' || s === 'servings';
}

router.post('/scan-label', async (req: Request, res: Response) => {
  if (!openai) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid image parameter (expected base64 data URL)' });
  }

  // Accept either a full data URL ("data:image/jpeg;base64,...") or the bare
  // base64 payload — normalise to a data URL since that's what the OpenAI
  // vision API expects in image_url.url.
  const dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You read packaged-food nutrition labels from images and return their macros as JSON. Output JSON only — no prose, no markdown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: SCAN_LABEL_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<ScanLabelResponse>;

    const calories = Number.isFinite(parsed.calories) ? Math.max(0, Math.round(Number(parsed.calories))) : 0;
    const protein = clampNonNegOneDp(parsed.protein);
    const carbs = clampNonNegOneDp(parsed.carbs);
    const fat = clampNonNegOneDp(parsed.fat);
    const fiber = clampNonNegOneDp(parsed.fiber);
    const baseUnit: 'grams' | 'ml' | 'servings' = isValidBaseUnit(parsed.baseUnit) ? parsed.baseUnit : 'grams';
    const baseAmountRaw = Number(parsed.baseAmount);
    const baseAmount = Number.isFinite(baseAmountRaw) && baseAmountRaw > 0 ? baseAmountRaw : (baseUnit === 'servings' ? 1 : 100);
    const servingSize = Number.isFinite(Number(parsed.servingSize)) && Number(parsed.servingSize) > 0
      ? Number(parsed.servingSize)
      : null;
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const confidence: 'high' | 'medium' | 'low' =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'medium';
    const reasoning =
      typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
        ? parsed.reasoning.trim()
        : 'Extracted from nutrition label.';

    const result: ScanLabelResponse = {
      name, baseAmount, baseUnit, calories, protein, carbs, fat, fiber,
      servingSize, confidence, reasoning,
    };
    res.json(result);
  } catch (err) {
    logger.error('[ai/scan-label] failed:', err);
    res.status(500).json({ error: 'Failed to scan label' });
  }
});

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
