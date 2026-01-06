import Database from 'better-sqlite3';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create a unique temp database for each test
export function createTempDb(): { db: Database.Database; path: string } {
  const path = join(tmpdir(), `gym-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  return { db, path };
}

// Clean up temp database
export function cleanupDb(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
  // Also clean up WAL files
  if (existsSync(`${path}-wal`)) {
    unlinkSync(`${path}-wal`);
  }
  if (existsSync(`${path}-shm`)) {
    unlinkSync(`${path}-shm`);
  }
}

// Create old schema (before user_id was added)
export function createOldSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL
    );

    CREATE TABLE exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      default_weight REAL,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES workout_days(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT
    );

    CREATE TABLE session_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE set_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      is_dropset INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE body_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      measured_at TEXT NOT NULL,
      weight REAL,
      chest REAL,
      waist REAL,
      hips REAL,
      left_arm REAL,
      right_arm REAL,
      left_thigh REAL,
      right_thigh REAL,
      left_calf REAL,
      right_calf REAL,
      shoulders REAL,
      neck REAL,
      notes TEXT
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// Insert sample data into old schema
export function insertOldSchemaData(db: Database.Database): void {
  // Insert workout days
  db.exec(`
    INSERT INTO workout_days (name, display_name) VALUES ('push', 'Push Day');
    INSERT INTO workout_days (name, display_name) VALUES ('pull', 'Pull Day');
  `);

  // Insert exercises
  db.exec(`
    INSERT INTO exercises (day_id, name, description, default_weight, order_index)
    VALUES (1, 'Bench Press', '3x10', 60, 0);
    INSERT INTO exercises (day_id, name, description, default_weight, order_index)
    VALUES (1, 'Shoulder Press', '3x10', 40, 1);
  `);

  // Insert a session
  db.exec(`
    INSERT INTO sessions (day_id, started_at, ended_at)
    VALUES (1, '2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z');
  `);

  // Insert body measurement
  db.exec(`
    INSERT INTO body_measurements (measured_at, weight, chest)
    VALUES ('2024-01-01T10:00:00Z', 75.5, 100);
  `);

  // Insert setting
  db.exec(`
    INSERT INTO settings (key, value) VALUES ('weekly_goal', '4');
  `);
}
