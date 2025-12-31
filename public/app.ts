// Main Gym Tracker App

import { api } from './api.js';
import * as templates from './templates.js';
import type {
  WorkoutDay,
  Exercise,
  Session,
  ExerciseWithSets,
  ExerciseStats,
  ParsedSet,
  SetGroup,
  BodyMeasurement,
  MeasurementFieldConfig,
  SummaryStats
} from './types.js';
import { MEASUREMENT_FIELDS } from './types.js';

declare const Chart: any;

class GymTrackerApp {
  // State
  private days: WorkoutDay[] = [];
  private currentSession: Session | null = null;
  private sessionStartTime: Date | null = null;
  private currentExercises: ExerciseWithSets[] = [];
  private viewingSessionId: number | null = null;
  private viewingMeasurementId: number | null = null;
  private editingSetId: number | null = null;
  private setGroups: SetGroup[] = [];
  private navigationStack: string[] = ['home-screen'];
  private currentRouteParams: { [key: string]: string } = {};

  // Route definitions: screen -> URL path
  private static routes: { [screen: string]: string } = {
    'home-screen': '/',
    'session-screen': '/session',
    'history-screen': '/history',
    'session-detail-screen': '/history/:id',
    'progress-screen': '/progress',
    'measurements-screen': '/body',
    'measurement-detail-screen': '/body/:id',
    'manage-screen': '/manage'
  };

  // Timers
  private timerInterval: number | null = null;
  private restTimerInterval: number | null = null;
  private restTimeRemaining: number = 0;

  // Charts (array for multiple exercise charts)
  private progressCharts: any[] = [];
  private measurementCharts: any[] = [];

  // Lazy DOM element getters
  private get $dayButtons() { return document.getElementById('day-buttons'); }
  private get $activeSessionBanner() { return document.getElementById('active-session-banner'); }
  private get $statsContainer() { return document.getElementById('stats-container'); }
  private get $weeklyGoalModal() { return document.getElementById('weekly-goal-modal'); }
  private get $weeklyGoalContent() { return document.getElementById('weekly-goal-content'); }
  private get $sessionDayName() { return document.getElementById('session-day-name'); }
  private get $sessionTimer() { return document.getElementById('session-timer'); }
  private get $exerciseList() { return document.getElementById('exercise-list'); }
  private get $sessionHistory() { return document.getElementById('session-history'); }
  private get $detailSessionTitle() { return document.getElementById('detail-session-title'); }
  private get $sessionDetailContent() { return document.getElementById('session-detail-content'); }
  private get $progressDaySelect() { return document.getElementById('progress-day-select') as HTMLSelectElement; }
  private get $progressCharts() { return document.getElementById('progress-charts'); }
  private get $manageDaySelect() { return document.getElementById('manage-day-select') as HTMLSelectElement; }
  private get $manageExerciseList() { return document.getElementById('manage-exercise-list'); }
  private get $addExerciseBtn() { return document.getElementById('add-exercise-btn'); }
  private get $exerciseModal() { return document.getElementById('exercise-modal'); }
  private get $restTimerModal() { return document.getElementById('rest-timer-modal'); }
  private get $editSetModal() { return document.getElementById('edit-set-modal'); }
  private get $measurementsSummary() { return document.getElementById('measurements-summary'); }
  private get $measurementsCharts() { return document.getElementById('measurements-charts'); }
  private get $measurementsHistory() { return document.getElementById('measurements-history'); }
  private get $measurementDetailTitle() { return document.getElementById('measurement-detail-title'); }
  private get $measurementDetailContent() { return document.getElementById('measurement-detail-content'); }
  private get $measurementModal() { return document.getElementById('measurement-modal'); }
  private get $measurementFormFields() { return document.getElementById('measurement-form-fields'); }

