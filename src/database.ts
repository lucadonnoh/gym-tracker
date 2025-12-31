import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { WorkoutDay, Exercise, Session, SessionExercise, SetLog, SessionWithDay, ExerciseWithSets, BodyMeasurement } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'gym.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
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
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exercises_day ON exercises(day_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day_id);
    CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id);
    CREATE INDEX IF NOT EXISTS idx_set_logs_session_exercise ON set_logs(session_exercise_id);
    CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON body_measurements(measured_at);
  `);
}

// Workout Days
export function getAllDays(): (WorkoutDay & { last_session_date: string | null })[] {
  return db.prepare(`
    SELECT wd.*,
      (SELECT MAX(s.started_at) FROM sessions s WHERE s.day_id = wd.id AND s.ended_at IS NOT NULL) as last_session_date
    FROM workout_days wd
    ORDER BY wd.id
  `).all() as (WorkoutDay & { last_session_date: string | null })[];
}

export function getDayById(id: number): WorkoutDay | undefined {
  return db.prepare('SELECT * FROM workout_days WHERE id = ?').get(id) as WorkoutDay | undefined;
}

// Exercises
export function getExercisesByDay(dayId: number): Exercise[] {
  return db.prepare('SELECT * FROM exercises WHERE day_id = ? ORDER BY order_index').all(dayId) as Exercise[];
}

export function getExerciseById(id: number): Exercise | undefined {
  return db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as Exercise | undefined;
}

export function createExercise(dayId: number, name: string, description: string | null, defaultWeight: number | null): Exercise {
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM exercises WHERE day_id = ?').get(dayId) as { next: number };
  const result = db.prepare(
    'INSERT INTO exercises (day_id, name, description, default_weight, order_index) VALUES (?, ?, ?, ?, ?)'
  ).run(dayId, name, description, defaultWeight, maxOrder.next);
  return getExerciseById(Number(result.lastInsertRowid))!;
}

export function updateExercise(id: number, name: string, description: string | null, defaultWeight: number | null): Exercise | undefined {
  db.prepare('UPDATE exercises SET name = ?, description = ?, default_weight = ? WHERE id = ?').run(name, description, defaultWeight, id);
  return getExerciseById(id);
}

export function deleteExercise(id: number): boolean {
  const result = db.prepare('DELETE FROM exercises WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderExercise(id: number, newIndex: number): void {
  const exercise = getExerciseById(id);
  if (!exercise) return;

  const exercises = getExercisesByDay(exercise.day_id);
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
export function createSession(dayId: number): Session {
  const result = db.prepare('INSERT INTO sessions (day_id, started_at) VALUES (?, ?)').run(dayId, new Date().toISOString());
  return getSessionById(Number(result.lastInsertRowid))!;
}

export function getSessionById(id: number): Session | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function endSession(id: number, notes?: string): Session | undefined {
  db.prepare('UPDATE sessions SET ended_at = ?, notes = ? WHERE id = ?').run(new Date().toISOString(), notes || null, id);
  return getSessionById(id);
}

export function getAllSessions(): SessionWithDay[] {
  return db.prepare(`
    SELECT s.*, d.name as day_name, d.display_name as day_display_name
    FROM sessions s
    JOIN workout_days d ON s.day_id = d.id
    ORDER BY s.started_at DESC
  `).all() as SessionWithDay[];
}

export function getActiveSession(): SessionWithDay | undefined {
  return db.prepare(`
    SELECT s.*, d.name as day_name, d.display_name as day_display_name
    FROM sessions s
    JOIN workout_days d ON s.day_id = d.id
    WHERE s.ended_at IS NULL
    ORDER BY s.started_at DESC
    LIMIT 1
  `).get() as SessionWithDay | undefined;
}

// Session Exercises
export function getSessionExercises(sessionId: number): ExerciseWithSets[] {
  const session = getSessionById(sessionId);
  if (!session) return [];

  const exercises = getExercisesByDay(session.day_id);
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
      ORDER BY s.started_at DESC, sl.set_number ASC
    `).all(exercise.id, sessionId) as SetLog[];

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

