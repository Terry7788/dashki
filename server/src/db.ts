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

      // ── Step Entries ───────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS StepEntries (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          date  TEXT NOT NULL UNIQUE,
          steps INTEGER NOT NULL
        )
      `);

      // ── Todos ──────────────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS Todos (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          title      TEXT NOT NULL,
          completed  INTEGER NOT NULL DEFAULT 0,
          due_date   TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── Gym Sessions ───────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS GymSessions (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          date       TEXT NOT NULL,
          name       TEXT,
          notes      TEXT,
          status     TEXT NOT NULL DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS GymExercises (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id  INTEGER NOT NULL,
          name        TEXT NOT NULL,
          order_index INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (session_id) REFERENCES GymSessions(id) ON DELETE CASCADE
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS GymSets (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          exercise_id INTEGER NOT NULL,
          set_number  INTEGER NOT NULL,
          reps        INTEGER,
          weight_kg   REAL,
          FOREIGN KEY (exercise_id) REFERENCES GymExercises(id) ON DELETE CASCADE
        )
      `);

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

      // ── Calendar Tokens ────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS CalendarTokens (
          id            INTEGER PRIMARY KEY CHECK (id = 1),
          access_token  TEXT,
          refresh_token TEXT,
          expiry_date   INTEGER
        )
      `);

      // ── Workout Templates ──────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS WorkoutTemplates (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          notes      TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS WorkoutTemplateExercises (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id   INTEGER NOT NULL,
          exercise_name TEXT NOT NULL,
          order_index   INTEGER NOT NULL DEFAULT 0,
          default_sets  INTEGER DEFAULT 3,
          default_reps  INTEGER DEFAULT 10,
          FOREIGN KEY (template_id) REFERENCES WorkoutTemplates(id) ON DELETE CASCADE
        )
      `);

      // ── Gym Routine ────────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS GymRoutine (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          day_of_week  INTEGER NOT NULL UNIQUE,
          workout_name TEXT NOT NULL,
          notes        TEXT,
          created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS GymRoutineSync (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          routine_id  INTEGER NOT NULL,
          synced_date TEXT NOT NULL,
          FOREIGN KEY (routine_id) REFERENCES GymRoutine(id) ON DELETE CASCADE
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

      // ── Migration: add template_id to GymRoutine ──────────────────────────
      db.all(`PRAGMA table_info(GymRoutine)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        if (!existingCols.has('template_id')) {
          db.run(
            `ALTER TABLE GymRoutine ADD COLUMN template_id INTEGER REFERENCES WorkoutTemplates(id) ON DELETE SET NULL`,
            [],
            (err) => {
              if (err) console.error('[db] migration error (GymRoutine.template_id):', err.message);
              else console.log('[db] ran migration: ALTER TABLE GymRoutine ADD COLUMN template_id');
            }
          );
        }
      });

      // ── Migration: add status to GymSessions ───────────────────────────────
      db.all(`PRAGMA table_info(GymSessions)`, [], (pragmaErr, columns: Array<{ name: string }>) => {
        if (pragmaErr) return;
        const existingCols = new Set(columns.map((c) => c.name));
        if (!existingCols.has('status')) {
          db.run(`ALTER TABLE GymSessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`, [], (err) => {
            if (err) console.error('[db] migration error (GymSessions.status):', err.message);
            else console.log('[db] ran migration: ALTER TABLE GymSessions ADD COLUMN status');
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
