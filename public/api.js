// API wrapper for all backend calls
class Api {
    async get(url) {
        const res = await fetch(url);
        return res.json();
    }
    async post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return res.json();
    }
    async put(url, body = {}) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        // Handle 204 No Content responses
        if (res.status === 204) {
            return undefined;
        }
        return res.json();
    }
    async delete(url) {
        const res = await fetch(url, { method: 'DELETE' });
        return res.ok;
    }
    // Days
    async getDays() {
        return this.get('/api/days');
    }
    async getDayExercises(dayId) {
        return this.get(`/api/days/${dayId}/exercises`);
    }
    // Exercises
    async getAllExercises() {
        return this.get('/api/exercises');
    }
    async getExercise(id) {
        return this.get(`/api/exercises/${id}`);
    }
    async createExercise(dayId, name, description, defaultWeight) {
        return this.post('/api/exercises', {
            day_id: dayId,
            name,
            description,
            default_weight: defaultWeight
        });
    }
    async updateExercise(id, name, description, defaultWeight) {
        return this.put(`/api/exercises/${id}`, {
            name,
            description,
            default_weight: defaultWeight
        });
    }
    async deleteExercise(id) {
        return this.delete(`/api/exercises/${id}`);
    }
    async getExerciseLastVolume(exerciseId, excludeSessionId) {
        const url = excludeSessionId
            ? `/api/exercises/${exerciseId}/last-volume?excludeSession=${excludeSessionId}`
            : `/api/exercises/${exerciseId}/last-volume`;
        return this.get(url);
    }
    // Sessions
    async getSessions() {
        return this.get('/api/sessions');
    }
    async getActiveSession() {
        return this.get('/api/sessions/active');
    }
    async getSession(id) {
        return this.get(`/api/sessions/${id}`);
    }
    async createSession(dayId) {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day_id: dayId })
        });
        return res.json();
    }
    async endSession(id, notes) {
        return this.put(`/api/sessions/${id}/end`, { notes });
    }
    async deleteSession(id) {
        return this.delete(`/api/sessions/${id}`);
    }
    async getSessionExercises(sessionId) {
        return this.get(`/api/sessions/${sessionId}/exercises`);
    }
    async getSessionStats(sessionId) {
        return this.get(`/api/sessions/${sessionId}/stats`);
    }
    // Sets
    async logSet(sessionId, exerciseId, setNumber, weight, reps, isDropset = false, notes = null) {
        return this.post(`/api/sessions/${sessionId}/exercises/${exerciseId}/sets`, {
            set_number: setNumber,
            weight,
            reps,
            is_dropset: isDropset,
            notes
        });
    }
    async markExerciseComplete(sessionId, exerciseId, completed = true) {
        await this.put(`/api/sessions/${sessionId}/exercises/${exerciseId}/complete`, { completed });
    }
    async updateSet(id, weight, reps) {
        return this.put(`/api/sets/${id}`, { weight, reps });
    }
    async deleteSet(id) {
        return this.delete(`/api/sets/${id}`);
    }
    // Progress
    async getProgress(exerciseId) {
        return this.get(`/api/progress/${exerciseId}`);
    }
    // Body Measurements
    async getMeasurements() {
        return this.get('/api/measurements');
    }
    async getLatestMeasurement() {
        return this.get('/api/measurements/latest');
    }
    async getMeasurement(id) {
        return this.get(`/api/measurements/${id}`);
    }
    async createMeasurement(data) {
        return this.post('/api/measurements', data);
    }
    async updateMeasurement(id, data) {
        return this.put(`/api/measurements/${id}`, data);
    }
    async deleteMeasurement(id) {
        return this.delete(`/api/measurements/${id}`);
    }
    async getMeasurementProgress() {
        return this.get('/api/measurements');
    }
    // Summary Stats
    async getSummaryStats() {
        return this.get('/api/stats/summary');
    }
    async getWeeklyGoal() {
        return this.get('/api/stats/weekly-goal');
    }
    async setWeeklyGoal(goal) {
        return this.put('/api/stats/weekly-goal', { goal });
    }
}
export const api = new Api();
