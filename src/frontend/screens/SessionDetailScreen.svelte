<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { navigate, goBack } from '../lib/store.svelte';
  import { formatDuration } from '../lib/utils';
  import type { Session, ExerciseWithSets, ExerciseStats } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let { params } = $props<{ params: Record<string, string> }>();

  let session = $state<Session | null>(null);
  let exercises = $state<ExerciseWithSets[]>([]);
  let stats = $state<ExerciseStats[]>([]);
  let loading = $state(true);

  // Edit end time modal
  let editEndTimeOpen = $state(false);
  let editEndDate = $state('');
  let editEndTime = $state('');
  let savingEndTime = $state(false);

  // Inline set editing
  let editingSet = $state<{
    setId: number | null;
    exerciseId: number;
    setNumber: number;
    weight: number | string;
    reps: number | string;
    isNew: boolean;
  } | null>(null);
  let savingSet = $state(false);

  onMount(() => { load(); });

  async function load() {
    loading = true;
    const sessionId = parseInt(params.id);
    try {
      const [s, ex, st] = await Promise.all([
        api.getSession(sessionId),
        api.getSessionExercises(sessionId),
        api.getSessionStats(sessionId),
      ]);
      session = s;
      exercises = ex;
      stats = st;
    } catch (err) {
      console.error('Failed to load session detail', err);
    }
    loading = false;
  }

  function getExerciseStats(exerciseId: number): ExerciseStats | undefined {
    return stats.find(s => s.exerciseId === exerciseId);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function sessionDuration(): string {
    if (!session || !session.ended_at) return '';
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    return formatDuration(ms);
  }

  function totalVolume(): number {
    let vol = 0;
    for (const ex of exercises) {
      if (ex.sets) {
        for (const s of ex.sets) {
          vol += (s.weight || 0) * (s.reps || 0);
        }
      }
    }
    return vol;
  }

  function totalPrCount(): number {
    let count = 0;
    for (const s of stats) {
      if (s.prs.volume) count++;
      if (s.prs.setVolume) count++;
      if (s.prs.weight) count++;
      if (s.prs.reps) count++;
    }
    return count;
  }

  function exerciseVolume(ex: ExerciseWithSets): number {
    let vol = 0;
    if (ex.sets) {
      for (const s of ex.sets) {
        vol += (s.weight || 0) * (s.reps || 0);
      }
    }
    return vol;
  }

  // End time editing
  function openEditEndTime() {
    if (!session?.ended_at) return;
    const d = new Date(session.ended_at);
    editEndDate = d.toISOString().split('T')[0];
    editEndTime = d.toTimeString().slice(0, 5);
    editEndTimeOpen = true;
  }

  function closeEditEndTime() {
    editEndTimeOpen = false;
    savingEndTime = false;
  }

  async function saveEndTime() {
    if (!session || !editEndDate || !editEndTime) return;
    savingEndTime = true;
    try {
      const endedAt = new Date(`${editEndDate}T${editEndTime}:00`).toISOString();
      const updated = await api.updateSessionEndTime(session.id, endedAt);
      session = updated;
      closeEditEndTime();
    } catch (err) {
      alert('Failed to update end time');
      console.error(err);
      savingEndTime = false;
    }
  }

  // Delete session
  async function deleteSession() {
    if (!session) return;
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await api.deleteSession(session.id);
      goBack();
    } catch (err) {
      alert('Failed to delete session');
      console.error(err);
    }
  }

  // Inline set editing
  function startEditSet(exerciseId: number, set: { id: number; set_number: number; weight: number | null; reps: number | null }) {
    editingSet = {
      setId: set.id,
      exerciseId,
      setNumber: set.set_number,
      weight: set.weight ?? '',
      reps: set.reps ?? '',
      isNew: false,
    };
  }

  function startAddSet(exerciseId: number, nextSetNumber: number) {
    editingSet = {
      setId: null,
      exerciseId,
      setNumber: nextSetNumber,
      weight: '',
      reps: '',
      isNew: true,
    };
  }

  function cancelEditSet() {
    editingSet = null;
  }

  async function saveSet() {
    if (!editingSet || !session) return;
    savingSet = true;
    try {
      const weight = editingSet.weight === '' ? null : Number(editingSet.weight);
      const reps = editingSet.reps === '' ? null : Number(editingSet.reps);

      if (editingSet.isNew) {
        await api.logSet(session.id, editingSet.exerciseId, editingSet.setNumber, weight, reps);
      } else if (editingSet.setId !== null) {
        await api.updateSet(editingSet.setId, weight, reps);
      }

      editingSet = null;
      savingSet = false;
      await reloadExercisesAndStats();
    } catch (err) {
      alert('Failed to save set');
      console.error(err);
      savingSet = false;
    }
  }

  async function deleteSet() {
    if (!editingSet || editingSet.setId === null) return;
    if (!confirm('Delete this set?')) return;
    savingSet = true;
    try {
      await api.deleteSet(editingSet.setId);
      editingSet = null;
      savingSet = false;
      await reloadExercisesAndStats();
    } catch (err) {
      alert('Failed to delete set');
      console.error(err);
      savingSet = false;
    }
  }

  async function reloadExercisesAndStats() {
    if (!session) return;
    const [ex, st] = await Promise.all([
      api.getSessionExercises(session.id),
      api.getSessionStats(session.id),
    ]);
    exercises = ex;
    stats = st;
  }
