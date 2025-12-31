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
  SummaryStats
} from './types.js';

class Api {
  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url);
    return res.json();
  }

  private async post<T>(url: string, body: object): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  private async put<T>(url: string, body: object = {}): Promise<T> {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    // Handle 204 No Content responses
    if (res.status === 204) {
      return undefined as T;
    }
    return res.json();
  }

  private async delete(url: string): Promise<boolean> {
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok;
  }

  // Days
  async getDays(): Promise<WorkoutDay[]> {
    return this.get('/api/days');
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_id: dayId })
    });
    return res.json();
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
}

export const api = new Api();
