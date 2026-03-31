import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

// ─── GET / — fetch current preferences ───────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  db.get(
    `SELECT theme FROM UserPreferences WHERE id = 1`,
    [],
    (err, row: { theme: string } | undefined) => {
      if (err) {
        console.error('[error] GET /api/preferences', err);
        return res.status(500).json({ error: 'Failed to fetch preferences' });
      }

      res.json({ theme: row?.theme ?? 'dark' });
    }
  );
});

// ─── PUT / — update preferences ──────────────────────────────────────────────

router.put('/', (req: Request, res: Response) => {
  const { theme } = req.body || {};

  if (theme !== 'dark' && theme !== 'light') {
    return res.status(400).json({ error: 'theme must be "dark" or "light"' });
  }

  db.run(
    `UPDATE UserPreferences SET theme = ? WHERE id = 1`,
    [theme],
    function (err) {
      if (err) {
        console.error('[error] PUT /api/preferences', err);
        return res.status(500).json({ error: 'Failed to update preferences' });
      }

      try {
        getIo().emit('preferences-updated', { theme });
      } catch (_) {
        // io not ready yet — silent fail
      }

      res.json({ theme });
    }
  );
});

export default router;
