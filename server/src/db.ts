import 'dotenv/config';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve('./dashki.db');

// Ensure the parent directory exists (useful for Railway volumes)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new sqlite3.Database(dbPath);

export function initDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA foreign_keys = ON');

      // ── Foods ──────────────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS Foods (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT NOT NULL,
          base_amount  REAL NOT NULL DEFAULT 100,
          base_unit    TEXT NOT NULL DEFAULT 'grams',
          calories     REAL NOT NULL,
          protein      REAL,
          carbs        REAL,
          fat          REAL,
          serving_size_g REAL,
          created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Saved Meals ────────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS SavedMeals (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS SavedMealItems (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          meal_id  INTEGER NOT NULL,
          food_id  INTEGER NOT NULL,
          servings REAL NOT NULL,
          FOREIGN KEY (meal_id) REFERENCES SavedMeals(id) ON DELETE CASCADE,
          FOREIGN KEY (food_id) REFERENCES Foods(id) ON DELETE CASCADE
        )
      `);

      // ── Current Meal ───────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS CurrentMeal (
          id         INTEGER PRIMARY KEY CHECK (id = 1),
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS CurrentMealItems (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          food_id              INTEGER,
          servings             REAL NOT NULL,
          temp_food_name       TEXT,
          temp_food_base_amount REAL,
          temp_food_base_unit  TEXT,
          temp_food_calories   REAL,
          temp_food_protein    REAL,
          FOREIGN KEY (food_id) REFERENCES Foods(id) ON DELETE CASCADE
        )
      `);

      // ── Journal Entries ────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS JournalEntries (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          date                TEXT NOT NULL,
          meal_type           TEXT NOT NULL,
          logged_at           TEXT NOT NULL,
          food_id             INTEGER,
          food_name_snapshot  TEXT NOT NULL,
          servings            REAL NOT NULL,
          calories_snapshot   REAL NOT NULL,
          protein_snapshot    REAL,
          created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Step Entries (LEGACY aggregate; kept for backward compat) ──────────
      // Historically this held one row per date with the day's total.
      // The new source of truth is StepLogEntries (below) which supports
      // multiple entries per day. GET /api/steps computes aggregates
      // on-the-fly from StepLogEntries so this table is no longer required.
      db.run(`
        CREATE TABLE IF NOT EXISTS StepEntries (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          date  TEXT NOT NULL UNIQUE,
          steps INTEGER NOT NULL
        )
      `);

      // ── Step Log Entries (new — multiple per day, like JournalEntries) ─────
      db.run(`
        CREATE TABLE IF NOT EXISTS StepLogEntries (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          date       TEXT NOT NULL,
          steps      INTEGER NOT NULL,
          note       TEXT,
          logged_at  TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_step_log_entries_date ON StepLogEntries(date)`);

      // One-time seed: if StepLogEntries is empty and StepEntries has rows,
      // convert each legacy aggregate into a single log entry so the user's
      // historical totals don't disappear from view.
      db.get(
        `SELECT COUNT(*) AS cnt FROM StepLogEntries`,
        [],
        (cntErr, cntRow: { cnt: number } | undefined) => {
          if (cntErr || !cntRow || cntRow.cnt > 0) return;
          db.run(`
            INSERT INTO StepLogEntries (date, steps, note, logged_at)
            SELECT date, steps, 'Migrated from legacy total', datetime(date || 'T12:00:00')
            FROM StepEntries
          `, [], (seedErr) => {
            if (seedErr) console.error('[db] migration error (seed StepLogEntries):', seedErr.message);
            else console.log('[db] ran migration: seeded StepLogEntries from StepEntries');
          });
        }
      );

      // ── Weight Entries ─────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS WeightEntries (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          date       TEXT NOT NULL UNIQUE,
          weight_kg  REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Goals (user-configurable targets) ─────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS Goals (
          id           INTEGER PRIMARY KEY CHECK (id = 1),
          calories     REAL,
          protein      REAL,
          carbs        REAL,
          fat          REAL,
          steps        INTEGER,
          weight_kg    REAL,
          updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert default goals row (singleton)
      db.run(`INSERT OR IGNORE INTO Goals (id) VALUES (1)`);

      // ── User Preferences ───────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS UserPreferences (
          id    INTEGER PRIMARY KEY CHECK (id = 1),
          theme TEXT NOT NULL DEFAULT 'dark'
        )
      `);

      db.run(`INSERT OR IGNORE INTO UserPreferences (id) VALUES (1)`);

      // ── Calendar Tokens ────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS CalendarTokens (
          id            INTEGER PRIMARY KEY CHECK (id = 1),
          access_token  TEXT,
          refresh_token TEXT,
          expiry_date   INTEGER
        )
      `);

      // ── CurrentMeal singleton ─────────────────────────────────────────────
      db.run(`INSERT OR IGNORE INTO CurrentMeal (id) VALUES (1)`);

      // ── Migrations: add missing columns to Foods if they don't exist ──────
      // SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
      // so we check PRAGMA table_info and add only missing columns.
      db.all(`PRAGMA table_info(Foods)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        const migrations: string[] = [];

        if (!existingCols.has('carbs')) {
          migrations.push('ALTER TABLE Foods ADD COLUMN carbs REAL');
        }
        if (!existingCols.has('fat')) {
          migrations.push('ALTER TABLE Foods ADD COLUMN fat REAL');
        }
        if (!existingCols.has('serving_size_g')) {
          migrations.push('ALTER TABLE Foods ADD COLUMN serving_size_g REAL');
        }

        for (const sql of migrations) {
          db.run(sql, [], (err) => {
            if (err) console.error('[db] migration error:', err.message);
            else console.log(`[db] ran migration: ${sql}`);
          });
        }
      });

      // ── Migration: add display_name to UserPreferences ─────────────────────
      db.all(`PRAGMA table_info(UserPreferences)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        if (!existingCols.has('display_name')) {
          db.run(`ALTER TABLE UserPreferences ADD COLUMN display_name TEXT`, [], (err) => {
            if (err) console.error('[db] migration error (UserPreferences.display_name):', err.message);
            else console.log('[db] ran migration: ALTER TABLE UserPreferences ADD COLUMN display_name');
          });
        }
      });

      // ── Migration: add quantity + unit to JournalEntries (DSHKI-8) ─────────
      // SQLite ALTER TABLE can't add NOT NULL columns retroactively; we add
      // them as nullable and enforce via the route code. Backfill from the
      // legacy `servings` column so existing entries stay readable.
      db.all(`PRAGMA table_info(JournalEntries)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        const migrations: string[] = [];

        if (!existingCols.has('quantity')) {
          migrations.push('ALTER TABLE JournalEntries ADD COLUMN quantity REAL');
        }
        if (!existingCols.has('unit')) {
          migrations.push('ALTER TABLE JournalEntries ADD COLUMN unit TEXT');
        }

        for (const sql of migrations) {
          db.run(sql, [], (err) => {
            if (err) console.error('[db] migration error:', err.message);
            else console.log(`[db] ran migration: ${sql}`);
          });
        }

        // Backfill: any row where quantity IS NULL gets quantity=servings, unit='serving'.
        // Idempotent — safe to re-run.
        db.run(
          `UPDATE JournalEntries
           SET quantity = servings, unit = 'serving'
           WHERE quantity IS NULL OR unit IS NULL`,
          [],
          function (this: { changes: number }, err) {
            if (err) console.error('[db] backfill error:', err.message);
            else if (this.changes > 0) {
              console.log(`[db] backfilled ${this.changes} JournalEntries with quantity/unit`);
            }
          }
        );
      });

      // ── Migration: drop legacy `servings` column from JournalEntries (DSHKI-8 PR 2) ──
      // SQLite ALTER TABLE DROP COLUMN was added in 3.35 (2021). Use a guarded
      // try/catch via PRAGMA so this is safe on older SQLite builds (logs a
      // warning but continues — the unused column is harmless).
      db.all(`PRAGMA table_info(JournalEntries)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        if (existingCols.has('servings')) {
          db.run('ALTER TABLE JournalEntries DROP COLUMN servings', [], (err) => {
            if (err) console.warn('[db] could not drop legacy JournalEntries.servings:', err.message);
            else console.log('[db] ran migration: DROP COLUMN JournalEntries.servings');
          });
        }
      });

      // ── Sentinel to confirm serialization completed ────────────────────────
      db.run('SELECT 1', (err) => {
        if (err) reject(err);
        else {
          console.log(`[db] Initialised — ${dbPath}`);
          resolve();
        }
      });
    });
  });
}
