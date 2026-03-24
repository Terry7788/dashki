import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// ─── GET / — list todos ───────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const filter = (req.query.filter as string) || 'all';
  const upcoming = req.query.upcoming === 'true';

  if (upcoming) {
    const today = new Date().toISOString().slice(0, 10);
    db.all(
      `SELECT id, title, completed, due_date, created_at
       FROM Todos
       WHERE due_date >= ? AND completed = 0
       ORDER BY due_date ASC
       LIMIT 3`,
      [today],
      (err, rows) => {
        if (err) {
          console.error('[error] GET /api/todos upcoming', err);
          return res.status(500).json({ error: 'Failed to fetch upcoming todos' });
        }
        res.json(rows || []);
      }
    );
    return;
  }

  let sql = `SELECT id, title, completed, due_date, created_at FROM Todos`;

  if (filter === 'active') sql += ` WHERE completed = 0`;
  else if (filter === 'completed') sql += ` WHERE completed = 1`;

  sql += ` ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at ASC`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('[error] GET /api/todos', err);
      return res.status(500).json({ error: 'Failed to fetch todos' });
    }
    res.json(rows || []);
  });
});

// ─── POST / — create todo ─────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const { title, due_date } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Missing required field: title' });
  }

  db.run(
    `INSERT INTO Todos (title, due_date) VALUES (?, ?)`,
    [title.trim(), due_date ?? null],
    function (this: { lastID: number }, err) {
      if (err) {
        console.error('[error] POST /api/todos', err);
        return res.status(500).json({ error: 'Failed to create todo' });
      }
      const newId = this.lastID;
      db.get(
        `SELECT id, title, completed, due_date, created_at FROM Todos WHERE id = ?`,
        [newId],
        (err2, todo) => {
          if (err2) {
            console.error('[error] POST /api/todos fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch created todo' });
          }
          res.status(201).json(todo);
        }
      );
    }
  );
});

// ─── PUT /:id — update todo ───────────────────────────────────────────────────

router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const { title, completed, due_date } = req.body || {};

  const fields: string[] = [];
  const params: unknown[] = [];

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Invalid title' });
    }
    fields.push('title = ?'); params.push(title.trim());
  }
  if (completed !== undefined) {
    fields.push('completed = ?'); params.push(completed ? 1 : 0);
  }
  if (due_date !== undefined) {
    fields.push('due_date = ?'); params.push(due_date ?? null);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.run(
    `UPDATE Todos SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/todos/:id', err);
        return res.status(500).json({ error: 'Failed to update todo' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Todo not found' });

      db.get(
        `SELECT id, title, completed, due_date, created_at FROM Todos WHERE id = ?`,
        [id],
        (err2, todo) => {
          if (err2) {
            console.error('[error] PUT /api/todos/:id fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch updated todo' });
          }
          res.json(todo);
        }
      );
    }
  );
});

// ─── DELETE /:id — delete todo ────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM Todos WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/todos/:id', err);
        return res.status(500).json({ error: 'Failed to delete todo' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Todo not found' });
      res.status(204).send();
    }
  );
});

export default router;
