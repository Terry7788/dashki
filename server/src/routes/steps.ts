import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// ─── GET / — list step entries ────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  if (date) {
    db.get(
      `SELECT id, date, steps FROM StepEntries WHERE date = ?`,
      [date],
      (err, row) => {
        if (err) {
          console.error('[error] GET /api/steps ?date=', err);
          return res.status(500).json({ error: 'Failed to fetch step entry' });
        }
        res.json(row ? [row] : []);
      }
    );
    return;
  }

  if (startDate || endDate) {
    let sql = `SELECT id, date, steps FROM StepEntries WHERE 1=1`;
    const params: string[] = [];
    if (startDate) { sql += ` AND date >= ?`; params.push(startDate); }
    if (endDate) { sql += ` AND date <= ?`; params.push(endDate); }
    sql += ` ORDER BY date ASC`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('[error] GET /api/steps ?startDate/endDate', err);
        return res.status(500).json({ error: 'Failed to fetch step entries' });
      }
      res.json(rows || []);
    });
    return;
  }

  db.all(
    `SELECT id, date, steps FROM StepEntries ORDER BY date DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[error] GET /api/steps', err);
        return res.status(500).json({ error: 'Failed to fetch step entries' });
      }
      res.json(rows || []);
    }
  );
});

// ─── GET /today — today's steps ───────────────────────────────────────────────

router.get('/today', (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);

  db.get(
    `SELECT id, date, steps FROM StepEntries WHERE date = ?`,
    [today],
    (err, row: { id: number; date: string; steps: number } | undefined) => {
      if (err) {
        console.error('[error] GET /api/steps/today', err);
        return res.status(500).json({ error: "Failed to fetch today's steps" });
      }
      res.json({ date: today, steps: row?.steps ?? 0, id: row?.id ?? null });
    }
  );
});

// ─── POST / — upsert steps ────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const { date, steps } = req.body || {};

  if (!date || steps === undefined) {
    return res.status(400).json({ error: 'Missing required fields: date, steps' });
  }

  const stepsNum = Math.floor(Number(steps));
  if (!Number.isFinite(stepsNum) || stepsNum < 0) {
    return res.status(400).json({ error: 'Invalid steps value' });
  }

  db.run(
    `INSERT OR REPLACE INTO StepEntries (date, steps) VALUES (?, ?)`,
    [date, stepsNum],
    (err) => {
      if (err) {
        console.error('[error] POST /api/steps', err);
        return res.status(500).json({ error: 'Failed to upsert steps' });
      }

      db.get(
        `SELECT id, date, steps FROM StepEntries WHERE date = ?`,
        [date],
        (err2, entry) => {
          if (err2) {
            console.error('[error] POST /api/steps fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch step entry' });
          }
          res.status(201).json(entry);
        }
      );
    }
  );
});

export default router;
