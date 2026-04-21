import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Data model note
//
//   StepLogEntries — source of truth. Multiple rows per date, each one is a
//   discrete entry ("+3,200 at 10:15am", "+1,500 from calculator at 3pm").
//   Fields: id, date, steps, note?, logged_at, created_at.
//
//   StepEntries — legacy aggregate. Kept only because old migrations seeded
//   data into it; we don't read from it anymore. GET /api/steps computes
//   per-day totals on the fly from StepLogEntries via SUM(steps) GROUP BY date.
// ─────────────────────────────────────────────────────────────────────────────

function nowLocalISO(): string {
  // YYYY-MM-DDTHH:MM:SS in local time (no tz suffix). Matches the format used
  // elsewhere for logged_at / journal entries.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── GET / — list aggregate step totals ──────────────────────────────────────
//
// Shape preserved from the legacy API so existing callers (home dashboard,
// calendar, widget, desktop app) keep working without any changes:
//
//   [{ id: number, date: "YYYY-MM-DD", steps: number }, ...]
//
// `id` is synthesised (we use MIN(id) from the logs) because callers don't
// use it for anything other than React keys.

router.get('/', (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  // Single-day query
  if (date) {
    db.get(
      `SELECT MIN(id) AS id, date, COALESCE(SUM(steps), 0) AS steps
       FROM StepLogEntries WHERE date = ? GROUP BY date`,
      [date],
      (err, row: { id: number | null; date: string; steps: number } | undefined) => {
        if (err) {
          console.error('[error] GET /api/steps ?date=', err);
          return res.status(500).json({ error: 'Failed to fetch step entry' });
        }
        // Always return a single-element array matching the legacy contract
        // (empty array when there are no logs for that date).
        res.json(row ? [row] : []);
      }
    );
    return;
  }

  // Date-range query
  if (startDate || endDate) {
    let sql = `
      SELECT MIN(id) AS id, date, SUM(steps) AS steps
      FROM StepLogEntries WHERE 1=1`;
    const params: string[] = [];
    if (startDate) { sql += ` AND date >= ?`; params.push(startDate); }
    if (endDate)   { sql += ` AND date <= ?`; params.push(endDate); }
    sql += ` GROUP BY date ORDER BY date ASC`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('[error] GET /api/steps ?startDate/endDate', err);
        return res.status(500).json({ error: 'Failed to fetch step entries' });
      }
      res.json(rows || []);
    });
    return;
  }

  // No params: all dates
  db.all(
    `SELECT MIN(id) AS id, date, SUM(steps) AS steps
     FROM StepLogEntries GROUP BY date ORDER BY date DESC`,
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

// ─── GET /today — today's aggregate ──────────────────────────────────────────

router.get('/today', (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);

  db.get(
    `SELECT MIN(id) AS id, date, COALESCE(SUM(steps), 0) AS steps
     FROM StepLogEntries WHERE date = ? GROUP BY date`,
    [today],
    (err, row: { id: number | null; date: string; steps: number } | undefined) => {
      if (err) {
        console.error("[error] GET /api/steps/today", err);
        return res.status(500).json({ error: "Failed to fetch today's steps" });
      }
      res.json({
        date: today,
        steps: row?.steps ?? 0,
        id: row?.id ?? null,
      });
    }
  );
});

// ─── POST / — legacy upsert (still works, now maps to log entry) ─────────────
// Backwards-compat path: when called with a date + total, REPLACES any logs
// for that date with a single log containing the new total. This preserves
// the existing "this is the total for the day" semantic for any callers
// that haven't migrated to the new /logs API yet.

