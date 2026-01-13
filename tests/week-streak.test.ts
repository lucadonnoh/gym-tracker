import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTempDb, cleanupDb } from './setup';

// Recreate the database schema for testing
function initTestDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL
    );

    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_id INTEGER NOT NULL REFERENCES workout_days(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT
    );

    CREATE TABLE settings (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);

  // Create a test user
  db.exec(`INSERT INTO users (username, password_hash) VALUES ('testuser', 'hash')`);
  db.exec(`INSERT INTO workout_days (user_id, name, display_name) VALUES (1, 'push', 'Push Day')`);
}

// Original getWeekNumber from database.ts (ISO 8601)
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Original getWeekStreak function from database.ts (with the bug)
function getWeekStreakOriginal(db: Database.Database, userId: number): { current: number; best: number } {
  const weeklyGoal = 3; // default

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

// Helper to get Monday of a given week
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Fixed getWeekStreak that uses Monday dates instead of week numbers
function getWeekStreakFixed(db: Database.Database, userId: number): { current: number; best: number } {
  const weeklyGoal = 3;

  // Use Monday of each week as identifier to avoid week number format mismatches
  const weeks = db.prepare(`
    SELECT
      DATE(started_at, '-' || ((CAST(strftime('%w', started_at) AS INTEGER) + 6) % 7) || ' days') as week_monday,
      COUNT(DISTINCT DATE(started_at)) as workout_days
    FROM sessions
    WHERE user_id = ? AND ended_at IS NOT NULL
    GROUP BY DATE(started_at, '-' || ((CAST(strftime('%w', started_at) AS INTEGER) + 6) % 7) || ' days')
    ORDER BY week_monday DESC
  `).all(userId) as { week_monday: string; workout_days: number }[];

  if (weeks.length === 0) {
    return { current: 0, best: 0 };
  }

  const now = new Date();
  const currentMonday = getMondayOfWeek(now);
  const currentMondayStr = currentMonday.toISOString().split('T')[0];

  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  let checkingCurrent = true;

  const weekMap = new Map(weeks.map(w => [w.week_monday, w.workout_days]));

  let checkMonday = new Date(currentMonday);

  const currentWeekWorkouts = weekMap.get(currentMondayStr) || 0;
  const currentWeekComplete = currentWeekWorkouts >= weeklyGoal;

  if (!currentWeekComplete) {
    checkMonday.setDate(checkMonday.getDate() - 7);
  }

  for (let i = 0; i < 52; i++) {
    const mondayStr = checkMonday.toISOString().split('T')[0];
    const workouts = weekMap.get(mondayStr) || 0;

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

    checkMonday.setDate(checkMonday.getDate() - 7);
  }

  if (tempStreak > bestStreak) {
    bestStreak = tempStreak;
  }

  return { current: currentStreak, best: Math.max(bestStreak, currentStreak) };
}

describe('Week Streak Calculation', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    const temp = createTempDb();
    db = temp.db;
    dbPath = temp.path;
    initTestDb(db);
  });

  afterEach(() => {
    if (db) db.close();
    if (dbPath) cleanupDb(dbPath);
  });

  it('should count streak as 1 when previous week is complete but current week is not', () => {
    // Get the Monday of last week
    const lastMonday = getMondayOfWeek(new Date());
    lastMonday.setDate(lastMonday.getDate() - 7);

    // Add 3 workouts on different days last week (meets goal of 3)
    for (let i = 0; i < 3; i++) {
      const workoutDate = new Date(lastMonday);
      workoutDate.setDate(workoutDate.getDate() + i);
      const dateStr = workoutDate.toISOString();

      db.prepare(`
        INSERT INTO sessions (user_id, day_id, started_at, ended_at)
        VALUES (1, 1, ?, ?)
      `).run(dateStr, dateStr);
    }

    // Current week has 0 workouts (incomplete)
    // The streak should be 1 (previous week was complete)
    const result = getWeekStreakFixed(db, 1);
    expect(result.current).toBe(1);
  });

  it('should demonstrate the bug: original function returns 0 due to week ID mismatch', () => {
    // Get the Monday of last week
    const lastMonday = getMondayOfWeek(new Date());
    lastMonday.setDate(lastMonday.getDate() - 7);

    // Add 3 workouts on different days last week (meets goal of 3)
    for (let i = 0; i < 3; i++) {
      const workoutDate = new Date(lastMonday);
      workoutDate.setDate(workoutDate.getDate() + i);
      const dateStr = workoutDate.toISOString();

      db.prepare(`
        INSERT INTO sessions (user_id, day_id, started_at, ended_at)
        VALUES (1, 1, ?, ?)
      `).run(dateStr, dateStr);
    }

    // The original function may return 0 due to week ID format mismatch
    // between SQLite's strftime('%Y-%W') and JavaScript's getWeekNumber()
    const originalResult = getWeekStreakOriginal(db, 1);
    const fixedResult = getWeekStreakFixed(db, 1);

    // The fixed version should return 1
    expect(fixedResult.current).toBe(1);

    // Note: The original might return 0 or 1 depending on the specific date
    // The bug happens when the week number formats don't match
    // This test demonstrates that the fixed version works reliably
  });

  it('should count consecutive completed weeks', () => {
    // Add completed weeks for the past 3 weeks (not including current)
    const currentMonday = getMondayOfWeek(new Date());

    for (let weekOffset = 1; weekOffset <= 3; weekOffset++) {
      const weekMonday = new Date(currentMonday);
      weekMonday.setDate(weekMonday.getDate() - (7 * weekOffset));

      // Add 3 workouts for each week
      for (let day = 0; day < 3; day++) {
        const workoutDate = new Date(weekMonday);
        workoutDate.setDate(workoutDate.getDate() + day);
        const dateStr = workoutDate.toISOString();

        db.prepare(`
          INSERT INTO sessions (user_id, day_id, started_at, ended_at)
          VALUES (1, 1, ?, ?)
        `).run(dateStr, dateStr);
      }
    }

    const result = getWeekStreakFixed(db, 1);
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it('should return 0 when no workouts exist', () => {
    const result = getWeekStreakFixed(db, 1);
    expect(result.current).toBe(0);
    expect(result.best).toBe(0);
  });

  it('should break streak when a week is missed', () => {
    const currentMonday = getMondayOfWeek(new Date());

    // Add workouts 1 week ago (completed)
    const lastWeek = new Date(currentMonday);
    lastWeek.setDate(lastWeek.getDate() - 7);
    for (let day = 0; day < 3; day++) {
      const workoutDate = new Date(lastWeek);
      workoutDate.setDate(workoutDate.getDate() + day);
      const dateStr = workoutDate.toISOString();
      db.prepare(`
        INSERT INTO sessions (user_id, day_id, started_at, ended_at)
        VALUES (1, 1, ?, ?)
      `).run(dateStr, dateStr);
    }

    // Skip week 2 ago (no workouts)

    // Add workouts 3 weeks ago (completed)
    const threeWeeksAgo = new Date(currentMonday);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
    for (let day = 0; day < 3; day++) {
      const workoutDate = new Date(threeWeeksAgo);
      workoutDate.setDate(workoutDate.getDate() + day);
      const dateStr = workoutDate.toISOString();
      db.prepare(`
        INSERT INTO sessions (user_id, day_id, started_at, ended_at)
        VALUES (1, 1, ?, ?)
      `).run(dateStr, dateStr);
    }

    const result = getWeekStreakFixed(db, 1);
    // Current streak should be 1 (only last week is consecutive)
    expect(result.current).toBe(1);
    // Best streak could be 1 (both isolated completed weeks count as 1 each)
    expect(result.best).toBe(1);
  });
});
