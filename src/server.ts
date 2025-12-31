import express from 'express';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { statSync } from 'fs';
import {
  initializeDatabase,
  getAllDays,
  getDayById,
  getExercisesByDay,
  getExerciseById,
  createExercise,
  updateExercise,
  deleteExercise,
  reorderExercise,
  createSession,
  getSessionById,
  endSession,
  getAllSessions,
  getActiveSession,
  getSessionExercises,
  logSet,
  markExerciseComplete,
  getExerciseProgress,
  getAllExercises,
  deleteSession,
  updateSetLog,
  deleteSetLog,
  getLastSessionVolume,
  getSessionStats,
  getAllMeasurements,
  getMeasurementById,
  getLatestMeasurement,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement,
  getSummaryStats,
  getWeeklyGoal,
  setWeeklyGoal,
  db
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('combined'));
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// Initialize database
initializeDatabase();

// Workout Days
app.get('/api/days', (_req, res) => {
  res.json(getAllDays());
});

app.get('/api/days/:id', (req, res) => {
  const day = getDayById(Number(req.params.id));
  if (!day) return res.status(404).json({ error: 'Day not found' });
  res.json(day);
});

app.get('/api/days/:id/exercises', (req, res) => {
  res.json(getExercisesByDay(Number(req.params.id)));
});

// Exercises
app.get('/api/exercises', (_req, res) => {
  res.json(getAllExercises());
});

