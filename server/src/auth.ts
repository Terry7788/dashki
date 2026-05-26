// Auth utilities for mobile-app sign-in (DSHKI-53, Phase 1).
//
// Additive — preserves backwards-compatible behavior for the existing
// unauthenticated web client by defaulting `req.user.id = 1` when no
// Bearer token is present. Terry's existing data lives under user_id = 1.
//
// In production:
//   - JWT secret comes from process.env.JWT_SECRET (REQUIRED in prod, falls
//     back to a dev-only key locally so devs don't have to set it up).
//   - Tokens are signed with HS256, 30-day TTL.
//   - Password hashing is bcrypt with cost 12.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { logger } from './logger';

// ─── Constants ────────────────────────────────────────────────────────────

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET env var is required in production');
      })()
    : 'dashki-dev-only-jwt-secret-do-not-use-in-production');

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const BCRYPT_COST = 12;

// The legacy "Terry" user — his existing data lives under user_id = 1.
// All unauthenticated requests (no Bearer token) are treated as this user
// so the web app keeps working without sign-in.
export const DEFAULT_USER_ID = 1;

// ─── Password hashing ─────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT ──────────────────────────────────────────────────────────────────

interface TokenPayload {
  user_id: number;
}

export function generateToken(userId: number): {
  token: string;
  expiresAt: Date;
} {
  const token = jwt.sign({ user_id: userId } as TokenPayload, JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  return { token, expiresAt };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

// ─── Express middleware ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: number;
        is_authenticated: boolean; // false when falling back to DEFAULT_USER_ID
      };
    }
  }
}

/**
 * Extract a Bearer token from the request, verify it, and attach req.user.
 *
 * Behavior:
 *   - No Authorization header → req.user = { id: 1, is_authenticated: false }
 *     (legacy compatibility — Terry's existing usage from web)
 *   - Valid Bearer token → req.user = { id: <decoded>, is_authenticated: true }
 *   - Invalid Bearer token → 401 (caller sent something deliberately)
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header) {
    req.user = { id: DEFAULT_USER_ID, is_authenticated: false };
    return next();
  }

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({
      error: 'Invalid Authorization header — expected "Bearer <token>"',
    });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = { id: payload.user_id, is_authenticated: true };
  next();
}

/**
 * Stricter guard for routes that require a real signed-in user (e.g. delete
 * account, change password). Returns 401 if the request is the legacy
 * unauthenticated user.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.is_authenticated) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

// ─── DB helpers (Promise-wrapped sqlite3) ─────────────────────────────────

export function dbGet<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row: T | undefined) => {
      if (err) reject(err);
      else resolve(row ?? null);
    });
  });
}

export function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function dbRun(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (this: { lastID: number; changes: number }, err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ─── User row type (canonical) ────────────────────────────────────────────

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
  subscription_status: 'free' | 'premium' | 'lifetime';
  onboarding_completed_at: string | null;
}

export interface SessionRow {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

// Public-safe view (strips password_hash for API responses).
export function publicUser(row: UserRow): Omit<UserRow, 'password_hash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, ...rest } = row;
  return rest;
}

// ─── Sign-in with Apple — verification stub ───────────────────────────────
//
// Real implementation requires:
//   1. Fetching Apple's public keys from https://appleid.apple.com/auth/keys
//   2. Verifying the identity token's signature with the matching key
//   3. Checking the audience (your bundle ID), issuer, expiry, nonce
//
// We stub it here so the routes can be wired now. When Terry's Apple
// Developer account is active (DSHKI-50), drop the real verifier in.
// Until then, this throws so accidental prod use is loud.
export async function verifyAppleIdentityToken(
  identityToken: string,
  expectedAudience: string,
): Promise<{ sub: string; email?: string }> {
  // TODO_CREDENTIALS: implement real Apple JWT verification once
  // Apple Developer Program enrollment (DSHKI-50) is active.
  // For dev, decode the token without signature verification just to
  // confirm the shape is roughly correct (DO NOT TRUST in production).
  if (process.env.NODE_ENV === 'production') {
    void identityToken;
    void expectedAudience;
    throw new Error(
      'Sign in with Apple verification not yet implemented — see DSHKI-50',
    );
  }
  try {
    const decoded = jwt.decode(identityToken) as
      | { sub?: string; email?: string }
      | null;
    if (!decoded || !decoded.sub) {
      throw new Error('Invalid Apple identity token shape');
    }
    logger.warn(
      '[auth] DEV ONLY — Apple identity token accepted without signature verification',
    );
    return { sub: decoded.sub, email: decoded.email };
  } catch (err) {
    throw new Error(
      `Could not decode Apple identity token: ${(err as Error).message}`,
    );
  }
}
