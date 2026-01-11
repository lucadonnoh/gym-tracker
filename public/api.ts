// API wrapper for all backend calls

import type {
  WorkoutDay,
  Exercise,
  Session,
  ExerciseWithSets,
  ProgressData,
  ExerciseStats,
  SetLog,
  BodyMeasurement,
  SummaryStats,
  User
} from './types.js';

const TOKEN_KEY = 'gym_tracker_token';

class Api {
  private token: string | null = null;
  private onAuthError: (() => void) | null = null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  setAuthErrorHandler(handler: () => void): void {
    this.onAuthError = handler;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  getToken(): string | null {
    return this.token;
  }

  private setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (res.status === 401) {
      this.setToken(null);
      if (this.onAuthError) {
        this.onAuthError();
      }
      throw new Error('Unauthorized');
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return res.json();
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.getHeaders() });
    return this.handleResponse<T>(res);
  }

  private async post<T>(url: string, body: object): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });
    return this.handleResponse<T>(res);
  }

  private async put<T>(url: string, body: object = {}): Promise<T> {
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });
    return this.handleResponse<T>(res);
  }

  private async delete(url: string): Promise<boolean> {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (res.status === 401) {
      this.setToken(null);
      if (this.onAuthError) {
        this.onAuthError();
      }
      throw new Error('Unauthorized');
    }
    return res.ok;
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User } | { error: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async logout(): Promise<void> {
    this.setToken(null);
  }

  async getMe(): Promise<User> {
    return this.get('/api/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string } | { error: string }> {
    return this.put('/api/auth/password', { currentPassword, newPassword });
  }

  // Days
  async getDays(): Promise<WorkoutDay[]> {
    return this.get('/api/days');
  }

  async createDay(name: string, displayName: string): Promise<WorkoutDay | { error: string }> {
    return this.post('/api/days', { name, display_name: displayName });
  }

  async getDayExercises(dayId: number): Promise<Exercise[]> {
    return this.get(`/api/days/${dayId}/exercises`);
  }

  // Exercises
  async getAllExercises(): Promise<Exercise[]> {
    return this.get('/api/exercises');
  }

  async getExercise(id: number): Promise<Exercise> {
    return this.get(`/api/exercises/${id}`);
  }

  async createExercise(dayId: number, name: string, description: string | null, defaultWeight: number | null): Promise<Exercise> {
    return this.post('/api/exercises', {
      day_id: dayId,
      name,
      description,
      default_weight: defaultWeight
    });
  }

  async updateExercise(id: number, name: string, description: string | null, defaultWeight: number | null): Promise<Exercise> {
    return this.put(`/api/exercises/${id}`, {
      name,
      description,
      default_weight: defaultWeight
    });
  }

  async deleteExercise(id: number): Promise<boolean> {
    return this.delete(`/api/exercises/${id}`);
  }

  async getExerciseLastVolume(exerciseId: number, excludeSessionId?: number): Promise<{ volume: number | null }> {
    const url = excludeSessionId
      ? `/api/exercises/${exerciseId}/last-volume?excludeSession=${excludeSessionId}`
      : `/api/exercises/${exerciseId}/last-volume`;
    return this.get(url);
  }

  async getExerciseHistory(exerciseId: number, limit: number = 5): Promise<{
    session_id: number;
    date: string;
    sets: { set_number: number; weight: number; reps: number }[];
    volume: number;
  }[]> {
    return this.get(`/api/exercises/${exerciseId}/history?limit=${limit}`);
  }

  // Sessions
  async getSessions(): Promise<Session[]> {
    return this.get('/api/sessions');
  }

  async getActiveSession(): Promise<Session | null> {
    return this.get('/api/sessions/active');
  }

  async getSession(id: number): Promise<Session> {
    return this.get(`/api/sessions/${id}`);
  }

  async createSession(dayId: number): Promise<Session | { error: string; activeSession?: Session }> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ day_id: dayId })
    });
    return this.handleResponse(res);
  }

  async endSession(id: number, notes?: string): Promise<Session> {
    return this.put(`/api/sessions/${id}/end`, { notes });
  }

  async deleteSession(id: number): Promise<boolean> {
    return this.delete(`/api/sessions/${id}`);
  }

  async getSessionExercises(sessionId: number): Promise<ExerciseWithSets[]> {
    return this.get(`/api/sessions/${sessionId}/exercises`);
  }

  async getSessionStats(sessionId: number): Promise<ExerciseStats[]> {
    return this.get(`/api/sessions/${sessionId}/stats`);
  }

  // Sets
  async logSet(
    sessionId: number,
    exerciseId: number,
    setNumber: number,
    weight: number | null,
    reps: number | null,
    isDropset: boolean = false,
    notes: string | null = null
  ): Promise<SetLog> {
    return this.post(`/api/sessions/${sessionId}/exercises/${exerciseId}/sets`, {
      set_number: setNumber,
      weight,
      reps,
      is_dropset: isDropset,
      notes
    });
  }

  async markExerciseComplete(sessionId: number, exerciseId: number, completed: boolean = true): Promise<void> {
    await this.put(`/api/sessions/${sessionId}/exercises/${exerciseId}/complete`, { completed });
  }

  async updateSet(id: number, weight: number | null, reps: number | null): Promise<SetLog> {
    return this.put(`/api/sets/${id}`, { weight, reps });
  }

  async deleteSet(id: number): Promise<boolean> {
    return this.delete(`/api/sets/${id}`);
  }

  // Progress
  async getProgress(exerciseId: number): Promise<ProgressData[]> {
    return this.get(`/api/progress/${exerciseId}`);
  }

  // Body Measurements
  async getMeasurements(): Promise<BodyMeasurement[]> {
    return this.get('/api/measurements');
  }

  async getLatestMeasurement(): Promise<BodyMeasurement | null> {
    return this.get('/api/measurements/latest');
  }

  async getMeasurement(id: number): Promise<BodyMeasurement> {
    return this.get(`/api/measurements/${id}`);
  }

  async createMeasurement(data: Omit<BodyMeasurement, 'id'>): Promise<BodyMeasurement> {
    return this.post('/api/measurements', data);
  }

  async updateMeasurement(id: number, data: Partial<Omit<BodyMeasurement, 'id'>>): Promise<BodyMeasurement> {
    return this.put(`/api/measurements/${id}`, data);
  }

  async deleteMeasurement(id: number): Promise<boolean> {
    return this.delete(`/api/measurements/${id}`);
  }

  async getMeasurementProgress(): Promise<BodyMeasurement[]> {
    return this.get('/api/measurements');
  }

  // Summary Stats
  async getSummaryStats(): Promise<SummaryStats> {
    return this.get('/api/stats/summary');
  }

  async getWeeklyGoal(): Promise<{ goal: number }> {
    return this.get('/api/stats/weekly-goal');
  }

  async setWeeklyGoal(goal: number): Promise<{ goal: number }> {
    return this.put('/api/stats/weekly-goal', { goal });
  }

  // Admin (donnoh only)
  async getUsers(): Promise<User[]> {
    return this.get('/api/admin/users');
  }

  async createUser(username: string): Promise<{ id: number; username: string }> {
    return this.post('/api/admin/users', { username });
  }
}

export const api = new Api();
