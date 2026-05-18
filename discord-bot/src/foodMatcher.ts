import type { Food } from './types';

// Match a parsed item name against the Foods DB.
//
// Server's GET /api/foods?search= does a SQL LIKE — we get every food whose
// name contains the query as a substring. From those candidates we pick the
// best one via simple scoring (exact match > contains-query > shortest name
// as tiebreak). Returns null if nothing fits.
//
// Why scoring on the client: SQL LIKE returns "Chicken Breast", "Chicken
// Breast Cooked", and "Chicken Liver" for the query "Chicken". We want the
// shortest one as the canonical pick — that's easy in JS, awkward in SQLite.
//
// Plural handling: if the bare query has no hits, retry with the trailing
// "s" stripped. Cheap, covers most cases.

export function pickBestMatch(query: string, candidates: Food[]): Food | null {
  if (candidates.length === 0) return null;
  const q = normalise(query);

  let best: Food | null = null;
  let bestScore = -Infinity;

  for (const food of candidates) {
    const n = normalise(food.name);
    const score = scoreMatch(q, n);
    if (score > bestScore) {
      bestScore = score;
      best = food;
    }
  }

  return bestScore >= 1 ? best : null;
}

function scoreMatch(query: string, candidate: string): number {
  if (query === candidate) return 100;
  if (candidate.startsWith(query)) return 50 - candidate.length;
  if (candidate.includes(query)) return 10 - candidate.length;
  if (query.includes(candidate)) return 5 - candidate.length;
  return 0;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Try the bare query, then a depluralised retry if needed.
export async function findInDb(
  query: string,
  search: (q: string) => Promise<Food[]>
): Promise<Food | null> {
  const direct = await search(query);
  const match = pickBestMatch(query, direct);
  if (match) return match;

  if (query.toLowerCase().endsWith('s') && query.length > 2) {
    const singular = query.slice(0, -1);
    const retried = await search(singular);
    const retriedMatch = pickBestMatch(singular, retried);
    if (retriedMatch) return retriedMatch;
  }

  return null;
}
