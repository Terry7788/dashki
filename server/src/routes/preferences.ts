import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

interface PreferencesRow {
  theme: string | null;
  display_name: string | null;
  home_metrics: string | null;
}

// Default set of home-dashboard metrics shown when the user hasn't customised.
// Calories is always shown — it's the primary metric and isn't toggleable.
const VALID_HOME_METRICS = ['protein', 'fiber', 'steps', 'weight'] as const;
type HomeMetric = (typeof VALID_HOME_METRICS)[number];
const DEFAULT_HOME_METRICS: HomeMetric[] = ['protein', 'steps', 'weight'];

function parseHomeMetrics(raw: string | null): HomeMetric[] {
  if (!raw) return DEFAULT_HOME_METRICS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_HOME_METRICS;
    const filtered = parsed.filter(
      (k): k is HomeMetric =>
        typeof k === 'string' && (VALID_HOME_METRICS as readonly string[]).includes(k)
    );
    return filtered;
  } catch {
    return DEFAULT_HOME_METRICS;
  }
}

// ─── GET / — fetch current preferences ───────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  db.get(
    `SELECT theme, display_name, home_metrics FROM UserPreferences WHERE id = 1`,
    [],
    (err, row: PreferencesRow | undefined) => {
      if (err) {
        console.error('[error] GET /api/preferences', err);
        return res.status(500).json({ error: 'Failed to fetch preferences' });
      }

      res.json({
        theme: row?.theme ?? 'dark',
        display_name: row?.display_name ?? null,
        home_metrics: parseHomeMetrics(row?.home_metrics ?? null),
      });
    }
  );
});

// ─── PUT / — update preferences ──────────────────────────────────────────────
//
// Partial update — only fields present in the body are written. Accepts:
//   theme:         'dark' | 'light'
//   display_name:  string | null   (null/'' resets to default greeting)
//   home_metrics:  string[]        (whitelist filtered; persisted as JSON text)

router.put('/', (req: Request, res: Response) => {
  const body = req.body || {};

  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (body.theme !== undefined) {
    if (body.theme !== 'dark' && body.theme !== 'light') {
      return res.status(400).json({ error: 'theme must be "dark" or "light"' });
    }
    updates.push('theme = ?');
    params.push(body.theme);
  }

  if (body.display_name !== undefined) {
    let name: string | null = body.display_name;
    if (typeof name === 'string') name = name.trim();
    if (name === '' || name === null) {
      name = null;
    } else if (typeof name !== 'string') {
      return res.status(400).json({ error: 'display_name must be a string' });
    } else if (name.length > 50) {
      return res.status(400).json({ error: 'display_name must be 50 characters or fewer' });
    }
    updates.push('display_name = ?');
    params.push(name);
  }

  if (body.home_metrics !== undefined) {
    if (!Array.isArray(body.home_metrics)) {
      return res.status(400).json({ error: 'home_metrics must be an array of metric keys' });
    }
    const filtered = body.home_metrics.filter(
      (k: unknown): k is HomeMetric =>
        typeof k === 'string' && (VALID_HOME_METRICS as readonly string[]).includes(k)
    );
    updates.push('home_metrics = ?');
    params.push(JSON.stringify(filtered));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  db.run(
    `UPDATE UserPreferences SET ${updates.join(', ')} WHERE id = 1`,
    params,
    function (err) {
      if (err) {
        console.error('[error] PUT /api/preferences', err);
        return res.status(500).json({ error: 'Failed to update preferences' });
      }

      db.get(
        `SELECT theme, display_name, home_metrics FROM UserPreferences WHERE id = 1`,
        [],
        (selErr, row: PreferencesRow | undefined) => {
          if (selErr) {
            console.error('[error] PUT /api/preferences re-fetch', selErr);
            return res.status(500).json({ error: 'Failed to fetch updated preferences' });
          }

          const result = {
            theme: row?.theme ?? 'dark',
            display_name: row?.display_name ?? null,
            home_metrics: parseHomeMetrics(row?.home_metrics ?? null),
          };

          try {
            getIo().emit('preferences-updated', result);
          } catch (_) {
            // io not ready yet — silent fail
          }

          res.json(result);
        }
      );
    }
  );
});

export default router;
