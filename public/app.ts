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
  SummaryStats,
  User
} from './types.js';
import { MEASUREMENT_FIELDS } from './types.js';

// Screen component system
import { ScreenManager } from './screens/ScreenManager.js';
import { HistoryScreen } from './screens/HistoryScreen.js';
import { ManageScreen } from './screens/ManageScreen.js';
import { ProgressScreen } from './screens/ProgressScreen.js';
import { MeasurementsScreen } from './screens/MeasurementsScreen.js';
import { SessionDetailScreen } from './screens/SessionDetailScreen.js';
import { MeasurementDetailScreen } from './screens/MeasurementDetailScreen.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { SessionScreen } from './screens/SessionScreen.js';
import type { ScreenContext, RouteParams, AppState } from './screens/types.js';

declare const Chart: any;

class GymTrackerApp {
  // State
  private currentUser: User | null = null;
  private days: WorkoutDay[] = [];
  private currentSession: Session | null = null;
  private sessionStartTime: Date | null = null;
  private currentExercises: ExerciseWithSets[] = [];
  private viewingSessionId: number | null = null;
  private viewingMeasurementId: number | null = null;
  private editingSetId: number | null = null;
  private addingSetExerciseId: number | null = null;
  private addingSetNumber: number | null = null;
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

  // Screen manager for modular screen components
  private screenManager: ScreenManager;

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
  private get $settingsModal() { return document.getElementById('settings-modal'); }
  private get $exerciseHistoryModal() { return document.getElementById('exercise-history-modal'); }
  private get $exerciseHistoryTitle() { return document.getElementById('exercise-history-title'); }
  private get $exerciseHistoryList() { return document.getElementById('exercise-history-list'); }
  private get $loginScreen() { return document.getElementById('login-screen'); }

