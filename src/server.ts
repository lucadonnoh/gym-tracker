import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { statSync, readFileSync } from 'fs';
import {
  initializeDatabase,
  migrateExistingData,
  getUserByUsername,
  verifyPassword,
  updatePassword,
  getUserById,
  createUser,
  getAllUsers,
  getAllDays,
  getDayById,
  createDay,
  updateDay,
  deleteDay,
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
  getExerciseHistory,
  getAllExercises,
  deleteSession,
  updateSessionEndTime,
  autoStopStaleSessions,
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
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gym-tracker-secret-change-in-production';
const JWT_EXPIRY = '30d';

// Extend Express Request to include user
interface AuthRequest extends Request {
  user?: { id: number; username: string; is_admin: boolean };
}

app.use(morgan('combined'));
app.use(express.json());

// Initialize database and run migrations
initializeDatabase();
migrateExistingData();

// Serve index.html with analytics injection
const umamiUrl = process.env.UMAMI_URL;
const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;

function serveIndex(_req: Request, res: Response) {
  const indexPath = join(__dirname, '..', 'public', 'index.html');
  if (umamiUrl && umamiWebsiteId) {
    const html = readFileSync(indexPath, 'utf8');
    const analyticsScript = `<script defer src="${umamiUrl}/script.js" data-website-id="${umamiWebsiteId}"></script>`;
    const injectedHtml = html.replace('</head>', `${analyticsScript}\n</head>`);
    res.send(injectedHtml);
  } else {
    res.sendFile(indexPath);
  }
}

app.get('/', serveIndex);
app.use(express.static(join(__dirname, '..', 'public')));

// ===================
// Auth Middleware
// ===================

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    // Fetch fresh user data to get is_admin status
    const user = getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = { id: user.id, username: user.username, is_admin: !!user.is_admin };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ===================
// Auth Endpoints
// ===================

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = getUserById(req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

app.put('/api/auth/password', authMiddleware, (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }

  const user = getUserByUsername(req.user!.username);
  if (!user || !verifyPassword(user, currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const updated = updatePassword(req.user!.id, newPassword);
  if (!updated) {
    return res.status(500).json({ error: 'Failed to update password' });
  }

  res.json({ message: 'Password updated' });
});

// ===================
// Protected API Routes
// ===================

// Workout Days
app.get('/api/days', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getAllDays(req.user!.id));
});

app.get('/api/days/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const day = getDayById(Number(req.params.id), req.user!.id);
  if (!day) return res.status(404).json({ error: 'Day not found' });
  res.json(day);
});

app.get('/api/days/:id/exercises', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getExercisesByDay(Number(req.params.id), req.user!.id));
});

app.post('/api/days', authMiddleware, (req: AuthRequest, res: Response) => {
  const { name, display_name } = req.body;
  if (!name || !display_name) {
    return res.status(400).json({ error: 'Name and display_name are required' });
  }
  try {
    const day = createDay(req.user!.id, name, display_name);
    res.status(201).json(day);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'A workout day with this name already exists' });
    }
    throw e;
  }
});

app.patch('/api/days/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { display_name } = req.body;
  if (!display_name) {
    return res.status(400).json({ error: 'display_name is required' });
  }
  const day = updateDay(Number(req.params.id), req.user!.id, display_name);
  if (!day) {
    return res.status(404).json({ error: 'Day not found' });
  }
  res.json(day);
});

app.delete('/api/days/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const deleted = deleteDay(Number(req.params.id), req.user!.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Day not found' });
  }
  res.status(204).send();
});

// Exercises
app.get('/api/exercises', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getAllExercises(req.user!.id));
});

app.get('/api/exercises/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const exercise = getExerciseById(Number(req.params.id), req.user!.id);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

app.post('/api/exercises', authMiddleware, (req: AuthRequest, res: Response) => {
  const { day_id, name, description, default_weight } = req.body;
  if (!day_id || !name) {
    return res.status(400).json({ error: 'day_id and name are required' });
  }
  const exercise = createExercise(day_id, req.user!.id, name, description || null, default_weight || null);
  if (!exercise) return res.status(400).json({ error: 'Invalid day_id' });
  res.status(201).json(exercise);
});

app.put('/api/exercises/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { name, description, default_weight } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  const exercise = updateExercise(Number(req.params.id), req.user!.id, name, description || null, default_weight ?? null);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
  res.json(exercise);
});

