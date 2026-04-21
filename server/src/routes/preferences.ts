import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

interface PreferencesRow {
  theme: string | null;
  display_name: string | null;
}

// ─── GET / — fetch current preferences ───────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  db.get(
    `SELECT theme, display_name FROM UserPreferences WHERE id = 1`,
    [],
    (err, row: PreferencesRow | undefined) => {
      if (err) {
        console.error('[error] GET /api/preferences', err);
        return res.status(500).json({ error: 'Failed to fetch preferences' });
      }

      res.json({
        theme: row?.theme ?? 'dark',
        display_name: row?.display_name ?? null,
      });
    }
  );
});

// ─── PUT / — update preferences ──────────────────────────────────────────────
//
// Partial update — only fields present in the body are written. Pass either
// or both of `theme` and `display_name`. Empty string or null on
// display_name resets it (greeting falls back to a generic form).

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
        `SELECT theme, display_name FROM UserPreferences WHERE id = 1`,
        [],
        (selErr, row: PreferencesRow | undefined) => {
          if (selErr) {
            console.error('[error] PUT /api/preferences re-fetch', selErr);
            return res.status(500).json({ error: 'Failed to fetch updated preferences' });
          }

          const result = {
            theme: row?.theme ?? 'dark',
            display_name: row?.display_name ?? null,
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
