#!/usr/bin/env node
// server/scripts/pull-from-prod.js
//
// Pulls Dashki production data into the local SQLite DB so changes can be
// tested against real foods/journal entries before pushing.
//
// Usage:
//   node scripts/pull-from-prod.js              # prompts for confirmation
//   node scripts/pull-from-prod.js --yes        # skip confirmation
//
// Env:
//   RAILWAY_URL    Override prod URL (default: https://dashki-production.up.railway.app)
//   DATABASE_PATH  Override local DB path (default: ./dashki.db)
//
// Safety:
//   - Refuses to run if NODE_ENV === 'production' or DATABASE_PATH points at /data/ or /mnt/.
//   - Backs up existing local DB to dashki.db.bak-<timestamp> before wiping.

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const readline = require('readline');

const RAILWAY_URL = (process.env.RAILWAY_URL || 'https://dashki-production.up.railway.app').replace(/\/$/, '');
const LOCAL_DB_PATH = path.resolve(process.env.DATABASE_PATH || './dashki.db');
const RAW_DB_PATH = (process.env.DATABASE_PATH || './dashki.db').replace(/\\/g, '/');
const SKIP_CONFIRM = process.argv.includes('--yes');

// ── Safety ──────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSE: NODE_ENV=production. This script is local-only.');
  process.exit(1);
}
// Belt-and-braces: Railway sets RAILWAY_ENVIRONMENT on its runtime. If for
// some reason this script ended up there with a non-volume DATABASE_PATH,
// we still don't want to wipe-and-reinsert from prod into… prod.
if (process.env.RAILWAY_ENVIRONMENT) {
  console.error('REFUSE: Running inside a Railway environment.');
  process.exit(1);
}
// Check raw env var value (before OS path resolution) so /data/ and /mnt/ are
// always caught regardless of whether path.resolve() rewrites them on Windows.
const normalizedDbPath = LOCAL_DB_PATH.replace(/\\/g, '/');
if (RAW_DB_PATH.startsWith('/data/') || RAW_DB_PATH.startsWith('/mnt/') ||
    RAW_DB_PATH.includes('/data/') || RAW_DB_PATH.includes('/mnt/') ||
    normalizedDbPath.startsWith('/data/') || normalizedDbPath.startsWith('/mnt/') ||
    normalizedDbPath.includes('/data/') || normalizedDbPath.includes('/mnt/')) {
  console.error(`REFUSE: DATABASE_PATH '${process.env.DATABASE_PATH || LOCAL_DB_PATH}' looks like a Railway volume.`);
  process.exit(1);
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

async function getJson(pathname) {
  const url = `${RAILWAY_URL}${pathname}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

// ── Main pull sequence ──────────────────────────────────────────────────────

async function pullAll() {
  console.log(`Pulling from ${RAILWAY_URL}…`);
  const today = new Date().toISOString().slice(0, 10);
  const earliest = '2020-01-01';

  const data = {};
  data.foods         = await getJson('/api/foods');
  data.journal       = await getJson(`/api/journal?startDate=${earliest}&endDate=${today}`);
  data.weight        = await getJson('/api/weight');
  data.steps         = await getJson(`/api/steps?startDate=${earliest}&endDate=${today}`);
  data.savedMeals    = await getJson('/api/meals/saved');
  // Saved meal items are returned inline in /api/meals/saved (each meal has items[])
  // but to be safe, also fetch full detail per meal.
  data.savedMealsFull = [];
  for (const m of data.savedMeals) {
    data.savedMealsFull.push(await getJson(`/api/meals/saved/${m.id}`));
  }
  data.goals         = await getJson('/api/goals');
  data.preferences   = await getJson('/api/preferences');

  // Pull StepLogEntries per date that has steps
  const stepDates = [...new Set((data.steps || []).map(s => s.date))];
  data.stepLogs = [];
  for (const d of stepDates) {
    const logs = await getJson(`/api/steps/logs?date=${encodeURIComponent(d)}`);
    data.stepLogs.push(...logs);
  }

  console.log(`  foods:           ${data.foods.length}`);
  console.log(`  journal entries: ${data.journal.length}`);
  console.log(`  weight entries:  ${data.weight.length}`);
  console.log(`  step entries:    ${data.steps.length}`);
  console.log(`  step logs:       ${data.stepLogs.length}`);
  console.log(`  saved meals:     ${data.savedMeals.length}`);
  return data;
}

// ── Wipe + insert into local DB ─────────────────────────────────────────────

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

async function wipeAndInsert(data) {
  // Backup existing DB. Wrapped in its own try so a backup failure shows a
  // clear, attributable message rather than a generic "Pull failed: EACCES"
  // — and aborts BEFORE we touch the DB so the user's data is safe.
  if (fs.existsSync(LOCAL_DB_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = `${LOCAL_DB_PATH}.bak-${ts}`;
    try {
      fs.copyFileSync(LOCAL_DB_PATH, backup);
      console.log(`Backed up: ${backup}`);
    } catch (err) {
      console.error(`Backup failed; aborting before wipe. ${err.message}`);
      throw err;
    }
  }

  const db = new sqlite3.Database(LOCAL_DB_PATH);

  // Wrap wipe + insert in a transaction. Atomicity (a crash mid-load rolls
  // back instead of leaving a half-loaded DB) plus a substantial speedup —
  // hundreds of inserts in one commit instead of one auto-commit per row.
  await run(db, 'BEGIN IMMEDIATE');
  try {
    // Wipe — preserves schema/indexes
    await run(db, 'DELETE FROM JournalEntries');
    await run(db, 'DELETE FROM SavedMealItems');
    await run(db, 'DELETE FROM SavedMeals');
    await run(db, 'DELETE FROM Foods');
    await run(db, 'DELETE FROM WeightEntries');
    await run(db, 'DELETE FROM StepLogEntries');
    await run(db, 'DELETE FROM StepEntries');
    // Goals + UserPreferences are singletons (id=1) — UPDATE not DELETE.

  // Foods
  for (const f of data.foods) {
    await run(db,
      `INSERT INTO Foods (id, name, base_amount, base_unit, calories, protein, carbs, fat, serving_size_g, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.id, f.name, f.baseAmount ?? 100, f.baseUnit ?? 'grams',
       f.calories ?? 0, f.protein ?? null, f.carbs ?? null, f.fat ?? null,
       f.serving_size_g ?? null, f.created_at ?? new Date().toISOString()]);
  }

  // Saved meals + items
  for (const m of data.savedMeals) {
    await run(db, 'INSERT INTO SavedMeals (id, name, created_at) VALUES (?, ?, ?)',
      [m.id, m.name, m.created_at]);
  }
  for (const m of data.savedMealsFull) {
    for (const item of (m.items || [])) {
      await run(db, 'INSERT INTO SavedMealItems (id, meal_id, food_id, servings) VALUES (?, ?, ?, ?)',
        [item.id, m.id, item.foodId ?? item.food_id, item.servings]);
    }
  }

  // Journal entries — old API may not include quantity/unit; fall back to servings.
  for (const e of data.journal) {
    await run(db,
      `INSERT INTO JournalEntries
         (id, date, meal_type, logged_at, food_id, food_name_snapshot,
          servings, quantity, unit, calories_snapshot, protein_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.date, e.meal_type, e.logged_at, e.food_id, e.food_name_snapshot,
       e.servings, e.quantity ?? e.servings, e.unit ?? 'serving',
       e.calories_snapshot, e.protein_snapshot ?? null, e.created_at ?? new Date().toISOString()]);
  }

  // Weight
  for (const w of data.weight) {
    await run(db, 'INSERT INTO WeightEntries (id, date, weight_kg, created_at) VALUES (?, ?, ?, ?)',
      [w.id, w.date, w.weight_kg, w.created_at]);
  }

  // Steps (legacy aggregate)
  for (const s of data.steps) {
    await run(db, 'INSERT INTO StepEntries (id, date, steps) VALUES (?, ?, ?)',
      [s.id, s.date, s.steps]);
  }
  // Step logs (new)
  for (const l of data.stepLogs) {
    await run(db,
      `INSERT INTO StepLogEntries (id, date, steps, note, logged_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [l.id, l.date, l.steps, l.note ?? null, l.logged_at, l.created_at]);
  }

  // Goals (singleton)
  if (data.goals) {
    await run(db,
      `UPDATE Goals SET calories=?, protein=?, carbs=?, fat=?, steps=?, weight_kg=?, updated_at=? WHERE id=1`,
      [data.goals.calories ?? null, data.goals.protein ?? null, data.goals.carbs ?? null,
       data.goals.fat ?? null, data.goals.steps ?? null, data.goals.weight_kg ?? null,
       data.goals.updated_at ?? new Date().toISOString()]);
  }

    // Preferences (singleton)
    if (data.preferences) {
      await run(db,
        `UPDATE UserPreferences SET theme=?, display_name=? WHERE id=1`,
        [data.preferences.theme ?? 'dark', data.preferences.display_name ?? null]);
    }

    await run(db, 'COMMIT');
  } catch (err) {
    // ROLLBACK is best-effort — if it itself fails the local DB has the
    // backup .bak file to recover from.
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw err;
  }

  await new Promise((res, rej) => db.close(err => err ? rej(err) : res()));
  console.log('Local DB updated.');
}

// ── Confirm prompt ──────────────────────────────────────────────────────────

async function confirm() {
  if (SKIP_CONFIRM) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`This will OVERWRITE ${LOCAL_DB_PATH} with prod data. Proceed? (y/N) `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

(async () => {
  try {
    if (!(await confirm())) { console.log('Aborted.'); process.exit(0); }
    const data = await pullAll();
    await wipeAndInsert(data);
    console.log('✓ Pull complete.');
  } catch (e) {
    console.error('Pull failed:', e.message || e);
    process.exit(1);
  }
})();
