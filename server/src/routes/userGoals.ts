// User goals routes (DSHKI-53, Phase 1).
//
// GET   /api/user/goals               — fetch current user's goals
// PATCH /api/user/goals               — partial update
// POST  /api/user/onboarding-complete — mark onboarding wizard finished
//
// All require authentication. The legacy unauthenticated user (Terry,
// user_id = 1) gets a UserGoals row seeded by the migration in db.ts.

import { Router } from 'express';
import { requireAuth, dbGet, dbRun } from '../auth';
import { logger } from '../logger';

const router = Router();

// ─── Row type ─────────────────────────────────────────────────────────────

interface UserGoalsRow {
  user_id: number;
  primary_goal: string | null;
  sex: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  activity_level: string | null;
  pace: string | null;
  kcal_target: number;
  protein_target_g: number;
  fibre_target_g: number;
  steps_target: number;
  enabled_tiles: string | null; // JSON-encoded array
  onboarding_completed_at: string | null;
}

function rowToJson(row: UserGoalsRow) {
  return {
    ...row,
    enabled_tiles: row.enabled_tiles ? JSON.parse(row.enabled_tiles) : [],
  };
}

async function ensureGoalsRow(userId: number) {
  const existing = await dbGet<UserGoalsRow>(
    `SELECT * FROM UserGoals WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  if (existing) return existing;

  await dbRun(`INSERT INTO UserGoals (user_id) VALUES (?)`, [userId]);
  return dbGet<UserGoalsRow>(
    `SELECT * FROM UserGoals WHERE user_id = ? LIMIT 1`,
    [userId],
  ) as Promise<UserGoalsRow>;
}

// ─── GET /api/user/goals ──────────────────────────────────────────────────

router.get('/goals', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const row = await ensureGoalsRow(userId);
    res.json(rowToJson(row));
  } catch (err) {
    logger.error('[userGoals] GET failed', err);
    res.status(500).json({ error: 'Failed to load user goals' });
  }
});

// ─── PATCH /api/user/goals ────────────────────────────────────────────────

const ALLOWED_FIELDS = [
  'primary_goal',
  'sex',
  'age',
  'height_cm',
  'weight_kg',
  'target_weight_kg',
  'activity_level',
  'pace',
  'kcal_target',
  'protein_target_g',
  'fibre_target_g',
  'steps_target',
  'enabled_tiles',
] as const;

router.patch('/goals', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await ensureGoalsRow(userId);

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const field of ALLOWED_FIELDS) {
      if (field in req.body) {
        const value = req.body[field];
        // Special handling: enabled_tiles is stored as JSON.
        if (field === 'enabled_tiles') {
          updates.push(`enabled_tiles = ?`);
          values.push(value == null ? null : JSON.stringify(value));
        } else {
          updates.push(`${field} = ?`);
          values.push(value);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(userId);
    await dbRun(
      `UPDATE UserGoals SET ${updates.join(', ')} WHERE user_id = ?`,
      values,
    );

    const updated = await dbGet<UserGoalsRow>(
      `SELECT * FROM UserGoals WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    res.json(updated ? rowToJson(updated) : {});
  } catch (err) {
    logger.error('[userGoals] PATCH failed', err);
    res.status(500).json({ error: 'Failed to update user goals' });
  }
});

// ─── POST /api/user/onboarding-complete ───────────────────────────────────

router.post('/onboarding-complete', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await ensureGoalsRow(userId);
    await dbRun(
      `UPDATE UserGoals SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [userId],
    );
    // Also stamp the user row so we can check from /api/auth/me.
    await dbRun(
      `UPDATE Users SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userId],
    );
    res.status(204).end();
  } catch (err) {
    logger.error('[userGoals] onboarding-complete failed', err);
    res.status(500).json({ error: 'Failed to mark onboarding complete' });
  }
});

export default router;
