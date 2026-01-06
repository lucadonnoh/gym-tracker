import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcrypt';
import type { WorkoutDay, Exercise, Session, SessionExercise, SetLog, SessionWithDay, ExerciseWithSets, BodyMeasurement, User } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'gym.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const BCRYPT_ROUNDS = 10;

export function initializeDatabase(): void {
  // Create users table first
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if we need to migrate old schema (tables exist but without user_id)
  const needsMigration = checkAndMigrateSchema();

  // Now create tables - will skip if they exist (after migration added user_id)
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

  // Create indexes only after schema is ready (including migrated columns)
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_workout_days_user ON workout_days(user_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_exercises_day ON exercises(day_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_set_logs_session_exercise ON set_logs(session_exercise_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_body_measurements_user ON body_measurements(user_id)`);
  } catch {}
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON body_measurements(measured_at)`);
  } catch {}
}

// Check if tables exist without user_id and add the column
function checkAndMigrateSchema(): boolean {
  // Check if workout_days exists but doesn't have user_id column
  const tableInfo = db.prepare("PRAGMA table_info(workout_days)").all() as { name: string }[];
  if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'user_id')) {
    console.log('Detected old schema, adding user_id columns...');
    try { db.exec('ALTER TABLE workout_days ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
    try { db.exec('ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
    try { db.exec('ALTER TABLE body_measurements ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
    return true;
  }
  return false;
}

// Run migration for existing data - creates donnoh user and assigns orphaned data
export function migrateExistingData(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

  if (userCount === 0) {
    // Check if there's existing data that needs to be assigned to a user
    const orphanedDays = (db.prepare('SELECT COUNT(*) as count FROM workout_days WHERE user_id IS NULL').get() as { count: number }).count;

    if (orphanedDays > 0) {
      console.log('Migrating existing data to user "donnoh"...');

      // Create donnoh user
      const passwordHash = bcrypt.hashSync('1234', BCRYPT_ROUNDS);
      const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('donnoh', passwordHash);
      const userId = Number(result.lastInsertRowid);

      // Update all existing data to belong to donnoh
      db.prepare('UPDATE workout_days SET user_id = ? WHERE user_id IS NULL').run(userId);
      db.prepare('UPDATE sessions SET user_id = ? WHERE user_id IS NULL').run(userId);
      db.prepare('UPDATE body_measurements SET user_id = ? WHERE user_id IS NULL').run(userId);

      // Migrate settings
      try {
        const oldSettings = db.prepare('SELECT key, value FROM settings WHERE user_id IS NULL').all() as { key: string; value: string }[];
        for (const s of oldSettings) {
          db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)').run(userId, s.key, s.value);
        }
        db.prepare('DELETE FROM settings WHERE user_id IS NULL').run();
      } catch {}

      console.log('Migration complete!');
    }
  }
}

// Users
export function createUser(username: string, password: string): User {
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByUsername(username: string): (User & { password_hash: string }) | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as (User & { password_hash: string }) | undefined;
}

export function verifyPassword(user: { password_hash: string }, password: string): boolean {
  return bcrypt.compareSync(password, user.password_hash);
}

export function updatePassword(userId: number, newPassword: string): boolean {
  const passwordHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  return result.changes > 0;
}

// Workout Days
export function getAllDays(userId: number): (WorkoutDay & { last_session_date: string | null })[] {
  return db.prepare(`
    SELECT wd.*,
      (SELECT MAX(s.started_at) FROM sessions s WHERE s.day_id = wd.id AND s.ended_at IS NOT NULL) as last_session_date
    FROM workout_days wd
    WHERE wd.user_id = ?
    ORDER BY wd.id
  `).all(userId) as (WorkoutDay & { last_session_date: string | null })[];
}

export function getDayById(id: number, userId: number): WorkoutDay | undefined {
  return db.prepare('SELECT * FROM workout_days WHERE id = ? AND user_id = ?').get(id, userId) as WorkoutDay | undefined;
}

export function createDay(userId: number, name: string, displayName: string): WorkoutDay {
  const result = db.prepare('INSERT INTO workout_days (user_id, name, display_name) VALUES (?, ?, ?)').run(userId, name, displayName);
  return getDayById(Number(result.lastInsertRowid), userId)!;
}

// Exercises
export function getExercisesByDay(dayId: number, userId: number): Exercise[] {
  // Verify day belongs to user
  const day = getDayById(dayId, userId);
  if (!day) return [];
  return db.prepare('SELECT * FROM exercises WHERE day_id = ? ORDER BY order_index').all(dayId) as Exercise[];
}

export function getExerciseById(id: number, userId: number): Exercise | undefined {
  return db.prepare(`
    SELECT e.* FROM exercises e
    JOIN workout_days d ON e.day_id = d.id
    WHERE e.id = ? AND d.user_id = ?
  `).get(id, userId) as Exercise | undefined;
}

export function createExercise(dayId: number, userId: number, name: string, description: string | null, defaultWeight: number | null): Exercise | undefined {
  const day = getDayById(dayId, userId);
  if (!day) return undefined;

  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM exercises WHERE day_id = ?').get(dayId) as { next: number };
  const result = db.prepare(
    'INSERT INTO exercises (day_id, name, description, default_weight, order_index) VALUES (?, ?, ?, ?, ?)'
  ).run(dayId, name, description, defaultWeight, maxOrder.next);
  return getExerciseById(Number(result.lastInsertRowid), userId);
}

export function updateExercise(id: number, userId: number, name: string, description: string | null, defaultWeight: number | null): Exercise | undefined {
  const exercise = getExerciseById(id, userId);
  if (!exercise) return undefined;

  db.prepare('UPDATE exercises SET name = ?, description = ?, default_weight = ? WHERE id = ?').run(name, description, defaultWeight, id);
  return getExerciseById(id, userId);
}

export function deleteExercise(id: number, userId: number): boolean {
  const exercise = getExerciseById(id, userId);
  if (!exercise) return false;

  const result = db.prepare('DELETE FROM exercises WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderExercise(id: number, userId: number, newIndex: number): void {
  const exercise = getExerciseById(id, userId);
  if (!exercise) return;

  const exercises = getExercisesByDay(exercise.day_id, userId);
  const currentIndex = exercises.findIndex(e => e.id === id);
  if (currentIndex === -1 || currentIndex === newIndex) return;

  const reordered = [...exercises];
  const [moved] = reordered.splice(currentIndex, 1);
  reordered.splice(newIndex, 0, moved);

  const updateStmt = db.prepare('UPDATE exercises SET order_index = ? WHERE id = ?');
  const transaction = db.transaction(() => {
    reordered.forEach((ex, idx) => updateStmt.run(idx, ex.id));
  });
  transaction();
}

// Sessions
export function createSession(dayId: number, userId: number): Session | undefined {
  const day = getDayById(dayId, userId);
  if (!day) return undefined;

  const result = db.prepare('INSERT INTO sessions (user_id, day_id, started_at) VALUES (?, ?, ?)').run(userId, dayId, new Date().toISOString());
  return getSessionById(Number(result.lastInsertRowid), userId);
}

export function getSessionById(id: number, userId: number): Session | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, userId) as Session | undefined;
}

export function endSession(id: number, userId: number, notes?: string): Session | undefined {
  const session = getSessionById(id, userId);
  if (!session) return undefined;

  db.prepare('UPDATE sessions SET ended_at = ?, notes = ? WHERE id = ?').run(new Date().toISOString(), notes || null, id);
  return getSessionById(id, userId);
}

export function getAllSessions(userId: number): SessionWithDay[] {
  return db.prepare(`
    SELECT s.*, d.name as day_name, d.display_name as day_display_name
    FROM sessions s
    JOIN workout_days d ON s.day_id = d.id
    WHERE s.user_id = ?
    ORDER BY s.started_at DESC
  `).all(userId) as SessionWithDay[];
}

export function getActiveSession(userId: number): SessionWithDay | undefined {
  return db.prepare(`
    SELECT s.*, d.name as day_name, d.display_name as day_display_name
    FROM sessions s
    JOIN workout_days d ON s.day_id = d.id
    WHERE s.user_id = ? AND s.ended_at IS NULL
    ORDER BY s.started_at DESC
    LIMIT 1
  `).get(userId) as SessionWithDay | undefined;
}

// Session Exercises
export function getSessionExercises(sessionId: number, userId: number): ExerciseWithSets[] {
  const session = getSessionById(sessionId, userId);
  if (!session) return [];

  const exercises = getExercisesByDay(session.day_id, userId);
  const sessionExercises = db.prepare(
    'SELECT * FROM session_exercises WHERE session_id = ?'
  ).all(sessionId) as SessionExercise[];

  return exercises.map(exercise => {
    const sessionExercise = sessionExercises.find(se => se.exercise_id === exercise.id);
    const sets = sessionExercise
      ? (db.prepare('SELECT * FROM set_logs WHERE session_exercise_id = ? ORDER BY set_number').all(sessionExercise.id) as SetLog[])
      : [];

    // Get last session's sets for this exercise (for placeholders)
    const lastSets = db.prepare(`
      SELECT sl.* FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE se.exercise_id = ?
        AND s.id != ?
        AND s.ended_at IS NOT NULL
        AND s.user_id = ?
      ORDER BY s.started_at DESC, sl.set_number ASC
    `).all(exercise.id, sessionId, userId) as SetLog[];

    // Get only sets from the most recent session
    const lastSessionSets: SetLog[] = [];
    if (lastSets.length > 0) {
      const firstSessionExId = lastSets[0].session_exercise_id;
      for (const set of lastSets) {
        if (set.session_exercise_id === firstSessionExId) {
          lastSessionSets.push(set);
        } else {
          break;
        }
      }
    }

    return {
      ...exercise,
      session_exercise_id: sessionExercise?.id,
      completed: sessionExercise?.completed ?? false,
      sets,
      lastSets: lastSessionSets
    };
  });
}

export function logSet(sessionId: number, exerciseId: number, userId: number, setNumber: number, weight: number | null, reps: number | null, isDropset: boolean = false, notes: string | null = null): SetLog | undefined {
  const session = getSessionById(sessionId, userId);
  if (!session) return undefined;

  let sessionExercise = db.prepare(
    'SELECT * FROM session_exercises WHERE session_id = ? AND exercise_id = ?'
  ).get(sessionId, exerciseId) as SessionExercise | undefined;

  if (!sessionExercise) {
    const result = db.prepare(
      'INSERT INTO session_exercises (session_id, exercise_id, completed) VALUES (?, ?, 0)'
    ).run(sessionId, exerciseId);
    sessionExercise = { id: Number(result.lastInsertRowid), session_id: sessionId, exercise_id: exerciseId, completed: false, notes: null };
  }

  // Check if set already exists
  const existingSet = db.prepare(
    'SELECT * FROM set_logs WHERE session_exercise_id = ? AND set_number = ?'
  ).get(sessionExercise.id, setNumber) as SetLog | undefined;

  if (existingSet) {
    db.prepare(
      'UPDATE set_logs SET weight = ?, reps = ?, is_dropset = ?, notes = ? WHERE id = ?'
    ).run(weight, reps, isDropset ? 1 : 0, notes, existingSet.id);
    return { ...existingSet, weight, reps, is_dropset: isDropset, notes };
  }

  const result = db.prepare(
    'INSERT INTO set_logs (session_exercise_id, set_number, weight, reps, is_dropset, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sessionExercise.id, setNumber, weight, reps, isDropset ? 1 : 0, notes);

  return {
    id: Number(result.lastInsertRowid),
    session_exercise_id: sessionExercise.id,
    set_number: setNumber,
    weight,
    reps,
    is_dropset: isDropset,
    notes
  };
}

export function markExerciseComplete(sessionId: number, exerciseId: number, userId: number, completed: boolean = true): void {
  const session = getSessionById(sessionId, userId);
  if (!session) return;

  let sessionExercise = db.prepare(
    'SELECT * FROM session_exercises WHERE session_id = ? AND exercise_id = ?'
  ).get(sessionId, exerciseId) as SessionExercise | undefined;

  if (!sessionExercise) {
    db.prepare(
      'INSERT INTO session_exercises (session_id, exercise_id, completed) VALUES (?, ?, ?)'
    ).run(sessionId, exerciseId, completed ? 1 : 0);
  } else {
    db.prepare('UPDATE session_exercises SET completed = ? WHERE id = ?').run(completed ? 1 : 0, sessionExercise.id);
  }

  // Update the exercise's default weight to the max weight used in this session
  if (completed) {
    const maxWeight = db.prepare(`
      SELECT MAX(sl.weight) as max_weight
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      WHERE se.session_id = ? AND se.exercise_id = ?
    `).get(sessionId, exerciseId) as { max_weight: number | null };

    if (maxWeight.max_weight !== null) {
      db.prepare('UPDATE exercises SET default_weight = ? WHERE id = ?').run(maxWeight.max_weight, exerciseId);
    }
  }
}

// Progress
export function getExerciseProgress(exerciseId: number, userId: number): { date: string; maxWeight: number; totalReps: number }[] {
  const exercise = getExerciseById(exerciseId, userId);
  if (!exercise) return [];

  return db.prepare(`
    SELECT
      DATE(s.started_at) as date,
      MAX(sl.weight) as maxWeight,
      SUM(sl.reps) as totalReps
    FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE se.exercise_id = ? AND s.user_id = ?
    GROUP BY DATE(s.started_at)
    ORDER BY date ASC
  `).all(exerciseId, userId) as { date: string; maxWeight: number; totalReps: number }[];
}

export function getAllExercises(userId: number): (Exercise & { day_display_name: string })[] {
  return db.prepare(`
    SELECT e.*, d.display_name as day_display_name
    FROM exercises e
    JOIN workout_days d ON e.day_id = d.id
    WHERE d.user_id = ?
    ORDER BY d.id, e.order_index
  `).all(userId) as (Exercise & { day_display_name: string })[];
}

// Get last session volume for an exercise (excluding current session)
export function getLastSessionVolume(exerciseId: number, userId: number, excludeSessionId?: number): number | null {
  const exercise = getExerciseById(exerciseId, userId);
  if (!exercise) return null;

  const query = excludeSessionId
    ? `
      SELECT SUM(sl.weight * sl.reps) as volume
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE se.exercise_id = ? AND s.id != ? AND s.user_id = ?
      AND s.started_at = (
        SELECT MAX(s2.started_at)
        FROM sessions s2
        JOIN session_exercises se2 ON s2.id = se2.session_id
        WHERE se2.exercise_id = ? AND s2.id != ? AND s2.user_id = ?
      )
    `
    : `
      SELECT SUM(sl.weight * sl.reps) as volume
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE se.exercise_id = ? AND s.user_id = ?
      AND s.started_at = (
        SELECT MAX(s2.started_at)
        FROM sessions s2
        JOIN session_exercises se2 ON s2.id = se2.session_id
        WHERE se2.exercise_id = ? AND s2.user_id = ?
      )
    `;

  const params = excludeSessionId
    ? [exerciseId, excludeSessionId, userId, exerciseId, excludeSessionId, userId]
    : [exerciseId, userId, exerciseId, userId];

  const result = db.prepare(query).get(...params) as { volume: number | null };
  return result?.volume || null;
}

// Delete session
export function deleteSession(id: number, userId: number): boolean {
  const session = getSessionById(id, userId);
  if (!session) return false;

  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

// Update set
export function updateSetLog(id: number, userId: number, weight: number | null, reps: number | null): SetLog | undefined {
  // Verify ownership
  const existing = db.prepare(`
    SELECT sl.* FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE sl.id = ? AND s.user_id = ?
  `).get(id, userId) as SetLog | undefined;
  if (!existing) return undefined;

  db.prepare('UPDATE set_logs SET weight = ?, reps = ? WHERE id = ?').run(weight, reps, id);
  return { ...existing, weight, reps };
}

// Delete set
export function deleteSetLog(id: number, userId: number): boolean {
  // Verify ownership
  const existing = db.prepare(`
    SELECT sl.id FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE sl.id = ? AND s.user_id = ?
  `).get(id, userId);
  if (!existing) return false;

  const result = db.prepare('DELETE FROM set_logs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Get max weight ever for an exercise before a given session
export function getExerciseMaxWeightBefore(exerciseId: number, beforeSessionId: number, userId: number): number | null {
  const result = db.prepare(`
    SELECT MAX(sl.weight) as max_weight
    FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE se.exercise_id = ?
      AND s.id != ?
      AND s.user_id = ?
      AND s.started_at < (SELECT started_at FROM sessions WHERE id = ?)
  `).get(exerciseId, beforeSessionId, userId, beforeSessionId) as { max_weight: number | null };
  return result?.max_weight || null;
}

// Get previous bests for an exercise before a given session
function getExercisePreviousBests(exerciseId: number, beforeSessionId: number, userId: number): {
  maxWeight: number | null;
  maxSetVolume: number | null;
  maxTotalVolume: number | null;
  maxReps: number | null;
} {
  const result = db.prepare(`
    SELECT
      MAX(sl.weight) as max_weight,
      MAX(sl.weight * sl.reps) as max_set_volume,
      MAX(sl.reps) as max_reps
    FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE se.exercise_id = ?
      AND s.id != ?
      AND s.user_id = ?
      AND s.started_at < (SELECT started_at FROM sessions WHERE id = ?)
  `).get(exerciseId, beforeSessionId, userId, beforeSessionId) as {
    max_weight: number | null;
    max_set_volume: number | null;
    max_reps: number | null;
  };

  // Get max total volume from any previous session
  const volumeResult = db.prepare(`
    SELECT MAX(session_volume) as max_total_volume FROM (
      SELECT SUM(sl.weight * sl.reps) as session_volume
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE se.exercise_id = ?
        AND s.id != ?
        AND s.user_id = ?
        AND s.started_at < (SELECT started_at FROM sessions WHERE id = ?)
      GROUP BY s.id
    )
  `).get(exerciseId, beforeSessionId, userId, beforeSessionId) as { max_total_volume: number | null };

  return {
    maxWeight: result?.max_weight || null,
    maxSetVolume: result?.max_set_volume || null,
    maxTotalVolume: volumeResult?.max_total_volume || null,
    maxReps: result?.max_reps || null
  };
}

// Get session stats (volume per exercise, PRs)
export function getSessionStats(sessionId: number, userId: number): {
  exerciseId: number;
  volume: number;
  maxWeight: number;
  maxSetVolume: number;
  maxReps: number;
  prs: {
    volume: boolean;
    setVolume: boolean;
    weight: boolean;
    reps: boolean;
  };
}[] {
  const session = getSessionById(sessionId, userId);
  if (!session) return [];

  const exercises = db.prepare(`
    SELECT DISTINCT se.exercise_id
    FROM session_exercises se
    WHERE se.session_id = ?
  `).all(sessionId) as { exercise_id: number }[];

  return exercises.map(ex => {
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(sl.weight * sl.reps), 0) as volume,
        MAX(sl.weight) as max_weight,
        MAX(sl.weight * sl.reps) as max_set_volume,
        MAX(sl.reps) as max_reps
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      WHERE se.session_id = ? AND se.exercise_id = ?
    `).get(sessionId, ex.exercise_id) as {
      volume: number;
      max_weight: number | null;
      max_set_volume: number | null;
      max_reps: number | null;
    };

    const currentVolume = stats.volume || 0;
    const currentMaxWeight = stats.max_weight || 0;
    const currentMaxSetVolume = stats.max_set_volume || 0;
    const currentMaxReps = stats.max_reps || 0;

    const prevBests = getExercisePreviousBests(ex.exercise_id, sessionId, userId);

    const isBodyweight = currentMaxWeight === 0;

    const prs = {
      volume: currentVolume > 0 && (prevBests.maxTotalVolume === null || currentVolume > prevBests.maxTotalVolume),
      setVolume: !isBodyweight && currentMaxSetVolume > 0 && (prevBests.maxSetVolume === null || currentMaxSetVolume > prevBests.maxSetVolume),
      weight: !isBodyweight && currentMaxWeight > 0 && (prevBests.maxWeight === null || currentMaxWeight > prevBests.maxWeight),
      reps: isBodyweight && currentMaxReps > 0 && (prevBests.maxReps === null || currentMaxReps > prevBests.maxReps)
    };

    return {
      exerciseId: ex.exercise_id,
      volume: currentVolume,
      maxWeight: currentMaxWeight,
      maxSetVolume: currentMaxSetVolume,
      maxReps: currentMaxReps,
      prs
    };
  });
}

// Body Measurements
export function getAllMeasurements(userId: number): BodyMeasurement[] {
  return db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY measured_at DESC').all(userId) as BodyMeasurement[];
}

export function getMeasurementById(id: number, userId: number): BodyMeasurement | undefined {
  return db.prepare('SELECT * FROM body_measurements WHERE id = ? AND user_id = ?').get(id, userId) as BodyMeasurement | undefined;
}

export function getLatestMeasurement(userId: number): BodyMeasurement | undefined {
  return db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY measured_at DESC LIMIT 1').get(userId) as BodyMeasurement | undefined;
}

export function createMeasurement(userId: number, data: Omit<BodyMeasurement, 'id'>): BodyMeasurement {
  const result = db.prepare(`
    INSERT INTO body_measurements (
      user_id, measured_at, weight, chest, waist, hips,
      left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf,
      shoulders, neck, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    data.measured_at,
    data.weight ?? null,
    data.chest ?? null,
    data.waist ?? null,
    data.hips ?? null,
    data.left_arm ?? null,
    data.right_arm ?? null,
    data.left_thigh ?? null,
    data.right_thigh ?? null,
    data.left_calf ?? null,
    data.right_calf ?? null,
    data.shoulders ?? null,
    data.neck ?? null,
    data.notes ?? null
  );
  return getMeasurementById(Number(result.lastInsertRowid), userId)!;
}

export function updateMeasurement(id: number, userId: number, data: Partial<Omit<BodyMeasurement, 'id'>>): BodyMeasurement | undefined {
  const existing = getMeasurementById(id, userId);
  if (!existing) return undefined;

  const updated = { ...existing, ...data };
  db.prepare(`
    UPDATE body_measurements SET
      measured_at = ?, weight = ?, chest = ?, waist = ?, hips = ?,
      left_arm = ?, right_arm = ?, left_thigh = ?, right_thigh = ?, left_calf = ?, right_calf = ?,
      shoulders = ?, neck = ?, notes = ?
    WHERE id = ?
  `).run(
    updated.measured_at,
    updated.weight ?? null,
    updated.chest ?? null,
    updated.waist ?? null,
    updated.hips ?? null,
    updated.left_arm ?? null,
    updated.right_arm ?? null,
    updated.left_thigh ?? null,
    updated.right_thigh ?? null,
    updated.left_calf ?? null,
    updated.right_calf ?? null,
    updated.shoulders ?? null,
    updated.neck ?? null,
    updated.notes ?? null,
    id
  );
  return getMeasurementById(id, userId);
}

export function deleteMeasurement(id: number, userId: number): boolean {
  const existing = getMeasurementById(id, userId);
  if (!existing) return false;

  const result = db.prepare('DELETE FROM body_measurements WHERE id = ?').run(id);
  return result.changes > 0;
}

// Settings
export function getSetting(userId: number, key: string): string | null {
  const result = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(userId, key) as { value: string } | undefined;
  return result?.value ?? null;
}

export function setSetting(userId: number, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)').run(userId, key, value);
}

// Summary Stats
export function getTotalWorkoutCount(userId: number): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND ended_at IS NOT NULL').get(userId) as { count: number };
  return result.count;
}

export function getTotalWorkoutHours(userId: number): number {
  const result = db.prepare(`
    SELECT COALESCE(SUM(
      (julianday(ended_at) - julianday(started_at)) * 24
    ), 0) as hours
    FROM sessions
    WHERE user_id = ? AND ended_at IS NOT NULL
  `).get(userId) as { hours: number };
  return Math.round(result.hours * 10) / 10;
}

// Get workouts for current week (Monday to Sunday)
export function getCurrentWeekWorkouts(userId: number): { date: string; dayOfWeek: number }[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  const mondayStr = monday.toISOString();

  const result = db.prepare(`
    SELECT DATE(started_at) as date,
           CAST(strftime('%w', started_at) AS INTEGER) as dayOfWeek
    FROM sessions
    WHERE user_id = ? AND ended_at IS NOT NULL
      AND started_at >= ?
    GROUP BY DATE(started_at)
    ORDER BY date
  `).all(userId, mondayStr) as { date: string; dayOfWeek: number }[];

  return result;
}

// Get weekly goal (default 3)
export function getWeeklyGoal(userId: number): number {
  const value = getSetting(userId, 'weekly_goal');
  return value ? parseInt(value, 10) : 3;
}

export function setWeeklyGoal(userId: number, goal: number): void {
  setSetting(userId, 'weekly_goal', goal.toString());
}

// Calculate streak of completed weeks
export function getWeekStreak(userId: number): { current: number; best: number } {
  const weeklyGoal = getWeeklyGoal(userId);

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

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Get complete summary stats
export function getSummaryStats(userId: number): {
  totalWorkouts: number;
  totalHours: number;
  weeklyGoal: number;
  currentWeekWorkouts: { date: string; dayOfWeek: number }[];
  streak: { current: number; best: number };
} {
  return {
    totalWorkouts: getTotalWorkoutCount(userId),
    totalHours: getTotalWorkoutHours(userId),
    weeklyGoal: getWeeklyGoal(userId),
    currentWeekWorkouts: getCurrentWeekWorkouts(userId),
    streak: getWeekStreak(userId)
  };
}


export { db };
