import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /sessions & GET / — list sessions ────────────────────────────────────

function listSessions(req: Request, res: Response): void {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;

  const sql = `SELECT gs.id, gs.date, gs.name, gs.notes, gs.status, gs.created_at,
       COUNT(ge.id) AS exercise_count
     FROM GymSessions gs
     LEFT JOIN GymExercises ge ON gs.id = ge.session_id
     GROUP BY gs.id
     ORDER BY gs.date DESC, gs.created_at DESC${limit ? ' LIMIT ?' : ''}`;

  const params: unknown[] = limit ? [limit] : [];

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[error] GET /api/gym/sessions', err);
      return res.status(500).json({ error: 'Failed to fetch gym sessions' });
    }
    res.json(rows || []);
  });
}

router.get('/', listSessions);
router.get('/sessions', listSessions);

// ─── GET /sessions/:id — single session with exercises + sets ─────────────────

function getSession(req: Request, res: Response): void {
  const id = toInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  db.get(
    `SELECT id, date, name, notes, status, created_at FROM GymSessions WHERE id = ?`,
    [id],
    (err, session) => {
      if (err) {
        console.error('[error] GET /api/gym/sessions/:id', err);
        return res.status(500).json({ error: 'Failed to fetch gym session' });
      }
      if (!session) return res.status(404).json({ error: 'Session not found' });

      db.all(
        `SELECT id, session_id, name, order_index FROM GymExercises WHERE session_id = ? ORDER BY order_index ASC, id ASC`,
        [id],
        (err2, exercises) => {
          if (err2) {
            console.error('[error] GET /api/gym/sessions/:id exercises', err2);
            return res.status(500).json({ error: 'Failed to fetch exercises' });
          }

          const exList = (exercises || []) as Record<string, unknown>[];

          if (exList.length === 0) {
            return res.json({ ...(session as object), exercises: [] });
          }

          // Fetch sets for each exercise
          let completed = 0;
          const exercisesWithSets: Record<string, unknown>[] = exList.map((ex) => ({ ...ex, sets: [] }));

          exList.forEach((ex, idx) => {
            db.all(
              `SELECT id, exercise_id, set_number, reps, weight_kg FROM GymSets WHERE exercise_id = ? ORDER BY set_number ASC`,
              [ex.id],
              (err3, sets) => {
                if (!err3) {
                  exercisesWithSets[idx].sets = sets || [];
                }
                completed++;
                if (completed === exList.length) {
                  res.json({ ...(session as object), exercises: exercisesWithSets });
                }
              }
            );
          });
        }
      );
    }
  );
}

router.get('/sessions/:id', getSession);

// ─── POST /sessions & POST / — create session ────────────────────────────────

function createSession(req: Request, res: Response): void {
  const { date, name, notes } = req.body || {};

  if (!date) {
    res.status(400).json({ error: 'Missing required field: date' });
    return;
  }

  db.run(
    `INSERT INTO GymSessions (date, name, notes) VALUES (?, ?, ?)`,
    [date, name ?? null, notes ?? null],
    function (this: { lastID: number }, err) {
      if (err) {
        console.error('[error] POST /api/gym/sessions', err);
        return res.status(500).json({ error: 'Failed to create gym session' });
      }
      const newId = this.lastID;
      db.get(
        `SELECT id, date, name, notes, status, created_at FROM GymSessions WHERE id = ?`,
        [newId],
        (err2, session) => {
          if (err2) {
            console.error('[error] POST /api/gym/sessions fetch', err2);
            return res.status(500).json({ error: 'Failed to fetch created session' });
          }
          res.status(201).json(session);
        }
      );
    }
  );
}

router.post('/', createSession);
router.post('/sessions', createSession);

// ─── PUT /sessions/:id & PUT /:id — update session ───────────────────────────