</script>

<div id="session-detail-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold truncate mx-2">
      {#if session}
        {session.day_display_name || session.day_name || 'Workout'} - {formatDate(session.started_at)}
      {:else}
        Session
      {/if}
    </h1>
    <button class="text-danger text-sm font-medium" onclick={deleteSession}>Delete</button>
  </header>

  {#if loading}
    <div class="text-center text-text-muted py-8">Loading...</div>
  {:else if session}
    <main class="p-4">
      <!-- Timing -->
      <div class="bg-surface border border-border rounded-lg p-4 mb-4">
        <div class="flex items-center justify-between">
          <div class="text-sm text-text-secondary">
            {formatTime(session.started_at)}
            {#if session.ended_at}
              <span class="text-text-muted mx-1">-></span>
              {formatTime(session.ended_at)}
              <span class="text-text-muted ml-1">({sessionDuration()})</span>
            {:else}
              <span class="text-accent ml-1">In progress</span>
            {/if}
          </div>
          {#if session.ended_at}
            <button
              class="text-xs text-text-muted border border-border rounded px-2 py-1"
              onclick={openEditEndTime}
            >
              Edit
            </button>
          {/if}
        </div>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-surface border border-border rounded-lg p-3 text-center">
          <div class="text-xl font-bold text-text-primary">{Math.round(totalVolume()).toLocaleString()}</div>
          <div class="text-xs text-text-muted uppercase tracking-wider">volume (kg)</div>
        </div>
        <div class="bg-surface border border-border rounded-lg p-3 text-center">
          <div class="text-xl font-bold text-text-primary">{exercises.length}</div>
          <div class="text-xs text-text-muted uppercase tracking-wider">exercises</div>
        </div>
        <div class="bg-surface border border-border rounded-lg p-3 text-center">
          <div class="text-xl font-bold {totalPrCount() > 0 ? 'text-gold' : 'text-text-primary'}">{totalPrCount()}</div>
          <div class="text-xs text-text-muted uppercase tracking-wider">PRs</div>
        </div>
      </div>

      <!-- Exercises -->
      <div class="flex flex-col gap-3">
        {#each exercises as exercise}
          {@const exStats = getExerciseStats(exercise.id)}
          <div class="bg-surface border border-border rounded-lg p-4">
            <!-- Exercise header -->
            <div class="flex items-start justify-between mb-2">
              <button
                class="font-semibold text-text-primary text-left"
                onclick={() => {
                  if (session) navigate('progress-day', { id: String(session.day_id) });
                }}
              >
                {exercise.name}
              </button>
              <div class="flex gap-1 flex-wrap justify-end ml-2">
                {#if exStats?.prs.volume}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-gold/20 text-gold">Vol PR</span>
                {/if}
                {#if exStats?.prs.setVolume}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-orange-500/20 text-orange-500">Set PR</span>
                {/if}
                {#if exStats?.prs.weight}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-pink-500/20 text-pink-500">1RM</span>
                {/if}
                {#if exStats?.prs.reps}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-500">Reps PR</span>
                {/if}
              </div>
            </div>

            <div class="text-xs text-text-muted mb-2">{exerciseVolume(exercise).toLocaleString()} kg</div>

            <!-- Sets -->
            <div class="flex flex-wrap gap-1.5 items-center">
              {#if exercise.sets}
                {#each exercise.sets as set}
                  {#if editingSet && !editingSet.isNew && editingSet.setId === set.id}
                    <!-- Inline editor for existing set -->
                    <div class="flex items-center gap-1 bg-black border border-accent rounded-lg p-2">
                      <input
                        type="number"
                        bind:value={editingSet.reps}
                        placeholder="reps"
                        class="w-12 p-1 bg-surface border border-border rounded text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                      />
                      <span class="text-text-muted text-xs">x</span>
                      <input
                        type="number"
                        bind:value={editingSet.weight}
                        placeholder="kg"
                        step="0.5"
                        class="w-14 p-1 bg-surface border border-border rounded text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                      />
                      <span class="text-text-muted text-xs">kg</span>
                      <button
                        class="text-accent text-xs font-medium px-1"
                        onclick={saveSet}
                        disabled={savingSet}
                      >
                        {savingSet ? '...' : 'Save'}
                      </button>
                      <button
                        class="text-danger text-xs font-medium px-1"
                        onclick={deleteSet}
                        disabled={savingSet}
                      >
                        Del
                      </button>
                      <button
                        class="text-text-muted text-xs px-1"
                        onclick={cancelEditSet}
                      >
                        X
                      </button>
                    </div>
                  {:else}
                    <!-- Set badge -->
                    <button
                      class="px-2 py-1 bg-black border border-border rounded text-sm text-text-secondary active:bg-surface-elevated"
                      onclick={() => startEditSet(exercise.id, set)}
                    >
                      {set.reps ?? '?'} x {set.weight ?? '?'}kg
                    </button>
                  {/if}
                {/each}
              {/if}

              <!-- Add set button / inline editor -->
              {#if editingSet && editingSet.isNew && editingSet.exerciseId === exercise.id}
                <div class="flex items-center gap-1 bg-black border border-accent rounded-lg p-2">
                  <input
                    type="number"
                    bind:value={editingSet.reps}
                    placeholder="reps"
                    class="w-12 p-1 bg-surface border border-border rounded text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                  />
                  <span class="text-text-muted text-xs">x</span>
                  <input
                    type="number"
                    bind:value={editingSet.weight}
                    placeholder="kg"
                    step="0.5"
                    class="w-14 p-1 bg-surface border border-border rounded text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                  />
                  <span class="text-text-muted text-xs">kg</span>
                  <button
                    class="text-accent text-xs font-medium px-1"
                    onclick={saveSet}
                    disabled={savingSet}
                  >
                    {savingSet ? '...' : 'Save'}
                  </button>
                  <button
                    class="text-text-muted text-xs px-1"
                    onclick={cancelEditSet}
                  >
                    X
                  </button>
                </div>
              {:else}
                <button
                  class="px-2 py-1 border border-dashed border-border rounded text-sm text-text-muted active:bg-surface-elevated"
                  onclick={() => startAddSet(exercise.id, (exercise.sets?.length ?? 0) + 1)}
                >
                  + Add
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </main>
  {/if}
</div>

<!-- Edit End Time Modal -->
<Modal open={editEndTimeOpen} onclose={closeEditEndTime}>
  <h3 class="text-lg font-semibold mb-4">Edit End Time</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-3">
    Date
    <input
      type="date"
      bind:value={editEndDate}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-4">
    Time
    <input
      type="time"
      bind:value={editEndTime}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closeEditEndTime}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={saveEndTime}
      disabled={savingEndTime}
    >
      {savingEndTime ? 'Saving...' : 'Save'}
    </button>
  </div>
</Modal>

<style>
  .screen {
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
</style>
