<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { appState, navigate, goBack } from '../lib/store.svelte';
  import { formatDuration } from '../lib/utils';
  import type { Session } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let sessions = $state<Session[]>([]);
  let loading = $state(true);

  // Backfill modal state
  let backfillOpen = $state(false);
  let backfillDate = $state('');
  let backfillDayId = $state<number | null>(null);
  let backfillSubmitting = $state(false);

  onMount(() => { load(); });

  async function load() {
    loading = true;
    try {
      sessions = await api.getSessions();
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
    loading = false;
  }

  function openBackfill() {
    const today = new Date();
    backfillDate = today.toISOString().split('T')[0];
    backfillDayId = appState.days.length > 0 ? appState.days[0].id : null;
    backfillOpen = true;
  }

  function closeBackfill() {
    backfillOpen = false;
    backfillSubmitting = false;
  }

  async function startBackfill() {
    if (!backfillDayId || !backfillDate) return;
    backfillSubmitting = true;
    try {
      const startedAt = new Date(backfillDate + 'T12:00:00').toISOString();
      const result = await api.createSession(backfillDayId, startedAt);

      if ('error' in result) {
        alert(result.error);
        backfillSubmitting = false;
        return;
      }

      appState.currentSession = result;
      const day = appState.days.find(d => d.id === backfillDayId);
      if (appState.currentSession && day) {
        appState.currentSession.day_display_name = day.display_name;
      }
      closeBackfill();
      navigate('session');
    } catch (err) {
      alert('Failed to create session');
      console.error(err);
      backfillSubmitting = false;
    }
  }

  function formatSessionDate(dateStr: string): string {
    const d = new Date(dateStr);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = dayNames[d.getDay()];
    return `${day}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  function getSessionDuration(session: Session): string {
    if (!session.ended_at) return 'In progress';
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    return formatDuration(ms);
  }

  let todayStr = $derived(new Date().toISOString().split('T')[0]);
</script>

<div id="history-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">History</h1>
    <div class="w-10"></div>
  </header>

  <main class="p-4">
    <button
      id="add-workout-btn"
      class="w-full p-3 mb-4 bg-surface border border-border rounded-lg text-accent font-medium text-sm"
      onclick={openBackfill}
    >
      + Add Past Workout
    </button>

    <div id="session-history">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else if sessions.length === 0}
      <div class="text-center text-text-muted py-8">No sessions yet</div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each sessions as session}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="bg-surface border border-border rounded-lg p-4 active:bg-surface-elevated cursor-pointer"
            onclick={() => navigate('session-detail', { id: String(session.id) })}
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-text-primary">{session.day_display_name || session.day_name || 'Workout'}</span>
              <span class="text-sm text-text-muted">{getSessionDuration(session)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-text-secondary">{formatSessionDate(session.started_at)}</span>
              <div class="flex gap-1 flex-wrap justify-end">
                {#if session.volume_prs && session.volume_prs > 0}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-gold/20 text-gold">Vol PR</span>
                {/if}
                {#if session.set_prs && session.set_prs > 0}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-orange-500/20 text-orange-500">Set PR</span>
                {/if}
                {#if session.weight_prs && session.weight_prs > 0}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-pink-500/20 text-pink-500">1RM</span>
                {/if}
                {#if session.reps_prs && session.reps_prs > 0}
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-500">Reps PR</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
    </div>
  </main>
</div>

<Modal open={backfillOpen} onclose={closeBackfill} id="backfill-modal">
  <h3 class="text-lg font-semibold mb-4">Add Past Workout</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-3">
    Date
    <input
      id="backfill-date"
      type="date"
      bind:value={backfillDate}
      max={todayStr}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-4">
    Workout Day
    <select
      id="backfill-day"
      bind:value={backfillDayId}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    >
      {#each appState.days as day}
        <option value={day.id}>{day.display_name}</option>
      {/each}
    </select>
  </label>

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closeBackfill}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={startBackfill}
      disabled={backfillSubmitting || !backfillDayId}
    >
      {backfillSubmitting ? 'Creating...' : 'Start'}
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
