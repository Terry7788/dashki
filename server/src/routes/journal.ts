import { Router, Request, Response } from 'express';
import { db } from '../db';
import { getIo } from '../socket';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const SELECT_ENTRY_SQL = `
  SELECT id, date, meal_type, logged_at, food_id, food_name_snapshot, servings,
         calories_snapshot, protein_snapshot, created_at
  FROM JournalEntries
`;

// ─── GET / — entries for a date ───────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const date = ((req.query.date as string) || todayStr()).trim();

  db.all(
    `${SELECT_ENTRY_SQL} WHERE date = ? ORDER BY logged_at ASC`,
    [date],
    (err, rows) => {
      if (err) {
        console.error('[error] GET /api/journal', err);
        return res.status(500).json({ error: 'Failed to fetch journal entries' });
      }
      res.json(rows || []);
    }
  );
});

// ─── GET /today-summary ───────────────────────────────────────────────────────

router.get('/today-summary', (req: Request, res: Response) => {
  const date = ((req.query.date as string) || todayStr()).trim();

  db.get(
    `SELECT COALESCE(SUM(calories_snapshot), 0) AS calories,
            COALESCE(SUM(protein_snapshot), 0)  AS protein
     FROM JournalEntries WHERE date = ?`,
    [date],
    (err, summary: { calories: number; protein: number } | undefined) => {
      if (err) {
        console.error('[error] GET /api/journal/today-summary', err);
        return res.status(500).json({ error: 'Failed to fetch today summary' });
      }

      db.all(
        `${SELECT_ENTRY_SQL} WHERE date = ? ORDER BY logged_at ASC`,
        [date],
        (err2, entries) => {
          if (err2) {
            console.error('[error] GET /api/journal/today-summary entries', err2);
            return res.status(500).json({ error: 'Failed to fetch today entries' });
          }
          res.json({
            date,
            calories: summary?.calories ?? 0,
            protein: summary?.protein ?? 0,
            entries: entries || [],
          });
        }
      );
    }
  );
});

// ─── GET /summary?date= ───────────────────────────────────────────────────────

router.get('/summary', (req: Request, res: Response) => {
  const date = ((req.query.date as string) || todayStr()).trim();

  db.get(
    `SELECT COALESCE(SUM(calories_snapshot), 0) AS calories,
            COALESCE(SUM(protein_snapshot), 0)  AS protein
     FROM JournalEntries WHERE date = ?`,
    [date],
    (err, summary: { calories: number; protein: number } | undefined) => {
      if (err) {
        console.error('[error] GET /api/journal/summary', err);
        return res.status(500).json({ error: 'Failed to fetch journal summary' });
      }
      res.json({
        date,
        calories: summary?.calories ?? 0,
        protein: summary?.protein ?? 0,
      });
    }
  );
});

// ─── POST / — add journal entry ───────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const {
    date,
    meal_type,
    logged_at,
    food_id,
    food_name_snapshot,
    servings,
    calories_snapshot,
    protein_snapshot,
  } = req.body || {};

  if (!date || !meal_type || !food_name_snapshot || servings === undefined || calories_snapshot === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: date, meal_type, food_name_snapshot, servings, calories_snapshot',
    });
  }

  const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  if (!validMealTypes.includes(meal_type)) {
    return res.status(400).json({ error: 'meal_type must be one of: breakfast, lunch, dinner, snack' });
  }

  const servingsNum = toNumber(servings);
  if (servingsNum === null || servingsNum <= 0) return res.status(400).json({ error: 'Invalid servings' });

  const caloriesNum = toNumber(calories_snapshot, 0)!;
  const proteinNum = toNumber(protein_snapshot, null);
  const loggedAt = logged_at || new Date().toISOString();
  const foodIdVal = food_id ? Number(food_id) : null;

  db.run(
    `INSERT INTO JournalEntries (date, meal_type, logged_at, food_id, food_name_snapshot, servings, calories_snapshot, protein_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, meal_type, loggedAt, foodIdVal, food_name_snapshot, servingsNum, caloriesNum, proteinNum],
    function (this: { lastID: number }, err) {
      if (err) {
        console.error('[error] POST /api/journal', err);
        return res.status(500).json({ error: 'Failed to add journal entry' });
      }
      const newId = this.lastID;
      db.get(
        `${SELECT_ENTRY_SQL} WHERE id = ?`,
        [newId],
        (err2, entry) => {
          if (err2) {
            console.error('[error] POST /api/journal fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch created entry' });
          }
          try { getIo().emit('journal-entry-created', entry); } catch (_) {}
          res.status(201).json(entry);
        }
      );
    }
  );
});

// ─── PUT /:id — update entry ──────────────────────────────────────────────────

router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const { servings, meal_type, logged_at, calories_snapshot, protein_snapshot } = req.body || {};

  const fields: string[] = [];
  const params: unknown[] = [];

  if (servings !== undefined) {
    const v = toNumber(servings);
    if (v === null || v <= 0) return res.status(400).json({ error: 'Invalid servings' });
    fields.push('servings = ?'); params.push(v);
  }
  if (meal_type !== undefined) {
    const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validMealTypes.includes(meal_type)) return res.status(400).json({ error: 'Invalid meal_type' });
    fields.push('meal_type = ?'); params.push(meal_type);
  }
  if (logged_at !== undefined) { fields.push('logged_at = ?'); params.push(logged_at); }
  if (calories_snapshot !== undefined) {
    const v = toNumber(calories_snapshot, 0);
    fields.push('calories_snapshot = ?'); params.push(v);
  }
  if (protein_snapshot !== undefined) {
    const v = toNumber(protein_snapshot, null);
    fields.push('protein_snapshot = ?'); params.push(v);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.run(
    `UPDATE JournalEntries SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/journal/:id', err);
        return res.status(500).json({ error: 'Failed to update journal entry' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Journal entry not found' });

      db.get(
        `${SELECT_ENTRY_SQL} WHERE id = ?`,
        [id],
        (err2, entry) => {
          if (err2) {
            console.error('[error] PUT /api/journal/:id fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch updated entry' });
          }
          try { getIo().emit('journal-entry-updated', entry); } catch (_) {}
          res.json(entry);
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
    'DELETE FROM JournalEntries WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/journal/:id', err);
        return res.status(500).json({ error: 'Failed to delete journal entry' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Journal entry not found' });
      try { getIo().emit('journal-entry-deleted', { id }); } catch (_) {}
      res.status(204).send();
    }
  );
});

export default router;
