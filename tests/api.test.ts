import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { createTempDb, cleanupDb } from './setup';

const JWT_SECRET = 'test-secret';
const BCRYPT_ROUNDS = 10;

// Create a minimal test server
function createTestServer(db: Database.Database) {
  const app = express();
  app.use(express.json());

  // Auth middleware
  function authMiddleware(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
      req.user = { id: decoded.userId, username: decoded.username };
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  });

  // Protected endpoint
  app.get('/api/days', authMiddleware, (req: any, res) => {
    const days = db.prepare('SELECT * FROM workout_days WHERE user_id = ?').all(req.user.id);
    res.json(days);
  });

  // Protected endpoint for sessions
  app.get('/api/sessions', authMiddleware, (req: any, res) => {
    const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ?').all(req.user.id);
    res.json(sessions);
  });

  return app;
}

// Setup test database with users table and test user
function setupTestDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      display_name TEXT NOT NULL
    );

    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      day_id INTEGER NOT NULL REFERENCES workout_days(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT
    );
  `);

  // Create test user
  const passwordHash = bcrypt.hashSync('testpass', BCRYPT_ROUNDS);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('testuser', passwordHash);

  // Create some test data
  db.prepare('INSERT INTO workout_days (user_id, name, display_name) VALUES (1, ?, ?)').run('push', 'Push Day');
  db.prepare('INSERT INTO workout_days (user_id, name, display_name) VALUES (1, ?, ?)').run('pull', 'Pull Day');
}

describe('API Endpoints', () => {
  let db: Database.Database;
  let dbPath: string;
  let app: express.Express;

  beforeAll(() => {
    const temp = createTempDb();
    db = temp.db;
    dbPath = temp.path;
    setupTestDb(db);
    app = createTestServer(db);
  });

  afterAll(() => {
    if (db) db.close();
    if (dbPath) cleanupDb(dbPath);
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if username or password missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username and password required');
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'testpass' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('testuser');
    });
  });

  describe('Protected Routes', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/days');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/days')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('should return 401 with malformed authorization header', async () => {
      const res = await request(app)
        .get('/api/days')
        .set('Authorization', 'NotBearer token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should return data with valid token', async () => {
      // First login to get token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });

      const token = loginRes.body.token;

      // Use token to access protected route
      const res = await request(app)
        .get('/api/days')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe('Data Isolation', () => {
    it('should only return data for authenticated user', async () => {
      // Create another user with different data
      const passwordHash = bcrypt.hashSync('otherpass', BCRYPT_ROUNDS);
      db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('otheruser', passwordHash);
      db.prepare('INSERT INTO workout_days (user_id, name, display_name) VALUES (2, ?, ?)').run('legs', 'Leg Day');

      // Login as testuser (id=1)
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });

      const token = loginRes.body.token;

      // Should only see testuser's days, not otheruser's
      const res = await request(app)
        .get('/api/days')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2); // Only push and pull, not legs
      expect(res.body.every((d: any) => d.user_id === 1)).toBe(true);
    });
  });
});