  constructor() {
    // Disable browser's automatic scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Initialize screen manager with context
    this.screenManager = new ScreenManager(this.createScreenContext());
    this.registerScreens();

    // Set up auth error handler - redirect to login on 401
    api.setAuthErrorHandler(() => {
      this.currentUser = null;
      this.showLoginScreen();
    });

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

  /**
   * Create the ScreenContext that screens use to interact with the app.
   */
  private createScreenContext(): ScreenContext {
    return {
      navigate: (screenId: string, params?: RouteParams) => this.screenManager.navigateTo(screenId, params),
      goBack: () => this.goBack(),
      updateUrl: (screenId: string, params?: RouteParams) => this.updateUrl(screenId, params),
      getState: () => this.getAppState(),
      setState: (updates: Partial<AppState>) => this.setAppState(updates),
      showScreen: (screenId: string) => this.showScreen(screenId, false, true),
      scrollToTop: () => this.scrollToTop()
    };
  }

  /**
   * Register all screen components with the manager.
   */
  private registerScreens(): void {
    const ctx = this.createScreenContext();
    this.screenManager.register(new HistoryScreen(ctx));
    this.screenManager.register(new ManageScreen(ctx));
    this.screenManager.register(new ProgressScreen(ctx));
    this.screenManager.register(new MeasurementsScreen(ctx));
    this.screenManager.register(new SessionDetailScreen(ctx));
    this.screenManager.register(new MeasurementDetailScreen(ctx));
    this.screenManager.register(new HomeScreen(ctx));
    this.screenManager.register(new SessionScreen(ctx));
  }

  /**
   * Get the current app state for screens.
   */
  private getAppState(): AppState {
    return {
      currentUser: this.currentUser,
      days: this.days,
      currentSession: this.currentSession
    };
  }

  /**
   * Update app state from screens.
   */
  private setAppState(updates: Partial<AppState>): void {
    if (updates.currentUser !== undefined) this.currentUser = updates.currentUser;
    if (updates.days !== undefined) this.days = updates.days;
    if (updates.currentSession !== undefined) this.currentSession = updates.currentSession;
  }

  private async init(): Promise<void> {
    // Check authentication first
    if (!api.isAuthenticated()) {
      this.showLoginScreen();
      return;
    }

    // Verify token is still valid
    try {
      this.currentUser = await api.getMe();
    } catch {
      this.showLoginScreen();
      return;
    }

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

    // Show home screen and handle initial route
    this.$loginScreen?.classList.remove('active');
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
    // Sync timer when page becomes visible again (fixes frozen timer on background)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.updateTimer(); // Immediate sync when returning to app
    }
  };

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
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
          <div class="exercise-title-row">
            <span class="exercise-name">${exercise.name}</span>
            <button class="exercise-info-btn" onclick="event.stopPropagation(); app.showExerciseHistory(${exercise.id}, '${exercise.name.replace(/'/g, "\\'")}')">ⓘ</button>
          </div>
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
          // Dropset: "3x10-10-10" means 3 dropsets, each with 3 drops
          const dropsetParts = repsStr.split('-').length;
          for (let i = 0; i < count; i++) {
            sets.push({ setNumber: setNumber++, reps: repsStr, isDropset: true, dropsetParts });
          }
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
    if (!this.currentSession || defaultWeight === null || defaultWeight === undefined) return;

    try {
      await api.logSet(this.currentSession.id, exerciseId, setNumber, defaultWeight, reps);
      await api.markExerciseComplete(this.currentSession.id, exerciseId);
      await this.loadSessionExercises();
    } catch (err) {
      console.error('Failed to save set', err);
    }
  }

  async confirmDropset(exerciseId: number, setNumber: number, setId: string, dropCount: number): Promise<void> {
    if (!this.currentSession) return;

    try {
      // Log all drops in the dropset
      for (let i = 0; i < dropCount; i++) {
        const repsInput = document.getElementById(`${setId}-reps-${i}`) as HTMLInputElement;
        const weightInput = document.getElementById(`${setId}-weight-${i}`) as HTMLInputElement;

        const reps = parseInt(repsInput?.value) || parseInt(repsInput?.placeholder) || 10;
        const weight = parseFloat(weightInput?.value.replace(',', '.')) || parseFloat(weightInput?.placeholder) || 0;

        if (weight > 0) {
          await api.logSet(this.currentSession.id, exerciseId, setNumber + i * 0.1, weight, reps, true);
        }
      }

      await api.markExerciseComplete(this.currentSession.id, exerciseId);
      await this.loadSessionExercises();
    } catch (err) {
      console.error('Failed to save dropset', err);
    }
  }

  async logSetWeight(exerciseId: number, setNumber: number, weight: string, reps: string | number | null, isDropset: boolean = false): Promise<void> {
    if (!this.currentSession) return;

    const weightParsed = parseFloat(weight.replace(',', '.'));
    const weightNum = isNaN(weightParsed) ? null : weightParsed;
    const repsParsed = typeof reps === 'string' ? parseInt(reps) : reps;
    const repsNum = (typeof repsParsed === 'number' && isNaN(repsParsed)) ? null : repsParsed;

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
      <input type="number" class="reps-input" value="10" inputmode="numeric" placeholder="reps"
        onfocus="this.select()"
        onchange="app.logSetWeight(${exerciseId}, ${newSetNum}, document.querySelector('[data-exercise=\\'${exerciseId}\\'][data-set=\\'${newSetNum}\\'] .weight-input').value, this.value)">
      <span class="reps-unit">reps</span>
      <input type="text" class="weight-input" value="${defaultWeight}" inputmode="decimal" placeholder="kg"
        onfocus="this.select()"
        onchange="app.logSetWeight(${exerciseId}, ${newSetNum}, this.value, document.querySelector('[data-exercise=\\'${exerciseId}\\'][data-set=\\'${newSetNum}\\'] .reps-input').value)">
      <span class="weight-unit">kg</span>
    `;
    setsList.appendChild(newRow);
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
      // Home - always show home screen (even on initial load with valid token)
      this.showScreen('home-screen', !isInitial);
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

    // Check if screen is managed by ScreenManager (most screens are now)
    if (this.screenManager.has(screen)) {
      await this.screenManager.navigateTo(screen, params, updateHistory);
      return;
    }

    // Fallback for screens not yet migrated to ScreenManager
    await this.reloadScreenData(screen);
    this.showScreen(screen, updateHistory, true);
  }

  goBack(): void {
    // Use browser history for proper URL navigation
    history.back();
  }

  private async reloadScreenData(screenId: string): Promise<void> {
    // Most screens are now managed by ScreenManager (navigateToScreen delegates to it)
    // This method only handles screens not yet migrated
    switch (screenId) {
      case 'session-screen':
        // Session screen handled specially - has complex timer/state logic
        break;
    }
  }

  private clearScreenContent(screenId: string): void {
    // Most screens are now managed by ScreenManager
    // This method only handles screens not yet migrated
    switch (screenId) {
      case 'session-screen':
        // Don't clear exercise list - it loads fast and clearing causes flash
        if (this.$sessionTimer) this.$sessionTimer.textContent = '00:00:00';
        break;
    }
  }

  async showHome(): Promise<void> {
    this.navigationStack = ['home-screen'];
    await this.screenManager.navigateTo('home-screen');
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
  // Authentication
  // ===================

  private showLoginScreen(): void {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    this.$loginScreen?.classList.add('active');
  }

  async login(event: Event): Promise<void> {
    event.preventDefault();

    const usernameInput = document.getElementById('login-username') as HTMLInputElement;
    const passwordInput = document.getElementById('login-password') as HTMLInputElement;
    const errorDiv = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit') as HTMLButtonElement;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) return;

    submitBtn.disabled = true;
    errorDiv?.classList.add('hidden');

    try {
      const result = await api.login(username, password);

      if ('error' in result) {
        if (errorDiv) {
          errorDiv.textContent = result.error;
          errorDiv.classList.remove('hidden');
        }
        submitBtn.disabled = false;
        return;
      }

      this.currentUser = result.user;
      passwordInput.value = '';
      await this.initAfterLogin();
    } catch (err) {
      if (errorDiv) {
        errorDiv.textContent = 'Login failed. Please try again.';
        errorDiv.classList.remove('hidden');
      }
      submitBtn.disabled = false;
    }
  }

  private async initAfterLogin(): Promise<void> {
    // Load all data
    const [days, activeSession, stats] = await Promise.all([
      api.getDays(),
      api.getActiveSession(),
      api.getSummaryStats()
    ]);

    this.days = days;

    if (activeSession) {
      this.currentSession = activeSession;
      this.$activeSessionBanner?.classList.remove('hidden');
    }

    this.renderDayButtons();
    if (this.$statsContainer) {
      this.$statsContainer.innerHTML = templates.renderSummaryStats(stats);
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
    document.getElementById('home-content')?.classList.remove('loading');

    this.$loginScreen?.classList.remove('active');
    this.showScreen('home-screen', false);
    this.updateUrl('home-screen');
  }

  async logout(): Promise<void> {
    await api.logout();
    this.currentUser = null;
    this.currentSession = null;
    this.days = [];
    this.closeSettings();
    this.showLoginScreen();
  }

  showSettings(): void {
    const usernameEl = document.getElementById('settings-username');
    if (usernameEl && this.currentUser) {
      usernameEl.textContent = this.currentUser.username;
    }

    // Clear form
    (document.getElementById('current-password') as HTMLInputElement).value = '';
    (document.getElementById('new-password') as HTMLInputElement).value = '';
    (document.getElementById('confirm-password') as HTMLInputElement).value = '';
    document.getElementById('password-error')?.classList.add('hidden');
    document.getElementById('password-success')?.classList.add('hidden');

    this.$settingsModal?.classList.remove('hidden');
  }

  closeSettings(): void {
    this.$settingsModal?.classList.add('hidden');
  }

  async changePassword(event: Event): Promise<void> {
    event.preventDefault();

    const currentPassword = (document.getElementById('current-password') as HTMLInputElement).value;
    const newPassword = (document.getElementById('new-password') as HTMLInputElement).value;
    const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;
    const errorDiv = document.getElementById('password-error');
    const successDiv = document.getElementById('password-success');

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    if (newPassword !== confirmPassword) {
      if (errorDiv) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    if (newPassword.length < 4) {
      if (errorDiv) {
        errorDiv.textContent = 'Password must be at least 4 characters';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    try {
      const result = await api.changePassword(currentPassword, newPassword);

      if ('error' in result) {
        if (errorDiv) {
          errorDiv.textContent = result.error;
          errorDiv.classList.remove('hidden');
        }
        return;
      }

      // Success
      (document.getElementById('current-password') as HTMLInputElement).value = '';
      (document.getElementById('new-password') as HTMLInputElement).value = '';
      (document.getElementById('confirm-password') as HTMLInputElement).value = '';

      if (successDiv) {
        successDiv.textContent = 'Password updated successfully';
        successDiv.classList.remove('hidden');
      }
    } catch (err) {
      if (errorDiv) {
        errorDiv.textContent = 'Failed to change password';
        errorDiv.classList.remove('hidden');
      }
    }
  }

  // ===================
  // History (migrated to HistoryScreen)
  // ===================

  async showHistory(): Promise<void> {
    await this.screenManager.navigateTo('history-screen');
  }

  // loadHistory() moved to HistoryScreen.enter()

  // ===================
  // Session Detail
  // ===================

  async showSessionDetail(sessionId: number): Promise<void> {
    this.viewingSessionId = sessionId; // Keep for deleteSession compat
    await this.screenManager.navigateTo('session-detail-screen', { id: sessionId.toString() });
  }

  // loadSessionDetailContent() moved to SessionDetailScreen.enter()

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
    this.addingSetExerciseId = null;
    this.addingSetNumber = null;
  }

  openAddSetModal(exerciseId: number, setNumber: number): void {
    this.addingSetExerciseId = exerciseId;
    this.addingSetNumber = setNumber;
    this.editingSetId = null;

    const weightEl = document.getElementById('edit-set-weight') as HTMLInputElement;
    const repsEl = document.getElementById('edit-set-reps') as HTMLInputElement;
    const setIdEl = document.getElementById('edit-set-id') as HTMLInputElement;

    if (!weightEl || !repsEl || !setIdEl) return;

    setIdEl.value = '';
    weightEl.value = '';
    repsEl.value = '';

    this.$editSetModal?.classList.remove('hidden');
    weightEl.focus();
  }

  async updateSet(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.viewingSessionId) return;

    const weightVal = (document.getElementById('edit-set-weight') as HTMLInputElement).value.replace(',', '.');
    const weightParsed = parseFloat(weightVal);
    const weight = isNaN(weightParsed) ? null : weightParsed;
    const repsParsed = parseInt((document.getElementById('edit-set-reps') as HTMLInputElement).value);
    const reps = isNaN(repsParsed) ? null : repsParsed;

    try {
      if (this.addingSetExerciseId && this.addingSetNumber) {
        // Adding a new set
        await api.logSet(this.viewingSessionId, this.addingSetExerciseId, this.addingSetNumber, weight, reps);
      } else if (this.editingSetId) {
        // Updating existing set
        await api.updateSet(this.editingSetId, weight, reps);
      } else {
        return;
      }
      this.closeEditSetModal();
      await this.showSessionDetail(this.viewingSessionId);
    } catch (err) {
      alert('Failed to save set');
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
    await this.screenManager.navigateTo('progress-screen');
  }

  async showProgressForExercise(exerciseId: number): Promise<void> {
    // Find which day this exercise belongs to
    const exercises = await api.getAllExercises();
    const exercise = exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    // Navigate to progress screen first
    await this.screenManager.navigateTo('progress-screen');

    // Then select the day and load charts
    if (this.$progressDaySelect) {
      this.$progressDaySelect.value = exercise.day_id.toString();
      await this.loadDayProgress();
    }

    // Scroll to the specific exercise chart after charts are loaded
    setTimeout(() => {
      const chartEl = document.getElementById(`progress-exercise-${exerciseId}`);
      chartEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // loadProgressDaySelect() moved to ProgressScreen.enter()

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
    await this.screenManager.navigateTo('measurements-screen');
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
    this.viewingMeasurementId = id; // Keep for deleteMeasurement compat
    await this.screenManager.navigateTo('measurement-detail-screen', { id: id.toString() });
  }

  // loadMeasurementDetail() moved to MeasurementDetailScreen.enter()

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
          <input type="text" id="measurement-${f.key}" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*">
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
      const val = input?.value?.replace(',', '.');
      data[f.key] = val ? parseFloat(val) : null;
    });

    try {
      if (id) {
        await api.updateMeasurement(parseInt(id), data);
        this.closeMeasurementModal();
        // Refresh the detail screen by re-navigating
        if (this.viewingMeasurementId) {
          await this.screenManager.navigateTo('measurement-detail-screen', { id: this.viewingMeasurementId.toString() });
        }
      } else {
        await api.createMeasurement(data);
        this.closeMeasurementModal();
        // Refresh measurements list by re-navigating
        await this.screenManager.navigateTo('measurements-screen');
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
    await this.screenManager.navigateTo('manage-screen');
  }

  // loadManageDaySelect() moved to ManageScreen.enter()

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
  // Add Workout Day
  // ===================

  showAddDay(): void {
    (document.getElementById('day-display-name') as HTMLInputElement).value = '';
    document.getElementById('day-error')?.classList.add('hidden');
    document.getElementById('day-modal')?.classList.remove('hidden');
  }

  async saveDay(event: Event): Promise<void> {
    event.preventDefault();

    const displayNameInput = document.getElementById('day-display-name') as HTMLInputElement;
    const errorDiv = document.getElementById('day-error');
    const displayName = displayNameInput.value.trim();

    if (!displayName) return;

    // Generate a slug-style name from the display name
    const name = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const result = await api.createDay(name, displayName);

    if ('error' in result) {
      if (errorDiv) {
        errorDiv.textContent = result.error;
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    // Refresh days list
    this.days = await api.getDays();
    this.renderDayButtons();

    // Refresh manage day select dropdown
    if (this.$manageDaySelect) {
      this.$manageDaySelect.innerHTML = '<option value="">Select workout day...</option>' +
        this.days.map(d => `<option value="${d.id}">${d.display_name}</option>`).join('');
      // Select the new day
      this.$manageDaySelect.value = result.id.toString();
      await this.loadDayExercises();
    }

    this.closeModal();
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
    // Close all modals
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  async saveExercise(event: Event): Promise<void> {
    event.preventDefault();

    const id = (document.getElementById('exercise-id') as HTMLInputElement).value;
    const dayId = parseInt((document.getElementById('exercise-day-id') as HTMLInputElement).value);
    const name = (document.getElementById('exercise-name') as HTMLInputElement).value;
    const description = this.generateDescription() || null;
    const defaultWeightVal = (document.getElementById('exercise-weight') as HTMLInputElement).value.replace(',', '.');
    const defaultWeight = parseFloat(defaultWeightVal) || null;

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

  // Exercise History Modal
  async showExerciseHistory(exerciseId: number, exerciseName: string): Promise<void> {
    if (!this.$exerciseHistoryModal || !this.$exerciseHistoryTitle || !this.$exerciseHistoryList) return;

    this.$exerciseHistoryTitle.textContent = exerciseName;
    this.$exerciseHistoryList.innerHTML = '<div class="loading">Loading history...</div>';
    this.$exerciseHistoryModal.classList.remove('hidden');

    try {
      const history = await api.getExerciseHistory(exerciseId, 5);

      if (history.length === 0) {
        this.$exerciseHistoryList.innerHTML = '<div class="exercise-history-empty">No previous sessions found</div>';
        return;
      }

      this.$exerciseHistoryList.innerHTML = history.map(session => {
        const date = new Date(session.date);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const setsHtml = session.sets.map(set =>
          `<span class="exercise-history-set">${set.weight}kg × ${set.reps}</span>`
        ).join('');

        return `
          <div class="exercise-history-session">
            <div class="exercise-history-date">${dateStr}</div>
            <div class="exercise-history-sets">${setsHtml}</div>
            <div class="exercise-history-volume">Vol: ${session.volume.toLocaleString()}kg</div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load exercise history:', error);
      this.$exerciseHistoryList.innerHTML = '<div class="exercise-history-empty">Failed to load history</div>';
    }
  }

  closeExerciseHistory(): void {
    if (this.$exerciseHistoryModal) {
      this.$exerciseHistoryModal.classList.add('hidden');
    }
  }
}

// Initialize app
const app = new GymTrackerApp();
(window as any).app = app;