app.get('/api/exercises/:id', (req, res) => {
  const exercise = getExerciseById(Number(req.params.id));
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

app.post('/api/exercises', (req, res) => {
  const { day_id, name, description, default_weight } = req.body;
  if (!day_id || !name) {
    return res.status(400).json({ error: 'day_id and name are required' });
  }
  const exercise = createExercise(day_id, name, description || null, default_weight || null);
  res.status(201).json(exercise);
});

app.put('/api/exercises/:id', (req, res) => {
  const { name, description, default_weight } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  const exercise = updateExercise(Number(req.params.id), name, description || null, default_weight ?? null);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

app.delete('/api/exercises/:id', (req, res) => {
  const deleted = deleteExercise(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Exercise not found' });
  res.status(204).send();
});

app.put('/api/exercises/:id/reorder', (req, res) => {
  const { newIndex } = req.body;
  if (typeof newIndex !== 'number') {
    return res.status(400).json({ error: 'newIndex is required' });
  }
  reorderExercise(Number(req.params.id), newIndex);
  res.status(204).send();
});

// Sessions
app.get('/api/sessions', (_req, res) => {
  res.json(getAllSessions());
});

app.get('/api/sessions/active', (_req, res) => {
  const session = getActiveSession();
  res.json(session || null);
});

app.post('/api/sessions', (req, res) => {
  const { day_id } = req.body;
  if (!day_id) {
    return res.status(400).json({ error: 'day_id is required' });
  }

  // Check for existing active session
  const active = getActiveSession();
  if (active) {
    return res.status(400).json({ error: 'An active session already exists', activeSession: active });
  }

  const session = createSession(day_id);
  res.status(201).json(session);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSessionById(Number(req.params.id));
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.put('/api/sessions/:id/end', (req, res) => {
  const { notes } = req.body;
  const session = endSession(Number(req.params.id), notes);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.delete('/api/sessions/:id', (req, res) => {
  const deleted = deleteSession(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

// Session Exercises
app.get('/api/sessions/:id/exercises', (req, res) => {
  res.json(getSessionExercises(Number(req.params.id)));
});

app.post('/api/sessions/:sessionId/exercises/:exerciseId/sets', (req, res) => {
  const { set_number, weight, reps, is_dropset, notes } = req.body;
  if (typeof set_number !== 'number') {
    return res.status(400).json({ error: 'set_number is required' });
  }
  const set = logSet(
    Number(req.params.sessionId),
    Number(req.params.exerciseId),
    set_number,
    weight ?? null,
    reps ?? null,
    is_dropset ?? false,
    notes ?? null
  );
  res.status(201).json(set);
});

app.put('/api/sessions/:sessionId/exercises/:exerciseId/complete', (req, res) => {
  const { completed } = req.body;
  markExerciseComplete(Number(req.params.sessionId), Number(req.params.exerciseId), completed ?? true);
  res.status(204).send();
});

// Set CRUD
app.put('/api/sets/:id', (req, res) => {
  const { weight, reps } = req.body;
  const set = updateSetLog(Number(req.params.id), weight ?? null, reps ?? null);
  if (!set) return res.status(404).json({ error: 'Set not found' });
  res.json(set);
});

app.delete('/api/sets/:id', (req, res) => {
  const deleted = deleteSetLog(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Set not found' });
  res.status(204).send();
});

// Progress
app.get('/api/progress/:exerciseId', (req, res) => {
  res.json(getExerciseProgress(Number(req.params.exerciseId)));
});

// Get last session volume for comparison
app.get('/api/exercises/:exerciseId/last-volume', (req, res) => {
  const excludeSessionId = req.query.excludeSession ? Number(req.query.excludeSession) : undefined;
  const volume = getLastSessionVolume(Number(req.params.exerciseId), excludeSessionId);
  res.json({ volume });
});

// Get session stats (volume, PRs)
app.get('/api/sessions/:id/stats', (req, res) => {
  const stats = getSessionStats(Number(req.params.id));
  res.json(stats);
});

// Body Measurements
app.get('/api/measurements', (_req, res) => {
  res.json(getAllMeasurements());
});

app.get('/api/measurements/latest', (_req, res) => {
  const measurement = getLatestMeasurement();
  res.json(measurement || null);
});

app.get('/api/measurements/:id', (req, res) => {
  const measurement = getMeasurementById(Number(req.params.id));
  if (!measurement) return res.status(404).json({ error: 'Measurement not found' });
  res.json(measurement);
});

app.post('/api/measurements', (req, res) => {
  const data = req.body;
  if (!data.measured_at) {
    data.measured_at = new Date().toISOString();
  }
  const measurement = createMeasurement(data);
  res.status(201).json(measurement);
});

app.put('/api/measurements/:id', (req, res) => {
  const measurement = updateMeasurement(Number(req.params.id), req.body);
  if (!measurement) return res.status(404).json({ error: 'Measurement not found' });
  res.json(measurement);
});

app.delete('/api/measurements/:id', (req, res) => {
  const deleted = deleteMeasurement(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Measurement not found' });
  res.status(204).send();
});

// Summary Stats
app.get('/api/stats/summary', (_req, res) => {
  res.json(getSummaryStats());
});

app.get('/api/stats/weekly-goal', (_req, res) => {
  res.json({ goal: getWeeklyGoal() });
});

app.put('/api/stats/weekly-goal', (req, res) => {
  const { goal } = req.body;
  if (typeof goal !== 'number' || goal < 1 || goal > 7) {
    return res.status(400).json({ error: 'Goal must be a number between 1 and 7' });
  }
  setWeeklyGoal(goal);
  res.json({ goal: getWeeklyGoal() });
});

// Admin/Debug endpoints
app.get('/api/admin/db-stats', (_req, res) => {
  const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'gym.db');

  try {
    const stats = statSync(dbPath);
    const tableStats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM workout_days) as workout_days,
        (SELECT COUNT(*) FROM exercises) as exercises,
        (SELECT COUNT(*) FROM sessions) as sessions,
        (SELECT COUNT(*) FROM session_exercises) as session_exercises,
        (SELECT COUNT(*) FROM set_logs) as set_logs,
        (SELECT COUNT(*) FROM body_measurements) as measurements
    `).get() as Record<string, number>;

    res.json({
      file: {
        path: dbPath,
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        lastModified: stats.mtime
      },
      tables: tableStats,
      status: 'healthy'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get DB stats', details: String(error) });
  }
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gym Tracker running at http://localhost:${PORT}`);
  console.log(`Access from local network: http://<your-ip>:${PORT}`);
});