router.post('/', (req: Request, res: Response) => {
  const { date, steps } = req.body || {};

  if (!date || steps === undefined) {
    return res.status(400).json({ error: 'Missing required fields: date, steps' });
  }

  const stepsNum = Math.floor(Number(steps));
  if (!Number.isFinite(stepsNum) || stepsNum < 0) {
    return res.status(400).json({ error: 'Invalid steps value' });
  }

  db.serialize(() => {
    db.run(`DELETE FROM StepLogEntries WHERE date = ?`, [date]);
    db.run(
      `INSERT INTO StepLogEntries (date, steps, logged_at) VALUES (?, ?, ?)`,
      [date, stepsNum, nowLocalISO()],
      function (err) {
        if (err) {
          console.error('[error] POST /api/steps', err);
          return res.status(500).json({ error: 'Failed to save steps' });
        }

        const aggregate = { id: this.lastID, date, steps: stepsNum };
        try { getIo().emit('steps-updated', aggregate); } catch (_) {}
        res.status(201).json(aggregate);
      }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  NEW: individual log entry CRUD — /api/steps/logs
// ─────────────────────────────────────────────────────────────────────────────

interface StepLogRow {
  id: number;
  date: string;
  steps: number;
  note: string | null;
  logged_at: string;
  created_at: string;
}

function emitAggregateForDate(date: string) {
  db.get(
    `SELECT MIN(id) AS id, date, COALESCE(SUM(steps), 0) AS steps
     FROM StepLogEntries WHERE date = ? GROUP BY date`,
    [date],
    (_err, row: { id: number | null; date: string; steps: number } | undefined) => {
      const payload = row ?? { id: null, date, steps: 0 };
      try { getIo().emit('steps-updated', payload); } catch (_) {}
    }
  );
}

// GET /logs?date=YYYY-MM-DD — list entries for a single day (ordered oldest→newest)
router.get('/logs', (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  if (!date) {
    return res.status(400).json({ error: 'date query parameter is required' });
  }

  db.all(
    `SELECT id, date, steps, note, logged_at, created_at
     FROM StepLogEntries
     WHERE date = ?
     ORDER BY logged_at ASC, id ASC`,
    [date],
    (err, rows: StepLogRow[]) => {
      if (err) {
        console.error('[error] GET /api/steps/logs', err);
        return res.status(500).json({ error: 'Failed to fetch step log entries' });
      }
      res.json(rows || []);
    }
  );
});

// POST /logs — create a new log entry
// body: { date: "YYYY-MM-DD", steps: number, note?: string }
router.post('/logs', (req: Request, res: Response) => {
  const { date, steps, note } = req.body || {};

  if (!date || steps === undefined) {
    return res.status(400).json({ error: 'Missing required fields: date, steps' });
  }
  const stepsNum = Math.floor(Number(steps));
  if (!Number.isFinite(stepsNum) || stepsNum <= 0) {
    return res.status(400).json({ error: 'Invalid steps value (must be a positive integer)' });
  }
  const noteVal = typeof note === 'string' && note.trim() !== '' ? note.trim() : null;

  db.run(
    `INSERT INTO StepLogEntries (date, steps, note, logged_at) VALUES (?, ?, ?, ?)`,
    [date, stepsNum, noteVal, nowLocalISO()],
    function (err) {
      if (err) {
        console.error('[error] POST /api/steps/logs', err);
        return res.status(500).json({ error: 'Failed to create step log entry' });
      }

      db.get(
        `SELECT id, date, steps, note, logged_at, created_at FROM StepLogEntries WHERE id = ?`,
        [this.lastID],
        (err2, entry: StepLogRow | undefined) => {
          if (err2 || !entry) {
            console.error('[error] POST /api/steps/logs fetch', err2);
            return res.status(500).json({ error: 'Created but failed to fetch' });
          }
          emitAggregateForDate(entry.date);
          res.status(201).json(entry);
        }
      );
    }
  );
});

// PUT /logs/:id — update a log entry (partial: steps and/or note)
router.put('/logs/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { steps, note } = req.body || {};
  const updates: string[] = [];
  const params: (number | string | null)[] = [];

  if (steps !== undefined) {
    const n = Math.floor(Number(steps));
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: 'Invalid steps value (must be a positive integer)' });
    }
    updates.push('steps = ?');
    params.push(n);
  }

  if (note !== undefined) {
    if (note === null || (typeof note === 'string' && note.trim() === '')) {
      updates.push('note = ?');
      params.push(null);
    } else if (typeof note === 'string') {
      updates.push('note = ?');
      params.push(note.trim());
    } else {
      return res.status(400).json({ error: 'Invalid note value' });
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  params.push(id);

  db.run(
    `UPDATE StepLogEntries SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function (err) {
      if (err) {
        console.error('[error] PUT /api/steps/logs/:id', err);
        return res.status(500).json({ error: 'Failed to update step log entry' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Step log entry not found' });
      }

      db.get(
        `SELECT id, date, steps, note, logged_at, created_at FROM StepLogEntries WHERE id = ?`,
        [id],
        (err2, entry: StepLogRow | undefined) => {
          if (err2 || !entry) {
            console.error('[error] PUT /api/steps/logs/:id fetch', err2);
            return res.status(500).json({ error: 'Updated but failed to fetch' });
          }
          emitAggregateForDate(entry.date);
          res.json(entry);
        }
      );
    }
  );
});

// DELETE /logs/:id — remove a log entry
router.delete('/logs/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  // Grab the date first so we can re-emit the aggregate after deletion.
  db.get(
    `SELECT date FROM StepLogEntries WHERE id = ?`,
    [id],
    (selErr, row: { date: string } | undefined) => {
      if (selErr) {
        console.error('[error] DELETE /api/steps/logs/:id pre-fetch', selErr);
        return res.status(500).json({ error: 'Failed to delete step log entry' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Step log entry not found' });
      }

      const date = row.date;
      db.run(`DELETE FROM StepLogEntries WHERE id = ?`, [id], function (err) {
        if (err) {
          console.error('[error] DELETE /api/steps/logs/:id', err);
          return res.status(500).json({ error: 'Failed to delete step log entry' });
        }
        emitAggregateForDate(date);
        res.status(204).end();
      });
    }
  );
});

export default router;
