<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import type { ExerciseWithSets, ParsedSet, SetLog } from '../lib/types';
  import { appState, navigate, goBack } from '../lib/store.svelte';
  import { formatTimer, parseSetScheme } from '../lib/utils';
  import Modal from '../lib/Modal.svelte';

  // --- State ---
  let exercises = $state<ExerciseWithSets[]>([]);
  let loading = $state(true);
  let timerDisplay = $state('00:00:00');
  let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let sessionStartTime = $state<Date | null>(null);

  // Extra sets added beyond scheme (keyed by exerciseId)
  let extraSets = $state<Record<number, number[]>>({});

  // Rest timer
  let restTimerOpen = $state(false);
  let restTimerPhase = $state<'select' | 'countdown'>('select');
  let restTimeRemaining = $state(0);
  let restTimerInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let restTimerDone = $state(false);
  let customRestSeconds = $state('');

  // Exercise history modal
  let historyOpen = $state(false);
  let historyExerciseName = $state('');
  let historyLoading = $state(false);
  let historyData = $state<{
    session_id: number;
    date: string;
    sets: { set_number: number; weight: number; reps: number }[];
    volume: number;
  }[]>([]);

  // --- Lifecycle ---
  onMount(() => { load(); });

  async function load() {
    if (!appState.currentSession) {
      navigate('home');
      return;
    }

    sessionStartTime = new Date(appState.currentSession.started_at);
    await loadSessionExercises();
    loading = false;
    startTimer();
  }

  function startTimer() {
    updateTimer();
    timerInterval = setInterval(() => updateTimer(), 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      updateTimer();
    }
  }

  function updateTimer() {
    if (!sessionStartTime) return;
    const elapsed = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
    timerDisplay = formatTimer(elapsed);
  }

  // Cleanup on destroy
  $effect(() => {
    return () => {
      stopTimer();
      stopRestTimer();
    };
  });

  // --- Data Loading ---
  async function loadSessionExercises() {
    if (!appState.currentSession) return;

    exercises = await api.getSessionExercises(appState.currentSession.id);

    // Fetch last volume for each exercise in parallel
    await Promise.all(exercises.map(async (ex) => {
      const data = await api.getExerciseLastVolume(ex.id, appState.currentSession!.id);
      ex.lastVolume = data.volume;
    }));
  }

  async function refreshExerciseCard(exerciseId: number) {
    if (!appState.currentSession) return;

    const updated = await api.getSessionExercises(appState.currentSession.id);
    const exercise = updated.find(e => e.id === exerciseId);
    if (!exercise) return;

    const index = exercises.findIndex(e => e.id === exerciseId);
    if (index !== -1) {
      exercise.lastVolume = exercises[index].lastVolume;
      exercises[index] = exercise;
      exercises = exercises;
    }
  }

  // --- Set Confirmation ---
  async function confirmSet(exerciseId: number, setNumber: number) {
    if (!appState.currentSession) return;

    const row = document.querySelector(`[data-exercise="${exerciseId}"][data-set="${setNumber}"]`);
    if (!row) return;

    const weightInput = row.querySelector('.weight-input') as HTMLInputElement;
    const repsInput = row.querySelector('.reps-input') as HTMLInputElement;

    const weightStr = weightInput?.value?.replace(',', '.') || weightInput?.placeholder || '';
    const repsStr = repsInput?.value || repsInput?.placeholder || '';

    const weight = parseFloat(weightStr);
    const reps = parseInt(repsStr);

    if (isNaN(weight) || weight < 0) {
      alert('Please enter a valid weight');
      return;
    }

    try {
      await api.logSet(appState.currentSession.id, exerciseId, setNumber, weight, isNaN(reps) ? null : reps);
      await api.markExerciseComplete(appState.currentSession.id, exerciseId);
      await refreshExerciseCard(exerciseId);
    } catch (err) {
      console.error('Failed to save set', err);
    }
  }

  async function confirmDropset(exerciseId: number, setNumber: number, setId: string, dropCount: number) {
    if (!appState.currentSession) return;

    try {
      for (let i = 0; i < dropCount; i++) {
        const repsInput = document.getElementById(`${setId}-reps-${i}`) as HTMLInputElement;
        const weightInput = document.getElementById(`${setId}-weight-${i}`) as HTMLInputElement;

        const reps = parseInt(repsInput?.value) || parseInt(repsInput?.placeholder) || 10;
        const weight = parseFloat(weightInput?.value.replace(',', '.')) || parseFloat(weightInput?.placeholder) || 0;

        if (weight > 0) {
          await api.logSet(appState.currentSession.id, exerciseId, setNumber + i * 0.1, weight, reps, true);
        }
      }

      await api.markExerciseComplete(appState.currentSession.id, exerciseId);
      await refreshExerciseCard(exerciseId);
    } catch (err) {
      console.error('Failed to save dropset', err);
    }
  }

  // --- Extra Sets ---
  function addExtraSet(exerciseId: number) {
    const exercise = exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    const loggedSets = exercise.sets || [];
    const expectedSets = parseSetScheme(exercise.description);
    const maxSet = Math.max(
      ...loggedSets.map(s => Math.floor(s.set_number)),
      ...expectedSets.map(s => s.setNumber),
      ...(extraSets[exerciseId] || []),
      0
    );

    const newSetNum = maxSet + 1;
    if (!extraSets[exerciseId]) {
      extraSets[exerciseId] = [];
    }
    extraSets[exerciseId] = [...extraSets[exerciseId], newSetNum];
  }

  function removeExtraSet(exerciseId: number, setNum: number) {
    if (extraSets[exerciseId]) {
      extraSets[exerciseId] = extraSets[exerciseId].filter(s => s !== setNum);
    }
  }

  // --- Volume Helpers ---
  function currentVolume(exercise: ExerciseWithSets): number {
    const sets = exercise.sets || [];
    return sets.reduce((sum, s) => {
      return s.weight && s.reps ? sum + (s.weight * s.reps) : sum;
    }, 0);
  }

  function volumeChangePercent(current: number, last: number | null | undefined): { text: string; cssClass: string } | null {
    if (!last || last <= 0 || current <= 0) return null;
    const pct = ((current - last) / last) * 100;
    if (pct > 0) return { text: `+${pct.toFixed(0)}%`, cssClass: 'text-accent' };
    if (pct < 0) return { text: `${pct.toFixed(0)}%`, cssClass: 'text-danger' };
    return { text: '0%', cssClass: 'text-text-muted' };
  }

  // --- Set Row Helpers ---
  function getLoggedSet(exercise: ExerciseWithSets, setNumber: number): SetLog | undefined {
    return (exercise.sets || []).find(s => s.set_number === setNumber);
  }

  function getLastSet(exercise: ExerciseWithSets, setNumber: number): SetLog | undefined {
    return (exercise.lastSets || []).find(s => s.set_number === setNumber);
  }

  function getExtraLoggedSets(exercise: ExerciseWithSets): SetLog[] {
    const expectedSets = parseSetScheme(exercise.description);
    const maxExpected = expectedSets.length > 0 ? Math.max(...expectedSets.map(s => s.setNumber)) : 0;
    return (exercise.sets || []).filter(s => s.set_number > maxExpected && Number.isInteger(s.set_number));
  }

  function getDropsetData(exercise: ExerciseWithSets, expected: ParsedSet): {
    weight: number | string;
    reps: number | string;
    logged: boolean;
    placeholderWeight: string;
    placeholderReps: number;
  }[] {
    const loggedSets = exercise.sets || [];
    const lastSets = exercise.lastSets || [];
    const repsArray = typeof expected.reps === 'string'
      ? expected.reps.split('-').map(r => parseInt(r) || 10)
      : [typeof expected.reps === 'number' ? expected.reps : 10];

    const data = [];
    for (let i = 0; i < (expected.dropsetParts || 0); i++) {
      const subSetNum = expected.setNumber + i * 0.1;
      const subLogged = loggedSets.find(s => Math.abs(s.set_number - subSetNum) < 0.01);
      const lastSet = lastSets.find(s => Math.abs(s.set_number - subSetNum) < 0.01);
      const defaultReps = repsArray[i] ?? repsArray[0] ?? 10;
      data.push({
        weight: subLogged?.weight ?? '',
        reps: subLogged?.reps ?? '',
        logged: subLogged?.weight !== null && subLogged?.weight !== undefined,
        placeholderWeight: lastSet?.weight?.toString() || 'kg',
        placeholderReps: lastSet?.reps || defaultReps,
      });
    }
    return data;
  }

  function isDropsetAllLogged(exercise: ExerciseWithSets, expected: ParsedSet): boolean {
    return getDropsetData(exercise, expected).every(d => d.logged);
  }

  function hasLoggedSets(exercise: ExerciseWithSets): boolean {
    return (exercise.sets || []).some(s => s.weight !== null);
  }

  // --- Rest Timer ---
  function openRestTimer() {
    restTimerOpen = true;
    restTimerPhase = 'select';
    restTimerDone = false;
    customRestSeconds = '';
  }

  function closeRestTimer() {
    restTimerOpen = false;
    stopRestTimer();
  }

  function startRestTimerCountdown(seconds: number) {
    restTimeRemaining = seconds;
    restTimerPhase = 'countdown';
    restTimerDone = false;
    updateRestTimerDisplay();

    restTimerInterval = setInterval(() => {
      restTimeRemaining--;
      if (restTimeRemaining <= 0) {
        restTimerComplete();
      }
    }, 1000);
  }

  function startCustomRestTimer() {
    const seconds = parseInt(customRestSeconds);
    if (seconds && seconds > 0) {
      startRestTimerCountdown(seconds);
    }
  }

  function extendRestTimer(seconds: number) {
    restTimeRemaining += seconds;
    restTimerDone = false;

    if (!restTimerInterval) {
      restTimerInterval = setInterval(() => {
        restTimeRemaining--;
        if (restTimeRemaining <= 0) {
          restTimerComplete();
        }
      }, 1000);
    }
  }

  function updateRestTimerDisplay(): string {
    const mins = Math.floor(restTimeRemaining / 60);
    const secs = restTimeRemaining % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function restTimerComplete() {
    stopRestTimerInterval();
    restTimerDone = true;
    restTimeRemaining = 0;
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }

  function stopRestTimerInterval() {
    if (restTimerInterval) {
      clearInterval(restTimerInterval);
      restTimerInterval = null;
    }
  }

  function stopRestTimer() {
    stopRestTimerInterval();
    restTimeRemaining = 0;
    restTimerDone = false;
  }

  let restTimerDisplayText = $derived.by(() => {
    if (restTimerDone) return "Time's up!";
    const mins = Math.floor(restTimeRemaining / 60);
    const secs = restTimeRemaining % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

  // --- Exercise History ---
  async function showExerciseHistory(exerciseId: number, exerciseName: string) {
    historyExerciseName = exerciseName;
    historyData = [];
    historyLoading = true;
    historyOpen = true;

    try {
      historyData = await api.getExerciseHistory(exerciseId, 5);
    } catch (error) {
      console.error('Failed to load exercise history:', error);
    }
    historyLoading = false;
  }

  function closeExerciseHistory() {
    historyOpen = false;
  }

  function formatHistoryDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // --- Session End ---
  function confirmEndSession() {
    if (confirm('End this session?')) {
      finishSession();
    }
  }

  async function finishSession() {
    if (!appState.currentSession) return;

    try {
      await api.endSession(appState.currentSession.id);
      stopTimer();
      appState.currentSession = null;
      appState.days = await api.getDays();
      navigate('home');
    } catch (err) {
      alert('Failed to end session');
      console.error(err);
    }
  }

  async function cancelSession() {
    if (!appState.currentSession) return;
    if (!confirm('Cancel this session? All logged sets will be deleted.')) return;

    try {
      await api.deleteSession(appState.currentSession.id);
      stopTimer();
      appState.currentSession = null;
      appState.days = await api.getDays();
      navigate('home');
    } catch (err) {
      alert('Failed to cancel session');
      console.error(err);
    }
  }

  // Derived: day name
  let dayName = $derived(appState.currentSession?.day_display_name || 'Workout');
</script>

<div id="session-screen" class="screen active">
  <!-- Header -->
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-danger text-sm font-semibold" onclick={confirmEndSession}>End</button>
    <div class="flex flex-col items-center">
      <span class="text-sm font-semibold">{dayName}</span>
      <span class="text-xs text-text-muted font-mono">{timerDisplay}</span>
    </div>
    <button class="text-accent text-sm font-semibold" onclick={openRestTimer}>Rest</button>
  </header>

  {#if loading}
    <div class="text-center text-text-muted py-8">Loading...</div>
  {:else}
    <main class="p-4 pb-32">
      <!-- Exercise List -->
      {#each exercises as exercise (exercise.id)}
        {@const expectedSets = parseSetScheme(exercise.description)}
        {@const loggedSets = exercise.sets || []}
        {@const volume = currentVolume(exercise)}
        {@const volChange = volumeChangePercent(volume, exercise.lastVolume)}
        {@const extraLoggedSets = getExtraLoggedSets(exercise)}
        {@const exerciseExtraSets = extraSets[exercise.id] || []}
        {@const exerciseHasLogged = hasLoggedSets(exercise)}

        <div
          class="bg-surface border {exerciseHasLogged ? 'border-accent-dim' : 'border-border'} rounded-lg p-4 mb-4"
          id="exercise-{exercise.id}"
        >
          <!-- Exercise Name + History Button -->
          <div class="mb-3">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-text-primary">{exercise.name}</span>
              <button
                class="w-6 h-6 text-text-muted flex items-center justify-center"
                onclick={(e) => { e.stopPropagation(); showExerciseHistory(exercise.id, exercise.name); }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </button>
            </div>

            <!-- Volume Display -->
            <div class="flex items-baseline gap-2 text-sm">
              {#if volume > 0}
                <span class="font-semibold text-text-primary">{volume.toFixed(0)} kg</span>
                {#if volChange}
                  <span class="{volChange.cssClass} text-xs font-medium">{volChange.text}</span>
                {/if}
                {#if exercise.lastVolume}
                  <span class="text-text-muted text-xs">(last: {exercise.lastVolume.toFixed(0)} kg)</span>
                {/if}
              {:else}
                <span class="text-text-dim">-- kg</span>
                {#if exercise.lastVolume && exercise.lastVolume > 0}
                  <span class="text-text-muted text-xs">(last: {exercise.lastVolume.toFixed(0)} kg)</span>
                {/if}
              {/if}
            </div>
          </div>

          <!-- Set Scheme Description -->
          {#if exercise.description}
            <div class="text-sm text-text-muted mb-3">{exercise.description}</div>
          {/if}

          <!-- Set Rows -->
          <div class="sets-list flex flex-col gap-2">
            {#each expectedSets as expected}
              {@const logged = getLoggedSet(exercise, expected.setNumber)}
              {@const isLogged = logged && logged.weight !== null}

              {#if expected.isDropset && expected.dropsetParts}
                <!-- Dropset Row -->
                {@const drops = getDropsetData(exercise, expected)}
                {@const allLogged = isDropsetAllLogged(exercise, expected)}
                {@const setId = `dropset-${exercise.id}-${expected.setNumber}`}

                <div
                  class="p-3 {allLogged ? 'bg-accent-surface border-accent' : 'bg-surface border-border'} border rounded-lg"
                  data-exercise={exercise.id}
                  data-set={expected.setNumber}
                >
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm text-text-muted">Set {expected.setNumber}</span>
                    <button
                      class="{allLogged ? 'w-10 h-10 bg-surface border border-accent text-accent font-bold rounded-lg' : 'w-10 h-10 bg-accent text-black font-bold rounded-lg'}"
                      onclick={() => confirmDropset(exercise.id, expected.setNumber, setId, expected.dropsetParts!)}
                    >&#10003;</button>
                  </div>
                  <div class="flex flex-col gap-2">
                    {#each drops as drop, i}
                      <div class="flex items-center gap-2" data-drop={i}>
                        <input
                          type="number"
                          class="w-14 p-2 bg-black border {drop.logged ? 'border-accent' : 'border-border'} rounded text-center text-sm"
                          id="{setId}-reps-{i}"
                          value={drop.logged ? drop.reps : ''}
                          inputmode="numeric"
                          placeholder={String(drop.placeholderReps)}
                          onfocus={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <span class="text-text-muted">x</span>
                        <input
                          type="text"
                          class="w-16 p-2 bg-black border {drop.logged ? 'border-accent' : 'border-border'} rounded text-center text-sm"
                          id="{setId}-weight-{i}"
                          value={drop.logged ? drop.weight : ''}
                          inputmode="decimal"
                          placeholder={drop.placeholderWeight}
                          onfocus={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <span class="text-xs text-text-muted">kg</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {:else}
                <!-- Normal Set Row -->
                {@const lastSet = getLastSet(exercise, expected.setNumber)}
                {@const placeholderWeight = lastSet?.weight?.toString() || exercise.default_weight?.toString() || 'kg'}
                {@const placeholderReps = lastSet?.reps?.toString() || (typeof expected.reps === 'number' ? String(expected.reps) : 'reps')}
                {@const isMax = expected.reps === 'max'}
                {@const showWeight = isLogged ? (logged?.weight ?? '') : ''}
                {@const showReps = isLogged ? (logged?.reps ?? '') : (isMax ? '' : expected.reps)}

                <div
                  class="flex items-center gap-2 p-3 {isLogged ? 'bg-accent-surface border-accent' : 'bg-surface border-border'} border rounded-lg"
                  data-exercise={exercise.id}
                  data-set={expected.setNumber}
                >
                  <span class="text-sm text-text-muted w-12">Set {expected.setNumber}</span>
                  <input
                    type="number"
                    class="reps-input w-14 p-2 bg-black border {isLogged ? 'border-accent' : 'border-border'} rounded text-center text-sm"
                    value={showReps}
                    inputmode="numeric"
                    placeholder={isMax ? placeholderReps : String(expected.reps)}
                    onfocus={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <span class="text-xs text-text-muted">reps</span>
                  <input
                    type="text"
                    class="weight-input w-16 p-2 bg-black border {isLogged ? 'border-accent' : 'border-border'} rounded text-center text-sm"
                    value={showWeight}
                    inputmode="decimal"
                    placeholder={placeholderWeight}
                    onfocus={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <span class="text-xs text-text-muted">kg</span>
                  <button
                    class="{isLogged ? 'ml-auto w-10 h-10 bg-surface border border-accent text-accent font-bold rounded-lg' : 'ml-auto w-10 h-10 bg-accent text-black font-bold rounded-lg'}"
                    onclick={() => confirmSet(exercise.id, expected.setNumber)}
                  >&#10003;</button>
                </div>
              {/if}
            {/each}

            <!-- Extra logged sets from server -->
            {#each extraLoggedSets as loggedExtra}
              <div
                class="flex items-center gap-2 p-3 bg-accent-surface border border-dashed border-accent rounded-lg"
                data-exercise={exercise.id}
                data-set={loggedExtra.set_number}
                data-extra="true"
              >
                <span class="text-sm text-text-muted w-12">Extra</span>
                <input
                  type="number"
                  class="reps-input w-14 p-2 bg-black border border-accent rounded text-center text-sm"
                  value={loggedExtra.reps || ''}
                  inputmode="numeric"
                  placeholder="reps"
                  onfocus={(e) => (e.target as HTMLInputElement).select()}
                />
                <span class="text-xs text-text-muted">reps</span>
                <input
                  type="text"
                  class="weight-input w-16 p-2 bg-black border border-accent rounded text-center text-sm"
                  value={loggedExtra.weight ?? ''}
                  inputmode="decimal"
                  placeholder="kg"
                  onfocus={(e) => (e.target as HTMLInputElement).select()}
                />
                <span class="text-xs text-text-muted">kg</span>
                <button
                  class="ml-auto w-10 h-10 bg-surface border border-accent text-accent font-bold rounded-lg"
                  onclick={() => confirmSet(exercise.id, loggedExtra.set_number)}
                >&#10003;</button>
              </div>
            {/each}

            <!-- Extra sets added by user (not yet logged) -->
            {#each exerciseExtraSets as extraSetNum}
              {@const defaultWeight = exercise.default_weight || ''}
              <div
                class="flex items-center gap-2 p-3 bg-surface border border-dashed border-border rounded-lg"
                data-exercise={exercise.id}
                data-set={extraSetNum}
                data-extra="true"
              >
                <button
                  class="w-6 h-6 text-text-muted text-base"
                  onclick={() => removeExtraSet(exercise.id, extraSetNum)}
                >x</button>
                <span class="text-sm text-text-muted w-12">Extra</span>
                <input
                  type="number"
                  class="reps-input w-14 p-2 bg-black border border-border rounded text-center text-sm"
                  value=""
                  inputmode="numeric"
                  placeholder="10"
                  onfocus={(e) => (e.target as HTMLInputElement).select()}
                />
                <span class="text-xs text-text-muted">reps</span>
                <input
                  type="text"
                  class="weight-input w-16 p-2 bg-black border border-border rounded text-center text-sm"
                  value=""
                  inputmode="decimal"
                  placeholder={defaultWeight ? String(defaultWeight) : 'kg'}
                  onfocus={(e) => (e.target as HTMLInputElement).select()}
                />
                <span class="text-xs text-text-muted">kg</span>
                <button
                  class="ml-auto w-10 h-10 bg-accent text-black font-bold rounded-lg"
                  onclick={() => confirmSet(exercise.id, extraSetNum)}
                >&#10003;</button>
              </div>
            {/each}
          </div>

          <!-- Add Set Button -->
          <button
            class="w-full mt-3 p-2 border border-dashed border-border text-text-muted text-sm rounded-lg"
            onclick={() => addExtraSet(exercise.id)}
          >+ Add Set</button>
        </div>
      {/each}

      <!-- Finish / Cancel Buttons -->
      <div class="flex gap-3 mt-6">
        <button
          class="flex-1 p-4 bg-accent text-black font-semibold rounded-lg text-base"
          onclick={confirmEndSession}
        >Finish Workout</button>
        <button
          class="p-4 bg-black border border-danger text-danger font-medium rounded-lg text-sm"
          onclick={cancelSession}
        >Cancel</button>
      </div>
    </main>
  {/if}
</div>

<!-- Rest Timer Modal -->
<Modal open={restTimerOpen} onclose={closeRestTimer}>
  <h3 class="text-lg font-semibold mb-4 text-center">Rest Timer</h3>

  {#if restTimerPhase === 'select'}
    <div class="grid grid-cols-2 gap-3 mb-4">
      <button
        class="p-4 bg-surface border border-border rounded-lg text-text-primary text-lg font-medium"
        onclick={() => startRestTimerCountdown(60)}
      >1:00</button>
      <button
        class="p-4 bg-surface border border-border rounded-lg text-text-primary text-lg font-medium"
        onclick={() => startRestTimerCountdown(90)}
      >1:30</button>
      <button
        class="p-4 bg-surface border border-border rounded-lg text-text-primary text-lg font-medium"
        onclick={() => startRestTimerCountdown(120)}
      >2:00</button>
      <button
        class="p-4 bg-surface border border-border rounded-lg text-text-primary text-lg font-medium"
        onclick={() => startRestTimerCountdown(180)}
      >3:00</button>
    </div>

    <div class="flex gap-2 mb-4">
      <input
        type="number"
        class="flex-1 p-3 bg-black border border-border rounded-lg text-text-primary text-center"
        placeholder="Custom (seconds)"
        inputmode="numeric"
        bind:value={customRestSeconds}
      />
      <button
        class="px-4 py-3 bg-accent text-black font-semibold rounded-lg"
        onclick={startCustomRestTimer}
      >Go</button>
    </div>

    <button
      class="w-full p-3 bg-black border border-border text-text-secondary rounded-lg"
      onclick={closeRestTimer}
    >Cancel</button>
  {:else}
    <!-- Countdown -->
    <div class="text-center mb-6">
      <div class="text-5xl font-bold font-mono {restTimerDone ? 'text-accent' : 'text-text-primary'} mb-2">
        {restTimerDisplayText}
      </div>
    </div>

    <div class="flex gap-2 mb-4">
      <button
        class="flex-1 p-3 bg-surface border border-border rounded-lg text-text-primary text-sm font-medium"
        onclick={() => extendRestTimer(10)}
      >+10s</button>
      <button
        class="flex-1 p-3 bg-surface border border-border rounded-lg text-text-primary text-sm font-medium"
        onclick={() => extendRestTimer(30)}
      >+30s</button>
      <button
        class="flex-1 p-3 bg-surface border border-border rounded-lg text-text-primary text-sm font-medium"
        onclick={() => extendRestTimer(60)}
      >+1m</button>
    </div>

    <button
      class="rest-timer-stop w-full p-3 {restTimerDone ? 'bg-accent text-black' : 'bg-black border border-border text-text-secondary'} rounded-lg font-medium"
      onclick={closeRestTimer}
    >{restTimerDone ? 'OK' : 'Stop'}</button>
  {/if}
</Modal>

<!-- Exercise History Modal -->
<Modal open={historyOpen} onclose={closeExerciseHistory}>
  <h3 class="text-lg font-semibold mb-4">{historyExerciseName}</h3>

  {#if historyLoading}
    <div class="text-center text-text-muted py-4">Loading history...</div>
  {:else if historyData.length === 0}
    <div class="text-center text-text-muted py-8">No previous sessions found</div>
  {:else}
    <div class="flex flex-col gap-3 mb-4">
      {#each historyData as session}
        <div class="bg-surface border border-border rounded-lg p-3">
          <div class="text-sm font-medium text-text-primary mb-2">{formatHistoryDate(session.date)}</div>
          <div class="flex flex-wrap gap-2 mb-2">
            {#each session.sets as set}
              <span class="inline-block px-2 py-1 bg-black rounded text-sm text-text-primary">
                {set.reps} x {set.weight}kg
              </span>
            {/each}
          </div>
          <div class="text-xs text-text-muted">Volume: {session.volume.toLocaleString()}kg</div>
        </div>
      {/each}
    </div>
  {/if}

  <button
    class="w-full p-3 bg-black border border-border text-text-secondary rounded-lg"
    onclick={closeExerciseHistory}
  >Close</button>
</Modal>

<style>
  .screen {
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
</style>
