import type { Session } from './types';
import { randomBytes } from 'crypto';

// In-memory store. Restart loses sessions — fine for a single-user bot.
// One active session per user; starting a new one supersedes the old.
const byId = new Map<string, Session>();
const activeByUser = new Map<string, string>();

export function newSessionId(): string {
  return randomBytes(4).toString('hex'); // 8 hex chars — easily fits in customId
}

export function startSession(s: Session): void {
  // Drop any prior active session for this user.
  const prevId = activeByUser.get(s.userId);
  if (prevId) byId.delete(prevId);
  byId.set(s.id, s);
  activeByUser.set(s.userId, s.id);
}

export function getSession(id: string): Session | null {
  return byId.get(id) ?? null;
}

export function endSession(id: string): void {
  const s = byId.get(id);
  if (!s) return;
  byId.delete(id);
  if (activeByUser.get(s.userId) === id) {
    activeByUser.delete(s.userId);
  }
}