app.delete('/api/exercises/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const deleted = deleteExercise(Number(req.params.id), req.user!.id);
  if (!deleted) return res.status(404).json({ error: 'Exercise not found' });
  res.status(204).send();
});

app.put('/api/exercises/:id/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  const { newIndex } = req.body;
  if (typeof newIndex !== 'number') {
    return res.status(400).json({ error: 'newIndex is required' });
  }
  reorderExercise(Number(req.params.id), req.user!.id, newIndex);
  res.status(204).send();
});

// Sessions
app.get('/api/sessions', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getAllSessions(req.user!.id));
});

app.get('/api/sessions/active', authMiddleware, (req: AuthRequest, res: Response) => {
  const session = getActiveSession(req.user!.id);
  res.json(session || null);
});

app.post('/api/sessions', authMiddleware, (req: AuthRequest, res: Response) => {
  const { day_id } = req.body;
  if (!day_id) {
    return res.status(400).json({ error: 'day_id is required' });
  }

  const active = getActiveSession(req.user!.id);
  if (active) {
    return res.status(400).json({ error: 'An active session already exists', activeSession: active });
  }

  const session = createSession(day_id, req.user!.id);
  if (!session) return res.status(400).json({ error: 'Invalid day_id' });
  res.status(201).json(session);
});

app.get('/api/sessions/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const session = getSessionById(Number(req.params.id), req.user!.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.put('/api/sessions/:id/end', authMiddleware, (req: AuthRequest, res: Response) => {
  const { notes } = req.body;
  const session = endSession(Number(req.params.id), req.user!.id, notes);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.put('/api/sessions/:id/end-time', authMiddleware, (req: AuthRequest, res: Response) => {
  const { ended_at } = req.body;
  if (!ended_at) {
    return res.status(400).json({ error: 'ended_at is required' });
  }

  // Validate the date format
  const date = new Date(ended_at);
  if (isNaN(date.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const session = updateSessionEndTime(Number(req.params.id), req.user!.id, ended_at);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.delete('/api/sessions/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const deleted = deleteSession(Number(req.params.id), req.user!.id);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

// Session Exercises
app.get('/api/sessions/:id/exercises', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getSessionExercises(Number(req.params.id), req.user!.id));
});

app.post('/api/sessions/:sessionId/exercises/:exerciseId/sets', authMiddleware, (req: AuthRequest, res: Response) => {
  const { set_number, weight, reps, is_dropset, notes } = req.body;
  if (typeof set_number !== 'number') {
    return res.status(400).json({ error: 'set_number is required' });
  }
  const set = logSet(
    Number(req.params.sessionId),
    Number(req.params.exerciseId),
    req.user!.id,
    set_number,
    weight ?? null,
    reps ?? null,
    is_dropset ?? false,
    notes ?? null
  );
  if (!set) return res.status(404).json({ error: 'Session not found' });
  res.status(201).json(set);
});

app.put('/api/sessions/:sessionId/exercises/:exerciseId/complete', authMiddleware, (req: AuthRequest, res: Response) => {
  const { completed } = req.body;
  markExerciseComplete(Number(req.params.sessionId), Number(req.params.exerciseId), req.user!.id, completed ?? true);
  res.status(204).send();
});

// Set CRUD
app.put('/api/sets/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { weight, reps } = req.body;
  const set = updateSetLog(Number(req.params.id), req.user!.id, weight ?? null, reps ?? null);
  if (!set) return res.status(404).json({ error: 'Set not found' });
  res.json(set);
});

app.delete('/api/sets/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const deleted = deleteSetLog(Number(req.params.id), req.user!.id);
  if (!deleted) return res.status(404).json({ error: 'Set not found' });
  res.status(204).send();
});

// Progress
app.get('/api/progress/:exerciseId', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getExerciseProgress(Number(req.params.exerciseId), req.user!.id));
});

