// Auth routes (DSHKI-53, Phase 1).
//
// POST   /api/auth/sign-up
// POST   /api/auth/sign-in
// POST   /api/auth/sign-out
// GET    /api/auth/me                  (requires auth)
// POST   /api/auth/password-reset      (request — sends email if user exists)
// POST   /api/auth/password-reset/confirm
// DELETE /api/auth/account             (requires auth)
// POST   /api/auth/sign-in-with-apple

import { Router } from 'express';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  requireAuth,
  publicUser,
  verifyAppleIdentityToken,
  dbGet,
  dbRun,
  type UserRow,
} from '../auth';
import { logger } from '../logger';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────

function isValidEmail(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  // Pragmatic email check — RFC-perfect parsing is too strict for real users.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255;
}

function isValidPassword(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 8 && s.length <= 128;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  return dbGet<UserRow>('SELECT * FROM Users WHERE email = ? LIMIT 1', [
    email.toLowerCase(),
  ]);
}

async function findUserById(id: number): Promise<UserRow | null> {
  return dbGet<UserRow>('SELECT * FROM Users WHERE id = ? LIMIT 1', [id]);
}

async function createSession(userId: number) {
  const { token, expiresAt } = generateToken(userId);
  await dbRun(
    `INSERT INTO Sessions (user_id, token, expires_at) VALUES (?, ?, ?)`,
    [userId, token, expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

// ─── POST /api/auth/sign-up ───────────────────────────────────────────────

router.post('/sign-up', async (req, res) => {
  try {
    const { email, password, display_name } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'Password must be 8-128 characters',
      });
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      // Don't leak which emails are registered — return generic 409.
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await hashPassword(password);
    const insert = await dbRun(
      `INSERT INTO Users (email, password_hash, display_name, subscription_status)
       VALUES (?, ?, ?, 'free')`,
      [normalizedEmail, passwordHash, display_name || null],
    );

    const user = await findUserById(insert.lastID);
    if (!user) {
      logger.error('[auth] sign-up: user vanished after insert');
      return res.status(500).json({ error: 'Internal error' });
    }

    const { token, expiresAt } = await createSession(user.id);
    res.status(201).json({
      user: publicUser(user),
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error('[auth] sign-up failed', err);
    res.status(500).json({ error: 'Sign-up failed' });
  }
});

// ─── POST /api/auth/sign-in ───────────────────────────────────────────────

router.post('/sign-in', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || typeof password !== 'string') {
      // Same response shape as wrong creds — don't leak whether email exists.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { token, expiresAt } = await createSession(user.id);
    res.json({
      user: publicUser(user),
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error('[auth] sign-in failed', err);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// ─── POST /api/auth/sign-out ──────────────────────────────────────────────

router.post('/sign-out', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (header) {
      const [scheme, token] = header.split(' ');
      if (scheme === 'Bearer' && token) {
        await dbRun(`DELETE FROM Sessions WHERE token = ?`, [token]);
      }
    }
    res.status(204).end();
  } catch (err) {
    logger.error('[auth] sign-out failed', err);
    res.status(500).json({ error: 'Sign-out failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(user));
  } catch (err) {
    logger.error('[auth] /me failed', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── POST /api/auth/password-reset (request) ──────────────────────────────
// Always returns 204 (don't reveal whether an email is registered).
// TODO_CREDENTIALS: when an email service is configured, send the
// reset token via email instead of logging it.

router.post('/password-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(204).end();
    }
    const user = await findUserByEmail(email);
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour
      await dbRun(
        `INSERT INTO PasswordResets (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [user.id, resetToken, expiresAt],
      );
      // TODO_CREDENTIALS: send email here. For now, log the reset URL.
      logger.warn(
        `[auth] DEV ONLY — password reset for ${user.email}: token=${resetToken}`,
      );
    }
    res.status(204).end();
  } catch (err) {
    logger.error('[auth] password-reset request failed', err);
    res.status(204).end(); // Still don't leak.
  }
});

// ─── POST /api/auth/password-reset/confirm ────────────────────────────────

router.post('/password-reset/confirm', async (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    if (typeof token !== 'string' || !isValidPassword(new_password)) {
      return res.status(400).json({ error: 'Invalid token or password' });
    }

    const reset = await dbGet<{ id: number; user_id: number; expires_at: string }>(
      `SELECT id, user_id, expires_at FROM PasswordResets WHERE token = ? AND used_at IS NULL LIMIT 1`,
      [token],
    );

    if (!reset) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    if (new Date(reset.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await hashPassword(new_password);
    await dbRun(`UPDATE Users SET password_hash = ? WHERE id = ?`, [
      passwordHash,
      reset.user_id,
    ]);
    await dbRun(
      `UPDATE PasswordResets SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reset.id],
    );
    // Invalidate all existing sessions for this user.
    await dbRun(`DELETE FROM Sessions WHERE user_id = ?`, [reset.user_id]);

    res.status(204).end();
  } catch (err) {
    logger.error('[auth] password-reset confirm failed', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ─── DELETE /api/auth/account ─────────────────────────────────────────────
// App Store requires in-app account deletion. This deletes the user and
// cascades the deletion to all their data (foods, journal, weight, etc.).

router.delete('/account', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (userId === 1) {
      // Belt-and-suspenders — Terry's data must never be deletable via this route.
      return res.status(403).json({ error: 'Cannot delete the root user' });
    }

    // Hard-delete the user — ON DELETE CASCADE on user_id foreign keys
    // handles the data tables.
    await dbRun(`DELETE FROM Sessions WHERE user_id = ?`, [userId]);
    await dbRun(`DELETE FROM Users WHERE id = ?`, [userId]);
    res.status(204).end();
  } catch (err) {
    logger.error('[auth] delete-account failed', err);
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// ─── POST /api/auth/sign-in-with-apple ────────────────────────────────────

router.post('/sign-in-with-apple', async (req, res) => {
  try {
    const { identity_token, user: appleUserHint } = req.body || {};
    if (typeof identity_token !== 'string') {
      return res.status(400).json({ error: 'identity_token required' });
    }

    const expectedAudience = process.env.APPLE_BUNDLE_ID || 'com.dashki.app';
    const decoded = await verifyAppleIdentityToken(
      identity_token,
      expectedAudience,
    );

    // Apple's `sub` is a stable, user-specific identifier. Use it as the
    // canonical Apple-id link key. If we've seen this sub before, sign that
    // user in; otherwise create a new one.
    const appleSub = decoded.sub;
    let user = await dbGet<UserRow>(
      `SELECT * FROM Users WHERE apple_sub = ? LIMIT 1`,
      [appleSub],
    );

    if (!user) {
      // First-time sign-in. Apple only sends email + name on the FIRST sign-in;
      // subsequent sign-ins won't include them, so the client passes them in
      // appleUserHint on first sign-up.
      const email =
        decoded.email ||
        appleUserHint?.email ||
        `apple-${appleSub.slice(0, 8)}@private.appleid`;
      const displayName =
        [appleUserHint?.given_name, appleUserHint?.family_name]
          .filter(Boolean)
          .join(' ') || null;

      const insert = await dbRun(
        `INSERT INTO Users (email, password_hash, display_name, subscription_status, apple_sub)
         VALUES (?, ?, ?, 'free', ?)`,
        [email.toLowerCase(), '', displayName, appleSub],
      );
      user = await findUserById(insert.lastID);
      if (!user) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
    }

    const { token, expiresAt } = await createSession(user.id);
    res.json({
      user: publicUser(user),
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error('[auth] sign-in-with-apple failed', err);
    res.status(500).json({
      error: 'Sign in with Apple failed',
      message: (err as Error).message,
    });
  }
});

export default router;
