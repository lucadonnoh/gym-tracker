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

  describe('Week Streak Calculation', () => {
    beforeEach(() => {
      const temp = createTempDb();
      db = temp.db;
      dbPath = temp.path;
      initializeDatabase(db);

      // Create a test user
      const passwordHash = bcrypt.hashSync('1234', BCRYPT_ROUNDS);
      db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('testuser', passwordHash);

      // Create a workout day
      db.prepare("INSERT INTO workout_days (user_id, name, display_name) VALUES (1, 'day1', 'Test Day')").run();
    });

    // Match SQLite's strftime('%W') behavior
    function getWeekNumber(date: Date): number {
      const year = date.getFullYear();
      const jan1 = new Date(year, 0, 1);
      const jan1Day = jan1.getDay();

      const startOfYear = new Date(year, 0, 0);
      const diff = date.getTime() - startOfYear.getTime();
      const oneDay = 1000 * 60 * 60 * 24;
      const dayOfYear = Math.floor(diff / oneDay);

      const daysUntilFirstMonday = jan1Day === 0 ? 1 : (jan1Day === 1 ? 0 : 8 - jan1Day);

      if (dayOfYear <= daysUntilFirstMonday) {
        return 0;
      }

      return Math.floor((dayOfYear - daysUntilFirstMonday - 1) / 7) + 1;
    }

    function getWeekStreak(userId: number, weeklyGoal: number): { current: number; best: number } {
      const weeks = db.prepare(`
        SELECT
          strftime('%Y-%W', started_at) as week,
          COUNT(DISTINCT DATE(started_at)) as workout_days
        FROM sessions
        WHERE user_id = ? AND ended_at IS NOT NULL
        GROUP BY strftime('%Y-%W', started_at)
        ORDER BY week DESC
      `).all(userId) as { week: string; workout_days: number }[];

      if (weeks.length === 0) {
        return { current: 0, best: 0 };
      }

      const now = new Date();
      const currentWeek = `${now.getFullYear()}-${String(getWeekNumber(now)).padStart(2, '0')}`;

      let currentStreak = 0;
      let bestStreak = 0;
      let tempStreak = 0;
      let checkingCurrent = true;

      const weekMap = new Map(weeks.map(w => [w.week, w.workout_days]));

      let checkDate = new Date(now);

      const currentWeekWorkouts = weekMap.get(currentWeek) || 0;
      const currentWeekComplete = currentWeekWorkouts >= weeklyGoal;

      if (!currentWeekComplete) {
        checkDate.setDate(checkDate.getDate() - 7);
      }

      for (let i = 0; i < 52; i++) {
        const weekId = `${checkDate.getFullYear()}-${String(getWeekNumber(checkDate)).padStart(2, '0')}`;
        const workouts = weekMap.get(weekId) || 0;

        if (workouts >= weeklyGoal) {
          if (checkingCurrent) {
            currentStreak++;
          }
          tempStreak++;
        } else {
          if (checkingCurrent) {
            checkingCurrent = false;
          }
          if (tempStreak > bestStreak) {
            bestStreak = tempStreak;
          }
          tempStreak = 0;
        }

        checkDate.setDate(checkDate.getDate() - 7);
      }

      if (tempStreak > bestStreak) {
        bestStreak = tempStreak;
      }

      return { current: currentStreak, best: Math.max(bestStreak, currentStreak) };
    }

    function createSession(userId: number, dayId: number, startedAt: Date): void {
      const endedAt = new Date(startedAt.getTime() + 60 * 60 * 1000); // 1 hour later
      db.prepare(`
        INSERT INTO sessions (user_id, day_id, started_at, ended_at)
        VALUES (?, ?, ?, ?)
      `).run(userId, dayId, startedAt.toISOString(), endedAt.toISOString());
    }

    it('should return 1 week streak when last week is complete but current week is not', () => {
      const now = new Date();
      const weeklyGoal = 3;

      // Create 3 sessions last week (complete)
      for (let i = 0; i < 3; i++) {
        const lastWeek = new Date(now);
        lastWeek.setDate(now.getDate() - 7 - i); // Different days last week
        createSession(1, 1, lastWeek);
      }

      // Create 1 session this week (incomplete - less than goal of 3)
      createSession(1, 1, now);

      const streak = getWeekStreak(1, weeklyGoal);

      // Debug: log the weeks found
      const weeks = db.prepare(`
        SELECT
          strftime('%Y-%W', started_at) as week,
          COUNT(DISTINCT DATE(started_at)) as workout_days
        FROM sessions
        WHERE user_id = 1 AND ended_at IS NOT NULL
        GROUP BY strftime('%Y-%W', started_at)
        ORDER BY week DESC
      `).all();
      console.log('Weeks found:', weeks);
      console.log('Current week (ISO):', `${now.getFullYear()}-${String(getWeekNumber(now)).padStart(2, '0')}`);

      expect(streak.current).toBe(1); // Last week was complete
      expect(streak.best).toBe(1);
    });

    it('should return 0 streak when no weeks are complete', () => {
      const now = new Date();
      const weeklyGoal = 3;

      // Create only 1 session this week (incomplete)
      createSession(1, 1, now);

      const streak = getWeekStreak(1, weeklyGoal);

      expect(streak.current).toBe(0);
      expect(streak.best).toBe(0);
    });

    it('should return correct streak for multiple consecutive complete weeks', () => {
      const now = new Date();
      const weeklyGoal = 3;

      // Create 3 sessions each for the past 3 weeks
      for (let week = 1; week <= 3; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(now);
          date.setDate(now.getDate() - (week * 7) + day);
          createSession(1, 1, date);
        }
      }

      const streak = getWeekStreak(1, weeklyGoal);

      expect(streak.current).toBe(3);
      expect(streak.best).toBe(3);
    });
  });
});
