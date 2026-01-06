import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { createTempDb, cleanupDb, createOldSchema, insertOldSchemaData, createPartialMigrationSchema, insertPartialMigrationData } from './setup';

// We need to test the actual database functions, so we'll recreate the key logic here
// rather than importing (which would use the real DB path)

const BCRYPT_ROUNDS = 10;

function initializeDatabase(db: Database.Database): void {
  // Create users table first
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if we need to migrate old schema
  checkAndMigrateSchema(db);

  // Always check if settings table needs migration (may have been missed in previous partial migration)
  migrateSettingsTable(db);

  // Create tables - will skip if they exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      default_weight REAL,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_id INTEGER NOT NULL REFERENCES workout_days(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS set_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      is_dropset INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);

  // Create indexes - wrapped in try/catch for safety
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_workout_days_user ON workout_days(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_exercises_day ON exercises(day_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_set_logs_session_exercise ON set_logs(session_exercise_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_body_measurements_user ON body_measurements(user_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON body_measurements(measured_at)`); } catch {}
}

function checkAndMigrateSchema(db: Database.Database): boolean {
  const tableInfo = db.prepare("PRAGMA table_info(workout_days)").all() as { name: string }[];
  if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'user_id')) {
    try { db.exec('ALTER TABLE workout_days ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
    try { db.exec('ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
    try { db.exec('ALTER TABLE body_measurements ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}

    // Settings table needs special handling - recreate with new schema
    migrateSettingsTable(db);

    return true;
  }
  return false;
}

function migrateSettingsTable(db: Database.Database): void {
  const settingsInfo = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
  if (settingsInfo.length > 0 && !settingsInfo.some(col => col.name === 'user_id')) {
    try {
      const oldSettings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      db.exec('DROP TABLE settings');
      // Create without FK constraint to allow NULL user_id for orphaned settings
      db.exec(`
        CREATE TABLE settings (
          user_id INTEGER,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (user_id, key)
        )
      `);
      for (const s of oldSettings) {
        db.prepare('INSERT INTO settings (user_id, key, value) VALUES (NULL, ?, ?)').run(s.key, s.value);
      }
    } catch {}
  }
}

function migrateExistingData(db: Database.Database): void {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

  if (userCount === 0) {
    const orphanedDays = (db.prepare('SELECT COUNT(*) as count FROM workout_days WHERE user_id IS NULL').get() as { count: number }).count;

    if (orphanedDays > 0) {
      const passwordHash = bcrypt.hashSync('1234', BCRYPT_ROUNDS);
      const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('donnoh', passwordHash);
      const userId = Number(result.lastInsertRowid);

      db.prepare('UPDATE workout_days SET user_id = ? WHERE user_id IS NULL').run(userId);
      db.prepare('UPDATE sessions SET user_id = ? WHERE user_id IS NULL').run(userId);
      db.prepare('UPDATE body_measurements SET user_id = ? WHERE user_id IS NULL').run(userId);

      // Migrate settings (user_id IS NULL is marker for orphaned settings from migrateSettingsTable)
      try {
        const oldSettings = db.prepare('SELECT key, value FROM settings WHERE user_id IS NULL').all() as { key: string; value: string }[];
        for (const s of oldSettings) {
          db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)').run(userId, s.key, s.value);
        }
        db.prepare('DELETE FROM settings WHERE user_id IS NULL').run();
      } catch {}
    }
  }
}

describe('Database', () => {
  let db: Database.Database;
  let dbPath: string;

  afterEach(() => {
    if (db) db.close();
    if (dbPath) cleanupDb(dbPath);
  });

  describe('Fresh Database Initialization', () => {
    beforeEach(() => {
      const temp = createTempDb();
      db = temp.db;
      dbPath = temp.path;
    });

    it('should create all tables on fresh database', () => {
      initializeDatabase(db);

      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as { name: string }[];

      const tableNames = tables.map(t => t.name).sort();
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('workout_days');
      expect(tableNames).toContain('exercises');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('session_exercises');
      expect(tableNames).toContain('set_logs');
      expect(tableNames).toContain('body_measurements');
      expect(tableNames).toContain('settings');
    });

    it('should create user_id columns in relevant tables', () => {
      initializeDatabase(db);

      const workoutDaysInfo = db.prepare("PRAGMA table_info(workout_days)").all() as { name: string }[];
      expect(workoutDaysInfo.some(col => col.name === 'user_id')).toBe(true);

      const sessionsInfo = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
      expect(sessionsInfo.some(col => col.name === 'user_id')).toBe(true);

      const measurementsInfo = db.prepare("PRAGMA table_info(body_measurements)").all() as { name: string }[];
      expect(measurementsInfo.some(col => col.name === 'user_id')).toBe(true);
    });
  });

  describe('Migration from Old Schema', () => {
    beforeEach(() => {
      const temp = createTempDb();
      db = temp.db;
      dbPath = temp.path;
      // Create old schema WITHOUT user_id columns
      createOldSchema(db);
    });

    it('should add user_id columns to existing tables', () => {
      // Verify old schema doesn't have user_id
      const beforeInfo = db.prepare("PRAGMA table_info(workout_days)").all() as { name: string }[];
      expect(beforeInfo.some(col => col.name === 'user_id')).toBe(false);

      // Run initialization (which should add columns)
      initializeDatabase(db);

      // Verify user_id was added
      const afterInfo = db.prepare("PRAGMA table_info(workout_days)").all() as { name: string }[];
      expect(afterInfo.some(col => col.name === 'user_id')).toBe(true);
    });

    it('should not crash when migrating existing data', () => {
      insertOldSchemaData(db);

      // This should not throw
      expect(() => {
        initializeDatabase(db);
        migrateExistingData(db);
      }).not.toThrow();
    });

    it('should create default user and assign orphaned data', () => {
      insertOldSchemaData(db);

      initializeDatabase(db);
      migrateExistingData(db);

      // Check user was created
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('donnoh') as { id: number; username: string };
      expect(user).toBeDefined();
      expect(user.username).toBe('donnoh');

      // Check data was assigned to user
      const days = db.prepare('SELECT * FROM workout_days WHERE user_id = ?').all(user.id);
      expect(days.length).toBe(2);

      const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(user.id);
      expect(sessions.length).toBe(1);

      const measurements = db.prepare('SELECT * FROM body_measurements WHERE user_id = ?').all(user.id);
      expect(measurements.length).toBe(1);
    });

    it('should migrate settings table and allow user-scoped queries', () => {
      insertOldSchemaData(db);

      initializeDatabase(db);
      migrateExistingData(db);

      // Check user was created
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('donnoh') as { id: number };

      // Settings should be queryable with user_id (this would fail if settings table wasn't migrated)
      const setting = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(user.id, 'weekly_goal') as { value: string } | undefined;
      expect(setting).toBeDefined();
      expect(setting?.value).toBe('4');

      // Should be able to insert new settings with user_id
      expect(() => {
        db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)').run(user.id, 'test_key', 'test_value');
      }).not.toThrow();
    });

    it('should preserve existing data during migration', () => {
      insertOldSchemaData(db);

      const beforeDays = db.prepare('SELECT name, display_name FROM workout_days').all();
      const beforeExercises = db.prepare('SELECT name, description FROM exercises').all();

      initializeDatabase(db);
      migrateExistingData(db);

      const afterDays = db.prepare('SELECT name, display_name FROM workout_days').all();
      const afterExercises = db.prepare('SELECT name, description FROM exercises').all();

      expect(afterDays).toEqual(beforeDays);
      expect(afterExercises).toEqual(beforeExercises);
    });
  });

  describe('Index Creation', () => {
    beforeEach(() => {
      const temp = createTempDb();
      db = temp.db;
      dbPath = temp.path;
    });

    it('should create indexes on fresh database', () => {
      initializeDatabase(db);

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'
      `).all() as { name: string }[];

      expect(indexes.some(i => i.name === 'idx_workout_days_user')).toBe(true);
      expect(indexes.some(i => i.name === 'idx_sessions_user')).toBe(true);
    });

    it('should create indexes after migrating old schema', () => {
      createOldSchema(db);
      insertOldSchemaData(db);

      initializeDatabase(db);

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'
      `).all() as { name: string }[];

      expect(indexes.some(i => i.name === 'idx_workout_days_user')).toBe(true);
      expect(indexes.some(i => i.name === 'idx_sessions_user')).toBe(true);
    });
  });

  describe('Partial Migration (settings table missed)', () => {
    beforeEach(() => {
      const temp = createTempDb();
      db = temp.db;
      dbPath = temp.path;
      // Create schema where other tables have user_id but settings doesn't
      createPartialMigrationSchema(db);
    });

    it('should migrate settings table even when other tables already have user_id', () => {
      insertPartialMigrationData(db);

      // Verify settings table doesn't have user_id before migration
      const beforeInfo = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
      expect(beforeInfo.some(col => col.name === 'user_id')).toBe(false);

      // Run initialization (should detect and fix settings table)
      initializeDatabase(db);

      // Verify settings table now has user_id
      const afterInfo = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
      expect(afterInfo.some(col => col.name === 'user_id')).toBe(true);

      // Verify we can query settings with user_id
      expect(() => {
        db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(1, 'weekly_goal');
      }).not.toThrow();
    });

    it('should preserve existing settings data during partial migration', () => {
      insertPartialMigrationData(db);

      const beforeSettings = db.prepare('SELECT key, value FROM settings').all();

      initializeDatabase(db);

      // Settings should still exist (with NULL user_id initially)
      const afterSettings = db.prepare('SELECT key, value FROM settings').all();
      expect(afterSettings.length).toBe(beforeSettings.length);
    });
  });
});
