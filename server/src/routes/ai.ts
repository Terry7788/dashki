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
  /** kcal per ONE serving — printed directly if a kcal/Cal value is on
   *  the label; otherwise derived from kJ via kJ/4.184. */
  calories: number;
  /** Printed kJ per ONE serving, or null if the label only shows kcal/Cal.
   *  When present and energyPrintedAs === 'kj' the client uses this as
   *  the source-of-truth for the Energy (kJ) field instead of deriving
   *  it from kcal, so what's saved matches the printed label byte-for-byte. */
  kj: number | null;
  /** What the label actually printed in the energy row. Drives whether
   *  the kJ field or the kcal field is treated as source-of-truth on
   *  the client. */
  energyPrintedAs: 'kcal' | 'kj' | 'both';
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** Printed serving weight in grams (solids) or ml (liquids), e.g.
   *  "Serving size: 30g" → 30. Null if not printed. */
  servingSize: number | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

const SCAN_LABEL_PROMPT = `You are extracting nutrition data from a photo of a packaged-food nutrition label.

YOUR JOB: Read the "PER SERVE" / "Per Serving" / "Per 1 serving" column. ALWAYS. Even if a "Per 100g" column is also printed alongside it — IGNORE the per-100g column. Every macro you return must be per ONE serving.

Output ONLY valid JSON in this exact shape — no markdown, no commentary:
{
  "calories":        <integer kcal PER ONE SERVING — see Rule 2 for kJ-only labels>,
  "kj":              <integer kJ per ONE serving if the label printed kJ, else null>,
  "energyPrintedAs": "<one of 'kcal', 'kj', 'both' — what the energy row of the label actually printed>",
  "protein":         <number grams of protein PER ONE SERVING, one decimal>,
  "carbs":           <number grams of carbohydrate PER ONE SERVING, one decimal>,
  "fat":             <number grams of fat PER ONE SERVING, one decimal>,
  "fiber":           <number grams of dietary fibre PER ONE SERVING, one decimal — 0 if not listed>,
  "servingSize":     <optional number — printed serving weight in grams (solids) or ml (liquids), e.g. "Serving size: 30g" → 30. null if not printed>,
  "confidence":      "<high|medium|low>",
  "reasoning":       "<one or two sentences describing what column you read and any conversions you made>"
}

Rules:
1. EVERY macro number must be the PER-SERVING value. If the label ONLY has a "Per 100g" column (no per-serve column at all), derive per-serve by multiplying by (printed_serving_size / 100). If no serving size is printed either, set confidence='low' and explain.
2. Energy handling — read it carefully:
   - If the energy row prints kcal (or "Cal" / "Calories" on US labels): use that integer as "calories". Set energyPrintedAs='kcal' if no kJ is printed, or 'both' if kJ is also there.
   - If the energy row prints ONLY kJ (common on AU/EU labels): set kj = the printed kJ integer, set energyPrintedAs='kj', and ALSO compute calories = round(kj / 4.184). The client uses the printed kJ as source-of-truth in this case.
   - "kj" is null whenever the label did not print a kJ value.
3. Carbohydrate: prefer "Total Carbohydrate" / "Carbohydrate" (NOT "of which sugars" / "Sugars").
4. Fat: prefer "Total Fat" / "Fat" (NOT "Saturated Fat").
5. Fibre may be labelled "Fibre", "Dietary Fibre", or "Fiber" — extract whichever appears. If absent from the label, return 0.
6. servingSize: the printed serving weight in g (solids) or ml (liquids). Examples: "Serving size: 30g" → 30, "Per serve (250ml)" → 250. null if not printed.
7. If the image is NOT a nutrition label (blurry, wrong subject, unreadable): set confidence='low', all macros 0, calories=0, kj=null, energyPrintedAs='kcal', servingSize=null, and explain in reasoning.
8. If the image IS a label but a specific value is unreadable: set that value to 0 (or kj=null) and mention it in reasoning.

Return JSON only.`;

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

    const kjRaw = Number(parsed.kj);
    const kj = Number.isFinite(kjRaw) && kjRaw > 0 ? Math.round(kjRaw) : null;
    const energyPrintedAs: 'kcal' | 'kj' | 'both' =
      parsed.energyPrintedAs === 'kcal' || parsed.energyPrintedAs === 'kj' || parsed.energyPrintedAs === 'both'
        ? parsed.energyPrintedAs
        : (kj != null ? 'kj' : 'kcal');

    // If the label only printed kJ, trust kj as source-of-truth and
    // re-derive calories from it server-side. This guards against the
    // model returning a kcal that doesn't match its own kJ.
    let calories: number;
    if (energyPrintedAs === 'kj' && kj != null) {
      calories = Math.max(0, Math.round(kj / 4.184));
    } else {
      calories = Number.isFinite(parsed.calories) ? Math.max(0, Math.round(Number(parsed.calories))) : 0;
    }

    const protein = clampNonNegOneDp(parsed.protein);
    const carbs = clampNonNegOneDp(parsed.carbs);
    const fat = clampNonNegOneDp(parsed.fat);
    const fiber = clampNonNegOneDp(parsed.fiber);
    const servingSize = Number.isFinite(Number(parsed.servingSize)) && Number(parsed.servingSize) > 0
      ? Number(parsed.servingSize)
      : null;
    const confidence: 'high' | 'medium' | 'low' =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'medium';
    const reasoning =
      typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
        ? parsed.reasoning.trim()
        : 'Extracted from nutrition label.';

    const result: ScanLabelResponse = {
      calories, kj, energyPrintedAs, protein, carbs, fat, fiber,
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
