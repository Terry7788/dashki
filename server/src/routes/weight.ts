import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// ─── GET / — list weight entries ──────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const days = req.query.days as string | undefined;
  const limit = req.query.limit as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  let sql = `SELECT id, date, weight_kg, created_at FROM WeightEntries WHERE 1=1`;
  const params: (string | number)[] = [];

  if (days && days !== 'all') {
    const daysNum = Number(days);
    if (!Number.isFinite(daysNum) || daysNum <= 0) {
      return res.status(400).json({ error: 'Invalid days parameter' });
    }
    sql += ` AND date >= date('now', '-${Math.floor(daysNum)} days')`;
  }

  if (startDate) { sql += ` AND date >= ?`; params.push(startDate); }
  if (endDate) { sql += ` AND date <= ?`; params.push(endDate); }

  sql += ` ORDER BY date DESC`;

  if (limit) {
    const limitNum = Number(limit);
    if (Number.isFinite(limitNum) && limitNum > 0) {
      sql += ` LIMIT ${Math.floor(limitNum)}`;
    }
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[error] GET /api/weight', err);
      return res.status(500).json({ error: 'Failed to fetch weight entries' });
    }
    res.json(rows || []);
  });
});

// ─── GET /latest — most recent entry ─────────────────────────────────────────

router.get('/latest', (_req: Request, res: Response) => {
  db.get(
    `SELECT id, date, weight_kg, created_at FROM WeightEntries ORDER BY date DESC LIMIT 1`,
    [],
    (err, row) => {
      if (err) {
        console.error('[error] GET /api/weight/latest', err);
        return res.status(500).json({ error: 'Failed to fetch latest weight entry' });
      }
      if (!row) return res.status(404).json({ error: 'No weight entries found' });
      res.json(row);
    }
  );
});

// ─── POST / — upsert weight entry ────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const { date, weight_kg } = req.body || {};

  if (!date || weight_kg === undefined) {
    return res.status(400).json({ error: 'Missing required fields: date, weight_kg' });
  }

  const weightNum = Number(weight_kg);
  if (!Number.isFinite(weightNum) || weightNum <= 0) {
    return res.status(400).json({ error: 'Invalid weight_kg' });
  }

  db.run(
    `INSERT OR REPLACE INTO WeightEntries (date, weight_kg) VALUES (?, ?)`,
    [date, weightNum],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] POST /api/weight', err);
        return res.status(500).json({ error: 'Failed to upsert weight entry' });
      }

      db.get(
        `SELECT id, date, weight_kg, created_at FROM WeightEntries WHERE date = ?`,
        [date],
        (err2, entry) => {
          if (err2) {
            console.error('[error] POST /api/weight fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch weight entry' });
          }
          res.status(201).json(entry);
        }
      );
    }
  );
});

// ─── DELETE /:id — delete entry ───────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM WeightEntries WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/weight/:id', err);
        return res.status(500).json({ error: 'Failed to delete weight entry' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Weight entry not found' });
      res.status(204).send();
    }
  );
});

export default router;