export function logSet(sessionId: number, exerciseId: number, setNumber: number, weight: number | null, reps: number | null, isDropset: boolean = false, notes: string | null = null): SetLog {
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

export function markExerciseComplete(sessionId: number, exerciseId: number, completed: boolean): void {
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
export function getExerciseProgress(exerciseId: number): { date: string; maxWeight: number; totalReps: number }[] {
  return db.prepare(`
    SELECT
      DATE(s.started_at) as date,
      MAX(sl.weight) as maxWeight,
      SUM(sl.reps) as totalReps
    FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE se.exercise_id = ?
    GROUP BY DATE(s.started_at)
    ORDER BY date ASC
  `).all(exerciseId) as { date: string; maxWeight: number; totalReps: number }[];
}

export function getAllExercises(): (Exercise & { day_display_name: string })[] {
  return db.prepare(`
    SELECT e.*, d.display_name as day_display_name
    FROM exercises e
    JOIN workout_days d ON e.day_id = d.id
    ORDER BY d.id, e.order_index
  `).all() as (Exercise & { day_display_name: string })[];
}

// Get last session volume for an exercise (excluding current session)
export function getLastSessionVolume(exerciseId: number, excludeSessionId?: number): number | null {
  const query = excludeSessionId
    ? `
      SELECT SUM(sl.weight * sl.reps) as volume
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE se.exercise_id = ? AND s.id != ?
      AND s.started_at = (
        SELECT MAX(s2.started_at)
        FROM sessions s2
        JOIN session_exercises se2 ON s2.id = se2.session_id
        WHERE se2.exercise_id = ? AND s2.id != ?
      )
    `
    : `
      SELECT SUM(sl.weight * sl.reps) as volume
      FROM set_logs sl
      JOIN session_exercises se ON sl.session_exercise_id = se.id
      JOIN sessions s ON se.session_id = s.id
      WHERE se.exercise_id = ?
      AND s.started_at = (
        SELECT MAX(s2.started_at)
        FROM sessions s2
        JOIN session_exercises se2 ON s2.id = se2.session_id
        WHERE se2.exercise_id = ?
      )
    `;

  const params = excludeSessionId
    ? [exerciseId, excludeSessionId, exerciseId, excludeSessionId]
    : [exerciseId, exerciseId];

  const result = db.prepare(query).get(...params) as { volume: number | null };
  return result?.volume || null;
}

// Delete session
export function deleteSession(id: number): boolean {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

// Update set
export function updateSetLog(id: number, weight: number | null, reps: number | null): SetLog | undefined {
  const existing = db.prepare('SELECT * FROM set_logs WHERE id = ?').get(id) as SetLog | undefined;
  if (!existing) return undefined;

  db.prepare('UPDATE set_logs SET weight = ?, reps = ? WHERE id = ?').run(weight, reps, id);
  return { ...existing, weight, reps };
}

// Delete set
export function deleteSetLog(id: number): boolean {
  const result = db.prepare('DELETE FROM set_logs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Get max weight ever for an exercise before a given session
export function getExerciseMaxWeightBefore(exerciseId: number, beforeSessionId: number): number | null {
  const result = db.prepare(`
    SELECT MAX(sl.weight) as max_weight
    FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN sessions s ON se.session_id = s.id
    WHERE se.exercise_id = ?
      AND s.id != ?
      AND s.started_at < (SELECT started_at FROM sessions WHERE id = ?)
  `).get(exerciseId, beforeSessionId, beforeSessionId) as { max_weight: number | null };
  return result?.max_weight || null;
}

// Get previous bests for an exercise before a given session
function getExercisePreviousBests(exerciseId: number, beforeSessionId: number): {
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
      AND s.started_at < (SELECT started_at FROM sessions WHERE id = ?)
  `).get(exerciseId, beforeSessionId, beforeSessionId) as {
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
        AND s.started_at < (SELECT started_at FROM sessions WHERE id = ?)
      GROUP BY s.id
    )
  `).get(exerciseId, beforeSessionId, beforeSessionId) as { max_total_volume: number | null };

  return {
    maxWeight: result?.max_weight || null,
    maxSetVolume: result?.max_set_volume || null,
    maxTotalVolume: volumeResult?.max_total_volume || null,
    maxReps: result?.max_reps || null
  };
}

// Get session stats (volume per exercise, PRs)
export function getSessionStats(sessionId: number): {
  exerciseId: number;
  volume: number;
  maxWeight: number;
  maxSetVolume: number;
  maxReps: number;
  prs: {
    volume: boolean;      // Total exercise volume PR
    setVolume: boolean;   // Single set volume PR
    weight: boolean;      // 1RM PR (max weight)
    reps: boolean;        // Max reps in single set (for bodyweight)
  };
}[] {
  const exercises = db.prepare(`
    SELECT DISTINCT se.exercise_id
    FROM session_exercises se
    WHERE se.session_id = ?
  `).all(sessionId) as { exercise_id: number }[];

  return exercises.map(ex => {
    // Get current session stats
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

    const prevBests = getExercisePreviousBests(ex.exercise_id, sessionId);

    // Determine PRs
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
export function getAllMeasurements(): BodyMeasurement[] {
  return db.prepare('SELECT * FROM body_measurements ORDER BY measured_at DESC').all() as BodyMeasurement[];
}

export function getMeasurementById(id: number): BodyMeasurement | undefined {
  return db.prepare('SELECT * FROM body_measurements WHERE id = ?').get(id) as BodyMeasurement | undefined;
}

export function getLatestMeasurement(): BodyMeasurement | undefined {
  return db.prepare('SELECT * FROM body_measurements ORDER BY measured_at DESC LIMIT 1').get() as BodyMeasurement | undefined;
}

export function createMeasurement(data: Omit<BodyMeasurement, 'id'>): BodyMeasurement {
  const result = db.prepare(`
    INSERT INTO body_measurements (
      measured_at, weight, chest, waist, hips,
      left_arm, right_arm, left_thigh, right_thigh, left_calf, right_calf,
      shoulders, neck, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  return getMeasurementById(Number(result.lastInsertRowid))!;
}

export function updateMeasurement(id: number, data: Partial<Omit<BodyMeasurement, 'id'>>): BodyMeasurement | undefined {
  const existing = getMeasurementById(id);
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
  return getMeasurementById(id);
}

export function deleteMeasurement(id: number): boolean {
  const result = db.prepare('DELETE FROM body_measurements WHERE id = ?').run(id);
  return result.changes > 0;
}

// Settings
export function getSetting(key: string): string | null {
  const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return result?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Summary Stats
export function getTotalWorkoutCount(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE ended_at IS NOT NULL').get() as { count: number };
  return result.count;
}

export function getTotalWorkoutHours(): number {
  const result = db.prepare(`
    SELECT COALESCE(SUM(
      (julianday(ended_at) - julianday(started_at)) * 24
    ), 0) as hours
    FROM sessions
    WHERE ended_at IS NOT NULL
  `).get() as { hours: number };
  return Math.round(result.hours * 10) / 10;
}

// Get workouts for current week (Monday to Sunday)
export function getCurrentWeekWorkouts(): { date: string; dayOfWeek: number }[] {
  // Get start of current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  const mondayStr = monday.toISOString();

  const result = db.prepare(`
    SELECT DATE(started_at) as date,
           CAST(strftime('%w', started_at) AS INTEGER) as dayOfWeek
    FROM sessions
    WHERE ended_at IS NOT NULL
      AND started_at >= ?
    GROUP BY DATE(started_at)
    ORDER BY date
  `).all(mondayStr) as { date: string; dayOfWeek: number }[];

  return result;
}

// Get weekly goal (default 3)
export function getWeeklyGoal(): number {
  const value = getSetting('weekly_goal');
  return value ? parseInt(value, 10) : 3;
}

export function setWeeklyGoal(goal: number): void {
  setSetting('weekly_goal', goal.toString());
}

// Calculate streak of completed weeks
export function getWeekStreak(): { current: number; best: number } {
  const weeklyGoal = getWeeklyGoal();

  // Get all completed sessions grouped by week
  const weeks = db.prepare(`
    SELECT
      strftime('%Y-%W', started_at) as week,
      COUNT(DISTINCT DATE(started_at)) as workout_days
    FROM sessions
    WHERE ended_at IS NOT NULL
    GROUP BY strftime('%Y-%W', started_at)
    ORDER BY week DESC
  `).all() as { week: string; workout_days: number }[];

  if (weeks.length === 0) {
    return { current: 0, best: 0 };
  }

  // Get current week identifier
  const now = new Date();
  const currentWeek = `${now.getFullYear()}-${String(getWeekNumber(now)).padStart(2, '0')}`;

  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  let checkingCurrent = true;

  // Parse weeks into a map for easy lookup
  const weekMap = new Map(weeks.map(w => [w.week, w.workout_days]));

  // Start from current week and go backwards
  let checkDate = new Date(now);

  // Check if current week is complete
  const currentWeekWorkouts = weekMap.get(currentWeek) || 0;
  const currentWeekComplete = currentWeekWorkouts >= weeklyGoal;

  // For current streak, we can include current week if it's complete,
  // or start counting from last week if current week is incomplete
  if (!currentWeekComplete) {
    // Move to last week
    checkDate.setDate(checkDate.getDate() - 7);
  }

  // Count consecutive completed weeks
  for (let i = 0; i < 52; i++) { // Check up to a year back
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

  // Final check for best streak
  if (tempStreak > bestStreak) {
    bestStreak = tempStreak;
  }

  return { current: currentStreak, best: Math.max(bestStreak, currentStreak) };
}

// Helper function to get ISO week number
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Get complete summary stats
export function getSummaryStats(): {
  totalWorkouts: number;
  totalHours: number;
  weeklyGoal: number;
  currentWeekWorkouts: { date: string; dayOfWeek: number }[];
  streak: { current: number; best: number };
} {
  return {
    totalWorkouts: getTotalWorkoutCount(),
    totalHours: getTotalWorkoutHours(),
    weeklyGoal: getWeeklyGoal(),
    currentWeekWorkouts: getCurrentWeekWorkouts(),
    streak: getWeekStreak()
  };
}


export { db };