// Exercise history (last N sessions for a specific exercise)
app.get('/api/exercises/:exerciseId/history', authMiddleware, (req: AuthRequest, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 5;
  res.json(getExerciseHistory(Number(req.params.exerciseId), req.user!.id, limit));
});

// Get last session volume for comparison
app.get('/api/exercises/:exerciseId/last-volume', authMiddleware, (req: AuthRequest, res: Response) => {
  const excludeSessionId = req.query.excludeSession ? Number(req.query.excludeSession) : undefined;
  const volume = getLastSessionVolume(Number(req.params.exerciseId), req.user!.id, excludeSessionId);
  res.json({ volume });
});

// Get session stats (volume, PRs)
app.get('/api/sessions/:id/stats', authMiddleware, (req: AuthRequest, res: Response) => {
  const stats = getSessionStats(Number(req.params.id), req.user!.id);
  res.json(stats);
});

// Body Measurements
app.get('/api/measurements', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getAllMeasurements(req.user!.id));
});

app.get('/api/measurements/latest', authMiddleware, (req: AuthRequest, res: Response) => {
  const measurement = getLatestMeasurement(req.user!.id);
  res.json(measurement || null);
});

app.get('/api/measurements/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const measurement = getMeasurementById(Number(req.params.id), req.user!.id);
  if (!measurement) return res.status(404).json({ error: 'Measurement not found' });
  res.json(measurement);
});

app.post('/api/measurements', authMiddleware, (req: AuthRequest, res: Response) => {
  const data = req.body;
  if (!data.measured_at) {
    data.measured_at = new Date().toISOString();
  }
  const measurement = createMeasurement(req.user!.id, data);
  res.status(201).json(measurement);
});

app.put('/api/measurements/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const measurement = updateMeasurement(Number(req.params.id), req.user!.id, req.body);
  if (!measurement) return res.status(404).json({ error: 'Measurement not found' });
  res.json(measurement);
});

app.delete('/api/measurements/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const deleted = deleteMeasurement(Number(req.params.id), req.user!.id);
  if (!deleted) return res.status(404).json({ error: 'Measurement not found' });
  res.status(204).send();
});

// Summary Stats
app.get('/api/stats/summary', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json(getSummaryStats(req.user!.id));
});

app.get('/api/stats/weekly-goal', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ goal: getWeeklyGoal(req.user!.id) });
});

app.put('/api/stats/weekly-goal', authMiddleware, (req: AuthRequest, res: Response) => {
  const { goal } = req.body;
  if (typeof goal !== 'number' || goal < 1 || goal > 7) {
    return res.status(400).json({ error: 'Goal must be a number between 1 and 7' });
  }
  setWeeklyGoal(req.user!.id, goal);
  res.json({ goal: getWeeklyGoal(req.user!.id) });
});

// Admin endpoints (requires admin user)
const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

app.get('/api/admin/users', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  const users = getAllUsers();
  res.json(users);
});

app.post('/api/admin/users', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }

  const existing = getUserByUsername(username.trim());
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  try {
    const user = createUser(username.trim(), '1234');
    res.status(201).json({ id: user.id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Debug endpoints (admin only)
app.get('/api/admin/db-stats', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'gym.db');

  try {
    const stats = statSync(dbPath);
    const tableStats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
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
app.get('*', serveIndex);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gym Tracker running at http://localhost:${PORT}`);
  console.log(`Access from local network: http://<your-ip>:${PORT}`);

  // Auto-stop stale sessions on startup
  const stoppedOnStartup = autoStopStaleSessions();
  if (stoppedOnStartup > 0) {
    console.log(`Auto-stopped ${stoppedOnStartup} stale session(s) on startup`);
  }

  // Check for stale sessions every hour
  setInterval(() => {
    const stopped = autoStopStaleSessions();
    if (stopped > 0) {
      console.log(`Auto-stopped ${stopped} stale session(s)`);
    }
  }, 60 * 60 * 1000); // 1 hour
});