  constructor() {
    // Disable browser's automatic scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
      if (event.state?.screen) {
        this.navigateToScreen(event.state.screen, event.state.params || {}, false);
      } else {
        this.handleRoute(window.location.pathname, false);
      }
    });

    this.init();
  }

  private async init(): Promise<void> {
    // Load all data in parallel
    const [days, activeSession, stats] = await Promise.all([
      api.getDays(),
      api.getActiveSession(),
      api.getSummaryStats()
    ]);

    this.days = days;

    // Check for active session
    if (activeSession) {
      this.currentSession = activeSession;
      this.$activeSessionBanner?.classList.remove('hidden');
    }

    // Render all content
    this.renderDayButtons();
    if (this.$statsContainer) {
      this.$statsContainer.innerHTML = templates.renderSummaryStats(stats);
    }

    // Wait for DOM update then reveal content
    await new Promise(resolve => requestAnimationFrame(resolve));
    document.getElementById('home-content')?.classList.remove('loading');

    // Handle initial route
    await this.handleRoute(window.location.pathname, true);
  }

  // ===================
  // Session Management
  // ===================

  private async checkActiveSession(): Promise<void> {
    const session = await api.getActiveSession();
    if (session) {
      this.currentSession = session;
      this.$activeSessionBanner?.classList.remove('hidden');
    }
  }

  async startSession(dayId: number): Promise<void> {
    try {
      const result = await api.createSession(dayId);

      if ('error' in result && result.activeSession) {
        this.currentSession = result.activeSession;
        await this.resumeSession();
        return;
      }

      if ('error' in result) {
        throw new Error(result.error);
      }

      this.currentSession = result;
      const day = this.days.find(d => d.id === dayId);
      if (this.currentSession && day) {
        this.currentSession.day_display_name = day.display_name;
      }
      await this.enterSessionScreen();
      this.updateUrl('session-screen');
    } catch (err) {
      alert('Failed to start session');
      console.error(err);
    }
  }

  async resumeSession(): Promise<void> {
    if (this.currentSession) {
      // Load everything first, THEN hide banner and show screen together
      await this.enterSessionScreen();
      // Hide banner after screen transition to avoid flash
      this.$activeSessionBanner?.classList.add('hidden');
      this.updateUrl('session-screen');
    }
  }

  private async enterSessionScreen(): Promise<void> {
    if (!this.currentSession) return;

    this.sessionStartTime = new Date(this.currentSession.started_at);

    // Set day name first (it's in the header, visible immediately)
    if (this.$sessionDayName) {
      this.$sessionDayName.textContent = this.currentSession.day_display_name || 'Workout';
    }

    // Load exercises BEFORE showing screen to prevent flash
    await this.loadSessionExercises();

    // Force DOM update to complete before showing screen
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Now show the screen with content already loaded
    this.showScreen('session-screen', true, true);  // skipClear: content already loaded

    this.startTimer();
  }

  confirmEndSession(): void {
    if (confirm('End this session?')) {
      this.finishSession();
    }
  }

  async finishSession(): Promise<void> {
    if (!this.currentSession) return;

    try {
      await api.endSession(this.currentSession.id);
      this.stopTimer();
      this.currentSession = null;
      this.sessionStartTime = null;
      this.days = await api.getDays();
      this.renderDayButtons();
      await this.loadSummaryStats();
      this.showHome();
    } catch (err) {
      alert('Failed to end session');
      console.error(err);
    }
  }

  async cancelSession(): Promise<void> {
    if (!this.currentSession) return;
    if (!confirm('Cancel this session? All logged sets will be deleted.')) return;

    try {
      await api.deleteSession(this.currentSession.id);
      this.stopTimer();
      this.currentSession = null;
      this.sessionStartTime = null;
      this.days = await api.getDays();
      this.renderDayButtons();
      this.showHome();
    } catch (err) {
      alert('Failed to cancel session');
      console.error(err);
    }
  }

  // ===================
  // Timer Management
  // ===================

  private startTimer(): void {
    this.updateTimer();
    this.timerInterval = window.setInterval(() => this.updateTimer(), 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateTimer(): void {
    if (!this.sessionStartTime || !this.$sessionTimer) return;
    const elapsed = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000);
    this.$sessionTimer.textContent = templates.formatTimer(elapsed);
  }

  // ===================
  // Rest Timer
  // ===================

  showRestTimer(): void {
    this.$restTimerModal?.classList.remove('hidden');
    document.getElementById('rest-timer-select')?.classList.remove('hidden');
    document.getElementById('rest-timer-countdown')?.classList.add('hidden');
    (document.getElementById('custom-rest-seconds') as HTMLInputElement).value = '';
    const stopBtn = document.querySelector('.rest-timer-stop') as HTMLButtonElement;
    if (stopBtn) stopBtn.textContent = 'Stop';
  }

  closeRestTimer(): void {
    this.$restTimerModal?.classList.add('hidden');
    this.stopRestTimer();
  }

  startRestTimer(seconds: number): void {
    this.restTimeRemaining = seconds;
    document.getElementById('rest-timer-select')?.classList.add('hidden');
    document.getElementById('rest-timer-countdown')?.classList.remove('hidden');
    this.updateRestTimerDisplay();

    this.restTimerInterval = window.setInterval(() => {
      this.restTimeRemaining--;
      this.updateRestTimerDisplay();
      if (this.restTimeRemaining <= 0) {
        this.restTimerComplete();
      }
    }, 1000);
  }

  startCustomRestTimer(): void {
    const input = document.getElementById('custom-rest-seconds') as HTMLInputElement;
    const seconds = parseInt(input.value);
    if (seconds && seconds > 0) {
      this.startRestTimer(seconds);
    }
  }

  extendRestTimer(seconds: number): void {
    this.restTimeRemaining += seconds;

    if (!this.restTimerInterval) {
      const stopBtn = document.querySelector('.rest-timer-stop') as HTMLButtonElement;
      if (stopBtn) stopBtn.textContent = 'Stop';

      this.restTimerInterval = window.setInterval(() => {
        this.restTimeRemaining--;
        this.updateRestTimerDisplay();
        if (this.restTimeRemaining <= 0) {
          this.restTimerComplete();
        }
      }, 1000);
    }

    this.updateRestTimerDisplay();
  }

  private updateRestTimerDisplay(): void {
    const display = document.getElementById('rest-timer-display');
    if (!display) return;
    const mins = Math.floor(this.restTimeRemaining / 60);
    const secs = this.restTimeRemaining % 60;
    display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private restTimerComplete(): void {
    this.stopRestTimer();
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
    document.getElementById('rest-timer-display')!.textContent = "Time's up!";
    const stopBtn = document.querySelector('.rest-timer-stop') as HTMLButtonElement;
    if (stopBtn) stopBtn.textContent = 'OK';
  }

  private stopRestTimer(): void {
    if (this.restTimerInterval) {
      clearInterval(this.restTimerInterval);
      this.restTimerInterval = null;
    }
    this.restTimeRemaining = 0;
  }

  // ===================
  // Exercise Loading & Rendering
  // ===================

  private async loadSessionExercises(): Promise<void> {
    if (!this.currentSession) return;

    this.currentExercises = await api.getSessionExercises(this.currentSession.id);

    // Fetch last volume for each exercise in parallel
    await Promise.all(this.currentExercises.map(async (ex) => {
      const data = await api.getExerciseLastVolume(ex.id, this.currentSession!.id);
      ex.lastVolume = data.volume;
    }));

    if (this.$exerciseList) {
      this.$exerciseList.innerHTML = this.currentExercises.map(ex => this.renderExerciseCard(ex)).join('');
    }
  }

  private renderExerciseCard(exercise: ExerciseWithSets): string {
    const loggedSets = exercise.sets || [];
    const expectedSets = this.parseSetScheme(exercise.description);
    const hasLoggedSets = loggedSets.some(s => s.weight !== null);
    const lastSets = exercise.lastSets || [];

    // Calculate current volume
    const currentVolume = loggedSets.reduce((sum, set) => {
      return set.weight && set.reps ? sum + (set.weight * set.reps) : sum;
    }, 0);

    // Build set rows
    const setRows = expectedSets.map(expected => {
      const logged = loggedSets.find(s => s.set_number === expected.setNumber);
      return templates.renderSetRow(exercise, expected, logged, lastSets);
    }).join('');

    // Extra sets beyond expected
    const maxExpected = expectedSets.length > 0 ? Math.max(...expectedSets.map(s => s.setNumber)) : 0;
    const extraSets = loggedSets.filter(s => s.set_number > maxExpected && Number.isInteger(s.set_number));
    const extraRows = extraSets.map(s => templates.renderExtraSetRow(exercise, s)).join('');

    const volumeHtml = templates.renderVolumeDisplay(currentVolume, exercise.lastVolume);

    return `
      <div class="exercise-card ${hasLoggedSets ? 'completed' : ''}" id="exercise-${exercise.id}">
        <div class="exercise-header">
          <span class="exercise-name">${exercise.name}</span>
          ${volumeHtml}
        </div>
        ${exercise.description ? `<div class="exercise-description">${exercise.description}</div>` : ''}
        <div class="sets-list">
          ${setRows}
          ${extraRows}
        </div>
        <button class="add-set-btn" onclick="app.addExtraSet(${exercise.id})">+ Add Set</button>
      </div>
    `;
  }

  private parseSetScheme(description: string | null): ParsedSet[] {
    if (!description) return [{ setNumber: 1, reps: 10, isDropset: false }];

    const sets: ParsedSet[] = [];
    let setNumber = 1;
    const parts = description.split(',').map(p => p.trim());

    for (const part of parts) {
      const match = part.match(/(\d+)\s*x\s*(\d+(?:-\d+)*|max)/i);
      if (match) {
        const count = parseInt(match[1]);
        const repsStr = match[2].toLowerCase();

        if (repsStr === 'max') {
          for (let i = 0; i < count; i++) {
            sets.push({ setNumber: setNumber++, reps: 'max', isDropset: false });
          }
        } else if (repsStr.includes('-')) {
          const dropsetParts = repsStr.split('-').length;
          sets.push({ setNumber: setNumber++, reps: repsStr, isDropset: true, dropsetParts });
        } else {
          const reps = parseInt(repsStr);
          for (let i = 0; i < count; i++) {
            sets.push({ setNumber: setNumber++, reps, isDropset: false });
          }
        }
      }
    }

    if (sets.length === 0) {
      return [
        { setNumber: 1, reps: 10, isDropset: false },
        { setNumber: 2, reps: 10, isDropset: false },
        { setNumber: 3, reps: 10, isDropset: false }
      ];
    }

    return sets;
  }

  // ===================
  // Set Logging
  // ===================

  async confirmSet(exerciseId: number, setNumber: number, defaultWeight: number, reps: number | null): Promise<void> {
    if (!this.currentSession || !defaultWeight) return;

    try {
      await api.logSet(this.currentSession.id, exerciseId, setNumber, defaultWeight, reps);
      await api.markExerciseComplete(this.currentSession.id, exerciseId);
      await this.loadSessionExercises();
    } catch (err) {
      console.error('Failed to save set', err);
    }
  }

  async logSetWeight(exerciseId: number, setNumber: number, weight: string, reps: string | number | null, isDropset: boolean = false): Promise<void> {
    if (!this.currentSession) return;

    const weightNum = parseFloat(weight) || null;
    const repsNum = typeof reps === 'string' ? (parseInt(reps) || null) : reps;

    if (weightNum === null) return;

    try {
      await api.logSet(this.currentSession.id, exerciseId, setNumber, weightNum, repsNum, isDropset);
      await api.markExerciseComplete(this.currentSession.id, exerciseId);

      const row = document.querySelector(`[data-exercise="${exerciseId}"][data-set="${setNumber}"]`);
      if (row) row.classList.add('logged');

      const card = document.getElementById(`exercise-${exerciseId}`);
      if (card) card.classList.add('completed');

      await this.loadSessionExercises();
    } catch (err) {
      console.error('Failed to save set', err);
    }
  }

  async addExtraSet(exerciseId: number): Promise<void> {
    if (!this.currentSession) return;

    const exercise = this.currentExercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    const loggedSets = exercise.sets || [];
    const expectedSets = this.parseSetScheme(exercise.description);
    const maxSet = Math.max(
      ...loggedSets.map(s => Math.floor(s.set_number)),
      ...expectedSets.map(s => s.setNumber),
      0
    );

    const card = document.getElementById(`exercise-${exerciseId}`);
    const setsList = card?.querySelector('.sets-list');
    if (!setsList) return;

    const newSetNum = maxSet + 1;
    const defaultWeight = exercise.default_weight || '';

    const newRow = document.createElement('div');
    newRow.className = 'set-row';
    newRow.dataset.exercise = exerciseId.toString();
    newRow.dataset.set = newSetNum.toString();
    newRow.innerHTML = `
      <span class="set-label">Set ${newSetNum}</span>
      <span class="set-reps">extra</span>
      <input type="number" class="weight-input" value="${defaultWeight}" step="0.5" inputmode="decimal" placeholder="kg"
        onchange="app.logSetWeight(${exerciseId}, ${newSetNum}, this.value, 10)">
      <span class="weight-unit">kg</span>
    `;
    setsList.appendChild(newRow);

    const input = newRow.querySelector('.weight-input') as HTMLInputElement;
    input?.focus();
    input?.select();
  }

  // ===================
  // Navigation
  // ===================

  showScreen(screenId: string, addToHistory: boolean = true, skipClear: boolean = false): void {
    // Clear content first (before showing) to avoid flash
    // Skip if content was pre-loaded before calling showScreen
    if (!skipClear) {
      this.clearScreenContent(screenId);
    }

    // Add active to new screen first, then remove from others
    // This prevents a frame where no screen is visible
    const targetScreen = document.getElementById(screenId);
    targetScreen?.classList.add('active');

    document.querySelectorAll('.screen').forEach(s => {
      if (s.id !== screenId) {
        s.classList.remove('active');
      }
    });

    if (addToHistory && this.navigationStack[this.navigationStack.length - 1] !== screenId) {
      this.navigationStack.push(screenId);
    }

    // Also scroll to top (backup, main scroll happens at start of navigation)
    this.scrollToTop();
  }

  private scrollToTop(): void {
    // Reset scroll position to top using every possible method
    // 1. Window scroll
    window.scrollTo(0, 0);

    // 2. Document elements
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // 3. Active screen and its main element
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
      (activeScreen as HTMLElement).scrollTop = 0;
      const main = activeScreen.querySelector('main');
      if (main) (main as HTMLElement).scrollTop = 0;
    }

    // 4. App container
    const app = document.getElementById('app');
    if (app) app.scrollTop = 0;

    // 5. Delayed scroll for iOS momentum scrolling
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }

  // ===================
  // URL Routing
  // ===================

  private updateUrl(screen: string, params: { [key: string]: string } = {}): void {
    let path = GymTrackerApp.routes[screen] || '/';

    // Replace :id placeholders with actual values
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`:${key}`, value);
    }

    // Only push state if URL actually changed
    if (window.location.pathname !== path) {
      history.pushState({ screen, params }, '', path);
    }
  }

  private async handleRoute(path: string, isInitial: boolean): Promise<void> {
    // Parse the path and navigate to the correct screen
    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) {
      // Home
      if (!isInitial) this.showScreen('home-screen', false);
      return;
    }

    switch (segments[0]) {
      case 'session':
        // Resume or show session screen
        if (this.currentSession) {
          await this.resumeSession();
        } else {
          this.showScreen('home-screen', false);
          this.updateUrl('home-screen');
        }
        break;

      case 'history':
        if (segments[1]) {
          // /history/:id - session detail
          const sessionId = parseInt(segments[1]);
          if (!isNaN(sessionId)) {
            await this.showSessionDetail(sessionId);
          }
        } else {
          // /history - history list
          await this.showHistory();
        }
        break;

      case 'progress':
        if (segments[1]) {
          // /progress/:exerciseId
          const exerciseId = parseInt(segments[1]);
          if (!isNaN(exerciseId)) {
            await this.showProgressForExercise(exerciseId);
          }
        } else {
          await this.showProgress();
        }
        break;

      case 'body':
        if (segments[1]) {
          // /body/:id - measurement detail
          const measurementId = parseInt(segments[1]);
          if (!isNaN(measurementId)) {
            await this.showMeasurementDetail(measurementId);
          }
        } else {
          await this.showMeasurements();
        }
        break;

      case 'manage':
        await this.showManage();
        break;

      default:
        // Unknown route, go home
        this.showScreen('home-screen', false);
        this.updateUrl('home-screen');
    }
  }

  private async navigateToScreen(screen: string, params: { [key: string]: string }, updateHistory: boolean): Promise<void> {
    this.currentRouteParams = params;

    switch (screen) {
      case 'session-detail-screen':
        if (params.id) {
          await this.showSessionDetail(parseInt(params.id));
        }
        break;
      case 'measurement-detail-screen':
        if (params.id) {
          await this.showMeasurementDetail(parseInt(params.id));
        }
        break;
      default:
        this.showScreen(screen, updateHistory);
    }
  }

  goBack(): void {
    // Use browser history for proper URL navigation
    history.back();
  }

  private async reloadScreenData(screenId: string): Promise<void> {
    switch (screenId) {
      case 'home-screen':
        this.checkActiveSession();
        break;
      case 'history-screen':
        await this.loadHistory();
        break;
      case 'session-detail-screen':
        if (this.viewingSessionId) {
          await this.loadSessionDetailContent(this.viewingSessionId);
        }
        break;
      case 'progress-screen':
        await this.loadProgressDaySelect();
        break;
      case 'measurements-screen':
        await this.loadMeasurements();
        break;
      case 'measurement-detail-screen':
        if (this.viewingMeasurementId) {
          await this.loadMeasurementDetail(this.viewingMeasurementId);
        }
        break;
      case 'manage-screen':
        await this.loadManageDaySelect();
        break;
    }
  }

  private clearScreenContent(screenId: string): void {
    switch (screenId) {
      case 'session-screen':
        // Don't clear exercise list - it loads fast and clearing causes flash
        if (this.$sessionTimer) this.$sessionTimer.textContent = '00:00:00';
        break;
      case 'history-screen':
        if (this.$sessionHistory) this.$sessionHistory.innerHTML = templates.LOADING_HTML;
        break;
      case 'session-detail-screen':
        if (this.$sessionDetailContent) this.$sessionDetailContent.innerHTML = templates.LOADING_HTML;
        if (this.$detailSessionTitle) this.$detailSessionTitle.textContent = 'Loading...';
        break;
      case 'progress-screen':
        if (this.$progressCharts) this.$progressCharts.innerHTML = '';
        this.destroyProgressCharts();
        break;
      case 'measurements-screen':
        if (this.$measurementsSummary) this.$measurementsSummary.innerHTML = '';
        if (this.$measurementsCharts) this.$measurementsCharts.innerHTML = '';
        if (this.$measurementsHistory) this.$measurementsHistory.innerHTML = templates.LOADING_HTML;
        this.destroyMeasurementCharts();
        break;
      case 'measurement-detail-screen':
        if (this.$measurementDetailContent) this.$measurementDetailContent.innerHTML = templates.LOADING_HTML;
        if (this.$measurementDetailTitle) this.$measurementDetailTitle.textContent = 'Loading...';
        break;
      case 'manage-screen':
        if (this.$manageExerciseList) this.$manageExerciseList.innerHTML = '';
        this.$addExerciseBtn?.classList.add('hidden');
        break;
    }
  }

  showHome(): void {
    this.navigationStack = ['home-screen'];
    this.showScreen('home-screen', false);
    this.checkActiveSession();
    this.loadSummaryStats();
    this.updateUrl('home-screen');
  }

  private renderDayButtons(): void {
    if (this.$dayButtons) {
      this.$dayButtons.innerHTML = this.days.map(d => templates.renderDayButton(d)).join('');
    }
  }

  // ===================
  // Summary Stats
  // ===================

  private async loadSummaryStats(): Promise<void> {
    try {
      const stats = await api.getSummaryStats();
      if (this.$statsContainer) {
        this.$statsContainer.innerHTML = templates.renderSummaryStats(stats);
      }
    } catch (err) {
      console.error('Failed to load summary stats', err);
    }
  }

  editWeeklyGoal(): void {
    api.getWeeklyGoal().then(({ goal }) => {
      if (this.$weeklyGoalContent) {
        this.$weeklyGoalContent.innerHTML = templates.renderWeeklyGoalModal(goal);
      }
      this.$weeklyGoalModal?.classList.remove('hidden');
    });
  }

  async setWeeklyGoal(goal: number): Promise<void> {
    try {
      await api.setWeeklyGoal(goal);
      this.$weeklyGoalModal?.classList.add('hidden');
      await this.loadSummaryStats();
    } catch (err) {
      alert('Failed to save weekly goal');
      console.error(err);
    }
  }

  closeWeeklyGoalModal(): void {
    this.$weeklyGoalModal?.classList.add('hidden');
  }

  // ===================
  // History
  // ===================

  async showHistory(): Promise<void> {
    await this.loadHistory();
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('history-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('history-screen');
  }

  private async loadHistory(): Promise<void> {
    const sessions = await api.getSessions();

    if (!this.$sessionHistory) return;

    if (sessions.length === 0) {
      this.$sessionHistory.innerHTML = '<p>No sessions yet</p>';
      return;
    }

    this.$sessionHistory.innerHTML = sessions.map(s => templates.renderHistoryItem(s)).join('');
  }

  // ===================
  // Session Detail
  // ===================

  async showSessionDetail(sessionId: number): Promise<void> {
    this.viewingSessionId = sessionId;
    await this.loadSessionDetailContent(sessionId);
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('session-detail-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('session-detail-screen', { id: sessionId.toString() });
  }

  private async loadSessionDetailContent(sessionId: number): Promise<void> {
    const [exercises, session, stats] = await Promise.all([
      api.getSessionExercises(sessionId),
      api.getSession(sessionId),
      api.getSessionStats(sessionId)
    ]);

    if (this.$detailSessionTitle) {
      const day = this.days.find(d => d.id === session.day_id);
      const date = new Date(session.started_at).toLocaleDateString();
      this.$detailSessionTitle.textContent = `${day?.display_name || 'Session'} - ${date}`;
    }

    if (!this.$sessionDetailContent) return;

    const totalVolume = stats.reduce((sum, s) => sum + s.volume, 0);
    const prCounts = {
      volume: stats.filter(s => s.prs?.volume).length,
      setVolume: stats.filter(s => s.prs?.setVolume).length,
      weight: stats.filter(s => s.prs?.weight).length,
      reps: stats.filter(s => s.prs?.reps).length
    };
    const totalPRs = prCounts.volume + prCounts.setVolume + prCounts.weight + prCounts.reps;

    const summaryHtml = templates.renderSessionSummary(totalVolume, exercises.length, totalPRs);
    const exercisesHtml = exercises.map(ex => {
      const exStats = stats.find(s => s.exerciseId === ex.id);
      return templates.renderSessionDetailExercise(ex, exStats);
    }).join('');

    this.$sessionDetailContent.innerHTML = summaryHtml + exercisesHtml;
  }

  async deleteSession(): Promise<void> {
    if (!this.viewingSessionId) return;
    if (!confirm('Delete this session? This cannot be undone.')) return;

    try {
      await api.deleteSession(this.viewingSessionId);
      this.viewingSessionId = null;
      // Remove session-detail-screen from stack before going back
      // so back button doesn't return to a deleted session
      this.navigationStack = this.navigationStack.filter(s => s !== 'session-detail-screen');
      this.goBack();
    } catch (err) {
      alert('Failed to delete session');
      console.error(err);
    }
  }

  // ===================
  // Edit Set Modal
  // ===================

  openEditSetModal(setId: number, weight: number, reps: number): void {
    this.editingSetId = setId;

    const weightEl = document.getElementById('edit-set-weight') as HTMLInputElement;
    const repsEl = document.getElementById('edit-set-reps') as HTMLInputElement;
    const setIdEl = document.getElementById('edit-set-id') as HTMLInputElement;

    if (!weightEl || !repsEl || !setIdEl) return;

    setIdEl.value = setId.toString();
    weightEl.value = weight.toString();
    repsEl.value = reps.toString();

    this.$editSetModal?.classList.remove('hidden');
    weightEl.focus();
    weightEl.select();
  }

  closeEditSetModal(): void {
    this.$editSetModal?.classList.add('hidden');
    this.editingSetId = null;
  }

  async updateSet(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.editingSetId || !this.viewingSessionId) return;

    const weight = parseFloat((document.getElementById('edit-set-weight') as HTMLInputElement).value) || null;
    const reps = parseInt((document.getElementById('edit-set-reps') as HTMLInputElement).value) || null;

    try {
      await api.updateSet(this.editingSetId, weight, reps);
      this.closeEditSetModal();
      await this.showSessionDetail(this.viewingSessionId);
    } catch (err) {
      alert('Failed to update set');
      console.error(err);
    }
  }

  async deleteSet(): Promise<void> {
    if (!this.editingSetId || !this.viewingSessionId) return;
    if (!confirm('Delete this set?')) return;

    try {
      await api.deleteSet(this.editingSetId);
      this.closeEditSetModal();
      await this.showSessionDetail(this.viewingSessionId);
    } catch (err) {
      alert('Failed to delete set');
      console.error(err);
    }
  }

  // ===================
  // Progress Charts
  // ===================

  async showProgress(): Promise<void> {
    await this.loadProgressDaySelect();
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('progress-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('progress-screen');
  }

  async showProgressForExercise(exerciseId: number): Promise<void> {
    // Find which day this exercise belongs to
    const exercises = await api.getAllExercises();
    const exercise = exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    // Load all content before showing screen
    await this.loadProgressDaySelect();

    if (this.$progressDaySelect) {
      this.$progressDaySelect.value = exercise.day_id.toString();
      await this.loadDayProgress();
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('progress-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('progress-screen');

    // Scroll to the specific exercise chart after screen is visible
    setTimeout(() => {
      const chartEl = document.getElementById(`progress-exercise-${exerciseId}`);
      chartEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  private async loadProgressDaySelect(): Promise<void> {
    if (this.$progressDaySelect) {
      this.$progressDaySelect.innerHTML = '<option value="">Select workout day...</option>' +
        this.days.map(d => `<option value="${d.id}">${d.display_name}</option>`).join('');
    }
  }

  async loadDayProgress(): Promise<void> {
    if (!this.$progressDaySelect || !this.$progressCharts) return;

    const dayId = this.$progressDaySelect.value;
    if (!dayId) {
      this.$progressCharts.innerHTML = '';
      this.destroyProgressCharts();
      return;
    }

    // Get all exercises for this day
    const exercises = await api.getDayExercises(parseInt(dayId));

    if (exercises.length === 0) {
      this.$progressCharts.innerHTML = '<p class="no-data">No exercises for this day</p>';
      return;
    }

    // Destroy old charts
    this.destroyProgressCharts();

    // Create container for each exercise
    this.$progressCharts.innerHTML = exercises.map(ex => `
      <div class="progress-exercise" id="progress-exercise-${ex.id}">
        <h3 class="progress-exercise-name">${ex.name}</h3>
        <div class="progress-exercise-charts">
          <canvas id="weight-chart-${ex.id}"></canvas>
          <canvas id="reps-chart-${ex.id}"></canvas>
        </div>
      </div>
    `).join('');

    // Load progress data and render charts for each exercise
    for (const exercise of exercises) {
      const data = await api.getProgress(exercise.id);
      if (data.length > 0) {
        this.renderExerciseCharts(exercise.id, exercise.name, data);
      } else {
        const container = document.getElementById(`progress-exercise-${exercise.id}`);
        const chartsDiv = container?.querySelector('.progress-exercise-charts');
        if (chartsDiv) {
          chartsDiv.innerHTML = '<p class="no-data">No data yet</p>';
        }
      }
    }
  }

  private destroyProgressCharts(): void {
    for (const chart of this.progressCharts) {
      chart.destroy();
    }
    this.progressCharts = [];
  }

  private renderExerciseCharts(exerciseId: number, exerciseName: string, data: { date: string; maxWeight: number; totalReps: number }[]): void {
    const labels = data.map(d => d.date);
    const weights = data.map(d => d.maxWeight);
    const reps = data.map(d => d.totalReps);

    const darkThemeOptions = {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          color: '#888888',
          font: { family: 'Outfit', weight: '500' as const, size: 12 }
        }
      },
      scales: {
        x: {
          ticks: { color: '#555555', font: { family: 'Outfit', size: 10 } },
          grid: { color: '#1a1a1a' }
        },
        y: {
          ticks: { color: '#555555', font: { family: 'Outfit', size: 10 } },
          grid: { color: '#1a1a1a' }
        }
      }
    };

    const weightCtx = document.getElementById(`weight-chart-${exerciseId}`) as HTMLCanvasElement;
    if (weightCtx) {
      const weightChart = new Chart(weightCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Max Weight (kg)',
            data: weights,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#22c55e',
            pointBorderColor: '#22c55e',
            pointRadius: 3
          }]
        },
        options: {
          ...darkThemeOptions,
          plugins: {
            ...darkThemeOptions.plugins,
            title: { ...darkThemeOptions.plugins.title, text: 'Weight' }
          }
        }
      });
      this.progressCharts.push(weightChart);
    }

    const repsCtx = document.getElementById(`reps-chart-${exerciseId}`) as HTMLCanvasElement;
    if (repsCtx) {
      const repsChart = new Chart(repsCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Total Reps',
            data: reps,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#3b82f6',
            pointRadius: 3
          }]
        },
        options: {
          ...darkThemeOptions,
          plugins: {
            ...darkThemeOptions.plugins,
            title: { ...darkThemeOptions.plugins.title, text: 'Reps' }
          }
        }
      });
      this.progressCharts.push(repsChart);
    }
  }

  // ===================
  // Body Measurements
  // ===================
  // All field definitions come from MEASUREMENT_FIELDS config in types.ts

  async showMeasurements(): Promise<void> {
    await this.loadMeasurements();
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('measurements-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('measurements-screen');
  }

  private async loadMeasurements(): Promise<void> {
    const [measurements, latest] = await Promise.all([
      api.getMeasurements(),
      api.getLatestMeasurement()
    ]);

    // Render summary using config
    if (this.$measurementsSummary && latest) {
      const stats = MEASUREMENT_FIELDS
        .filter(f => latest[f.key] !== null)
        .slice(0, 5) // Show max 5 stats in summary
        .map(f => `<div class="measurement-stat"><span class="stat-value">${latest[f.key]}</span><span class="stat-label">${f.unit} ${f.label.toLowerCase()}</span></div>`)
        .join('');

      this.$measurementsSummary.innerHTML = `
        <div class="measurement-summary-card">
          <div class="measurement-summary-date">Last: ${new Date(latest.measured_at).toLocaleDateString()}</div>
          <div class="measurement-summary-stats">${stats}</div>
        </div>
      `;
    } else if (this.$measurementsSummary) {
      this.$measurementsSummary.innerHTML = '';
    }

    // Render charts
    await this.renderMeasurementCharts(measurements);

    // Render history
    if (this.$measurementsHistory) {
      if (measurements.length === 0) {
        this.$measurementsHistory.innerHTML = '<p class="no-data">No measurements yet</p>';
      } else {
        this.$measurementsHistory.innerHTML = measurements.map(m => {
          const details = MEASUREMENT_FIELDS
            .filter(f => m[f.key] !== null)
            .slice(0, 2)
            .map(f => `${m[f.key]} ${f.unit}`)
            .join(' • ') || 'Measurements recorded';
          return `
            <div class="measurement-history-item" onclick="app.showMeasurementDetail(${m.id})">
              <div class="measurement-history-date">${new Date(m.measured_at).toLocaleDateString()}</div>
              <div class="measurement-history-details">${details}</div>
            </div>
          `;
        }).join('');
      }
    }
  }

  private async renderMeasurementCharts(measurements: BodyMeasurement[]): Promise<void> {
    if (measurements.length === 0 || !this.$measurementsCharts) {
      if (this.$measurementsCharts) this.$measurementsCharts.innerHTML = '';
      return;
    }

    this.destroyMeasurementCharts();

    const sorted = [...measurements].sort((a, b) =>
      new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
    );
    const labels = sorted.map(m => new Date(m.measured_at).toLocaleDateString());

    // Use config to build charts
    const chartsToRender = MEASUREMENT_FIELDS.filter(f => {
      const values = sorted.map(m => m[f.key] as number | null);
      return values.some(v => v !== null);
    });

    this.$measurementsCharts.innerHTML = chartsToRender
      .map(f => `<div class="measurement-chart"><h3>${f.label} (${f.unit})</h3><canvas id="chart-${f.key}"></canvas></div>`)
      .join('');

    for (const field of chartsToRender) {
      const values = sorted.map(m => m[field.key] as number | null);
      const ctx = document.getElementById(`chart-${field.key}`) as HTMLCanvasElement;
      if (ctx) {
        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: `${field.label} (${field.unit})`,
              data: values,
              borderColor: field.color,
              backgroundColor: field.color + '1A',
              fill: true,
              tension: 0.3,
              spanGaps: true,
              pointBackgroundColor: field.color,
              pointBorderColor: field.color,
              pointRadius: 3
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { color: '#555555', font: { family: 'Outfit', size: 10 } },
                grid: { color: '#1a1a1a' }
              },
              y: {
                ticks: { color: '#555555', font: { family: 'Outfit', size: 10 } },
                grid: { color: '#1a1a1a' }
              }
            }
          }
        });
        this.measurementCharts.push(chart);
      }
    }
  }

  private destroyMeasurementCharts(): void {
    for (const chart of this.measurementCharts) {
      chart.destroy();
    }
    this.measurementCharts = [];
  }

  async showMeasurementDetail(id: number): Promise<void> {
    this.viewingMeasurementId = id;
    await this.loadMeasurementDetail(id);
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('measurement-detail-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('measurement-detail-screen', { id: id.toString() });
  }

  private async loadMeasurementDetail(id: number): Promise<void> {
    const m = await api.getMeasurement(id);

    if (this.$measurementDetailTitle) {
      this.$measurementDetailTitle.textContent = new Date(m.measured_at).toLocaleDateString();
    }

    if (this.$measurementDetailContent) {
      // Use config to build detail rows
      const rows = MEASUREMENT_FIELDS
        .filter(f => m[f.key] !== null)
        .map(f => `<div class="detail-row"><span class="detail-label">${f.label}</span><span class="detail-value">${m[f.key]} ${f.unit}</span></div>`)
        .join('');

      let html = `<div class="measurement-detail-rows">${rows || '<p class="no-data">No measurements recorded</p>'}</div>`;
      if (m.notes) {
        html += `<div class="measurement-notes-display"><strong>Notes:</strong> ${m.notes}</div>`;
      }
      html += `<button class="edit-measurement-btn" onclick="app.editMeasurement(${m.id})">Edit</button>`;

      this.$measurementDetailContent.innerHTML = html;
    }
  }

  private renderMeasurementForm(): void {
    if (!this.$measurementFormFields) return;

    const sections: Record<string, MeasurementFieldConfig[]> = {
      main: [],
      upper: [],
      core: [],
      lower: []
    };

    MEASUREMENT_FIELDS.forEach(f => sections[f.section].push(f));

    const renderSection = (title: string, fields: MeasurementFieldConfig[]) => {
      if (fields.length === 0) return '';
      const inputs = fields.map(f => `
        <label class="measurement-input-group">
          <span>${f.label} (${f.unit})</span>
          <input type="number" id="measurement-${f.key}" step="0.1" inputmode="decimal">
        </label>
      `).join('');
      return title
        ? `<h3 class="measurement-section-title">${title}</h3><div class="measurement-form-grid">${inputs}</div>`
        : `<div class="measurement-form-grid">${inputs}</div>`;
    };

    this.$measurementFormFields.innerHTML =
      renderSection('', sections.main) +
      renderSection('Upper Body', sections.upper) +
      renderSection('Core', sections.core) +
      renderSection('Lower Body', sections.lower);
  }

  showAddMeasurement(): void {
    (document.getElementById('measurement-modal-title') as HTMLElement).textContent = 'Add Measurement';
    (document.getElementById('measurement-id') as HTMLInputElement).value = '';
    this.renderMeasurementForm();
    (document.getElementById('measurement-notes') as HTMLTextAreaElement).value = '';
    this.$measurementModal?.classList.remove('hidden');
  }

  async editMeasurement(id: number): Promise<void> {
    const m = await api.getMeasurement(id);

    (document.getElementById('measurement-modal-title') as HTMLElement).textContent = 'Edit Measurement';
    (document.getElementById('measurement-id') as HTMLInputElement).value = id.toString();

    this.renderMeasurementForm();

    // Populate form using config
    MEASUREMENT_FIELDS.forEach(f => {
      const input = document.getElementById(`measurement-${f.key}`) as HTMLInputElement;
      if (input) input.value = m[f.key]?.toString() || '';
    });
    (document.getElementById('measurement-notes') as HTMLTextAreaElement).value = m.notes || '';

    this.$measurementModal?.classList.remove('hidden');
  }

  closeMeasurementModal(): void {
    this.$measurementModal?.classList.add('hidden');
  }

  async saveMeasurement(event: Event): Promise<void> {
    event.preventDefault();

    const id = (document.getElementById('measurement-id') as HTMLInputElement).value;

    // Build data object using config
    const data: any = {
      measured_at: new Date().toISOString(),
      notes: (document.getElementById('measurement-notes') as HTMLTextAreaElement).value || null
    };

    MEASUREMENT_FIELDS.forEach(f => {
      const input = document.getElementById(`measurement-${f.key}`) as HTMLInputElement;
      data[f.key] = input?.value ? parseFloat(input.value) : null;
    });

    try {
      if (id) {
        await api.updateMeasurement(parseInt(id), data);
        this.closeMeasurementModal();
        if (this.viewingMeasurementId) {
          await this.loadMeasurementDetail(this.viewingMeasurementId);
        }
      } else {
        await api.createMeasurement(data);
        this.closeMeasurementModal();
        await this.loadMeasurements();
      }
    } catch (err) {
      alert('Failed to save measurement');
      console.error(err);
    }
  }

  async deleteMeasurement(): Promise<void> {
    if (!this.viewingMeasurementId) return;
    if (!confirm('Delete this measurement? This cannot be undone.')) return;

    try {
      await api.deleteMeasurement(this.viewingMeasurementId);
      this.viewingMeasurementId = null;
      this.navigationStack = this.navigationStack.filter(s => s !== 'measurement-detail-screen');
      this.goBack();
    } catch (err) {
      alert('Failed to delete measurement');
      console.error(err);
    }
  }

  // ===================
  // Manage Exercises
  // ===================

  async showManage(): Promise<void> {
    await this.loadManageDaySelect();
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.showScreen('manage-screen', true, true);  // skipClear: content already loaded
    this.updateUrl('manage-screen');
  }

  private async loadManageDaySelect(): Promise<void> {
    if (this.$manageDaySelect) {
      this.$manageDaySelect.innerHTML = '<option value="">Select workout day...</option>' +
        this.days.map(d => `<option value="${d.id}">${d.display_name}</option>`).join('');
    }

    if (this.$manageExerciseList) this.$manageExerciseList.innerHTML = '';
    this.$addExerciseBtn?.classList.add('hidden');
  }

  async loadDayExercises(): Promise<void> {
    if (!this.$manageDaySelect) return;

    const dayId = this.$manageDaySelect.value;
    if (!dayId) {
      if (this.$manageExerciseList) this.$manageExerciseList.innerHTML = '';
      this.$addExerciseBtn?.classList.add('hidden');
      return;
    }

    const exercises = await api.getDayExercises(parseInt(dayId));

    if (this.$manageExerciseList) {
      this.$manageExerciseList.innerHTML = exercises.map(ex => templates.renderManageExercise(ex)).join('');
    }

    this.$addExerciseBtn?.classList.remove('hidden');
  }

  // ===================
  // Add/Edit Exercise Modal
  // ===================

  showAddExercise(): void {
    const dayId = this.$manageDaySelect?.value;
    if (!dayId) return;

    (document.getElementById('modal-title') as HTMLElement).textContent = 'Add Exercise';
    (document.getElementById('exercise-id') as HTMLInputElement).value = '';
    (document.getElementById('exercise-day-id') as HTMLInputElement).value = dayId;
    (document.getElementById('exercise-name') as HTMLInputElement).value = '';
    (document.getElementById('exercise-weight') as HTMLInputElement).value = '';

    this.setGroups = [{ count: 3, reps: 10, isDropset: false }];
    this.renderSetGroups();

    this.$exerciseModal?.classList.remove('hidden');
  }

  async editExercise(id: number): Promise<void> {
    const exercise = await api.getExercise(id);

    (document.getElementById('modal-title') as HTMLElement).textContent = 'Edit Exercise';
    (document.getElementById('exercise-id') as HTMLInputElement).value = id.toString();
    (document.getElementById('exercise-day-id') as HTMLInputElement).value = exercise.day_id.toString();
    (document.getElementById('exercise-name') as HTMLInputElement).value = exercise.name;
    (document.getElementById('exercise-weight') as HTMLInputElement).value = exercise.default_weight?.toString() || '';

    this.setGroups = this.parseDescriptionToGroups(exercise.description);
    this.renderSetGroups();

    this.$exerciseModal?.classList.remove('hidden');
  }

  closeModal(): void {
    this.$exerciseModal?.classList.add('hidden');
  }

  async saveExercise(event: Event): Promise<void> {
    event.preventDefault();

    const id = (document.getElementById('exercise-id') as HTMLInputElement).value;
    const dayId = parseInt((document.getElementById('exercise-day-id') as HTMLInputElement).value);
    const name = (document.getElementById('exercise-name') as HTMLInputElement).value;
    const description = this.generateDescription() || null;
    const defaultWeight = parseFloat((document.getElementById('exercise-weight') as HTMLInputElement).value) || null;

    try {
      if (id) {
        await api.updateExercise(parseInt(id), name, description, defaultWeight);
      } else {
        await api.createExercise(dayId, name, description, defaultWeight);
      }

      this.closeModal();
      await this.loadDayExercises();
    } catch (err) {
      alert('Failed to save exercise');
      console.error(err);
    }
  }

  async deleteExercise(id: number): Promise<void> {
    if (!confirm('Delete this exercise?')) return;

    try {
      await api.deleteExercise(id);
      await this.loadDayExercises();
    } catch (err) {
      alert('Failed to delete exercise');
      console.error(err);
    }
  }

  // ===================
  // Set Group Builder
  // ===================

  private parseDescriptionToGroups(description: string | null): SetGroup[] {
    if (!description) return [{ count: 3, reps: 10, isDropset: false }];

    const groups: SetGroup[] = [];
    const parts = description.split(',').map(p => p.trim());

    for (const part of parts) {
      const match = part.match(/(\d+)\s*x\s*(\d+(?:-\d+)*|max)/i);
      if (match) {
        const count = parseInt(match[1]);
        const repsStr = match[2].toLowerCase();

        if (repsStr === 'max') {
          groups.push({ count, reps: 'max', isDropset: false });
        } else if (repsStr.includes('-')) {
          const dropCount = repsStr.split('-').length;
          const reps = parseInt(repsStr.split('-')[0]);
          groups.push({ count, reps, isDropset: true, dropsetCount: dropCount });
        } else {
          groups.push({ count, reps: parseInt(repsStr), isDropset: false });
        }

        const noteMatch = part.match(/\(([^)]+)\)/);
        if (noteMatch && groups.length > 0) {
          groups[groups.length - 1].note = noteMatch[1];
        }
      }
    }

    return groups.length > 0 ? groups : [{ count: 3, reps: 10, isDropset: false }];
  }

  private renderSetGroups(): void {
    const container = document.getElementById('set-groups');
    if (!container) return;

    container.innerHTML = this.setGroups.map((group, index) => `
      <div class="set-group" data-index="${index}">
        <input type="number" class="set-count" value="${group.count}" min="1" max="10"
          onchange="app.updateSetGroup(${index}, 'count', this.value)">
        <span class="set-group-label">x</span>
        <select class="set-reps-type" onchange="app.updateSetGroup(${index}, 'repsType', this.value)">
          <option value="number" ${group.reps !== 'max' ? 'selected' : ''}>Reps</option>
          <option value="max" ${group.reps === 'max' ? 'selected' : ''}>Max</option>
        </select>
        ${group.reps !== 'max' ? `
          <input type="number" class="set-reps" value="${group.reps}" min="1" max="100"
            onchange="app.updateSetGroup(${index}, 'reps', this.value)">
        ` : ''}
        <label class="dropset-toggle">
          <input type="checkbox" ${group.isDropset ? 'checked' : ''}
            onchange="app.updateSetGroup(${index}, 'isDropset', this.checked)">
          Drop
        </label>
        ${group.isDropset ? `
          <input type="number" class="dropset-count" value="${group.dropsetCount || 3}" min="2" max="5"
            placeholder="drops"
            onchange="app.updateSetGroup(${index}, 'dropsetCount', this.value)">
        ` : ''}
        <button type="button" class="remove-set-group" onclick="app.removeSetGroup(${index})">×</button>
      </div>
    `).join('');

    this.updateDescriptionPreview();
  }

  addSetGroup(): void {
    this.setGroups.push({ count: 1, reps: 10, isDropset: false });
    this.renderSetGroups();
  }

  removeSetGroup(index: number): void {
    if (this.setGroups.length <= 1) return;
    this.setGroups.splice(index, 1);
    this.renderSetGroups();
  }

  updateSetGroup(index: number, field: string, value: any): void {
    const group = this.setGroups[index];
    if (!group) return;

    switch (field) {
      case 'count':
        group.count = parseInt(value) || 1;
        break;
      case 'reps':
        group.reps = parseInt(value) || 10;
        break;
      case 'repsType':
        group.reps = value === 'max' ? 'max' : 10;
        break;
      case 'isDropset':
        group.isDropset = value;
        if (value && !group.dropsetCount) group.dropsetCount = 3;
        break;
      case 'dropsetCount':
        group.dropsetCount = parseInt(value) || 3;
        break;
    }

    this.renderSetGroups();
  }

  private updateDescriptionPreview(): void {
    const preview = document.getElementById('description-preview-text');
    if (preview) {
      preview.textContent = this.generateDescription() || 'No sets defined';
    }
  }

  private generateDescription(): string {
    return this.setGroups.map(group => {
      let repsStr: string;
      if (group.reps === 'max') {
        repsStr = 'max';
      } else if (group.isDropset && group.dropsetCount) {
        repsStr = Array(group.dropsetCount).fill(group.reps).join('-');
      } else {
        repsStr = group.reps.toString();
      }

      let part = `${group.count}x${repsStr}`;
      if (group.note) part += ` (${group.note})`;
      return part;
    }).join(', ');
  }
}

// Initialize app
const app = new GymTrackerApp();
(window as any).app = app;