function updateSession(req: Request, res: Response): void {
  const id = toInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const { name, notes, date, status } = req.body || {};
  const fields: string[] = [];
  const params: unknown[] = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(notes); }
  if (date !== undefined) { fields.push('date = ?'); params.push(date); }
  if (status !== undefined) {
    if (status !== 'active' && status !== 'completed') {
      res.status(400).json({ error: "Invalid status (must be 'active' or 'completed')" });
      return;
    }
    fields.push('status = ?');
    params.push(status);
  }

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  params.push(id);
  db.run(
    `UPDATE GymSessions SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/gym/sessions/:id', err);
        return res.status(500).json({ error: 'Failed to update gym session' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Session not found' });

      db.get(
        `SELECT id, date, name, notes, status, created_at FROM GymSessions WHERE id = ?`,
        [id],
        (err2, session) => {
          if (err2) {
            return res.status(500).json({ error: 'Failed to fetch updated session' });
          }
          res.json(session);
        }
      );
    }
  );
}

router.put('/sessions/:id', updateSession);
router.put('/:id(\\d+)', updateSession);

// ─── PATCH /sessions/:id — partial update (e.g. complete workout) ───────────
router.patch('/sessions/:id', updateSession);

// ─── DELETE /sessions/:id & DELETE /:id — delete session ─────────────────────

function deleteSession(req: Request, res: Response): void {
  const id = toInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  db.run(
    'DELETE FROM GymSessions WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/gym/sessions/:id', err);
        return res.status(500).json({ error: 'Failed to delete gym session' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Session not found' });
      res.status(204).send();
    }
  );
}

router.delete('/sessions/:id', deleteSession);
router.delete('/:id(\\d+)', deleteSession);

// ═══════════════════════════════════════════════════════════════════════════════
// EXERCISES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /sessions/:sessionId/exercises & POST /:sessionId/exercises ─────────

function addExercise(req: Request, res: Response): void {
  const sessionId = toInt(req.params.sessionId);
  if (sessionId === null) {
    res.status(400).json({ error: 'Invalid sessionId' });
    return;
  }

  db.get('SELECT id FROM GymSessions WHERE id = ?', [sessionId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { name, order_index } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const orderIndex = toNumber(order_index, 0)!;

    db.run(
      `INSERT INTO GymExercises (session_id, name, order_index) VALUES (?, ?, ?)`,
      [sessionId, name, orderIndex],
      function (this: { lastID: number }, err2) {
        if (err2) {
          console.error('[error] POST /api/gym exercises', err2);
          return res.status(500).json({ error: 'Failed to add exercise' });
        }
        const newId = this.lastID;
        db.get(
          `SELECT id, session_id, name, order_index FROM GymExercises WHERE id = ?`,
          [newId],
          (err3, exercise) => {
            if (err3) {
              return res.status(500).json({ error: 'Failed to fetch created exercise' });
            }
            res.status(201).json(exercise);
          }
        );
      }
    );
  });
}

router.post('/sessions/:sessionId/exercises', addExercise);
router.post('/:sessionId(\\d+)/exercises', addExercise);

// ─── PUT /exercises/:id ───────────────────────────────────────────────────────

router.put('/exercises/:id', (req: Request, res: Response) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const { name, order_index } = req.body || {};
  const fields: string[] = [];
  const params: unknown[] = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (order_index !== undefined) {
    const v = toNumber(order_index, 0);
    fields.push('order_index = ?'); params.push(v);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.run(
    `UPDATE GymExercises SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/gym/exercises/:id', err);
        return res.status(500).json({ error: 'Failed to update exercise' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Exercise not found' });

      db.get(
        `SELECT id, session_id, name, order_index FROM GymExercises WHERE id = ?`,
        [id],
        (err2, exercise) => {
          if (err2) return res.status(500).json({ error: 'Failed to fetch updated exercise' });
          res.json(exercise);
        }
      );
    }
  );
});

// ─── DELETE /exercises/:id ────────────────────────────────────────────────────

