import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { cleanupDb } from './setup';

// Point the real database module at a temp file BEFORE importing it.
// database.ts reads process.env.DATABASE_PATH at import time.
const dbPath = join(tmpdir(), `gym-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DATABASE_PATH = dbPath;

const TOTAL_SESSIONS = 12;

let getExerciseHistory: (exerciseId: number, userId: number, limit?: number) => { session_id: number }[];

describe('getExerciseHistory', () => {
  beforeAll(async () => {
    // Import the REAL function (not a reimplementation) so the test exercises shipping code.
    const mod = await import('../src/database.js');
    mod.initializeDatabase();
    getExerciseHistory = mod.getExerciseHistory;

    // Seed via a separate connection to the same file.
    const raw = new Database(dbPath);
    raw.pragma('journal_mode = WAL');
    const passwordHash = bcrypt.hashSync('1234', 10);
    raw.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('testuser', passwordHash);
    raw.prepare("INSERT INTO workout_days (user_id, name, display_name) VALUES (1, 'push', 'Push')").run();
    raw.prepare("INSERT INTO exercises (day_id, name, order_index) VALUES (1, 'Bench Press', 0)").run();

    for (let i = 0; i < TOTAL_SESSIONS; i++) {
      const started = new Date(2024, 0, i + 1, 10).toISOString();
      const ended = new Date(2024, 0, i + 1, 11).toISOString();
      const s = raw
        .prepare('INSERT INTO sessions (user_id, day_id, started_at, ended_at) VALUES (1, 1, ?, ?)')
        .run(started, ended);
      const se = raw
        .prepare('INSERT INTO session_exercises (session_id, exercise_id, completed) VALUES (?, 1, 1)')
        .run(s.lastInsertRowid);
      raw
        .prepare('INSERT INTO set_logs (session_exercise_id, set_number, weight, reps) VALUES (?, 1, 60, 10)')
        .run(se.lastInsertRowid);
    }
    raw.close();
  });

  afterAll(() => {
    cleanupDb(dbPath);
  });

  it('returns ALL past sessions for an exercise by default (does not truncate)', () => {
    const history = getExerciseHistory(1, 1);
    expect(history.length).toBe(TOTAL_SESSIONS);
  });

  it('still honors an explicit limit when one is given', () => {
    const history = getExerciseHistory(1, 1, 3);
    expect(history.length).toBe(3);
  });
});