router.delete('/exercises/:id', (req: Request, res: Response) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM GymExercises WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/gym/exercises/:id', err);
        return res.status(500).json({ error: 'Failed to delete exercise' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Exercise not found' });
      res.status(204).send();
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /exercises/:exerciseId/sets ─────────────────────────────────────────

router.post('/exercises/:exerciseId/sets', (req: Request, res: Response) => {
  const exerciseId = toInt(req.params.exerciseId);
  if (exerciseId === null) return res.status(400).json({ error: 'Invalid exerciseId' });

  db.get('SELECT id FROM GymExercises WHERE id = ?', [exerciseId], (err, exercise) => {
    if (err || !exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    const { set_number, reps, weight_kg } = req.body || {};
    if (set_number === undefined) {
      return res.status(400).json({ error: 'Missing required field: set_number' });
    }

    const setNum = toInt(set_number);
    const repsNum = reps !== undefined ? toInt(reps) : null;
    const weightNum = toNumber(weight_kg, null);

    if (setNum === null) return res.status(400).json({ error: 'Invalid set_number' });

    db.run(
      `INSERT INTO GymSets (exercise_id, set_number, reps, weight_kg) VALUES (?, ?, ?, ?)`,
      [exerciseId, setNum, repsNum, weightNum],
      function (this: { lastID: number }, err2) {
        if (err2) {
          console.error('[error] POST /api/gym/exercises/:exerciseId/sets', err2);
          return res.status(500).json({ error: 'Failed to add set' });
        }
        const newId = this.lastID;
        db.get(
          `SELECT id, exercise_id, set_number, reps, weight_kg FROM GymSets WHERE id = ?`,
          [newId],
          (err3, set) => {
            if (err3) return res.status(500).json({ error: 'Failed to fetch created set' });
            res.status(201).json(set);
          }
        );
      }
    );
  });
});

// ─── PUT /sets/:id ────────────────────────────────────────────────────────────

router.put('/sets/:id', (req: Request, res: Response) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const { set_number, reps, weight_kg } = req.body || {};
  const fields: string[] = [];
  const params: unknown[] = [];

  if (set_number !== undefined) {
    const v = toInt(set_number);
    if (v === null) return res.status(400).json({ error: 'Invalid set_number' });
    fields.push('set_number = ?'); params.push(v);
  }
  if (reps !== undefined) {
    const v = toInt(reps);
    if (v === null) return res.status(400).json({ error: 'Invalid reps' });
    fields.push('reps = ?'); params.push(v);
  }
  if (weight_kg !== undefined) {
    const v = toNumber(weight_kg, null);
    fields.push('weight_kg = ?'); params.push(v);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.run(
    `UPDATE GymSets SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/gym/sets/:id', err);
        return res.status(500).json({ error: 'Failed to update set' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Set not found' });

      db.get(
        `SELECT id, exercise_id, set_number, reps, weight_kg FROM GymSets WHERE id = ?`,
        [id],
        (err2, set) => {
          if (err2) return res.status(500).json({ error: 'Failed to fetch updated set' });
          res.json(set);
        }
      );
    }
  );
});

// ─── DELETE /sets/:id ─────────────────────────────────────────────────────────

router.delete('/sets/:id', (req: Request, res: Response) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    'DELETE FROM GymSets WHERE id = ?',
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/gym/sets/:id', err);
        return res.status(500).json({ error: 'Failed to delete set' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Set not found' });
      res.status(204).send();
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKOUT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

type TemplateExerciseRow = {
  id: number;
  template_id: number;
  exercise_name: string;
  order_index: number;
  default_sets: number;
  default_reps: number;
};

type TemplateRow = {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
};

// ─── GET /templates — list all templates with exercises ───────────────────────

router.get('/templates', (_req: Request, res: Response) => {
  db.all(`SELECT * FROM WorkoutTemplates ORDER BY name ASC`, [], (err, templateRows) => {
    if (err) {
      console.error('[error] GET /api/gym/templates', err);
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }

    const templates = (templateRows || []) as TemplateRow[];
    if (templates.length === 0) return res.json([]);

    db.all(
      `SELECT * FROM WorkoutTemplateExercises ORDER BY template_id ASC, order_index ASC`,
      [],
      (err2, exRows) => {
        if (err2) {
          console.error('[error] GET /api/gym/templates exercises', err2);
          return res.status(500).json({ error: 'Failed to fetch template exercises' });
        }

        const exercises = (exRows || []) as TemplateExerciseRow[];
        const result = templates.map((t) => ({
          ...t,
          exercises: exercises.filter((e) => e.template_id === t.id),
        }));
        res.json(result);
      }
    );
  });
});

// ─── POST /templates — create template with exercises ─────────────────────────

router.post('/templates', (req: Request, res: Response) => {
  const { name, notes, exercises } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing required field: name' });
  }

  const exList: Array<{ name: string; sets?: number; reps?: number }> = Array.isArray(exercises) ? exercises : [];

  db.run(
    `INSERT INTO WorkoutTemplates (name, notes) VALUES (?, ?)`,
    [name.trim(), notes ?? null],
    function (this: { lastID: number }, err) {
      if (err) {
        console.error('[error] POST /api/gym/templates', err);
        return res.status(500).json({ error: 'Failed to create template' });
      }

      const templateId = this.lastID;

      if (exList.length === 0) {
        return db.get(
          `SELECT * FROM WorkoutTemplates WHERE id = ?`,
          [templateId],
          (err2, row) => {
            if (err2) return res.status(500).json({ error: 'Failed to fetch template' });
            res.status(201).json({ ...(row as object), exercises: [] });
          }
        );
      }

      let pending = exList.length;
      let hasError = false;

      exList.forEach((ex, idx) => {
        db.run(
          `INSERT INTO WorkoutTemplateExercises (template_id, exercise_name, order_index, default_sets, default_reps)
           VALUES (?, ?, ?, ?, ?)`,
          [templateId, ex.name || 'Exercise', idx, ex.sets ?? 3, ex.reps ?? 10],
          (exErr) => {
            if (exErr && !hasError) {
              hasError = true;
              console.error('[error] POST /api/gym/templates exercise insert', exErr);
            }
            pending--;
            if (pending === 0) {
              db.get(
                `SELECT * FROM WorkoutTemplates WHERE id = ?`,
                [templateId],
                (err2, row) => {
                  if (err2) return res.status(500).json({ error: 'Failed to fetch template' });
                  db.all(
                    `SELECT * FROM WorkoutTemplateExercises WHERE template_id = ? ORDER BY order_index ASC`,
                    [templateId],
                    (err3, exRows) => {
                      if (err3) return res.status(500).json({ error: 'Failed to fetch exercises' });
                      res.status(201).json({ ...(row as object), exercises: exRows || [] });
                    }
                  );
                }
              );
            }
          }
        );
      });
    }
  );
});

// ─── PUT /templates/:id — update template + replace exercises ─────────────────

router.put('/templates/:id', (req: Request, res: Response) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const { name, notes, exercises } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing required field: name' });
  }

  const exList: Array<{ name: string; sets?: number; reps?: number }> = Array.isArray(exercises) ? exercises : [];

  db.run(
    `UPDATE WorkoutTemplates SET name = ?, notes = ? WHERE id = ?`,
    [name.trim(), notes ?? null, id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] PUT /api/gym/templates/:id', err);
        return res.status(500).json({ error: 'Failed to update template' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Template not found' });

      // Replace all exercises
      db.run(`DELETE FROM WorkoutTemplateExercises WHERE template_id = ?`, [id], (delErr) => {
        if (delErr) {
          console.error('[error] PUT /api/gym/templates/:id delete exercises', delErr);
          return res.status(500).json({ error: 'Failed to update exercises' });
        }

        if (exList.length === 0) {
          return db.get(`SELECT * FROM WorkoutTemplates WHERE id = ?`, [id], (err2, row) => {
            if (err2) return res.status(500).json({ error: 'Failed to fetch template' });
            res.json({ ...(row as object), exercises: [] });
          });
        }

        let pending = exList.length;

        exList.forEach((ex, idx) => {
          db.run(
            `INSERT INTO WorkoutTemplateExercises (template_id, exercise_name, order_index, default_sets, default_reps)
             VALUES (?, ?, ?, ?, ?)`,
            [id, ex.name || 'Exercise', idx, ex.sets ?? 3, ex.reps ?? 10],
            (exErr) => {
              if (exErr) console.error('[error] PUT /api/gym/templates exercise insert', exErr);
              pending--;
              if (pending === 0) {
                db.get(`SELECT * FROM WorkoutTemplates WHERE id = ?`, [id], (err2, row) => {
                  if (err2) return res.status(500).json({ error: 'Failed to fetch template' });
                  db.all(
                    `SELECT * FROM WorkoutTemplateExercises WHERE template_id = ? ORDER BY order_index ASC`,
                    [id],
                    (err3, exRows) => {
                      if (err3) return res.status(500).json({ error: 'Failed to fetch exercises' });
                      res.json({ ...(row as object), exercises: exRows || [] });
                    }
                  );
                });
              }
            }
          );
        });
      });
    }
  );
});

// ─── DELETE /templates/:id ────────────────────────────────────────────────────

router.delete('/templates/:id', (req: Request, res: Response) => {
  const id = toInt(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  db.run(
    `DELETE FROM WorkoutTemplates WHERE id = ?`,
    [id],
    function (this: { changes: number }, err) {
      if (err) {
        console.error('[error] DELETE /api/gym/templates/:id', err);
        return res.status(500).json({ error: 'Failed to delete template' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Template not found' });
      res.status(204).send();
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTINE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /routine/next — next non-Rest workout day ────────────────────────────

router.get('/routine/next', (req: Request, res: Response) => {
  db.all(
    `SELECT gr.*, wt.name AS template_name
     FROM GymRoutine gr
     LEFT JOIN WorkoutTemplates wt ON gr.template_id = wt.id
     WHERE gr.workout_name != 'Rest'
     ORDER BY gr.day_of_week ASC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[error] GET /api/gym/routine/next', err);
        return res.status(500).json({ error: 'Failed to fetch routine' });
      }

      const routineRows = (rows || []) as {
        id: number;
        day_of_week: number;
        workout_name: string;
        notes: string | null;
        template_id: number | null;
        template_name: string | null;
      }[];

      if (routineRows.length === 0) {
        return res.json(null);
      }

      const now = new Date();
      const todayDow = now.getDay(); // 0 = Sun

      // Check today+1 through today+7
      for (let i = 1; i <= 7; i++) {
        const checkDow = (todayDow + i) % 7;
        const entry = routineRows.find((r) => r.day_of_week === checkDow);
        if (entry) {
          const d = new Date(now);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().slice(0, 10);
          return res.json({
            day_of_week: entry.day_of_week,
            workout_name: entry.workout_name,
            notes: entry.notes,
            date: dateStr,
            template_id: entry.template_id ?? null,
            template_name: entry.template_name ?? null,
          });
        }
      }

      res.json(null);
    }
  );
});

// ─── GET /routine — all 7 days with gaps filled as Rest ──────────────────────

router.get('/routine', (_req: Request, res: Response) => {
  db.all(
    `SELECT gr.*, wt.name AS template_name
     FROM GymRoutine gr
     LEFT JOIN WorkoutTemplates wt ON gr.template_id = wt.id
     ORDER BY gr.day_of_week ASC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[error] GET /api/gym/routine', err);
        return res.status(500).json({ error: 'Failed to fetch routine' });
      }

      const routineRows = (rows || []) as {
        id: number;
        day_of_week: number;
        workout_name: string;
        notes: string | null;
        template_id: number | null;
        template_name: string | null;
      }[];

      const days = Array.from({ length: 7 }, (_, i) =>
        routineRows.find((r) => r.day_of_week === i) ||
        { id: null, day_of_week: i, workout_name: 'Rest', notes: null, template_id: null, template_name: null }
      );

      res.json(days);
    }
  );
});

// ─── PUT /routine/:dayOfWeek — upsert a day ───────────────────────────────────

router.put('/routine/:dayOfWeek', (req: Request, res: Response) => {
  const dayOfWeek = toInt(req.params.dayOfWeek);
  if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ error: 'Invalid dayOfWeek (must be 0-6)' });
  }

  const { template_id, notes, workout_name } = req.body || {};

  // If template_id provided, look up the template name for workout_name
  if (template_id !== null && template_id !== undefined) {
    const tid = toInt(template_id);
    if (tid === null) return res.status(400).json({ error: 'Invalid template_id' });

    db.get(`SELECT id, name FROM WorkoutTemplates WHERE id = ?`, [tid], (err, tmpl) => {
      if (err || !tmpl) return res.status(404).json({ error: 'Template not found' });
      const tmplRow = tmpl as { id: number; name: string };

      db.run(
        `INSERT INTO GymRoutine (day_of_week, workout_name, notes, template_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(day_of_week) DO UPDATE SET workout_name = excluded.workout_name, notes = excluded.notes, template_id = excluded.template_id`,
        [dayOfWeek, tmplRow.name, notes ?? null, tid],
        function (err2) {
          if (err2) {
            console.error('[error] PUT /api/gym/routine/:dayOfWeek (template)', err2);
            return res.status(500).json({ error: 'Failed to upsert routine day' });
          }
          db.get(
            `SELECT gr.*, wt.name AS template_name FROM GymRoutine gr LEFT JOIN WorkoutTemplates wt ON gr.template_id = wt.id WHERE gr.day_of_week = ?`,
            [dayOfWeek],
            (err3, row) => {
              if (err3) return res.status(500).json({ error: 'Failed to fetch updated routine day' });
              res.json(row);
            }
          );
        }
      );
    });
  } else {
    // Rest day or legacy text
    const name = (workout_name && typeof workout_name === 'string') ? workout_name.trim() : 'Rest';

    db.run(
      `INSERT INTO GymRoutine (day_of_week, workout_name, notes, template_id)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(day_of_week) DO UPDATE SET workout_name = excluded.workout_name, notes = excluded.notes, template_id = NULL`,
      [dayOfWeek, name, notes ?? null],
      function (err) {
        if (err) {
          console.error('[error] PUT /api/gym/routine/:dayOfWeek', err);
          return res.status(500).json({ error: 'Failed to upsert routine day' });
        }
        db.get(
          `SELECT gr.*, wt.name AS template_name FROM GymRoutine gr LEFT JOIN WorkoutTemplates wt ON gr.template_id = wt.id WHERE gr.day_of_week = ?`,
          [dayOfWeek],
          (err2, row) => {
            if (err2) return res.status(500).json({ error: 'Failed to fetch updated routine day' });
            res.json(row);
          }
        );
      }
    );
  }
});

// ─── POST /sessions/from-template/:templateId — create session from template ──

router.post('/sessions/from-template/:templateId', (req: Request, res: Response) => {
  const templateId = toInt(req.params.templateId);
  if (templateId === null) return res.status(400).json({ error: 'Invalid templateId' });

  db.get(
    `SELECT * FROM WorkoutTemplates WHERE id = ?`,
    [templateId],
    (err, tmpl) => {
      if (err || !tmpl) return res.status(404).json({ error: 'Template not found' });
      const tmplRow = tmpl as TemplateRow;

      const date = (req.body?.date as string) || new Date().toISOString().slice(0, 10);

      db.run(
        `INSERT INTO GymSessions (date, name, notes) VALUES (?, ?, ?)`,
        [date, tmplRow.name, tmplRow.notes ?? null],
        function (this: { lastID: number }, err2) {
          if (err2) {
            console.error('[error] POST /api/gym/sessions/from-template', err2);
            return res.status(500).json({ error: 'Failed to create session' });
          }

          const sessionId = this.lastID;

          db.all(
            `SELECT * FROM WorkoutTemplateExercises WHERE template_id = ? ORDER BY order_index ASC`,
            [templateId],
            (err3, exRows) => {
              if (err3) {
                console.error('[error] POST /api/gym/sessions/from-template exercises', err3);
                return res.status(500).json({ error: 'Failed to fetch template exercises' });
              }

              const templateExercises = (exRows || []) as TemplateExerciseRow[];

              if (templateExercises.length === 0) {
                return db.get(
                  `SELECT id, date, name, notes, status, created_at FROM GymSessions WHERE id = ?`,
                  [sessionId],
                  (err4, session) => {
                    if (err4) return res.status(500).json({ error: 'Failed to fetch session' });
                    res.status(201).json({ ...(session as object), exercises: [] });
                  }
                );
              }

              let pending = templateExercises.length;
              const insertedExercises: Array<{ id: number; name: string; order_index: number; sets: unknown[] }> = [];

              templateExercises.forEach((tex, idx) => {
                db.run(
                  `INSERT INTO GymExercises (session_id, name, order_index) VALUES (?, ?, ?)`,
                  [sessionId, tex.exercise_name, idx],
                  function (this: { lastID: number }, exErr) {
                    if (exErr) {
                      console.error('[error] from-template insert exercise', exErr);
                      pending--;
                      if (pending === 0) finalize();
                      return;
                    }

                    const exerciseId = this.lastID;
                    const sets = tex.default_sets ?? 3;
                    const reps = tex.default_reps ?? 10;

                    // Pre-create empty sets (0 weight) based on default_sets
                    let setsPending = sets;
                    const createdSets: unknown[] = [];

                    if (sets === 0) {
                      insertedExercises.push({ id: exerciseId, name: tex.exercise_name, order_index: idx, sets: [] });
                      pending--;
                      if (pending === 0) finalize();
                      return;
                    }

                    for (let s = 1; s <= sets; s++) {
                      db.run(
                        `INSERT INTO GymSets (exercise_id, set_number, reps, weight_kg) VALUES (?, ?, ?, ?)`,
                        [exerciseId, s, reps, 0],
                        function (this: { lastID: number }, setErr) {
                          if (!setErr) {
                            createdSets.push({ id: this.lastID, exercise_id: exerciseId, set_number: s, reps, weight_kg: 0 });
                          }
                          setsPending--;
                          if (setsPending === 0) {
                            insertedExercises.push({ id: exerciseId, name: tex.exercise_name, order_index: idx, sets: createdSets });
                            pending--;
                            if (pending === 0) finalize();
                          }
                        }
                      );
                    }
                  }
                );
              });

              function finalize() {
                db.get(
                  `SELECT id, date, name, notes, status, created_at FROM GymSessions WHERE id = ?`,
                  [sessionId],
                  (err4, session) => {
                    if (err4) return res.status(500).json({ error: 'Failed to fetch session' });
                    insertedExercises.sort((a, b) => a.order_index - b.order_index);
                    res.status(201).json({ ...(session as object), exercises: insertedExercises });
                  }
                );
              }
            }
          );
        }
      );
    }
  );
});

// ─── POST /routine/sync — sync next 28 days to Todos ─────────────────────────

router.post('/routine/sync', (_req: Request, res: Response) => {
  db.all(
    `SELECT * FROM GymRoutine WHERE workout_name != 'Rest'`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[error] POST /api/gym/routine/sync', err);
        return res.status(500).json({ error: 'Failed to fetch routine' });
      }

      const routineRows = (rows || []) as { id: number; day_of_week: number; workout_name: string; notes: string | null }[];

      if (routineRows.length === 0) {
        return res.json({ synced: 0 });
      }

      const now = new Date();
      const inserts: { title: string; due_date: string }[] = [];

      for (let i = 0; i < 28; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dow = d.getDay();
        const dateStr = d.toISOString().slice(0, 10);
        const entry = routineRows.find((r) => r.day_of_week === dow);
        if (entry) {
          inserts.push({ title: entry.workout_name, due_date: dateStr });
        }
      }

      if (inserts.length === 0) {
        return res.json({ synced: 0 });
      }

      let synced = 0;
      let pending = inserts.length;

      inserts.forEach(({ title, due_date }) => {
        db.run(
          `INSERT INTO Todos (title, due_date, completed)
           SELECT ?, ?, 0
           WHERE NOT EXISTS (SELECT 1 FROM Todos WHERE title = ? AND due_date = ?)`,
          [title, due_date, title, due_date],
          function (this: { changes: number }, err2) {
            if (!err2 && this.changes > 0) synced++;
            pending--;
            if (pending === 0) {
              res.json({ synced });
            }
          }
        );
      });
    }
  );
});

export default router;
